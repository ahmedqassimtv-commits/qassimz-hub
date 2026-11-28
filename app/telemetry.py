"""Cross-platform live hardware telemetry (CPU, RAM, Disk) & Hub cache cleaner."""
from __future__ import annotations

import ctypes
import os
import shutil
import threading
from pathlib import Path
from typing import Any


class _MEMORYSTATUSEX(ctypes.Structure):
    _fields_ = [
        ("dwLength", ctypes.c_uint32),
        ("dwMemoryLoad", ctypes.c_uint32),
        ("ullTotalPhys", ctypes.c_uint64),
        ("ullAvailPhys", ctypes.c_uint64),
        ("ullTotalPageFile", ctypes.c_uint64),
        ("ullAvailPageFile", ctypes.c_uint64),
        ("ullTotalVirtual", ctypes.c_uint64),
        ("ullAvailVirtual", ctypes.c_uint64),
        ("ullAvailExtendedVirtual", ctypes.c_uint64),
    ]


class _FILETIME(ctypes.Structure):
    _fields_ = [("dwLowDateTime", ctypes.c_uint32), ("dwHighDateTime", ctypes.c_uint32)]


class TelemetryMonitor:
    """Zero-dependency lightweight CPU/RAM/Disk monitor with delta CPU calculation."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._prev_idle = 0
        self._prev_total = 0

    def _cpu_percent(self) -> float:
        if os.name == "nt":
            try:
                idle_ft, kernel_ft, user_ft = _FILETIME(), _FILETIME(), _FILETIME()
                if ctypes.windll.kernel32.GetSystemTimes(
                    ctypes.byref(idle_ft), ctypes.byref(kernel_ft), ctypes.byref(user_ft)
                ):
                    idle = (idle_ft.dwHighDateTime << 32) | idle_ft.dwLowDateTime
                    kernel = (kernel_ft.dwHighDateTime << 32) | kernel_ft.dwLowDateTime
                    user = (user_ft.dwHighDateTime << 32) | user_ft.dwLowDateTime
                    total = kernel + user
                    with self._lock:
                        d_idle = idle - self._prev_idle
                        d_total = total - self._prev_total
                        self._prev_idle = idle
                        self._prev_total = total
                    if d_total > 0:
                        return round(max(0.0, min(100.0, (1.0 - d_idle / d_total) * 100.0)), 1)
            except Exception:
                pass
            return 0.0

        # Linux /proc/stat
        try:
            with open("/proc/stat", "r", encoding="utf-8") as fh:
                parts = fh.readline().split()
            if parts and parts[0] == "cpu":
                vals = [int(x) for x in parts[1:]]
                idle = vals[3] + (vals[4] if len(vals) > 4 else 0)
                total = sum(vals)
                with self._lock:
                    d_idle = idle - self._prev_idle
                    d_total = total - self._prev_total
                    self._prev_idle = idle
                    self._prev_total = total
                if d_total > 0:
                    return round(max(0.0, min(100.0, (1.0 - d_idle / d_total) * 100.0)), 1)
        except Exception:
            pass
        return 0.0

    def _ram_stats(self) -> tuple[float, float, float]:
        """Returns (ram_pct, used_gb, total_gb)."""
        if os.name == "nt":
            try:
                ms = _MEMORYSTATUSEX()
                ms.dwLength = ctypes.sizeof(ms)
                if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(ms)):
                    total_gb = ms.ullTotalPhys / (1024 ** 3)
                    used_gb = (ms.ullTotalPhys - ms.ullAvailPhys) / (1024 ** 3)
                    return float(ms.dwMemoryLoad), round(used_gb, 1), round(total_gb, 1)
            except Exception:
                pass
            return 0.0, 0.0, 0.0

        # Linux /proc/meminfo
        try:
            info: dict[str, int] = {}
            with open("/proc/meminfo", "r", encoding="utf-8") as fh:
                for line in fh:
                    if ":" in line:
                        k, v = line.split(":", 1)
                        nums = v.strip().split()
                        if nums and nums[0].isdigit():
                            info[k.strip()] = int(nums[0])  # KiB
            total_kb = info.get("MemTotal", 0)
            avail_kb = info.get("MemAvailable", info.get("MemFree", 0))
            if total_kb > 0:
                used_kb = max(0, total_kb - avail_kb)
                pct = round((used_kb / total_kb) * 100.0, 1)
                return pct, round(used_kb / (1024 ** 2), 1), round(total_kb / (1024 ** 2), 1)
        except Exception:
            pass
        return 0.0, 0.0, 0.0

    def _cache_bytes(self, root: Path) -> int:
        total = 0
        for sub in ("downloads", ".staging"):
            d = root / sub
            if d.is_dir():
                for p in d.rglob("*"):
                    try:
                        if p.is_file():
                            total += p.stat().st_size
                    except OSError:
                        pass
        return total

    def snapshot(self, root: Path) -> dict[str, Any]:
        cpu_pct = self._cpu_percent()
        ram_pct, ram_used_gb, ram_total_gb = self._ram_stats()
        try:
            usage = shutil.disk_usage(root if root.exists() else Path.home())
            disk_free_gb = round(usage.free / (1024 ** 3), 1)
            disk_total_gb = round(usage.total / (1024 ** 3), 1)
            disk_used_pct = round((usage.used / usage.total) * 100.0, 1) if usage.total > 0 else 0.0
        except Exception:
            disk_free_gb, disk_total_gb, disk_used_pct = 0.0, 0.0, 0.0

        cache_bytes = self._cache_bytes(root)
        return {
            "cpu_pct": cpu_pct,
            "ram_pct": ram_pct,
            "ram_used_gb": ram_used_gb,
            "ram_total_gb": ram_total_gb,
            "disk_free_gb": disk_free_gb,
            "disk_total_gb": disk_total_gb,
            "disk_used_pct": disk_used_pct,
            "cache_bytes": cache_bytes,
            "cache_mb": round(cache_bytes / (1024 * 1024), 1),
        }


def clear_hub_cache(root: Path, active_filenames: set[str] | None = None) -> dict[str, Any]:
    """Safely purge temporary downloads, partial files & staging folders."""
    active = active_filenames or set()
    freed = 0
    removed = 0
    for sub in ("downloads", ".staging"):
        d = root / sub
        if not d.is_dir():
            continue
        for p in list(d.iterdir()):
            if p.name in active:
                continue
            try:
                if p.is_file():
                    sz = p.stat().st_size
                    p.unlink(missing_ok=True)
                    freed += sz
                    removed += 1
                elif p.is_dir():
                    sz = sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
                    shutil.rmtree(p, ignore_errors=True)
                    freed += sz
                    removed += 1
            except OSError:
                pass
    return {
        "ok": True,
        "freed_bytes": freed,
        "freed_mb": round(freed / (1024 * 1024), 1),
        "files_removed": removed,
    }
