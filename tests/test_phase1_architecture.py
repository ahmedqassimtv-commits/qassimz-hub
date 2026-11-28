"""Unit tests for Phase 1 Core Desktop Architecture:
- Window State Persistence & Multi-Monitor Bounds Validation (including unplugged external display)
- Local-First Feature Flags (<50ms evaluation + Kill Switch + atomic remote config)
- Production Rotating Crash Logger & Atomic JSON Storage
"""
from __future__ import annotations

import json
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app"))

from crash_logger import atomic_write_json, init_crash_logging  # noqa: E402
from feature_flags import FeatureFlagStore  # noqa: E402
from window_state import (  # noqa: E402
    MonitorWorkArea,
    SavedWindowState,
    WindowStateStore,
    validate_window_rect,
)


class TestPhase1DesktopArchitecture(unittest.TestCase):
    def test_validate_window_rect_restores_on_connected_secondary_monitor(self):
        monitors = [
            MonitorWorkArea(name=r"\\.\DISPLAY1", left=0, top=0, width=1920, height=1040, is_primary=True),
            MonitorWorkArea(name=r"\\.\DISPLAY2", left=1920, top=0, width=2560, height=1400, is_primary=False),
        ]
        saved = SavedWindowState(
            x=2100, y=120, width=1400, height=900, maximized=False, monitor_name=r"\\.\DISPLAY2"
        )
        x, y, w, h, want_max, mon = validate_window_rect(saved, monitors)
        self.assertEqual((x, y, w, h, want_max, mon), (2100, 120, 1400, 900, False, r"\\.\DISPLAY2"))

    def test_validate_window_rect_handles_unplugged_external_monitor(self):
        # Secondary display at x=1920 was unplugged; only primary 1920x1040 remains
        monitors = [
            MonitorWorkArea(name=r"\\.\DISPLAY1", left=0, top=0, width=1920, height=1040, is_primary=True),
        ]
        saved = SavedWindowState(
            x=2100, y=120, width=1400, height=880, maximized=False, monitor_name=r"\\.\DISPLAY2"
        )
        x, y, w, h, want_max, mon = validate_window_rect(saved, monitors)
        # Logical size preserved, repositioned cleanly centered inside primary monitor
        self.assertEqual((w, h, want_max, mon), (1400, 880, False, r"\\.\DISPLAY1"))
        self.assertTrue(monitors[0].contains_rect(x, y, w, h))

    def test_validate_window_rect_clamps_oversized_window_to_small_laptop_screen(self):
        monitors = [
            MonitorWorkArea(name=r"\\.\DISPLAY1", left=0, top=0, width=1280, height=720, is_primary=True),
        ]
        saved = SavedWindowState(x=2000, y=50, width=1600, height=1000, maximized=True)
        x, y, w, h, want_max, _mon = validate_window_rect(saved, monitors)
        self.assertLessEqual(w, 1280)
        self.assertLessEqual(h, 720)
        self.assertTrue(monitors[0].contains_rect(x, y, w, h))
        self.assertTrue(want_max)

    def test_window_state_store_atomic_persistence_and_corrupt_recovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = WindowStateStore(Path(tmp))
            st = SavedWindowState(x=120, y=90, width=1360, height=860, maximized=True, monitor_name="DISP1")
            store.save(st)
            loaded = store.load()
            self.assertEqual(loaded, st)

            # Corrupt file should gracefully return None instead of crashing startup
            store.file.write_text("{corrupt json", encoding="utf-8")
            self.assertIsNone(store.load())

    def test_feature_flags_sub_50ms_evaluation_and_kill_switch(self):
        with tempfile.TemporaryDirectory() as tmp:
            flags = FeatureFlagStore(Path(tmp))
            t0 = time.perf_counter()
            for _ in range(1000):
                self.assertTrue(flags.is_enabled("command_palette"))
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            self.assertLess(elapsed_ms, 50.0)

            # Kill switch immediately disables flag even if override is True
            flags.apply_remote_config(
                {"flags": {"command_palette": True}, "kill_switches": ["command_palette"]}
            )
            self.assertFalse(flags.is_enabled("command_palette"))

            # Reload from disk persists kill switch atomically
            reloaded = FeatureFlagStore(Path(tmp))
            self.assertFalse(reloaded.is_enabled("command_palette"))

    def test_atomic_write_json_and_crash_logger_initialization(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / "state.json"
            atomic_write_json(target, {"ok": True, "lang": "العربية"})
            self.assertEqual(json.loads(target.read_text(encoding="utf-8"))["lang"], "العربية")

            logger = init_crash_logging(root, "1.6.3")
            logger.info("Phase 1 test entry")
            log_file = root / "logs" / "qassimz-hub.log"
            self.assertTrue(log_file.is_file())
            self.assertIn("Phase 1 test entry", log_file.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
