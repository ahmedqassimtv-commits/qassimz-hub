"""QASSIMZ Hub — Download manager, serialized UAC-aware installer runner & self-updater."""
from __future__ import annotations

import ctypes
import hashlib
import os
import shlex
import ssl
import subprocess
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable

try:
    import certifi
except ImportError:
    certifi = None  # type: ignore

UA = "QASSIMZ-Hub/1.1 (Windows NT 10.0; Win64; x64)"


def ssl_context() -> ssl.SSLContext:
    if certifi is not None:
        try:
            return ssl.create_default_context(cafile=certifi.where())
        except Exception:
            pass
    return ssl.create_default_context()


def _friendly_download_error(exc: Exception) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        return "تعذّر إكمال التحديث حالياً، سنحاول لاحقاً."
    if isinstance(exc, (urllib.error.URLError, TimeoutError)):
        return "تعذّر الاتصال بالإنترنت حالياً، سنحاول لاحقاً."
    return "تعذّر إكمال التحديث حالياً، سنحاول لاحقاً."


def _run_elevated_and_wait(exe_path: str, params_list: list[str]) -> int:
    """Execute an installer on Windows with 'runas' UAC elevation and wait for completion."""
    if os.name != "nt":
        raise RuntimeError("التثبيت المباشر لملفات .exe متاح على نظام Windows فقط.")

    from ctypes import wintypes

    SEE_MASK_NOCLOSEPROCESS = 0x00000040
    SW_SHOWNORMAL = 1
    INFINITE = 0xFFFFFFFF

    class SHELLEXECUTEINFOW(ctypes.Structure):
        _fields_ = [
            ("cbSize", wintypes.DWORD),
            ("fMask", ctypes.c_ulong),
            ("hwnd", wintypes.HWND),
            ("lpVerb", wintypes.LPCWSTR),
            ("lpFile", wintypes.LPCWSTR),
            ("lpParameters", wintypes.LPCWSTR),
            ("lpDirectory", wintypes.LPCWSTR),
            ("nShow", ctypes.c_int),
            ("hInstApp", wintypes.HINSTANCE),
            ("lpIDList", ctypes.c_void_p),
            ("lpClass", wintypes.LPCWSTR),
            ("hkeyClass", wintypes.HKEY),
            ("dwHotKey", wintypes.DWORD),
            ("hIconOrMonitor", wintypes.HANDLE),
            ("hProcess", wintypes.HANDLE),
        ]

    params_str = subprocess.list2cmdline(params_list) if params_list else ""
    sei = SHELLEXECUTEINFOW()
    sei.cbSize = ctypes.sizeof(sei)
    sei.fMask = SEE_MASK_NOCLOSEPROCESS
    sei.hwnd = None
    sei.lpVerb = "runas"
    sei.lpFile = exe_path
    sei.lpParameters = params_str
    sei.lpDirectory = str(Path(exe_path).parent)
    sei.nShow = SW_SHOWNORMAL

    shell32 = ctypes.windll.shell32
    kernel32 = ctypes.windll.kernel32

    if not shell32.ShellExecuteExW(ctypes.byref(sei)):
        err = ctypes.GetLastError()
        if err == 1223:  # ERROR_CANCELLED (user declined UAC)
            raise RuntimeError("تم إلغاء صلاحية المسؤول (UAC) من قِبل المستخدم.")
        raise RuntimeError(f"تعذّر تشغيل المثبّت بصلاحية المسؤول (كود {err}).")

    if not sei.hProcess:
        return 0

    try:
        kernel32.WaitForSingleObject(sei.hProcess, INFINITE)
        exit_code = wintypes.DWORD(0)
        kernel32.GetExitCodeProcess(sei.hProcess, ctypes.byref(exit_code))
        return int(exit_code.value)
    finally:
        kernel32.CloseHandle(sei.hProcess)


def run_windows_installer(exe_path: Path, args: list[str], requires_admin: bool = False) -> int:
    """Run a Windows Setup .exe (silent or interactive), automatically handling UAC elevation when needed."""
    if os.name != "nt":
        raise RuntimeError("تشغيل معالج التثبيت (.exe) يعمل على نظام Windows.")

    if requires_admin:
        return _run_elevated_and_wait(str(exe_path), args)

    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        proc = subprocess.Popen([str(exe_path), *args], creationflags=creationflags)
        return proc.wait()
    except OSError as e:
        if getattr(e, "winerror", None) == 740:
            return _run_elevated_and_wait(str(exe_path), args)
        raise


def run_uninstall_command(uninstall_cmd: str, silent: bool = True) -> int:
    """Execute a Windows registry UninstallString cleanly."""
    if os.name != "nt":
        raise RuntimeError("إلغاء التثبيت يعمل على نظام Windows.")
    if not uninstall_cmd:
        raise RuntimeError("لم يتم العثور على أمر إلغاء التثبيت لهذا البرنامج.")

    parts = shlex.split(uninstall_cmd, posix=False)
    exe = parts[0].strip('"')
    extra = [p.strip('"') for p in parts[1:]]
    if silent and "unins" in Path(exe).name.lower():
        for flag in ("/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"):
            if flag.lower() not in [x.lower() for x in extra]:
                extra.append(flag)
    elif silent and "/S" not in extra:
        extra.append("/S")

    return run_windows_installer(Path(exe), extra, requires_admin=("program files" in exe.lower()))


class TaskQueue:
    """Concurrent downloads + serialized Windows installation lock + tracked Hub self-update."""

    def __init__(
        self,
        cache_dir: Path,
        on_finished: Callable[[str, dict[str, Any]], None] | None = None,
        on_self_update_ready: Callable[[Path], None] | None = None,
        on_progress: Callable[[list[dict[str, Any]]], None] | None = None,
    ):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.on_finished = on_finished
        self.on_self_update_ready = on_self_update_ready
        self.on_progress = on_progress
        self._lock = threading.Lock()
        self._install_lock = threading.Lock()
        self._tasks: dict[str, dict[str, Any]] = {}
        self._items: dict[str, tuple[dict[str, Any], bool, bool]] = {}
        self._cancel_flags: set[str] = set()
        self._pause_flags: set[str] = set()

    def _emit_progress(self) -> None:
        if callable(self.on_progress):
            try:
                self.on_progress(self.snapshot())
            except Exception:
                pass

    def snapshot(self) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(v) for v in self._tasks.values()]

    def active_filenames(self) -> set[str]:
        with self._lock:
            out: set[str] = set()
            for t in self._tasks.values():
                if t["status"] in ("queued", "checking", "downloading", "paused", "verifying", "installing"):
                    fn = t.get("part_name") or ""
                    if fn:
                        out.add(fn)
            return out

    def pause(self, item_id: str) -> bool:
        with self._lock:
            t = self._tasks.get(item_id)
            if not t or t["status"] not in ("queued", "checking", "downloading"):
                return False
            self._pause_flags.add(item_id)
            t["status"] = "paused"
            t["speed_bps"] = 0
            t["eta_sec"] = 0
            t["message_ar"] = "تم إيقاف التحميل مؤقتاً"
        self._emit_progress()
        return True

    def resume(self, item_id: str) -> bool:
        with self._lock:
            t = self._tasks.get(item_id)
            saved = self._items.get(item_id)
            if not t or not saved or t["status"] not in ("paused", "app_running", "error"):
                return False
            self._pause_flags.discard(item_id)
            self._cancel_flags.discard(item_id)
            t["status"] = "queued"
            t["stage"] = "checking"
            t["error"] = ""
            t["running_exe"] = ""
            t["message_ar"] = "جارٍ استئناف التحميل..."
            item, silent, self_update = saved
        self._emit_progress()
        threading.Thread(target=self._worker, args=(dict(item), silent, self_update), daemon=True).start()
        return True

    def set_auto_launch(self, item_id: str, enabled: bool) -> bool:
        with self._lock:
            t = self._tasks.get(item_id)
            if not t:
                return False
            t["auto_launch"] = bool(enabled)
        return True

    def get_auto_launch(self, item_id: str) -> bool:
        with self._lock:
            t = self._tasks.get(item_id)
            return bool(t and t.get("auto_launch"))

    def force_close_and_retry(self, item_id: str) -> bool:
        exe_name = ""
        with self._lock:
            t = self._tasks.get(item_id)
            if not t:
                return False
            exe_name = str(t.get("running_exe") or "").strip()
        if os.name == "nt" and exe_name:
            try:
                no_win = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
                subprocess.run(["taskkill", "/F", "/IM", exe_name], creationflags=no_win, timeout=8, check=False)
                time.sleep(0.5)
            except Exception:
                pass
        return self.resume(item_id)

    def cancel(self, item_id: str) -> bool:
        with self._lock:
            t = self._tasks.get(item_id)
            if not t:
                return False
            if t["status"] in ("queued", "checking", "downloading", "paused", "app_running"):
                self._cancel_flags.add(item_id)
                self._pause_flags.discard(item_id)
                t["status"] = "cancelled"
                t["stage"] = "cancelled"
                t["speed_bps"] = 0
                t["eta_sec"] = 0
                t["message_ar"] = "تم إلغاء التنزيل"
                ok = True
            else:
                ok = False
        if ok:
            self._emit_progress()
        return ok

    def clear_finished(self) -> bool:
        with self._lock:
            done_ids = [k for k, v in self._tasks.items() if v["status"] in ("completed", "error", "cancelled")]
            for k in done_ids:
                self._tasks.pop(k, None)
        self._emit_progress()
        return True

    def enqueue_install(self, item: dict[str, Any], silent: bool = True, self_update: bool = False) -> dict[str, Any]:
        item_id = item["id"]
        with self._lock:
            cur = self._tasks.get(item_id)
            if cur and cur["status"] in ("queued", "checking", "downloading", "verifying", "installing"):
                return dict(cur)
            self._cancel_flags.discard(item_id)
            self._pause_flags.discard(item_id)
            self._items[item_id] = (dict(item), silent, self_update)
            task = {
                "id": item_id,
                "code": item.get("code", "Qh"),
                "name": item.get("name", item_id),
                "name_ar": item.get("name_ar", item.get("name", item_id)),
                "accent": item.get("accent", "#38BDF8"),
                "version": item.get("version", "1.0.0"),
                "status": "queued",
                "stage": "checking",
                "update_mode": "full",
                "progress": 0,
                "downloaded": 0,
                "total": int(item.get("setup_size") or 0),
                "speed_bps": 0,
                "eta_sec": 0,
                "delta_saved_bytes": 0,
                "delta_saved_pct": 0.0,
                "delta_full_size": int(item.get("delta_qpkg_size") or item.get("setup_size") or 0),
                "delta_chunks_done": 0,
                "delta_chunks_total": 0,
                "delta_fallback_reason": "",
                "silent": silent,
                "self_update": self_update,
                "auto_launch": False,
                "running_exe": "",
                "message_ar": "فحص المساحة والعمليات النشطة...",
                "error": "",
                "started_at": time.time(),
            }
            self._tasks[item_id] = task

        self._emit_progress()
        threading.Thread(target=self._worker, args=(dict(item), silent, self_update), daemon=True).start()
        return dict(task)

    def _update(self, item_id: str, **fields: Any) -> None:
        with self._lock:
            if item_id in self._tasks:
                self._tasks[item_id].update(fields)
        self._emit_progress()

    def _candidate_urls(self, item: dict[str, Any]) -> list[str]:
        urls: list[str] = []
        primary = (item.get("setup_url") or "").strip()
        if primary:
            urls.append(primary)
        fallback = (item.get("fallback_setup_url") or "").strip()
        if fallback and fallback not in urls:
            urls.append(fallback)
        # Auto-derive direct GitHub release fallback for public repos
        if item.get("repo_public") and item.get("repo") and item.get("setup_filename") and item.get("version"):
            ver = str(item["version"]).lstrip("v")
            direct = f"https://github.com/{item['repo']}/releases/download/v{ver}/{item['setup_filename']}"
            if direct not in urls:
                urls.append(direct)
        return urls

    def _download_with_fallback(
        self,
        item_id: str,
        urls: list[str],
        part: Path,
        expected_size: int,
        expected_sha: str,
    ) -> bool:
        """Download from candidate URLs with HTTP Range resume, pause & fallback. Returns False if cancelled/paused."""
        last_err: Exception | None = None
        for url in urls:
            for attempt in range(2):
                if item_id in self._cancel_flags:
                    part.unlink(missing_ok=True)
                    self._update(item_id, status="cancelled", stage="cancelled", message_ar="تم إلغاء التنزيل")
                    return False
                if item_id in self._pause_flags:
                    return False
                try:
                    existing_bytes = part.stat().st_size if part.is_file() else 0
                    headers = {"User-Agent": UA, "Accept": "*/*"}
                    if existing_bytes > 0:
                        headers["Range"] = f"bytes={existing_bytes}-"
                    self._update(
                        item_id,
                        status="downloading",
                        stage="downloading",
                        part_name=part.name,
                        progress=max(1, int(existing_bytes * 100 / expected_size)) if expected_size > 0 else 1,
                        message_ar="جارٍ استئناف التحميل..." if existing_bytes > 0 else ("جارٍ الاتصال بخادم التوزيع..." if attempt == 0 else "إعادة المحاولة للاتصال..."),
                    )
                    req = urllib.request.Request(url, headers=headers)
                    with urllib.request.urlopen(req, timeout=45, context=ssl_context()) as resp:
                        status_code = getattr(resp, "status", 200)
                        resumed = existing_bytes > 0 and status_code == 206
                        clen = int(resp.headers.get("Content-Length") or 0)
                        total = (existing_bytes + clen) if resumed and clen > 0 else (clen or expected_size or 0)
                        downloaded = existing_bytes if resumed else 0
                        mode = "ab" if resumed else "wb"
                        self._update(item_id, total=total, downloaded=downloaded, message_ar="جارٍ التحميل...")
                        t0 = time.monotonic()
                        session_bytes = 0
                        last_tick = t0

                        with open(part, mode) as fh:
                            while True:
                                if item_id in self._cancel_flags:
                                    part.unlink(missing_ok=True)
                                    self._update(item_id, status="cancelled", stage="cancelled", message_ar="تم إلغاء التنزيل")
                                    return False
                                if item_id in self._pause_flags:
                                    self._update(item_id, status="paused", speed_bps=0, eta_sec=0, message_ar="تم إيقاف التحميل مؤقتاً")
                                    return False
                                chunk = resp.read(65536)
                                if not chunk:
                                    break
                                fh.write(chunk)
                                downloaded += len(chunk)
                                session_bytes += len(chunk)

                                now = time.monotonic()
                                if now - last_tick >= 0.16 or (total and downloaded >= total):
                                    elapsed = max(0.05, now - t0)
                                    speed = int(session_bytes / elapsed)
                                    pct = min(96, int(downloaded * 100 / total)) if total > 0 else 50
                                    eta = int((total - downloaded) / speed) if (total > downloaded and speed > 0) else 0
                                    self._update(
                                        item_id,
                                        downloaded=downloaded,
                                        progress=pct,
                                        speed_bps=speed,
                                        eta_sec=eta,
                                    )
                                    last_tick = now

                        if downloaded <= 0:
                            part.unlink(missing_ok=True)
                            raise RuntimeError("تم تنزيل ملف فارغ من الخادم.")

                        # Stage 3: SHA-256 verification
                        self._update(
                            item_id,
                            status="verifying",
                            stage="verifying",
                            progress=97,
                            speed_bps=0,
                            eta_sec=0,
                            message_ar="جارٍ التحقق من سلامة الحزمة (SHA-256)...",
                        )
                        if expected_sha and self._sha256(part) != expected_sha:
                            part.unlink(missing_ok=True)
                            raise RuntimeError("فشل التحقق من سلامة الملف المحمّل (SHA-256 mismatch).")
                        return True
                except urllib.error.HTTPError as e:
                    if e.code == 416:
                        part.unlink(missing_ok=True)
                        continue
                    last_err = e
                    if e.code in (401, 403, 404):
                        part.unlink(missing_ok=True)
                        break
                    time.sleep(0.8)
                except Exception as e:
                    last_err = e
                    time.sleep(0.8)

        raise RuntimeError(_friendly_download_error(last_err or RuntimeError("رابط التحميل غير متاح.")))

    def _try_delta_update(self, item: dict[str, Any], silent: bool, self_update: bool) -> tuple[bool, str]:
        """Attempt differential update via DeltaUpdater.

        Returns `(handled, fallback_reason)`:
          - `(True, "")` when delta completed or was cancelled (caller should stop).
          - `(False, reason)` when caller should proceed with full Setup.exe download.
        """
        item_id = item["id"]
        if not silent and not self_update:
            return False, ""

        state = item.get("state") or {}
        install_dir_raw = (item.get("install_dir") or state.get("install_dir") or state.get("cep_dir") or "").strip()
        is_installed = bool(state.get("installed") or self_update or install_dir_raw)

        # Only attempt delta when app is already installed and we have a manifest URL or repo+version
        if not is_installed or not install_dir_raw:
            return False, ""

        try:
            from delta_updater import DeltaUpdater
        except Exception:
            return False, ""

        manifest_urls = DeltaUpdater.candidate_manifest_urls(item)
        if not manifest_urls:
            return False, ""

        install_dir = Path(install_dir_raw)
        updater = DeltaUpdater()

        stage_ar_map = {
            "manifest": "جارٍ فحص بيان التحديث الذكي (manifest.json)...",
            "scanning": "جارٍ مقارنة الملفات المثبّتة لحساب الفروقات...",
            "downloading": "جارٍ تنزيل الأجزاء المتغيرة فقط (تحديث تفاضلي)...",
            "verifying": "جارٍ التحقق من سلامة الأجزاء (SHA-256)...",
            "applying": "جارٍ تطبيق التحديث التفاضلي بشكل ذري آمن...",
            "completed": "اكتمل التحديث التفاضلي بنجاح ✓",
        }

        def _on_progress(payload: dict[str, Any]) -> None:
            st = payload.get("stage", "downloading")
            status_val = "installing" if st in ("verifying", "applying") else "downloading"
            if st == "completed":
                status_val = "completed"
            upd = dict(payload)
            upd["status"] = status_val
            upd["message_ar"] = stage_ar_map.get(st, "جارٍ التحديث التفاضلي...")
            self._update(item_id, **upd)

        def _cancel_check() -> bool:
            with self._lock:
                return item_id in self._cancel_flags

        self._update(
            item_id,
            update_mode="delta",
            stage="manifest",
            status="downloading",
            progress=1,
            message_ar=stage_ar_map["manifest"],
        )

        res = updater.apply_delta_update(
            item,
            install_dir,
            self.cache_dir,
            cancel_check=_cancel_check,
            on_progress=_on_progress,
            stage_only=self_update,
        )

        if res.cancelled:
            self._update(
                item_id,
                status="cancelled",
                stage="cancelled",
                speed_bps=0,
                eta_sec=0,
                message_ar="تم إلغاء التحديث",
            )
            return True, ""

        if res.ok:
            if self_update:
                self._update(
                    item_id,
                    status="installing",
                    stage="applying",
                    progress=99,
                    speed_bps=0,
                    eta_sec=0,
                    delta_saved_bytes=res.saved_bytes,
                    delta_saved_pct=res.saved_pct,
                    delta_full_size=res.full_package_bytes,
                    delta_chunks_done=res.chunks_downloaded,
                    delta_chunks_total=res.chunks_downloaded,
                    message_ar="جارٍ تطبيق التحديث التفاضلي وإعادة التشغيل تلقائياً...",
                )
                if self.on_self_update_ready and res.staged_dir:
                    self.on_self_update_ready(Path(res.staged_dir))
                self._update(
                    item_id,
                    status="completed",
                    stage="completed",
                    progress=100,
                    message_ar=f"اكتمل التحديث التفاضلي — تم توفير {res.saved_pct:.0f}% من الحجم ✓",
                )
                return True, ""

            self._update(
                item_id,
                status="completed",
                stage="completed",
                progress=100,
                speed_bps=0,
                eta_sec=0,
                downloaded=res.downloaded_bytes,
                total=res.downloaded_bytes,
                delta_saved_bytes=res.saved_bytes,
                delta_saved_pct=res.saved_pct,
                delta_full_size=res.full_package_bytes,
                delta_chunks_done=res.chunks_downloaded,
                delta_chunks_total=res.chunks_downloaded,
                message_ar=f"اكتمل التحديث التفاضلي — تم توفير {res.saved_pct:.0f}% من الحجم ✓",
            )
            if self.on_finished:
                self.on_finished(item_id, item)
            return True, ""

        # Fallback needed
        reason = res.fallback_reason or "delta_error"
        self._update(
            item_id,
            update_mode="fallback",
            stage="downloading",
            delta_fallback_reason=reason,
            progress=0,
            downloaded=0,
            total=int(item.get("setup_size") or 0),
            message_ar="جارٍ التبديل التلقائي إلى التنزيل الكامل (Setup.exe)...",
        )
        return False, reason

    @staticmethod
    def _detect_running_exe(item: dict[str, Any]) -> str:
        """Return running exe filename on Windows if the target desktop app is open."""
        if os.name != "nt" or item.get("category") == "adobe":
            return ""
        state = item.get("state") or {}
        exe_path = str(state.get("exe_path") or "").strip()
        exe_name = Path(exe_path).name if exe_path else ""
        if not exe_name:
            detect = item.get("detect") or {}
            exe_names = detect.get("exe_names") or []
            if exe_names:
                exe_name = str(exe_names[0])
        if not exe_name or exe_name.lower() == "qassimz hub.exe":
            return ""
        try:
            no_win = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
            out = subprocess.check_output(
                ["tasklist", "/FI", f"IMAGENAME eq {exe_name}", "/NH"],
                creationflags=no_win,
                text=True,
                timeout=4,
            )
            if exe_name.lower() in out.lower():
                return exe_name
        except Exception:
            pass
        return ""

    def _worker(self, item: dict[str, Any], silent: bool, self_update: bool) -> None:
        item_id = item["id"]
        expected_size = int(item.get("setup_size") or 0)

        # Stage 1: Checking disk space & running processes
        self._update(
            item_id,
            status="checking",
            stage="checking",
            progress=2,
            message_ar="فحص المساحة المتاحة والعمليات النشطة...",
        )
        try:
            import shutil

            free_bytes = shutil.disk_usage(self.cache_dir).free
            needed = max(50 * 1024 * 1024, int(expected_size * 1.5))
            if free_bytes < needed:
                need_mb = round(needed / (1024 * 1024))
                self._update(
                    item_id,
                    status="error",
                    stage="error",
                    error=f"المساحة المتاحة على القرص غير كافية (مطلوب {need_mb} MB على الأقل).",
                    message_ar="مساحة القرص غير كافية",
                )
                return
        except Exception:
            pass

        if not self_update:
            running_exe = self._detect_running_exe(item)
            if running_exe:
                self._update(
                    item_id,
                    status="app_running",
                    stage="checking",
                    running_exe=running_exe,
                    speed_bps=0,
                    eta_sec=0,
                    message_ar=f"البرنامج {running_exe} قيد التشغيل حالياً — أغلقه لمتابعة التحديث بأمان",
                )
                return

        # 1b. Try delta update first when eligible
        handled, fallback_reason = self._try_delta_update(item, silent, self_update)
        if handled:
            return

        urls = self._candidate_urls(item)
        if not urls:
            self._update(item_id, status="error", stage="error", error="رابط التحميل غير متاح حالياً.", message_ar="فشل التحميل")
            return

        fname = item.get("setup_filename") or urls[0].rsplit("/", 1)[-1]
        version_tag = item.get("version", "latest")
        dst = self.cache_dir / f"{item_id}-{version_tag}-{fname}"
        part = self.cache_dir / f"{dst.name}.part"
        expected_sha = (item.get("setup_sha256") or "").strip().lower()

        try:
            if not fallback_reason:
                self._update(item_id, update_mode="full", stage="downloading")
            need_download = True
            if dst.is_file():
                fsize = dst.stat().st_size
                if fsize > 4096 and (not expected_size or fsize == expected_size):
                    self._update(item_id, status="verifying", stage="verifying", progress=97, message_ar="جارٍ التحقق من الحزمة المخزنة...")
                    if not expected_sha or self._sha256(dst) == expected_sha:
                        need_download = False
                else:
                    dst.unlink(missing_ok=True)

            if need_download:
                ok = self._download_with_fallback(item_id, urls, part, expected_size, expected_sha)
                if not ok:
                    return
                part.replace(dst)

            # Self-update path for QASSIMZ Hub itself
            if self_update:
                self._update(
                    item_id,
                    status="installing",
                    stage="installing",
                    progress=99,
                    speed_bps=0,
                    eta_sec=0,
                    message_ar="جارٍ تطبيق تحديث QASSIMZ Hub وإعادة التشغيل تلقائياً...",
                )
                if self.on_self_update_ready:
                    self.on_self_update_ready(dst)
                self._update(item_id, status="completed", stage="completed", progress=100, message_ar="جاهز لإعادة التشغيل بالتحديث الجديد")
                return

            # Stage 4: Serialize Windows installer execution to prevent UAC / Inno Setup / NSIS collisions
            self._update(
                item_id,
                status="installing",
                stage="installing",
                progress=98,
                speed_bps=0,
                eta_sec=0,
                message_ar="في انتظار دور التثبيت...",
            )

            with self._install_lock:
                inst_cfg = item.get("install") or {}
                requires_admin = bool(inst_cfg.get("requires_admin", False))
                args = list(inst_cfg.get("silent_args") or []) if silent else []
                self._update(
                    item_id,
                    status="installing",
                    stage="installing",
                    progress=99,
                    message_ar="يرجى الموافقة على صلاحية المسؤول (UAC) لإتمام التثبيت..." if requires_admin else "جارٍ التثبيت الآن...",
                )

                if os.name == "nt":
                    code = run_windows_installer(dst, args, requires_admin=requires_admin)
                    if code != 0:
                        raise RuntimeError(f"انتهى معالج التثبيت بكود خطأ ({code}).")
                    self._update(item_id, status="completed", stage="completed", progress=100, message_ar="اكتمل التثبيت بنجاح ✓")
                else:
                    self._update(
                        item_id,
                        status="completed",
                        stage="completed",
                        progress=100,
                        message_ar=f"تم تنزيل الحزمة بنجاح إلى مجلد التخزين ({dst.name})",
                    )

            if self.on_finished:
                self.on_finished(item_id, item)
        except Exception as e:
            part.unlink(missing_ok=True)
            self._update(item_id, status="error", stage="error", error=str(e), message_ar=f"خطأ: {e}")

    @staticmethod
    def _sha256(p: Path) -> str:
        h = hashlib.sha256()
        with open(p, "rb") as fh:
            while True:
                b = fh.read(131072)
                if not b:
                    break
                h.update(b)
        return h.hexdigest().lower()
