"""Windows 10/11 Taskbar Progress (ITaskbarList3) & Completion Flash via ctypes.

Safe no-op on non-Windows platforms or headless test environments.
"""
from __future__ import annotations

import ctypes
import os
from ctypes import wintypes

TBPF_NOPROGRESS = 0x00000000
TBPF_INDETERMINATE = 0x00000001
TBPF_NORMAL = 0x00000002       # Green
TBPF_ERROR = 0x00000004        # Red
TBPF_PAUSED = 0x00000008       # Yellow


class _GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", wintypes.DWORD),
        ("Data2", wintypes.WORD),
        ("Data3", wintypes.WORD),
        ("Data4", ctypes.c_ubyte * 8),
    ]


class _FLASHWINFO(ctypes.Structure):
    _fields_ = [
        ("cbSize", wintypes.UINT),
        ("hwnd", wintypes.HWND),
        ("dwFlags", wintypes.DWORD),
        ("uCount", wintypes.UINT),
        ("dwTimeout", wintypes.DWORD),
    ]


# CLSID_TaskbarList = {56FDF344-FD6D-11D0-958A-006097C9A090}
_CLSID_TASKBAR_LIST = _GUID(
    0x56FDF344, 0xFD6D, 0x11D0, (ctypes.c_ubyte * 8)(0x95, 0x8A, 0x00, 0x60, 0x97, 0xC9, 0xA0, 0x90)
)
# IID_ITaskbarList3 = {EA1AFB91-9E28-4B86-90E9-9E9F8A5EEFAF}
_IID_ITASKBAR_LIST3 = _GUID(
    0xEA1AFB91, 0x9E28, 0x4B86, (ctypes.c_ubyte * 8)(0x90, 0xE9, 0x9E, 0x9F, 0x8A, 0x5E, 0xEF, 0xAF)
)


class TaskbarProgress:
    """Thin COM wrapper around ITaskbarList3 for Windows taskbar progress bars."""

    def __init__(self) -> None:
        self._ptr = ctypes.c_void_p(0)
        self._initialized = False

    def _ensure_com(self) -> bool:
        if os.name != "nt":
            return False
        if self._initialized:
            return bool(self._ptr.value)
        self._initialized = True
        try:
            ole32 = ctypes.windll.ole32
            ole32.CoInitializeEx(None, 0x2)  # COINIT_APARTMENTTHREADED
            CLSCTX_INPROC_SERVER = 0x1
            hr = ole32.CoCreateInstance(
                ctypes.byref(_CLSID_TASKBAR_LIST),
                None,
                CLSCTX_INPROC_SERVER,
                ctypes.byref(_IID_ITASKBAR_LIST3),
                ctypes.byref(self._ptr),
            )
            if hr != 0 or not self._ptr.value:
                self._ptr = ctypes.c_void_p(0)
                return False
            # vtable[3] = HrInit()
            vtable = ctypes.cast(self._ptr, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
            hr_init = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p)(vtable[3])
            hr_init(self._ptr)
            return True
        except Exception:
            self._ptr = ctypes.c_void_p(0)
            return False

    def _get_hwnd(self, window: object | None) -> int:
        if os.name != "nt" or window is None:
            return 0
        try:
            native = getattr(window, "native", None)
            if native is not None:
                handle = getattr(native, "Handle", None)
                if handle is not None:
                    val = int(handle.ToInt64()) if hasattr(handle, "ToInt64") else int(handle)
                    if val:
                        return val
        except Exception:
            pass
        try:
            user32 = ctypes.windll.user32
            hwnd = user32.FindWindowW(None, "QASSIMZ Hub")
            return int(hwnd or 0)
        except Exception:
            return 0

    def set_progress(self, window: object | None, completed: int, total: int = 100, state: int = TBPF_NORMAL) -> None:
        if os.name != "nt":
            return
        hwnd = self._get_hwnd(window)
        if not hwnd or not self._ensure_com():
            return
        try:
            vtable = ctypes.cast(self._ptr, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
            # vtable[9] = SetProgressValue(hwnd, ullCompleted, ullTotal)
            # vtable[10] = SetProgressState(hwnd, tbpFlags)
            set_state = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, wintypes.HWND, ctypes.c_int)(vtable[10])
            set_state(self._ptr, hwnd, state)
            if state in (TBPF_NORMAL, TBPF_PAUSED, TBPF_ERROR) and total > 0:
                set_val = ctypes.WINFUNCTYPE(
                    ctypes.c_long, ctypes.c_void_p, wintypes.HWND, ctypes.c_uint64, ctypes.c_uint64
                )(vtable[9])
                set_val(self._ptr, hwnd, max(0, min(completed, total)), total)
        except Exception:
            pass

    def clear(self, window: object | None) -> None:
        self.set_progress(window, 0, 100, TBPF_NOPROGRESS)

    def flash_complete(self, window: object | None) -> None:
        """Clear progress bar and emit a subtle 2-pulse taskbar flash on completion."""
        self.clear(window)
        if os.name != "nt":
            return
        hwnd = self._get_hwnd(window)
        if not hwnd:
            return
        try:
            fi = _FLASHWINFO()
            fi.cbSize = ctypes.sizeof(fi)
            fi.hwnd = hwnd
            fi.dwFlags = 0x00000002 | 0x0000000C  # FLASHW_TRAY | FLASHW_TIMERNOFG
            fi.uCount = 2
            fi.dwTimeout = 0
            ctypes.windll.user32.FlashWindowEx(ctypes.byref(fi))
        except Exception:
            pass
