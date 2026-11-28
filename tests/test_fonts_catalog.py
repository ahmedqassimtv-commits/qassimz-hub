"""QASSIMZ FONTs is linked in the catalog before its first Windows build exists."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app"))

import detector  # noqa: E402
import server  # noqa: E402


class TestFontsCatalogLink(unittest.TestCase):
    def setUp(self) -> None:
        self.cat = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
        self.item = next(it for it in self.cat["items"] if it["id"] == "qassimz-fonts")

    def test_item_and_apps_entry_present(self) -> None:
        self.assertEqual(self.item["category"], "desktop")
        self.assertEqual(self.item["version"], "0.1.0")
        self.assertEqual(self.item["setup_url"], "")
        self.assertEqual(self.item["setup_size"], 0)
        self.assertEqual(self.item["setup_sha256"], "")
        apps = self.cat["apps"]["qassimz-fonts"]
        self.assertEqual(apps["version"], "0.1.0")
        self.assertEqual(apps["setup_url"], "")
        self.assertNotIn("_note", self.item)

    def test_offline_icons_exist(self) -> None:
        for suffix in ("svg", "png"):
            path = ROOT / "app" / "ui" / "icons" / f"qassimz-fonts.{suffix}"
            self.assertTrue(path.is_file(), msg=f"missing {path}")
        self.assertTrue((ROOT / "catalog" / "icons" / "qassimz-fonts.svg").is_file())

    def test_coming_soon_flag_only_on_items_without_installer(self) -> None:
        enriched = detector.enrich_catalog(
            {"schema_version": 1, "items": [dict(it) for it in self.cat["items"]]}
        )
        by_id = {it["id"]: it for it in enriched["items"]}
        self.assertTrue(by_id["qassimz-fonts"]["coming_soon"])
        self.assertFalse(by_id["qassimz-studio"]["coming_soon"])
        self.assertEqual(
            [i for i, it in by_id.items() if it["coming_soon"]], ["qassimz-fonts"]
        )

    def test_install_refused_without_installer(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            api = server.HubApi(Path(tmp))
            with self.assertRaises(ValueError) as ctx:
                api.install("qassimz-fonts")
            self.assertIn("قيد التجهيز", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
