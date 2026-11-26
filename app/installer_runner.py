"""QASSIMZ Hub — Download manager & Windows UAC-aware installer runner."""
from __future__ import annotations

import ctypes
import hashlib
import os
import shlex
import ssl
import subprocess
import threading
import time
import urllib.request
from pathlib import Path
from typing import Any, Callable

try:
    import certifi
except ImportError:
    certifi = None  # type: ignore

UA = "QASSIMZ-Hub/1.0 (Windows NT 10.0; Win64; x64)"


def ssl_context() -> ssl.SSLContext:
    if certifi is not None:
        try:
            return ssl.create_default_context(cafile=certifi.where())
        except Exception:
            pass
    return ssl.create_default_context()


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
    """Manages sequential/concurrent downloads & installations with real-time progress telemetry."""

    def __init__(self, cache_dir: Path, on_finished: Callable[[str], None] | None = None):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.on_finished = on_finished
        self._lock = threading.Lock()
        self._tasks: dict[str, dict[str, Any]] = {}
        self._cancel_flags: set[str] = set()

    def snapshot(self) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(v) for v in self._tasks.values()]

    def cancel(self, item_id: str) -> bool:
        with self._lock:
            t = self._tasks.get(item_id)
            if not t:
                return False
            if t["status"] in ("queued", "downloading"):
                self._cancel_flags.add(item_id)
                t["status"] = "cancelled"
                t["message_ar"] = "تم إلغاء التنزيل"
                return True
        return False

    def clear_finished(self) -> bool:
        with self._lock:
            done_ids = [k for k, v in self._tasks.items() if v["status"] in ("completed", "error", "cancelled")]
            for k in done_ids:
                self._tasks.pop(k, None)
        return True

    def enqueue_install(self, item: dict[str, Any], silent: bool = True) -> dict[str, Any]:
        item_id = item["id"]
        with self._lock:
            cur = self._tasks.get(item_id)
            if cur and cur["status"] in ("queued", "downloading", "installing"):
                return dict(cur)
            self._cancel_flags.discard(item_id)
            task = {
                "id": item_id,
                "code": item.get("code", "Qh"),
                "name": item.get("name", item_id),
                "name_ar": item.get("name_ar", item.get("name", item_id)),
                "accent": item.get("accent", "#38BDF8"),
                "version": item.get("version", "1.0.0"),
                "status": "queued",
                "progress": 0,
                "downloaded": 0,
                "total": int(item.get("setup_size") or 0),
                "speed_bps": 0,
                "eta_sec": 0,
                "silent": silent,
                "message_ar": "في انتظار بدء التحميل...",
                "error": "",
                "started_at": time.time(),
            }
            self._tasks[item_id] = task

        threading.Thread(target=self._worker, args=(item, silent), daemon=True).start()
        return dict(task)

    def _update(self, item_id: str, **fields: Any) -> None:
        with self._lock:
            if item_id in self._tasks:
                self._tasks[item_id].update(fields)

    def _worker(self, item: dict[str, Any], silent: bool) -> None:
        item_id = item["id"]
        url = item.get("setup_url") or ""
        if not url:
            self._update(item_id, status="error", error="رابط التحميل غير متاح حالياً.", message_ar="فشل التحميل")
            return

        fname = item.get("setup_filename") or url.rsplit("/", 1)[-1]
        version_tag = item.get("version", "latest")
        dst = self.cache_dir / f"{item_id}-{version_tag}-{fname}"
        part = self.cache_dir / f"{dst.name}.part"
        expected_sha = (item.get("setup_sha256") or "").strip().lower()

        try:
            need_download = True
            if dst.is_file() and dst.stat().st_size > 0:
                if not expected_sha or self._sha256(dst) == expected_sha:
                    need_download = False

            if need_download:
                self._update(item_id, status="downloading", progress=1, message_ar="جارٍ الاتصال بخادم التوزيع...")
                req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
                with urllib.request.urlopen(req, timeout=45, context=ssl_context()) as resp:
                    total = int(resp.headers.get("Content-Length") or item.get("setup_size") or 0)
                    self._update(item_id, total=total, message_ar="جارٍ التحميل...")
                    downloaded = 0
                    t0 = time.monotonic()
                    last_tick = t0
                    hasher = hashlib.sha256()

                    with open(part, "wb") as fh:
                        while True:
                            if item_id in self._cancel_flags:
                                part.unlink(missing_ok=True)
                                self._update(item_id, status="cancelled", message_ar="تم إلغاء التنزيل")
                                return
                            chunk = resp.read(65536)
                            if not chunk:
                                break
                            fh.write(chunk)
                            hasher.update(chunk)
                            downloaded += len(chunk)

                            now = time.monotonic()
                            if now - last_tick >= 0.18 or (total and downloaded >= total):
                                elapsed = max(0.05, now - t0)
                                speed = int(downloaded / elapsed)
                                pct = min(99, int(downloaded * 100 / total)) if total > 0 else 50
                                eta = int((total - downloaded) / speed) if (total > downloaded and speed > 0) else 0
                                self._update(
                                    item_id,
                                    downloaded=downloaded,
                                    progress=pct,
                                    speed_bps=speed,
                                    eta_sec=eta,
                                )
                                last_tick = now

                    if expected_sha and hasher.hexdigest().lower() != expected_sha:
                        part.unlink(missing_ok=True)
                        raise RuntimeError("فشل التحقق من سلامة الملف المحمّل (SHA-256 mismatch).")

                    part.replace(dst)

            # Installation phase
            inst_cfg = item.get("install") or {}
            requires_admin = bool(inst_cfg.get("requires_admin", False))
            args = list(inst_cfg.get("silent_args") or []) if silent else []
            self._update(
                item_id,
                status="installing",
                progress=99,
                speed_bps=0,
                eta_sec=0,
                message_ar="يرجى الموافقة على صلاحية المسؤول (UAC) لإتمام التثبيت..." if requires_admin else "جارٍ التثبيت الآن...",
            )

            if os.name == "nt":
                code = run_windows_installer(dst, args, requires_admin=requires_admin)
                if code != 0:
                    raise RuntimeError(f"انتهى معالج التثبيت بكود خطأ ({code}).")
                self._update(item_id, status="completed", progress=100, message_ar="اكتمل التثبيت بنجاح")
            else:
                # Non-Windows environment: keep downloaded installer ready in cache folder
                self._update(
                    item_id,
                    status="completed",
                    progress=100,
                    message_ar=f"تم تنزيل الحزمة بنجاح إلى مجلد التخزين ({dst.name})",
                )

            if self.on_finished:
                self.on_finished(item_id)
        except Exception as e:
            part.unlink(missing_ok=True)
            self._update(item_id, status="error", error=str(e), message_ar=f"خطأ: {e}")

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
