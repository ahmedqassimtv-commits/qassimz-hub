"""QASSIMZ Hub — Adobe Creative Cloud-Style Silent Background Auto-Update Engine.

Architecture:
1. Isolated Staging: %LOCALAPPDATA%/QASSIMZ_Hub/.staging (zero UAC, per-user writable).
2. Resumable Downloads: HTTP Range resume + SHA-256 verification + Zip-Slip protection.
3. Zero-Downtime Hot-Patch: In-place atomic replacement for UI/assets-only updates.
4. Atomic Core Swap: Hidden PowerShell + robocopy.exe swapper (zero CMD/Inno UI),
   supporting immediate restart or deferred silent swap on minimize-to-tray.
"""
from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Callable

from installer_runner import UA, ssl_context

HOT_PATCH_EXTS = frozenset({
    ".html", ".css", ".js", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".woff2", ".json", ".txt",
})


def default_staging_root(fallback_root: Path | None = None) -> Path:
    """Return %LOCALAPPDATA%/QASSIMZ_Hub/.staging on Windows, or fallback/.staging elsewhere."""
    if os.name == "nt":
        local_app = os.environ.get("LOCALAPPDATA")
        if local_app:
            p = Path(local_app) / "QASSIMZ_Hub" / ".staging"
            p.mkdir(parents=True, exist_ok=True)
            return p
    base = (fallback_root or Path.home() / ".qassimz_hub") / ".staging"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(131072)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest().lower()


def _is_hot_patch_only(staged_dir: Path) -> bool:
    """Return True iff every file in staged_dir is a non-binary UI/asset/config file."""
    found_any = False
    for f in staged_dir.rglob("*"):
        if f.is_file():
            found_any = True
            rel = f.relative_to(staged_dir).as_posix().lower()
            if f.suffix.lower() not in HOT_PATCH_EXTS:
                return False
            if rel.endswith(".exe") or rel.endswith(".dll") or rel.endswith(".pyd") or rel.endswith(".py"):
                return False
    return found_any


class CreativeCloudUpdater:
    """Silent background staging, SHA-256 verification, hot-patch & atomic swap orchestrator."""

    def __init__(
        self,
        install_dir: Path,
        staging_root: Path | None = None,
        on_status_change: Callable[[dict[str, Any]], None] | None = None,
        on_hot_patched: Callable[[str], None] | None = None,
        on_before_exit: Callable[[], None] | None = None,
    ):
        self.install_dir = install_dir
        self.staging_root = staging_root or default_staging_root(install_dir)
        self.staging_root.mkdir(parents=True, exist_ok=True)
        self.on_status_change = on_status_change
        self.on_hot_patched = on_hot_patched
        self.on_before_exit = on_before_exit

        self._lock = threading.Lock()
        self._busy = False
        self._state: dict[str, Any] = {
            "phase": "idle",        # idle | downloading | extracting | staged_ready | applied
            "progress": 0,          # 0..100
            "target_version": "",
            "staged_dir": "",
            "method": "",           # delta | zip | hot_patch
            "updated_at": 0.0,
        }

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._state)

    def has_pending_core_update(self) -> bool:
        with self._lock:
            sd = self._state.get("staged_dir") or ""
            return self._state.get("phase") == "staged_ready" and bool(sd) and Path(sd).is_dir()

    def _set_state(self, **fields: Any) -> None:
        with self._lock:
            self._state.update(fields)
            self._state["updated_at"] = time.time()
            snap = dict(self._state)
        if callable(self.on_status_change):
            try:
                self.on_status_change(snap)
            except Exception:
                pass

    def _download_resumable(
        self,
        url: str,
        dest: Path,
        expected_sha256: str = "",
        on_pct: Callable[[int], None] | None = None,
    ) -> Path:
        """Download URL to dest with HTTP Range resume support and SHA-256 verification."""
        if not url.lower().startswith("https://"):
            raise ValueError("Refusing non-HTTPS update URL")

        part = dest.with_suffix(dest.suffix + ".part")
        existing = part.stat().st_size if part.is_file() else 0

        headers = {"User-Agent": UA, "Accept": "*/*"}
        if existing > 0:
            headers["Range"] = f"bytes={existing}-"

        req = urllib.request.Request(url, headers=headers)
        mode = "ab" if existing > 0 else "wb"
        downloaded = existing

        try:
            resp = urllib.request.urlopen(req, timeout=30, context=ssl_context())
        except urllib.error.HTTPError as exc:
            if exc.code == 416 and existing > 0:
                # Already fully downloaded on disk
                part.replace(dest)
                if expected_sha256 and _sha256_file(dest) != expected_sha256.lower():
                    dest.unlink(missing_ok=True)
                    raise RuntimeError("SHA-256 mismatch on resumed file")
                if on_pct:
                    on_pct(100)
                return dest
            raise

        with resp:
            status = getattr(resp, "status", 200)
            if status == 200 and existing > 0:
                # Server ignored Range header; restart from 0 cleanly
                mode = "wb"
                downloaded = 0
            cl = int(resp.headers.get("Content-Length") or 0)
            total = (existing + cl) if (status == 206 and cl > 0) else cl
            last_pct = -1

            with part.open(mode) as fh:
                while True:
                    buf = resp.read(65536)
                    if not buf:
                        break
                    fh.write(buf)
                    downloaded += len(buf)
                    if total > 0 and on_pct:
                        pct = min(99, int(downloaded * 100 / total))
                        if pct != last_pct:
                            last_pct = pct
                            on_pct(pct)

        if expected_sha256:
            actual = _sha256_file(part)
            if actual != expected_sha256.lower():
                part.unlink(missing_ok=True)
                raise RuntimeError(f"SHA-256 verification failed: expected {expected_sha256}, got {actual}")

        part.replace(dest)
        if on_pct:
            on_pct(100)
        return dest

    def _safe_extract_zip(self, zip_path: Path, out_dir: Path) -> None:
        """Extract zip safely into out_dir, preventing Zip-Slip path traversal."""
        if out_dir.exists():
            shutil.rmtree(out_dir, ignore_errors=True)
        out_dir.mkdir(parents=True, exist_ok=True)
        out_resolved = out_dir.resolve()

        with zipfile.ZipFile(zip_path, "r") as zf:
            members = zf.infolist()
            for info in members:
                if info.is_dir():
                    continue
                target = (out_dir / info.filename).resolve()
                if out_resolved not in target.parents and target != out_resolved:
                    raise RuntimeError(f"Blocked unsafe zip entry: {info.filename}")
                target.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(info, "r") as src, target.open("wb") as dst:
                    shutil.copyfileobj(src, dst, length=131072)

    def _apply_hot_patch(self, staged_dir: Path, target_version: str) -> bool:
        """Atomically replace UI/asset files in-place without closing the running application."""
        for src in staged_dir.rglob("*"):
            if not src.is_file():
                continue
            rel = src.relative_to(staged_dir)
            dst = self.install_dir / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp_name = tempfile.mkstemp(prefix=f".{dst.name}.", suffix=".qpatch", dir=str(dst.parent))
            os.close(fd)
            try:
                shutil.copy2(src, tmp_name)
                os.replace(tmp_name, dst)
            except Exception:
                try:
                    os.unlink(tmp_name)
                except OSError:
                    pass
                raise

        shutil.rmtree(staged_dir, ignore_errors=True)
        self._set_state(
            phase="applied",
            progress=100,
            target_version=target_version,
            staged_dir="",
            method="hot_patch",
        )
        if callable(self.on_hot_patched):
            try:
                self.on_hot_patched(target_version)
            except Exception:
                pass
        return True

    def stage_update_async(self, hub_meta: dict[str, Any]) -> bool:
        """Start silent background staging in a daemon thread. Never raises to UI."""
        ver = str(hub_meta.get("version") or "").strip()
        if not ver:
            return False
        with self._lock:
            if self._busy:
                return False
            if self._state.get("phase") == "staged_ready" and self._state.get("target_version") == ver:
                return False
            self._busy = True

        threading.Thread(
            target=self._stage_worker,
            args=(dict(hub_meta), ver),
            name="CCSilentUpdater",
            daemon=True,
        ).start()
        return True

    def _stage_worker(self, hub_meta: dict[str, Any], ver: str) -> None:
        try:
            self._set_state(phase="downloading", progress=2, target_version=ver, method="")

            staged_dir: Path | None = None
            method = ""

            # 1. Try Smart Delta staging first (fastest, minimal bandwidth)
            if hub_meta.get("delta_manifest_url") and self.install_dir.is_dir():
                try:
                    from delta_updater import DeltaUpdater

                    updater = DeltaUpdater()
                    item = {
                        "id": "qassimz-hub",
                        "version": ver,
                        "delta_manifest_url": hub_meta.get("delta_manifest_url") or "",
                        "delta_qpkg_url": hub_meta.get("delta_qpkg_url") or "",
                        "delta_manifest_sha256": hub_meta.get("delta_manifest_sha256") or "",
                        "repo": "ahmedqassimtv-commits/qassimz-hub",
                        "repo_public": True,
                    }

                    def _delta_cb(payload: dict[str, Any]) -> None:
                        pct = int(payload.get("progress") or 0)
                        st = payload.get("stage", "downloading")
                        ph = "extracting" if st in ("verifying", "applying") else "downloading"
                        self._set_state(phase=ph, progress=max(2, min(96, pct)), target_version=ver, method="delta")

                    res = updater.apply_delta_update(
                        item,
                        self.install_dir,
                        self.staging_root,
                        on_progress=_delta_cb,
                        stage_only=True,
                    )
                    if res.ok and res.staged_dir:
                        staged_dir = Path(res.staged_dir)
                        method = "delta"
                except Exception:
                    staged_dir = None

            # 2. Fallback to resumable Portable .zip archive
            if staged_dir is None:
                zip_url = str(hub_meta.get("portable_url") or "").strip()
                if not zip_url:
                    self._set_state(phase="idle", progress=0)
                    return
                zip_dest = self.staging_root / f"qassimz-hub-v{ver}.zip"
                expected_sha = str(hub_meta.get("portable_sha256") or "").strip()

                self._download_resumable(
                    zip_url,
                    zip_dest,
                    expected_sha256=expected_sha,
                    on_pct=lambda p: self._set_state(
                        phase="downloading",
                        progress=max(2, int(p * 0.80)),
                        target_version=ver,
                        method="zip",
                    ),
                )
                self._set_state(phase="extracting", progress=85, target_version=ver, method="zip")
                out_dir = self.staging_root / f"v{ver}"
                self._safe_extract_zip(zip_dest, out_dir)
                zip_dest.unlink(missing_ok=True)

                # Unwrap single top-level folder inside portable zip if present
                children = list(out_dir.iterdir())
                if len(children) == 1 and children[0].is_dir():
                    staged_dir = children[0]
                else:
                    staged_dir = out_dir
                method = "zip"

            # 3. Hot-Patch UI/assets immediately OR mark Core Swap ready
            if _is_hot_patch_only(staged_dir):
                self._apply_hot_patch(staged_dir, ver)
                return

            self._set_state(
                phase="staged_ready",
                progress=100,
                target_version=ver,
                staged_dir=str(staged_dir),
                method=method,
            )
        except Exception:
            # Silent UX: never disturb the user on offline/network errors
            self._set_state(phase="idle", progress=0)
        finally:
            with self._lock:
                self._busy = False

    def apply_pending_core_swap(self, relaunch_minimized: bool = False) -> bool:
        """Spawn hidden PowerShell + robocopy swapper to swap staged files and relaunch silently."""
        with self._lock:
            if self._state.get("phase") != "staged_ready":
                return False
            staged_str = str(self._state.get("staged_dir") or "")
        if not staged_str or not Path(staged_str).is_dir():
            return False
        if os.name != "nt":
            return False

        if callable(self.on_before_exit):
            try:
                self.on_before_exit()
            except Exception:
                pass

        exe_path = Path(sys.executable) if getattr(sys, "frozen", False) else (self.install_dir / "QASSIMZ Hub.exe")
        ps1_path = self.staging_root / f"cc_swap_{os.getpid()}.ps1"
        log_path = self.staging_root / "last_cc_swap.log"

        src_esc = staged_str.replace("'", "''")
        dst_esc = str(self.install_dir).replace("'", "''")
        exe_esc = str(exe_path).replace("'", "''")
        log_esc = str(log_path).replace("'", "''")
        arg_clause = " -ArgumentList '--minimized'" if relaunch_minimized else ""

        ps1_body = (
            f"$pidToWait = {os.getpid()}\r\n"
            f"$src = '{src_esc}'\r\n"
            f"$dst = '{dst_esc}'\r\n"
            f"$exe = '{exe_esc}'\r\n"
            f"$log = '{log_esc}'\r\n"
            "function Write-Log($m) { try { Add-Content -Path $log -Value \"$(Get-Date -Format o) $m\" -Encoding UTF8 } catch {} }\r\n"
            "Write-Log \"CC Atomic Swap start pid=$pidToWait src=$src dst=$dst\"\r\n"
            "for ($i = 0; $i -lt 28; $i++) {\r\n"
            "  if (-not (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue)) { break }\r\n"
            "  Start-Sleep -Milliseconds 250\r\n"
            "}\r\n"
            "if (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) {\r\n"
            "  Stop-Process -Id $pidToWait -Force -ErrorAction SilentlyContinue\r\n"
            "  Start-Sleep -Milliseconds 350\r\n"
            "}\r\n"
            "Start-Sleep -Milliseconds 300\r\n"
            "& robocopy.exe $src $dst /E /IS /IT /R:15 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null\r\n"
            "$rc = $LASTEXITCODE\r\n"
            "Write-Log \"robocopy exit=$rc\"\r\n"
            "Start-Sleep -Milliseconds 300\r\n"
            "if (Test-Path $exe) {\r\n"
            f"  Start-Process -FilePath $exe{arg_clause} -WorkingDirectory $dst\r\n"
            "  Write-Log 'Relaunched QASSIMZ Hub'\r\n"
            "}\r\n"
            "Remove-Item -Path $src -Recurse -Force -ErrorAction SilentlyContinue\r\n"
            "Remove-Item -Path $PSCommandPath -Force -ErrorAction SilentlyContinue\r\n"
        )
        ps1_path.write_text(ps1_body, encoding="utf-8-sig")

        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)
        subprocess.Popen(
            ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", str(ps1_path)],
            cwd=str(self.staging_root),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=flags,
            close_fds=True,
        )
        threading.Timer(0.3, lambda: os._exit(0)).start()
        return True
