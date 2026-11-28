"""QASSIMZ Hub — Window State Persistence & Multi-Monitor Bounds Verification.

Phase 1 (Core Desktop Architecture):
- Persists logical size, position, maximized state, and monitor name atomically.
- Enumerates connected Windows displays (EnumDisplayMonitors + GetMonitorInfoW).
- Restores saved (x, y) ONLY if the full window rectangle lies strictly inside an
  active monitor's work area; if an external monitor was unplugged, preserves logical
  size (clamped to primary work area) and centers cleanly on the primary visible monitor.
"""
from __future__ import annotations

import json
import os
import threading
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from crash_logger import atomic_write_json

MIN_WINDOW_W = 900
MIN_WINDOW_H = 620
DEFAULT_WINDOW_W = 1360
DEFAULT_WINDOW_H = 860


@dataclass(frozen=True)
class MonitorWorkArea:
    name: str
    left: int
    top: int
    width: int
    height: int
    is_primary: bool = False

    @property
    def right(self) -> int:
        return self.left + self.width

    @property
    def bottom(self) -> int:
        return self.top + self.height

    def contains_rect(self, x: int, y: int, w: int, h: int) -> bool:
        """Return True iff the entire rectangle [x, y, x+w, y+h] sits inside this monitor's work area."""
        return (
            x >= self.left
            and y >= self.top
            and (x + w) <= self.right
            and (y + h) <= self.bottom
        )


@dataclass
class SavedWindowState:
    x: int | None = None
    y: int | None = None
    width: int = DEFAULT_WINDOW_W
    height: int = DEFAULT_WINDOW_H
    maximized: bool = False
    monitor_name: str = ""


def enumerate_windows_monitors() -> list[MonitorWorkArea]:
    """Enumerate all connected Windows monitors with device names and taskbar-excluded work areas."""
    if os.name != "nt":
        return []
    try:
        import ctypes
        from ctypes import wintypes

        class MONITORINFOEXW(ctypes.Structure):
            _fields_ = [
                ("cbSize", wintypes.DWORD),
                ("rcMonitor", wintypes.RECT),
                ("rcWork", wintypes.RECT),
                ("dwFlags", wintypes.DWORD),
                ("szDevice", wintypes.WCHAR * 32),
            ]

        monitors: list[MonitorWorkArea] = []
        user32 = ctypes.windll.user32
        MONITORENUMPROC = ctypes.WINFUNCTYPE(
            wintypes.BOOL,
            wintypes.HMONITOR,
            wintypes.HDC,
            ctypes.POINTER(wintypes.RECT),
            wintypes.LPARAM,
        )

        def _cb(hmon: Any, _hdc: Any, _lprc: Any, _data: Any) -> bool:
            info = MONITORINFOEXW()
            info.cbSize = ctypes.sizeof(MONITORINFOEXW)
            if user32.GetMonitorInfoW(hmon, ctypes.byref(info)):
                rc = info.rcWork
                w = rc.right - rc.left
                h = rc.bottom - rc.top
                if w > 300 and h > 200:
                    monitors.append(
                        MonitorWorkArea(
                            name=str(info.szDevice or ""),
                            left=int(rc.left),
                            top=int(rc.top),
                            width=int(w),
                            height=int(h),
                            is_primary=bool(info.dwFlags & 1),
                        )
                    )
            return True

        user32.EnumDisplayMonitors(0, 0, MONITORENUMPROC(_cb), 0)
        return monitors
    except Exception:
        return []


def validate_window_rect(
    saved: SavedWindowState | None,
    monitors: list[MonitorWorkArea],
    default_w: int = DEFAULT_WINDOW_W,
    default_h: int = DEFAULT_WINDOW_H,
) -> tuple[int, int, int, int, bool, str]:
    """Resolve safe (x, y, width, height, maximized, monitor_name) guaranteed to be visible on screen."""
    primary = next((m for m in monitors if m.is_primary), monitors[0] if monitors else None)

    raw_w = int(saved.width) if (saved and saved.width) else default_w
    raw_h = int(saved.height) if (saved and saved.height) else default_h
    w = max(MIN_WINDOW_W, raw_w)
    h = max(MIN_WINDOW_H, raw_h)
    want_max = bool(saved.maximized) if saved else False

    # 1. Check if saved position lies completely inside a currently connected monitor's work area
    if saved and saved.x is not None and saved.y is not None and monitors:
        sx, sy = int(saved.x), int(saved.y)
        # Prefer the previously recorded monitor if still connected and containing the full rect
        ordered = sorted(
            monitors,
            key=lambda m: (0 if saved.monitor_name and m.name == saved.monitor_name else 1),
        )
        for mon in ordered:
            if mon.contains_rect(sx, sy, w, h):
                return (sx, sy, w, h, want_max, mon.name)

    # 2. External monitor unplugged or rect out-of-bounds: preserve logical dimensions
    #    (clamped to primary work area) and open centered on the primary visible monitor.
    if primary is not None:
        safe_w = min(w, max(MIN_WINDOW_W, primary.width - 32))
        safe_h = min(h, max(MIN_WINDOW_H, primary.height - 32))
        cx = primary.left + max(0, (primary.width - safe_w) // 2)
        cy = primary.top + max(0, (primary.height - safe_h) // 2)
        return (cx, cy, safe_w, safe_h, want_max, primary.name)

    return (80, 60, w, h, want_max, "")


class WindowStateStore:
    """Thread-safe atomic persistence for logical window bounds and monitor identity."""

    def __init__(self, root: Path):
        self.file = root / "window_state.json"
        self._lock = threading.Lock()

    def load(self) -> SavedWindowState | None:
        with self._lock:
            if not self.file.is_file():
                return None
            try:
                raw = json.loads(self.file.read_text(encoding="utf-8"))
                if not isinstance(raw, dict):
                    return None
                return SavedWindowState(
                    x=int(raw["x"]) if raw.get("x") is not None else None,
                    y=int(raw["y"]) if raw.get("y") is not None else None,
                    width=int(raw.get("width") or DEFAULT_WINDOW_W),
                    height=int(raw.get("height") or DEFAULT_WINDOW_H),
                    maximized=bool(raw.get("maximized", False)),
                    monitor_name=str(raw.get("monitor_name") or ""),
                )
            except Exception:
                return None

    def save(self, state: SavedWindowState) -> None:
        with self._lock:
            try:
                atomic_write_json(self.file, asdict(state))
            except Exception:
                pass

    def capture_from_window(
        self,
        win: Any,
        is_maximized: bool = False,
        restore_bounds: tuple[int, int, int, int] | None = None,
    ) -> SavedWindowState | None:
        """Read logical window bounds (using restore_bounds when maximized) and persist atomically."""
        if win is None:
            return None
        try:
            if is_maximized and restore_bounds:
                x, y, w, h = restore_bounds
            else:
                x = int(getattr(win, "x", 0) or 0)
                y = int(getattr(win, "y", 0) or 0)
                w = int(getattr(win, "width", DEFAULT_WINDOW_W) or DEFAULT_WINDOW_W)
                h = int(getattr(win, "height", DEFAULT_WINDOW_H) or DEFAULT_WINDOW_H)
            # Never persist the tiny 480x310 splash window dimensions
            if w < MIN_WINDOW_W or h < MIN_WINDOW_H:
                return None
            mon_name = ""
            monitors = enumerate_windows_monitors()
            cx, cy = x + w // 2, y + h // 2
            for mon in monitors:
                if mon.left <= cx < mon.right and mon.top <= cy < mon.bottom:
                    mon_name = mon.name
                    break
            st = SavedWindowState(
                x=x,
                y=y,
                width=w,
                height=h,
                maximized=bool(is_maximized),
                monitor_name=mon_name,
            )
            self.save(st)
            return st
        except Exception:
            return None
