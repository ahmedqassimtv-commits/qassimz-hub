"""Headless Playwright E2E & visual layout verification tests for QASSIMZ Hub."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app"))

import server  # noqa: E402

try:
    from playwright.sync_api import sync_playwright  # type: ignore

    HAS_PLAYWRIGHT = True
except Exception:
    HAS_PLAYWRIGHT = False


@unittest.skipUnless(HAS_PLAYWRIGHT, "playwright is not installed in this environment")
class TestQassimzHubUIE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cls.api = server.HubApi(Path(cls._tmp.name))
        cls.quit_calls = 0

        def _on_quit():
            cls.quit_calls += 1

        cls.api._on_quit_request = _on_quit
        # Deterministic catalog: never pull the live GitHub copy during tests,
        # or the item count depends on whether the network answered in time.
        cls.api.refresh_catalog = lambda force=False: cls.api.state()
        cls.url = server.start_server(cls.api)
        cls._pw = sync_playwright().start()
        cls.browser = cls._pw.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        try:
            cls.browser.close()
        finally:
            cls._pw.stop()
            cls._tmp.cleanup()

    def _new_page(self, width: int = 1360, height: int = 860):
        page = self.browser.new_page(viewport={"width": width, "height": height})
        page.goto(self.url, wait_until="networkidle")
        return page

    def test_splash_screen_and_wordmark_transform_box(self):
        page = self._new_page()
        try:
            intro = page.locator("#brand-intro")
            self.assertTrue(intro.is_visible(), "Splash screen should be visible on cold load")

            tbox = page.evaluate(
                "() => getComputedStyle(document.querySelector('#brand-intro .qz-part')).transformBox"
            )
            self.assertEqual(tbox, "fill-box", ".qz-part must use transform-box: fill-box")

            # Wait for splash to finish and hide cleanly
            page.wait_for_selector("#brand-intro", state="hidden", timeout=4000)
            self.assertFalse(intro.is_visible())
        finally:
            page.close()

    def test_main_chrome_sidebar_full_color_cards_and_no_overflow(self):
        page = self._new_page(1360, 860)
        try:
            page.wait_for_selector("#brand-intro", state="hidden", timeout=4000)

            # 48px titlebar & flush 46x48 Win11 caption controls
            tb_h = page.locator("#app-titlebar").bounding_box()["height"]
            self.assertAlmostEqual(tb_h, 48.0, delta=1.0)

            for btn_id in ("#btn-win-min", "#btn-win-max", "#btn-win-close"):
                box = page.locator(btn_id).bounding_box()
                self.assertAlmostEqual(box["width"], 46.0, delta=1.0)
                self.assertAlmostEqual(box["height"], 48.0, delta=1.0)
                rad = page.evaluate(f"() => getComputedStyle(document.querySelector('{btn_id}')).borderRadius")
                self.assertEqual(rad, "0px")

            # Maximize ↔ Restore toggle
            page.click("#btn-win-max")
            page.wait_for_function("() => document.documentElement.classList.contains('is-maximized')", timeout=2000)
            self.assertTrue(page.locator("#ico-win-restore").is_visible())
            page.click("#btn-win-max")
            page.wait_for_function("() => !document.documentElement.classList.contains('is-maximized')", timeout=2000)
            self.assertTrue(page.locator("#ico-win-maximize").is_visible())

            # 228px sidebar
            sb_w = page.locator("#app-sidebar").bounding_box()["width"]
            self.assertAlmostEqual(sb_w, 228.0, delta=1.0)

            # All 14 full-color cards (no grayscale filter)
            cards = page.locator(".craft-card")
            self.assertEqual(cards.count(), 14)
            filters = page.evaluate(
                "() => Array.from(document.querySelectorAll('.card-icon')).map(el => getComputedStyle(el).filter)"
            )
            for f in filters:
                self.assertNotIn("grayscale", f)

            # Zero horizontal overflow at 1360x860
            overflow = page.evaluate("() => document.documentElement.scrollWidth > document.documentElement.clientWidth")
            self.assertFalse(overflow)

            # Narrow viewport 900x700: sidebar collapses to 64px rail, zero overflow
            page.set_viewport_size({"width": 900, "height": 700})
            page.wait_for_timeout(150)
            sb_narrow_w = page.locator("#app-sidebar").bounding_box()["width"]
            self.assertAlmostEqual(sb_narrow_w, 64.0, delta=2.0)
            overflow_narrow = page.evaluate(
                "() => document.documentElement.scrollWidth > document.documentElement.clientWidth"
            )
            self.assertFalse(overflow_narrow)
        finally:
            page.close()

    def test_theme_language_filters_views_and_settings_quit(self):
        page = self._new_page(1360, 860)
        try:
            page.wait_for_selector("#brand-intro", state="hidden", timeout=4000)

            # Dark default (#1D1D1D = rgb(29, 29, 29))
            bg_dark = page.evaluate("() => getComputedStyle(document.body).backgroundColor")
            self.assertEqual(bg_dark, "rgb(29, 29, 29)")

            # Toggle Light (#F8F8F8 = rgb(248, 248, 248))
            page.click("#btn-theme-toggle")
            self.assertEqual(page.evaluate("() => document.documentElement.dataset.theme"), "light")
            bg_light = page.evaluate("() => getComputedStyle(document.body).backgroundColor")
            self.assertEqual(bg_light, "rgb(248, 248, 248)")
            page.click("#btn-theme-toggle")

            # Language: Arabic (RTL) is the product default for a fresh profile,
            # and the toggle flips it to English (LTR) and back.
            self.assertEqual(page.evaluate("() => document.documentElement.dir"), "rtl")
            self.assertEqual(page.evaluate("() => document.documentElement.lang"), "ar")
            self.assertIn("كل التطبيقات", page.locator("#view-title").text_content())
            page.click("#btn-lang")
            self.assertEqual(page.evaluate("() => document.documentElement.dir"), "ltr")
            self.assertEqual(page.evaluate("() => document.documentElement.lang"), "en")
            page.click("#btn-lang")
            self.assertEqual(page.evaluate("() => document.documentElement.dir"), "rtl")

            # Sidebar category filtering
            page.click("#nav-desktop")
            page.wait_for_timeout(300)
            self.assertEqual(page.locator(".craft-card").count(), 8)
            page.click("#nav-adobe")
            page.wait_for_timeout(300)
            self.assertEqual(page.locator(".craft-card").count(), 6)
            page.click("#nav-all")
            page.wait_for_timeout(300)
            self.assertEqual(page.locator(".craft-card").count(), 14)

            # Search filtering
            page.fill("#q-search", "Captions")
            page.wait_for_timeout(150)
            self.assertEqual(page.locator(".craft-card").count(), 1)
            page.click("#btn-search-clear")
            page.wait_for_timeout(250)
            self.assertEqual(page.locator(".craft-card").count(), 14)

            # Grid <-> List toggle
            page.click("#btn-view-list")
            page.wait_for_timeout(250)
            self.assertEqual(page.locator(".app-list-row").count(), 14)
            page.click("#btn-view-grid")
            page.wait_for_timeout(250)
            self.assertEqual(page.locator(".craft-card").count(), 14)

            # Settings modal: toggle minimize_to_tray checkbox, verify zero error toast & persisted state
            before_quits = self.quit_calls
            page.click("#btn-settings-top")
            self.assertTrue(page.locator("#settings-sheet").is_visible())

            tray_chk = page.locator('#settings-sheet input[data-setting="minimize_to_tray"]')
            initial_tray = tray_chk.is_checked()
            with page.expect_response(lambda r: r.url.endswith("/api/save_settings")) as resp_info:
                tray_chk.click()
            save_body = resp_info.value.json()
            self.assertTrue(save_body.get("ok"), f"save_settings failed: {save_body}")
            page.wait_for_timeout(150)
            self.assertEqual(page.locator(".cc-toast.error").count(), 0, "Unexpected error toast on save_settings")

            persisted_tray = page.evaluate(
                """async () => {
                    const r = await fetch("./api/state", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: "{}"
                    });
                    const j = await r.json();
                    return j.data.settings.minimize_to_tray;
                }"""
            )
            self.assertEqual(persisted_tray, not initial_tray)

            # Quit button -> api("win_quit")
            page.click("#st-quit")
            page.wait_for_timeout(150)
            self.assertEqual(self.quit_calls, before_quits + 1)
        finally:
            page.close()

    def test_install_theater_active_and_minimized_strip(self):
        page = self.browser.new_page(viewport={"width": 1360, "height": 860})
        try:
            mock_task = {
                "id": "qassimz-captions",
                "name": "CaptionsAI",
                "version": "1.2.0",
                "accent": "#EAB308",
                "status": "downloading",
                "progress": 64,
                "downloaded": 42_000_000,
                "total": 65_000_000,
                "speed_bps": 8_400_000,
                "message_ar": "Downloading CaptionsAI package…",
            }

            def _handle_route(route):
                url = route.request.url
                if url.endswith("/api/state"):
                    real = self.api.state()
                    real["tasks"] = [mock_task]
                    route.fulfill(
                        status=200,
                        content_type="application/json",
                        body=json.dumps({"ok": True, "data": real}),
                    )
                elif url.endswith("/api/tasks"):
                    route.fulfill(
                        status=200,
                        content_type="application/json",
                        body=json.dumps({"ok": True, "data": [mock_task]}),
                    )
                else:
                    route.continue_()

            page.route("**/api/*", _handle_route)
            page.goto(self.url, wait_until="domcontentloaded")
            page.wait_for_selector("#brand-intro", state="hidden", timeout=4000)
            page.wait_for_selector("#install-theater", state="visible", timeout=3000)

            theater = page.locator("#install-theater")
            self.assertTrue(theater.is_visible())
            self.assertEqual(page.locator("#th-pct").text_content(), "64%")
            self.assertEqual(page.locator("#th-app-name").text_content(), "CaptionsAI")

            # Minimize to background strip
            page.click("#btn-min-theater")
            self.assertFalse(theater.is_visible())
            self.assertTrue(page.locator("#transfer-strip").is_visible())

            # Restore theater from strip
            page.click("#btn-open-theater")
            self.assertTrue(theater.is_visible())
        finally:
            page.close()


if __name__ == "__main__":
    unittest.main()
