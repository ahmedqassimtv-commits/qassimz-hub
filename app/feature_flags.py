"""QASSIMZ Hub — Local-First Feature Flags & Remote Config Store (< 50ms Evaluation).

Phase 1 (Progressive Rollout & Kill Switch Foundation):
- Evaluates every feature flag locally in microseconds (zero blocking I/O).
- Supports immediate Kill Switch overrides (`kill_switches`) and Remote Config JSON merges.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from crash_logger import atomic_write_json


class FeatureFlagStore:
    DEFAULTS: dict[str, bool] = {
        "window_state_persistence": True,
        "win11_mica_material": True,
        "command_palette": True,
        "circular_theme_transition": True,
        "spring_motion_presets": True,
        "silent_background_updater": True,
        "in_app_changelog": True,
    }

    def __init__(self, root: Path):
        self.file = root / "feature_flags.json"
        self._lock = threading.Lock()
        self._overrides: dict[str, bool] = {}
        self._kill_switches: set[str] = set()
        self._load()

    def _load(self) -> None:
        if not self.file.is_file():
            return
        try:
            raw = json.loads(self.file.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                return
            for k, v in (raw.get("flags") or {}).items():
                if k in self.DEFAULTS:
                    self._overrides[k] = bool(v)
            for k in (raw.get("kill_switches") or []):
                if isinstance(k, str):
                    self._kill_switches.add(k)
        except Exception:
            pass

    def is_enabled(self, flag_name: str, default: bool = False) -> bool:
        with self._lock:
            if flag_name in self._kill_switches:
                return False
            if flag_name in self._overrides:
                return self._overrides[flag_name]
            return self.DEFAULTS.get(flag_name, default)

    def all(self) -> dict[str, bool]:
        with self._lock:
            out: dict[str, bool] = {}
            for k, v in self.DEFAULTS.items():
                if k in self._kill_switches:
                    out[k] = False
                else:
                    out[k] = self._overrides.get(k, v)
            return out

    def apply_remote_config(self, payload: dict[str, Any]) -> dict[str, bool]:
        """Merge remote JSON config (`flags` + `kill_switches`) and persist atomically."""
        if not isinstance(payload, dict):
            return self.all()
        with self._lock:
            if isinstance(payload.get("flags"), dict):
                for k, v in payload["flags"].items():
                    if k in self.DEFAULTS:
                        self._overrides[k] = bool(v)
            if isinstance(payload.get("kill_switches"), list):
                self._kill_switches = {str(k) for k in payload["kill_switches"] if k}
            try:
                atomic_write_json(
                    self.file,
                    {
                        "flags": dict(self._overrides),
                        "kill_switches": sorted(self._kill_switches),
                    },
                )
            except Exception:
                pass
        return self.all()
