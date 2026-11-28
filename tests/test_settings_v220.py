"""v2.2.0 settings tests: validation, import/export, paths and workspace lists."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app"))

import server  # noqa: E402


class TestSettingsV220(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    # --- defaults -------------------------------------------------------
    def test_new_defaults(self):
        cfg = server.HubSettings(self.tmp).all()
        self.assertIs(cfg["start_with_windows"], False)
        self.assertIs(cfg["smart_pause"], True)
        self.assertIs(cfg["auto_clean_installers"], True)
        self.assertEqual(cfg["cache_cleanup_days"], 7)
        self.assertIs(cfg["quiet_mode"], False)
        self.assertEqual(cfg["install_root"], "")
        self.assertEqual(cfg["workspaces"], {})

    # --- path handling --------------------------------------------------
    def test_install_root_validation(self):
        self.assertEqual(server._clean_dir_setting(""), "")
        self.assertEqual(server._clean_dir_setting("relative/path"), "")
        self.assertEqual(server._clean_dir_setting("C:\\QASSIMZ Hub\\Apps"), "C:\\QASSIMZ Hub\\Apps")
        abs_sample = str(self.tmp / "qassimz")
        self.assertEqual(server._clean_dir_setting(abs_sample), abs_sample)
        self.assertEqual(server._clean_dir_setting("x" * 400), "")

    def test_invalid_values_are_ignored(self):
        cfg = server.HubSettings(self.tmp)
        cfg.update({"cache_cleanup_days": 5, "mechanical_bg_mode": "loud", "install_root": "nope"})
        out = cfg.all()
        self.assertEqual(out["cache_cleanup_days"], 7)
        self.assertEqual(out["mechanical_bg_mode"], "balanced")
        self.assertEqual(out["install_root"], "")
        abs_install = str(self.tmp / "qassimz-install")
        cfg.update({"cache_cleanup_days": 30, "install_root": abs_install})
        self.assertEqual(cfg.all()["cache_cleanup_days"], 30)
        self.assertEqual(cfg.all()["install_root"], abs_install)

    def test_workspace_map_validation(self):
        clean = server._clean_workspaces(
            {
                "editing": ["qassimz-studio", "qassimz-studio", "bad id", "qdm"],
                "bad mode!": ["qdm"],
                "custom_podcast": ["qassimz-music"],
            }
        )
        self.assertEqual(clean["editing"], ["qassimz-studio", "qdm"])
        self.assertNotIn("bad mode!", clean)
        self.assertEqual(clean["custom_podcast"], ["qassimz-music"])
        self.assertEqual(server._clean_workspaces("not-a-dict"), {})

    # --- import / export -------------------------------------------------
    def test_export_import_roundtrip(self):
        api = server.HubApi(self.tmp)
        abs_qh = str(self.tmp / "qh")
        api.settings.update({"quiet_mode": True, "cache_cleanup_days": 30, "install_root": abs_qh})
        bundle = api.export_settings()
        self.assertEqual(bundle["app"], "qassimz-hub")
        self.assertEqual(bundle["settings"]["quiet_mode"], True)

        other = server.HubApi(self.tmp / "second")
        applied = other.import_settings(payload=bundle)
        self.assertIs(applied["quiet_mode"], True)
        self.assertEqual(applied["cache_cleanup_days"], 30)
        self.assertEqual(applied["install_root"], abs_qh)

    def test_import_rejects_garbage(self):
        api = server.HubApi(self.tmp)
        for bad in ({}, {"settings": {}}, {"settings": {"unknown_key": 1}}, "text", None):
            with self.assertRaises(ValueError):
                api.import_settings(payload=bad)

    def test_import_ignores_invalid_fields(self):
        api = server.HubApi(self.tmp)
        applied = api.import_settings(
            payload={"settings": {"cache_cleanup_days": 999, "smart_pause": False, "install_root": "relative"}}
        )
        self.assertEqual(applied["cache_cleanup_days"], 7)
        self.assertIs(applied["smart_pause"], False)
        self.assertEqual(applied["install_root"], "")

    # --- workspaces + endpoint parity ------------------------------------
    def test_set_workspaces_keeps_known_apps_only(self):
        api = server.HubApi(self.tmp)
        known = (api._get_enriched().get("items") or [])[0]["id"]
        res = api.set_workspaces("custom_focus", [known, "does-not-exist"])
        self.assertEqual(res["workspaces"]["custom_focus"], [known])
        self.assertIn("editing", res["workspaces"])

    def test_new_endpoints_are_allowed_and_public(self):
        for name in (
            "choose_install_folder",
            "export_settings",
            "import_settings",
            "set_workspaces",
            "remove_library_item",
        ):
            self.assertIn(name, server.ALLOWED_ENDPOINTS)
            self.assertTrue(callable(getattr(server.HubApi, name, None)), name)
            self.assertFalse(name.startswith("_"))

    def test_settings_file_is_atomic_and_readable(self):
        api = server.HubApi(self.tmp)
        api.settings.update({"quiet_mode": True})
        raw = json.loads((self.tmp / "settings.json").read_text(encoding="utf-8"))
        self.assertIs(raw["quiet_mode"], True)
        self.assertEqual(raw["_schema"], 2)
        self.assertFalse(list(self.tmp.glob("*.tmp")))


if __name__ == "__main__":
    unittest.main()
