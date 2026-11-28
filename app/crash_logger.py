"""QASSIMZ Hub — Production Rotating Logger, Native Fault Handler & Atomic JSON Storage.

Phase 1 (Observability & Local-First Durability):
- Captures native C/DLL crashes (faulthandler -> logs/native-crash.log)
- Captures unhandled main-thread and background-thread exceptions
- Provides crash-safe atomic JSON writes (temp file + fsync + os.replace)
"""
from __future__ import annotations

import faulthandler
import json
import logging
import os
import platform
import sys
import tempfile
import threading
import traceback
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

_FAULT_FILE_HANDLE: Any = None


def atomic_write_json(target: Path, data: Any, indent: int = 2) -> None:
    """Atomically write UTF-8 JSON to disk so power loss or crashes never corrupt state files."""
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=indent)
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{target.name}.",
        suffix=".tmp",
        dir=str(target.parent),
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(payload)
            fh.flush()
            try:
                os.fsync(fh.fileno())
            except OSError:
                pass
        os.replace(tmp_name, target)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def init_crash_logging(app_data_dir: Path, app_version: str) -> logging.Logger:
    """Initialize rotating logs, native faulthandler, and global exception hooks."""
    global _FAULT_FILE_HANDLE

    log_dir = app_data_dir / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "qassimz-hub.log"
    fault_file = log_dir / "native-crash.log"

    logger = logging.getLogger("qassimz_hub")
    logger.setLevel(logging.INFO)
    logger.propagate = False

    # Close existing file handlers cleanly if re-initialized in tests
    for existing in list(logger.handlers):
        logger.removeHandler(existing)
        try:
            existing.close()
        except Exception:
            pass

    handler = RotatingFileHandler(
        log_file,
        maxBytes=3 * 1024 * 1024,
        backupCount=4,
        encoding="utf-8",
    )
    handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] [%(threadName)s] %(message)s")
    )
    logger.addHandler(handler)

    try:
        if _FAULT_FILE_HANDLE is not None:
            try:
                faulthandler.disable()
                _FAULT_FILE_HANDLE.close()
            except Exception:
                pass
        _FAULT_FILE_HANDLE = open(fault_file, "a", encoding="utf-8")
        faulthandler.enable(file=_FAULT_FILE_HANDLE, all_threads=True)
    except Exception:
        pass

    def _sys_hook(exc_type: Any, exc_value: Any, exc_tb: Any) -> None:
        if issubclass(exc_type, KeyboardInterrupt):
            return
        formatted = "".join(traceback.format_exception(exc_type, exc_value, exc_tb))
        logger.critical("UNHANDLED MAIN EXCEPTION:\n%s", formatted)

    def _thread_hook(args: threading.ExceptHookArgs) -> None:
        formatted = "".join(traceback.format_exception(args.exc_type, args.exc_value, args.exc_traceback))
        tname = args.thread.name if args.thread else "unknown"
        logger.critical("UNHANDLED THREAD EXCEPTION (%s):\n%s", tname, formatted)

    sys.excepthook = _sys_hook
    threading.excepthook = _thread_hook

    logger.info(
        "QASSIMZ Hub v%s started | OS=%s %s | Python=%s",
        app_version,
        platform.system(),
        platform.release(),
        platform.python_version(),
    )
    return logger
