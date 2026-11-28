"""QASSIMZ Hub — Local HTTP/1.1 API server & settings manager."""
from __future__ import annotations

import json
import logging
import mimetypes
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from cc_updater import CreativeCloudUpdater
from crash_logger import atomic_write_json
from detector import (
    enable_cep_player_debug_mode,
    enrich_catalog,
    parse_version,
)
from feature_flags import FeatureFlagStore
from installer_runner import UA, TaskQueue, run_uninstall_command, ssl_context
from taskbar_progress import (
    TBPF_ERROR,
    TBPF_INDETERMINATE,
    TBPF_NORMAL,
    TBPF_PAUSED,
    TaskbarProgress,
)
from telemetry import TelemetryMonitor, clear_hub_cache
from window_state import (
    WindowStateStore,
    enumerate_windows_monitors,
    validate_window_rect,
)

VERSION = "2.1.0"
HUB_REPO = "ahmedqassimtv-commits/qassimz-hub"
REMOTE_CATALOG_URL = f"https://raw.githubusercontent.com/{HUB_REPO}/main/catalog.json"
STATE_CACHE_TTL = 3.0

mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("font/ttf", ".ttf")
mimetypes.add_type("image/svg+xml", ".svg")


def resource(rel: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    return base / rel


def data_dir() -> Path:
    base = Path(os.environ.get("APPDATA", Path.home())) / "QASSIMZ Hub"
    base.mkdir(parents=True, exist_ok=True)
    return base


class HubSettings:
    DEFAULTS: dict[str, Any] = {
        "silent_install": True,
        "minimize_to_tray": True,
        "start_with_windows": False,
        "auto_check_updates": True,
        "auto_update_apps": False,
        "auto_update_hub": False,
        "mechanical_bg_mode": "balanced",
        "sound_enabled": True,
    }
    ENUM_OPTIONS: dict[str, tuple[str, ...]] = {
        "mechanical_bg_mode": ("off", "balanced", "overdrive"),
    }

    def __init__(self, root: Path):
        self.file = root / "settings.json"
        self._lock = threading.Lock()
        self._data: dict[str, Any] = dict(self.DEFAULTS)
        if self.file.is_file():
            try:
                loaded = json.loads(self.file.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    for k in self.DEFAULTS:
                        if k not in loaded:
                            continue
                        if k in self.ENUM_OPTIONS:
                            val = str(loaded[k]).lower()
                            if val in self.ENUM_OPTIONS[k]:
                                self._data[k] = val
                        else:
                            self._data[k] = bool(loaded[k])
                    if loaded.get("_schema", 1) < 2:
                        self._data["auto_update_apps"] = False
                        self._data["auto_update_hub"] = False
                        out = dict(self._data)
                        out["_schema"] = 2
                        atomic_write_json(self.file, out)
            except Exception:
                pass

    def all(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._data)

    def update(self, values: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            for k, v in (values or {}).items():
                if k not in self.DEFAULTS:
                    continue
                if k in self.ENUM_OPTIONS:
                    val = str(v).lower()
                    if val in self.ENUM_OPTIONS[k]:
                        self._data[k] = val
                else:
                    self._data[k] = bool(v)
            out = dict(self._data)
            out["_schema"] = 2
            atomic_write_json(self.file, out)
            snap = dict(self._data)
        if "start_with_windows" in (values or {}):
            self._apply_startup(bool(snap["start_with_windows"]))
        return snap

    @staticmethod
    def _apply_startup(enabled: bool) -> None:
        if os.name != "nt":
            return
        try:
            import winreg  # type: ignore

            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run") as k:
                if enabled and getattr(sys, "frozen", False):
                    winreg.SetValueEx(k, "QASSIMZ Hub", 0, winreg.REG_SZ, f'"{sys.executable}" --minimized')
                elif not enabled:
                    try:
                        winreg.DeleteValue(k, "QASSIMZ Hub")
                    except OSError:
                        pass
        except Exception:
            pass


class HubApi:
    def __init__(self, root: Path | None = None):
        self.root = root or data_dir()
        self.cache_dir = self.root / "downloads"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.settings = HubSettings(self.root)
        self.feature_flags = FeatureFlagStore(self.root)
        self.window_state = WindowStateStore(self.root)
        self.window: Any = None
        self._is_maximized = False
        self._on_close_request: Any = None
        self._on_quit_request: Any = None
        self._on_release_lock: Any = None
        self._catalog_lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._enriched_cache: dict[str, Any] | None = None
        self._enriched_ts = 0.0
        self._catalog = self._load_initial_catalog()
        self._last_sync = 0.0
        self._sync_error = ""
        self.taskbar = TaskbarProgress()
        self.telemetry_monitor = TelemetryMonitor()
        self.queue = TaskQueue(
            self.cache_dir,
            on_finished=self._on_task_finished,
            on_self_update_ready=self._apply_hub_self_update,
            on_progress=self._on_tasks_progress,
        )
        install_dir = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent.parent
        self.cc_updater = CreativeCloudUpdater(
            install_dir=install_dir,
            staging_root=self.root / ".staging" if os.name != "nt" else None,
            on_status_change=lambda _st: self._notify_ui_sync(),
            on_hot_patched=self._on_hot_patched,
            on_before_exit=lambda: self._on_release_lock() if callable(self._on_release_lock) else None,
        )

    def _on_tasks_progress(self, tasks: list[dict[str, Any]]) -> None:
        active = [t for t in tasks if t["status"] in ("queued", "checking", "downloading", "verifying", "installing")]
        paused = [t for t in tasks if t["status"] in ("paused", "app_running")]
        errored = [t for t in tasks if t["status"] == "error"]
        if active:
            avg = int(sum(int(t.get("progress") or 0) for t in active) / len(active))
            if any(t["status"] in ("checking", "verifying") for t in active) and avg < 5:
                self.taskbar.set_progress(self.window, 0, 100, TBPF_INDETERMINATE)
            else:
                self.taskbar.set_progress(self.window, max(1, avg), 100, TBPF_NORMAL)
        elif paused:
            avg = int(sum(int(t.get("progress") or 0) for t in paused) / len(paused))
            self.taskbar.set_progress(self.window, max(1, avg), 100, TBPF_PAUSED)
        elif errored:
            self.taskbar.set_progress(self.window, 100, 100, TBPF_ERROR)
        else:
            self.taskbar.clear(self.window)

    def _on_hot_patched(self, new_version: str) -> None:
        win = self.window
        if win is not None:
            try:
                safe_ver = json.dumps(new_version)
                win.evaluate_js(f"window.__qhubOnHotPatched && window.__qhubOnHotPatched({safe_ver});")
            except Exception:
                pass

    def _notify_ui_sync(self) -> None:
        win = self.window
        if win is not None:
            try:
                win.evaluate_js("window.__qhubOnCatalogSynced && window.__qhubOnCatalogSynced();")
            except Exception:
                pass

    def _on_task_finished(self, item_id: str, item: dict[str, Any]) -> None:
        if item.get("category") == "adobe":
            try:
                enable_cep_player_debug_mode()
            except Exception:
                pass
        self._invalidate_state_cache()
        self.taskbar.flash_complete(self.window)
        if self.queue.get_auto_launch(item_id) and item.get("category") != "adobe":
            try:
                self.launch(item_id)
            except Exception:
                pass
        self._notify_ui_sync()

    def _apply_hub_self_update(self, target_path: Path) -> None:
        if os.name != "nt":
            return
        rel = self._on_release_lock
        if callable(rel):
            try:
                rel()
            except Exception:
                pass

        # Use CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP (never combine CREATE_NO_WINDOW with DETACHED_PROCESS).
        no_win_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)

        if target_path.is_dir():
            # Unicode-safe PowerShell + robocopy Delta swapper (avoids PS 5.1 Copy-Item -Recurse nesting bug,
            # retries locked WebView2/Python DLLs, and guarantees relaunch of QASSIMZ Hub.exe).
            install_dir = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent.parent
            exe_path = Path(sys.executable) if getattr(sys, "frozen", False) else (install_dir / "QASSIMZ Hub.exe")
            ps1_path = self.cache_dir / f"qhub_delta_swap_{os.getpid()}.ps1"
            log_path = self.cache_dir / "last_self_update.log"
            src_esc = str(target_path).replace("'", "''")
            dst_esc = str(install_dir).replace("'", "''")
            exe_esc = str(exe_path).replace("'", "''")
            log_esc = str(log_path).replace("'", "''")
            ps1_body = (
                f"$pidToWait = {os.getpid()}\r\n"
                f"$src = '{src_esc}'\r\n"
                f"$dst = '{dst_esc}'\r\n"
                f"$exe = '{exe_esc}'\r\n"
                f"$log = '{log_esc}'\r\n"
                "function Write-Log($m) { try { Add-Content -Path $log -Value \"$(Get-Date -Format o) $m\" -Encoding UTF8 } catch {} }\r\n"
                "Write-Log \"Start swap pid=$pidToWait src=$src dst=$dst exe=$exe\"\r\n"
                "for ($i = 0; $i -lt 28; $i++) {\r\n"
                "  if (-not (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue)) { break }\r\n"
                "  Start-Sleep -Milliseconds 250\r\n"
                "}\r\n"
                "if (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) {\r\n"
                "  Stop-Process -Id $pidToWait -Force -ErrorAction SilentlyContinue\r\n"
                "  Start-Sleep -Milliseconds 400\r\n"
                "}\r\n"
                "Start-Sleep -Milliseconds 350\r\n"
                "$rc = 99\r\n"
                "try {\r\n"
                "  & robocopy.exe $src $dst /E /IS /IT /R:15 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null\r\n"
                "  $rc = $LASTEXITCODE\r\n"
                "  Write-Log \"robocopy exit=$rc\"\r\n"
                "} catch {\r\n"
                "  Write-Log \"robocopy threw: $_\"\r\n"
                "}\r\n"
                "if ($rc -gt 7) {\r\n"
                "  Write-Log 'Fallback to per-file .NET copy'\r\n"
                "  $srcRoot = (Resolve-Path $src).Path.TrimEnd('\\')\r\n"
                "  Get-ChildItem -Path $srcRoot -Recurse -File | ForEach-Object {\r\n"
                "    $relPath = $_.FullName.Substring($srcRoot.Length).TrimStart('\\')\r\n"
                "    $outPath = Join-Path $dst $relPath\r\n"
                "    $outDir = Split-Path -Parent $outPath\r\n"
                "    if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }\r\n"
                "    for ($a = 0; $a -lt 8; $a++) {\r\n"
                "      try { [System.IO.File]::Copy($_.FullName, $outPath, $true); break } catch { Start-Sleep -Milliseconds 400 }\r\n"
                "    }\r\n"
                "  }\r\n"
                "}\r\n"
                "Start-Sleep -Milliseconds 350\r\n"
                "$launched = $false\r\n"
                "if (Test-Path $exe) {\r\n"
                "  try {\r\n"
                "    $p = Start-Process -FilePath $exe -WorkingDirectory $dst -PassThru\r\n"
                "    if ($p) { $launched = $true; Write-Log \"Relaunched via Start-Process pid=$($p.Id)\" }\r\n"
                "  } catch {\r\n"
                "    Write-Log \"Start-Process failed: $_\"\r\n"
                "  }\r\n"
                "  if (-not $launched) {\r\n"
                "    try {\r\n"
                "      & cmd.exe /c start \"\" /D \"$dst\" \"$exe\"\r\n"
                "      Write-Log 'Relaunched via cmd start'\r\n"
                "    } catch {\r\n"
                "      Write-Log \"cmd start failed: $_\"\r\n"
                "    }\r\n"
                "  }\r\n"
                "} else {\r\n"
                "  Write-Log \"Executable missing at $exe\"\r\n"
                "}\r\n"
                "Remove-Item -Path $src -Recurse -Force -ErrorAction SilentlyContinue\r\n"
                "Remove-Item -Path $PSCommandPath -Force -ErrorAction SilentlyContinue\r\n"
            )
            ps1_path.write_text(ps1_body, encoding="utf-8-sig")
            subprocess.Popen(
                ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", str(ps1_path)],
                cwd=str(self.cache_dir),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=no_win_flags,
                close_fds=True,
            )
            threading.Timer(0.35, lambda: os._exit(0)).start()
            return

        args = [
            str(target_path),
            "/VERYSILENT",
            "/SUPPRESSMSGBOXES",
            "/NORESTART",
            "/CLOSEAPPLICATIONS",
            "/AUTORUN=1",
        ]
        subprocess.Popen(
            args,
            cwd=str(target_path.parent),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200),
            close_fds=True,
        )
        threading.Timer(0.6, lambda: os._exit(0)).start()

    def _invalidate_state_cache(self) -> None:
        with self._state_lock:
            self._enriched_cache = None
            self._enriched_ts = 0.0

    def _load_initial_catalog(self) -> dict[str, Any]:
        bundled = resource("catalog.json")
        cached = self.root / "cached_catalog.json"
        bundled_data: dict[str, Any] = {"items": [], "hub": {"version": VERSION}}
        if bundled.is_file():
            try:
                bundled_data = json.loads(bundled.read_text(encoding="utf-8"))
            except Exception:
                pass
        if cached.is_file():
            try:
                cached_data = json.loads(cached.read_text(encoding="utf-8"))
                if cached_data.get("updated_at", "") >= bundled_data.get("updated_at", "") and cached_data.get("items"):
                    return cached_data
            except Exception:
                pass
        return bundled_data

    def refresh_catalog(self) -> dict[str, Any]:
        """Fetch latest public catalog.json from qassimz-hub GitHub without login."""
        url = f"{REMOTE_CATALOG_URL}?t={int(time.time())}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
            with urllib.request.urlopen(req, timeout=15, context=ssl_context()) as r:
                raw = r.read().decode("utf-8")
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and isinstance(parsed.get("items"), list) and parsed["items"]:
                # Use live published GitHub releases/latest (with real uploaded assets) as the
                # single source of truth for Hub self-updates so unbuilt CI commits never 404.
                hub_obj = dict(parsed.get("hub") or {})
                try:
                    rel_req = urllib.request.Request(
                        f"https://api.github.com/repos/{HUB_REPO}/releases/latest",
                        headers={"User-Agent": UA, "Accept": "application/vnd.github+json"},
                    )
                    with urllib.request.urlopen(rel_req, timeout=8, context=ssl_context()) as rr:
                        rel_data = json.loads(rr.read().decode("utf-8"))
                    is_draft = bool(rel_data.get("draft") or rel_data.get("prerelease"))
                    rel_tag = str(rel_data.get("tag_name") or "").strip()
                    rel_ver = rel_tag.lstrip("vV")
                    assets = rel_data.get("assets") or []
                    setup_a = next((a for a in assets if str(a.get("name", "")).lower().endswith(".exe")), None)
                    port_a = next((a for a in assets if str(a.get("name", "")).lower().endswith(".zip")), None)
                    man_a = next((a for a in assets if str(a.get("name", "")).lower() == "manifest.json"), None)
                    qpkg_a = next((a for a in assets if str(a.get("name", "")).lower().endswith(".qpkg")), None)
                    if not is_draft and rel_ver and (setup_a or (man_a and qpkg_a)):
                        hub_obj["version"] = rel_ver
                        if setup_a:
                            hub_obj["setup_filename"] = setup_a["name"]
                            hub_obj["setup_url"] = setup_a["browser_download_url"]
                            hub_obj["setup_size"] = int(setup_a.get("size") or 0)
                        if port_a:
                            hub_obj["portable_url"] = port_a["browser_download_url"]
                        if man_a and qpkg_a:
                            hub_obj["delta_manifest_url"] = man_a["browser_download_url"]
                            hub_obj["delta_qpkg_url"] = qpkg_a["browser_download_url"]
                            hub_obj["delta_qpkg_size"] = int(qpkg_a.get("size") or 0)
                        else:
                            hub_obj["delta_manifest_url"] = ""
                            hub_obj["delta_qpkg_url"] = ""
                        parsed["hub"] = hub_obj
                    else:
                        # Release is still draft/building — do not advertise an unreachable version
                        hub_obj["version"] = VERSION
                        parsed["hub"] = hub_obj
                except Exception:
                    # If GitHub API is unreachable, avoid advertising an unverified Hub bump
                    hub_obj["version"] = VERSION
                    parsed["hub"] = hub_obj
                with self._catalog_lock:
                    self._catalog = parsed
                    self._last_sync = time.time()
                    self._sync_error = ""
                atomic_write_json(self.root / "cached_catalog.json", parsed)
        except Exception as e:
            self._sync_error = str(e)
        self._invalidate_state_cache()
        return self.state(force=True)

    def _get_item(self, item_id: str) -> dict[str, Any] | None:
        with self._catalog_lock:
            for it in self._catalog.get("items") or []:
                if it.get("id") == item_id:
                    return dict(it)
        return None

    def _get_enriched(self, force: bool = False) -> dict[str, Any]:
        now = time.monotonic()
        with self._state_lock:
            if not force and self._enriched_cache is not None and (now - self._enriched_ts) < STATE_CACHE_TTL:
                return self._enriched_cache
        with self._catalog_lock:
            cat_snap = {
                "schema_version": self._catalog.get("schema_version", 1),
                "updated_at": self._catalog.get("updated_at", ""),
                "hub": dict(self._catalog.get("hub") or {}),
                "items": [dict(it) for it in (self._catalog.get("items") or [])],
            }
        enriched = enrich_catalog(cat_snap)
        with self._state_lock:
            self._enriched_cache = enriched
            self._enriched_ts = time.monotonic()
        return enriched

    def state(self, force: bool = False) -> dict[str, Any]:
        enriched = self._get_enriched(force=force)
        hub_meta = enriched.get("hub") or {}
        remote_hub_ver = hub_meta.get("version", VERSION)
        hub_has_update = parse_version(remote_hub_ver) > parse_version(VERSION)

        cache_bytes = 0
        if self.cache_dir.is_dir():
            for f in self.cache_dir.iterdir():
                if f.is_file():
                    try:
                        cache_bytes += f.stat().st_size
                    except OSError:
                        pass

        return {
            **enriched,
            "hub_version": VERSION,
            "hub_has_update": hub_has_update,
            "hub_remote_version": remote_hub_ver,
            "hub_release_notes": hub_meta.get("release_notes_ar") or "",
            "hub_repo_url": f"https://github.com/{HUB_REPO}",
            "cc_updater": self.cc_updater.snapshot(),
            "feature_flags": self.feature_flags.all(),
            "last_sync": self._last_sync,
            "sync_error": self._sync_error,
            "settings": self.settings.all(),
            "tasks": self.queue.snapshot(),
            "cache_dir": str(self.cache_dir),
            "cache_size_bytes": cache_bytes,
            "platform": os.name,
        }

    def report_ui_error(
        self,
        message: str = "",
        source: str = "",
        stack: str = "",
        kind: str = "error",
    ) -> dict[str, Any]:
        """Record frontend uncaught errors into the rotating backend crash log."""
        logger = logging.getLogger("qassimz_hub")
        logger.error("UI [%s] %s (%s)\n%s", kind, message, source, stack)
        return {"ok": True}

    def tasks(self) -> list[dict[str, Any]]:
        return self.queue.snapshot()

    def clear_finished_tasks(self) -> dict[str, Any]:
        return {"ok": self.queue.clear_finished()}

    def install(self, id: str, silent: bool | None = None) -> dict[str, Any]:
        # Separate Hub self-update from sub-apps catalog so Retry/Install on qassimz-hub never errors
        if id == "qassimz-hub":
            return self.install_hub_update(force=True)
        item = self._get_item(id)
        if not item:
            raise ValueError("تعذّر العثور على هذا التطبيق حالياً، سنحاول لاحقاً.")
        item_copy = dict(item)
        if "state" not in item_copy or not item_copy.get("state"):
            try:
                item_copy["state"] = detect_item_state(item_copy)
            except Exception:
                pass
        use_silent = self.settings.all()["silent_install"] if silent is None else bool(silent)
        return self.queue.enqueue_install(item_copy, silent=use_silent)

    def update_all(self) -> list[dict[str, Any]]:
        st = self.state()
        use_silent = self.settings.all()["silent_install"]
        queued = []
        for it in st["items"]:
            if it["state"]["has_update"]:
                queued.append(self.queue.enqueue_install(it, silent=use_silent))
        return queued

    def cancel_task(self, id: str) -> bool:
        return self.queue.cancel(id)

    def clear_tasks(self) -> bool:
        return self.queue.clear_finished()

    def launch(self, id: str, sub_idx: int | None = None) -> bool:
        st = self.state()
        target_item = next((x for x in st["items"] if x["id"] == id), None)
        if not target_item:
            raise ValueError("العنصر غير موجود.")
        istate = target_item["state"]

        if sub_idx is not None:
            subs = istate.get("sub_apps") or []
            if 0 <= sub_idx < len(subs):
                sa = subs[sub_idx]
                subprocess.Popen([sa["exe"], *sa.get("args", [])], cwd=str(Path(sa["exe"]).parent))
                return True

        if istate.get("exe_path"):
            exe = istate["exe_path"]
            subprocess.Popen([exe], cwd=str(Path(exe).parent))
            return True

        # Adobe CEP extension: open matching Adobe host if installed
        if target_item.get("category") == "adobe":
            host = (target_item.get("detection") or {}).get("adobe_host", "aftereffects")
            return self.launch_adobe(host)

        raise RuntimeError("التطبيق غير مثبّت حالياً على هذا الجهاز.")

    def launch_adobe(self, host: str = "premiere") -> bool:
        st = self.state()
        adobe = st["adobe"]
        exe = adobe["premiere_exe"] if host == "premiere" else adobe["aftereffects_exe"]
        if not exe:
            exe = adobe["aftereffects_exe"] or adobe["premiere_exe"]
        if not exe:
            raise RuntimeError("لم يتم العثور على Adobe Premiere Pro أو After Effects مثبّتاً على الجهاز.")
        subprocess.Popen([exe], cwd=str(Path(exe).parent))
        return True

    def fix_cep(self) -> dict[str, Any]:
        enable_cep_player_debug_mode()
        self._invalidate_state_cache()
        return self.state(force=True)["adobe"]

    def run_ai_setup(self, id: str) -> bool:
        st = self.state()
        target_item = next((x for x in st["items"] if x["id"] == id), None)
        if not target_item:
            raise ValueError("العنصر غير موجود.")
        script = target_item["state"].get("ai_setup_script") or ""
        if not script or not os.path.isfile(script):
            raise RuntimeError("ملف تجهيز الذكاء الاصطناعي غير موجود بعد — ثبّت الإضافة أولاً.")
        if os.name == "nt":
            subprocess.Popen(["cmd.exe", "/c", "start", "", script], cwd=str(Path(script).parent))
        return True

    def uninstall(self, id: str) -> bool:
        st = self.state()
        target_item = next((x for x in st["items"] if x["id"] == id), None)
        if not target_item:
            raise ValueError("العنصر غير موجود.")
        cmd = target_item["state"].get("uninstall_cmd") or ""
        if not cmd:
            raise RuntimeError("لا يوجد معالج إلغاء تثبيت مسجّل لهذا العنصر.")

        def _run_uninst():
            try:
                run_uninstall_command(cmd, False)
            finally:
                self._invalidate_state_cache()

        threading.Thread(target=_run_uninst, daemon=True).start()
        return True

    def open_folder(self, path: str) -> bool:
        if not path:
            return False
        p = Path(path)
        if p.is_file():
            if os.name == "nt":
                subprocess.Popen(f'explorer.exe /select,"{os.path.normpath(str(p))}"')
                return True
            p = p.parent
        p.mkdir(parents=True, exist_ok=True)
        if os.name == "nt":
            os.startfile(str(p))  # type: ignore[attr-defined]
        else:
            webbrowser.open(p.as_uri())
        return True

    def open_cache_dir(self) -> bool:
        return self.open_folder(str(self.cache_dir))

    def clear_cache(self) -> dict[str, Any]:
        if self.cache_dir.is_dir():
            for child in self.cache_dir.iterdir():
                if child.is_file() and not child.name.endswith(".part"):
                    child.unlink(missing_ok=True)
                elif child.is_dir():
                    shutil.rmtree(child, ignore_errors=True)
        return self.state()

    def open_url(self, url: str) -> bool:
        if str(url).startswith(("http://", "https://")):
            webbrowser.open(str(url))
        return True

    def save_settings(self, values: dict[str, Any] | None = None, **kwargs: Any) -> dict[str, Any]:
        merged = dict(values or {})
        merged.update(kwargs)
        return self.settings.update(merged)

    def toggle_fullscreen(self) -> bool:
        if self.window is not None:
            try:
                self.window.toggle_fullscreen()
                return True
            except Exception:
                pass
        return False

    def win_minimize(self) -> dict[str, Any]:
        if os.name == "nt":
            hwnd = getattr(self, "_hwnd", None)
            if hwnd:
                try:
                    import ctypes
                    SW_MINIMIZE = 6
                    ctypes.windll.user32.ShowWindow(int(hwnd), SW_MINIMIZE)
                    return {"ok": True}
                except Exception:
                    pass
        if self.window is not None:
            try:
                self.window.minimize()
                return {"ok": True}
            except Exception:
                pass
        return {"ok": True}

    @staticmethod
    def _get_windows_work_area(win_x: int, win_y: int) -> tuple[int, int, int, int] | None:
        """Return (left, top, width, height) of the monitor work area (excluding Windows taskbar)."""
        if os.name != "nt":
            return None
        try:
            import ctypes
            from ctypes import wintypes

            class MONITORINFO(ctypes.Structure):
                _fields_ = [
                    ("cbSize", wintypes.DWORD),
                    ("rcMonitor", wintypes.RECT),
                    ("rcWork", wintypes.RECT),
                    ("dwFlags", wintypes.DWORD),
                ]

            user32 = ctypes.windll.user32
            pt = wintypes.POINT(int(win_x) + 100, int(win_y) + 100)
            hmon = user32.MonitorFromPoint(pt, 2)  # MONITOR_DEFAULTTONEAREST
            mi = MONITORINFO()
            mi.cbSize = ctypes.sizeof(MONITORINFO)
            if hmon and user32.GetMonitorInfoW(hmon, ctypes.byref(mi)):
                rc = mi.rcWork
                w = rc.right - rc.left
                h = rc.bottom - rc.top
                if w > 400 and h > 300:
                    return (rc.left, rc.top, w, h)

            rect = wintypes.RECT()
            if user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0):  # SPI_GETWORKAREA
                return (rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top)
        except Exception:
            pass
        return None

    @staticmethod
    def _animate_window_bounds(
        win: Any,
        x0: int,
        y0: int,
        w0: int,
        h0: int,
        x1: int,
        y1: int,
        w1: int,
        h1: int,
        steps: int = 8,
        duration: float = 0.13,
    ) -> None:
        """Smoothly interpolate Win32 window position & size with ease-out cubic easing."""
        if not (hasattr(win, "move") and hasattr(win, "resize")):
            return
        step_sleep = duration / max(1, steps)
        for i in range(1, steps + 1):
            t = i / steps
            ease = 1.0 - (1.0 - t) ** 3
            cx = int(round(x0 + (x1 - x0) * ease))
            cy = int(round(y0 + (y1 - y0) * ease))
            cw = int(round(w0 + (w1 - w0) * ease))
            ch = int(round(h0 + (h1 - h0) * ease))
            try:
                win.move(cx, cy)
                win.resize(cw, ch)
            except Exception:
                break
            if i < steps:
                time.sleep(step_sleep)

    def win_reveal_main(self) -> dict[str, Any]:
        """Smoothly expand compact Adobe splash window (480x310) into validated saved or default workspace bounds."""
        if self.window is None or getattr(self, "_splash_expanded", True):
            self._splash_expanded = True
            return {"ok": True, "expanded": True}
        self._splash_expanded = True
        if os.name == "nt":
            try:
                cx = int(getattr(self.window, "x", 400) or 400)
                cy = int(getattr(self.window, "y", 250) or 250)
                cw = int(getattr(self.window, "width", 480) or 480)
                ch = int(getattr(self.window, "height", 310) or 310)

                saved = self.window_state.load() if self.feature_flags.is_enabled("window_state_persistence", True) else None
                monitors = enumerate_windows_monitors()
                if saved and monitors:
                    tx, ty, target_w, target_h, want_max, _mon = validate_window_rect(saved, monitors)
                    if want_max:
                        self._restore_bounds = (tx, ty, target_w, target_h)
                        work = self._get_windows_work_area(tx, ty)
                        if work is not None:
                            wx, wy, ww, wh = work
                            self._animate_window_bounds(self.window, cx, cy, cw, ch, wx, wy, ww, wh, steps=9, duration=0.16)
                            self._is_maximized = True
                            return {"ok": True, "expanded": True, "maximized": True}
                    self._animate_window_bounds(self.window, cx, cy, cw, ch, tx, ty, target_w, target_h, steps=9, duration=0.16)
                    return {"ok": True, "expanded": True, "maximized": False}

                work = self._get_windows_work_area(cx, cy)
                target_w, target_h = 1360, 860
                if work is not None:
                    wx, wy, ww, wh = work
                    target_w = min(1360, max(1040, ww - 48))
                    target_h = min(860, max(680, wh - 48))
                    tx = wx + max(0, (ww - target_w) // 2)
                    ty = wy + max(0, (wh - target_h) // 2)
                else:
                    tx = max(20, cx - (target_w - cw) // 2)
                    ty = max(20, cy - (target_h - ch) // 2)
                self._animate_window_bounds(self.window, cx, cy, cw, ch, tx, ty, target_w, target_h, steps=9, duration=0.16)
            except Exception:
                pass
        return {"ok": True, "expanded": True}

    def save_window_state(self) -> None:
        """Persist current logical window position, dimensions, monitor name, and maximized state."""
        if not self.feature_flags.is_enabled("window_state_persistence", True):
            return
        self.window_state.capture_from_window(
            self.window,
            is_maximized=bool(getattr(self, "_is_maximized", False)),
            restore_bounds=getattr(self, "_restore_bounds", None),
        )

    def win_toggle_maximize(self) -> dict[str, Any]:
        if self.window is not None:
            try:
                if getattr(self, "_is_maximized", False):
                    bounds = getattr(self, "_restore_bounds", None)
                    if os.name == "nt" and bounds and hasattr(self.window, "move") and hasattr(self.window, "resize"):
                        cx = int(getattr(self.window, "x", 0) or 0)
                        cy = int(getattr(self.window, "y", 0) or 0)
                        cw = int(getattr(self.window, "width", 1360) or 1360)
                        ch = int(getattr(self.window, "height", 860) or 860)
                        rx, ry, rw, rh = bounds
                        self._animate_window_bounds(self.window, cx, cy, cw, ch, rx, ry, rw, rh, steps=7, duration=0.12)
                    else:
                        self.window.restore()
                    self._is_maximized = False
                else:
                    if os.name == "nt" and hasattr(self.window, "move") and hasattr(self.window, "resize"):
                        cx = int(getattr(self.window, "x", 100) or 100)
                        cy = int(getattr(self.window, "y", 80) or 80)
                        cw = int(getattr(self.window, "width", 1360) or 1360)
                        ch = int(getattr(self.window, "height", 860) or 860)
                        self._restore_bounds = (cx, cy, cw, ch)
                        work = self._get_windows_work_area(cx, cy)
                        if work is not None:
                            wx, wy, ww, wh = work
                            # Use work area (excludes taskbar) so NVIDIA/AMD/Game Bar never
                            # treat the frameless WebView2 window as an exclusive fullscreen game.
                            self._animate_window_bounds(self.window, cx, cy, cw, ch, wx, wy, ww, wh, steps=7, duration=0.12)
                            self._is_maximized = True
                            return {"ok": True, "maximized": True}
                    self.window.maximize()
                    self._is_maximized = True
                return {"ok": True, "maximized": self._is_maximized}
            except Exception:
                return {"ok": False, "maximized": getattr(self, "_is_maximized", False)}
        else:
            self._is_maximized = not getattr(self, "_is_maximized", False)
            return {"ok": True, "maximized": self._is_maximized}

    def win_close(self) -> dict[str, Any]:
        cb = getattr(self, "_on_close_request", None)
        if callable(cb):
            cb()
            return {"ok": True}
        if self.window is not None:
            try:
                self.window.destroy()
                return {"ok": True}
            except Exception:
                pass
        return {"ok": True}

    def win_quit(self) -> dict[str, Any]:
        cb = getattr(self, "_on_quit_request", None)
        if callable(cb):
            cb()
            return {"ok": True}
        if self.window is not None:
            try:
                self.window.destroy()
                return {"ok": True}
            except Exception:
                pass
        return {"ok": True}

    def install_hub_update(self, force: bool = False) -> dict[str, Any]:
        with self._catalog_lock:
            hub = dict(self._catalog.get("hub") or {})
        url = hub.get("setup_url") or ""
        ver = hub.get("version") or VERSION
        if not url:
            raise RuntimeError("رابط تحديث QASSIMZ Hub غير متاح حالياً.")
        if not force and parse_version(ver) <= parse_version(VERSION):
            return {"up_to_date": True, "version": VERSION}
        hub_item = {
            "id": "qassimz-hub",
            "code": "Qh",
            "name": "QASSIMZ Hub",
            "name_ar": "تحديث مركز قَاسِمز الرسمي",
            "accent": "#38BDF8",
            "version": ver,
            "setup_filename": hub.get("setup_filename") or f"QASSIMZ-Hub-Setup-{ver}.exe",
            "setup_url": url,
            "setup_size": int(hub.get("setup_size") or 0),
            "setup_sha256": hub.get("setup_sha256") or "",
            "delta_manifest_url": hub.get("delta_manifest_url") or "",
            "delta_qpkg_url": hub.get("delta_qpkg_url") or "",
            "delta_qpkg_size": int(hub.get("delta_qpkg_size") or 0),
            "delta_manifest_sha256": hub.get("delta_manifest_sha256") or "",
            "install_dir": str(Path(sys.executable).parent) if getattr(sys, "frozen", False) else "",
            "repo": HUB_REPO,
            "repo_public": True,
        }
        return self.queue.enqueue_install(hub_item, silent=True, self_update=True)

    def apply_staged_update(self) -> dict[str, Any]:
        """Apply a pending staged Creative Cloud core update and restart smoothly."""
        ok = self.cc_updater.apply_pending_core_swap(relaunch_minimized=False)
        return {"ok": ok}

    def run_auto_update_cycle(self) -> dict[str, Any]:
        """Refresh remote catalog and silently stage/update installed apps & Hub in background."""
        cfg = self.settings.all()
        st = self.refresh_catalog()
        queued_apps: list[str] = []
        hub_queued = False
        if cfg.get("auto_update_apps", False):
            for it in st.get("items") or []:
                if it.get("state", {}).get("has_update"):
                    self.queue.enqueue_install(it, silent=cfg.get("silent_install", True))
                    queued_apps.append(it["id"])
        if cfg.get("auto_update_hub", False) and st.get("hub_has_update"):
            try:
                with self._catalog_lock:
                    hub_meta = dict(self._catalog.get("hub") or {})
                hub_queued = self.cc_updater.stage_update_async(hub_meta)
            except Exception:
                pass
        self._notify_ui_sync()
        return {"queued_apps": queued_apps, "hub_queued": hub_queued}

    # --- Creator OS: Telemetry, Cache Cleaner, Workspace Modes & Smart Drop Router ---

    WORKSPACE_MODES: dict[str, tuple[str, ...]] = {
        "editing": ("qassimz-studio", "qassimz-producer", "qassimz-organizer", "qassimz-music"),
        "podcast": ("qassimz-producer", "qassimz-music", "qassimz-studio"),
        "study": ("qassimz-study", "qassimz-music", "qdm"),
        "design": ("qassimz-thumbs", "qassimz-organizer", "qassimz-producer"),
    }

    def telemetry(self) -> dict[str, Any]:
        """Return live CPU %, RAM %, free disk GB & Hub cache size."""
        return self.telemetry_monitor.snapshot(self.root)

    def clear_cache(self) -> dict[str, Any]:
        """Purge stale downloads & staging files while preserving active transfers."""
        return clear_hub_cache(self.root, active_filenames=self.queue.active_filenames())

    def launch_workspace(self, mode_id: str) -> dict[str, Any]:
        """Launch all installed desktop apps associated with a Creator OS workspace mode."""
        app_ids = self.WORKSPACE_MODES.get(str(mode_id).lower(), ())
        if not app_ids:
            return {"ok": False, "launched": [], "skipped": []}
        st = self.state(force=False)
        by_id = {it["id"]: it for it in (st.get("items") or [])}
        launched: list[str] = []
        skipped: list[str] = []
        for aid in app_ids:
            it = by_id.get(aid)
            if it and it.get("state", {}).get("installed") and it.get("category") != "adobe":
                try:
                    self.launch(aid)
                    launched.append(aid)
                except Exception:
                    skipped.append(aid)
            else:
                skipped.append(aid)
        return {"ok": True, "mode": mode_id, "launched": launched, "skipped": skipped}

    def open_with(self, item_id: str, file_path: str = "") -> dict[str, Any]:
        """Open a dropped file with the selected installed desktop application."""
        st = self.state(force=False)
        item = next((it for it in (st.get("items") or []) if it["id"] == item_id), None)
        if not item:
            raise RuntimeError("البرنامج غير موجود.")
        exe = (item.get("state") or {}).get("exe_path") or ""
        if not exe:
            # Fallback to normal launch if Adobe CEP or exe not resolved
            return self.launch(item_id)
        if os.name == "nt":
            args = [exe, file_path] if file_path else [exe]
            subprocess.Popen(args, cwd=str(Path(exe).parent))
            return {"ok": True, "item_id": item_id, "file_path": file_path}
        return {"ok": True, "item_id": item_id, "file_path": file_path, "simulated": True}

    def pause_task(self, item_id: str) -> dict[str, Any]:
        return {"ok": self.queue.pause(item_id)}

    def resume_task(self, item_id: str) -> dict[str, Any]:
        return {"ok": self.queue.resume(item_id)}

    def set_task_auto_launch(self, item_id: str, enabled: bool = True) -> dict[str, Any]:
        return {"ok": self.queue.set_auto_launch(item_id, bool(enabled)), "enabled": bool(enabled)}

    def force_close_and_retry(self, item_id: str) -> dict[str, Any]:
        return {"ok": self.queue.force_close_and_retry(item_id)}


def make_handler(api: HubApi, token: str, ui_dir: Path):
    ui_resolved = ui_dir.resolve()
    static_cache: dict[Path, tuple[int, bytes, str, str]] = {}
    static_lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args: Any) -> None:
            pass

        def _send(
            self,
            code: int,
            body: bytes,
            ctype: str = "application/json; charset=utf-8",
            etag: str | None = None,
        ) -> None:
            try:
                self.send_response(code)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(body)))
                if etag:
                    self.send_header("ETag", etag)
                    self.send_header("Cache-Control", "public, max-age=86400")
                else:
                    self.send_header("Cache-Control", "no-store" if "json" in ctype else "max-age=3600")
                self.end_headers()
                if self.command != "HEAD" and body:
                    self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass

        def _strip_token(self) -> str | None:
            prefix = f"/{token}/"
            if not self.path.startswith(prefix):
                return None
            return self.path[len(token) + 1 :]

        def do_GET(self) -> None:
            rel = self._strip_token()
            if rel is None:
                return self._send(403, b"forbidden", "text/plain")
            route, _, _ = rel.partition("?")
            route = urllib.parse.unquote(route)
            if route in ("", "/"):
                route = "/index.html"
            target = (ui_resolved / route.lstrip("/")).resolve()
            if ui_resolved not in target.parents and target != ui_resolved:
                return self._send(403, b"forbidden", "text/plain")
            if not target.is_file():
                return self._send(404, b"not found", "text/plain")

            try:
                mtime_ns = target.stat().st_mtime_ns
            except OSError:
                return self._send(404, b"not found", "text/plain")

            with static_lock:
                cached = static_cache.get(target)
            if cached and cached[0] == mtime_ns:
                _, data, ctype, etag = cached
            else:
                ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
                if target.suffix == ".js":
                    ctype = "text/javascript; charset=utf-8"
                elif target.suffix == ".css":
                    ctype = "text/css; charset=utf-8"
                elif target.suffix == ".html":
                    ctype = "text/html; charset=utf-8"
                data = target.read_bytes()
                etag = f'"{mtime_ns:x}-{len(data):x}"'
                with static_lock:
                    static_cache[target] = (mtime_ns, data, ctype, etag)

            if self.headers.get("If-None-Match") == etag:
                self.send_response(304)
                self.send_header("ETag", etag)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return

            self._send(200, data, ctype, etag=etag)

        do_HEAD = do_GET

        def do_POST(self) -> None:
            rel = self._strip_token()
            if rel is None:
                return self._send(403, b"forbidden", "text/plain")
            method_name = rel.split("?", 1)[0].removeprefix("/api/")
            fn = getattr(api, method_name, None)
            if method_name.startswith("_") or not callable(fn):
                return self._send(404, b'{"ok":false,"error":"unknown endpoint"}')
            try:
                length = int(self.headers.get("Content-Length") or 0)
                payload = json.loads(self.rfile.read(length) or b"{}") if length > 0 else {}
                result = fn(**payload) if isinstance(payload, dict) else fn()
                resp = json.dumps({"ok": True, "data": result}, ensure_ascii=False, default=str)
            except Exception as e:
                resp = json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False)
            self._send(200, resp.encode("utf-8"))

    return Handler


def start_server(api: HubApi, port: int = 0) -> str:
    token = secrets.token_urlsafe(16)
    httpd = ThreadingHTTPServer(("127.0.0.1", port), make_handler(api, token, resource("app/ui")))
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{httpd.server_address[1]}/{token}/"
