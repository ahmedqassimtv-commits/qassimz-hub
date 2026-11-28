"""QASSIMZ Hub — Official Desktop Launcher & Updater Entry Point."""
from __future__ import annotations

import os
import socket
import sys
import threading
import time

# Guard None stdio under PyInstaller --noconsole on Windows
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

import webview  # type: ignore

from crash_logger import init_crash_logging
from server import VERSION, HubApi, data_dir, resource, start_server

SINGLE_INSTANCE_PORT = 49617


def _acquire_single_instance(on_activate) -> socket.socket | None:
    """Bind localhost IPC port; if already running, signal existing instance to show window and exit."""
    srv: socket.socket | None = None
    for attempt in range(10):
        cand = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            cand.bind(("127.0.0.1", SINGLE_INSTANCE_PORT))
            cand.listen(4)
            srv = cand
            break
        except OSError:
            cand.close()
            try:
                with socket.create_connection(("127.0.0.1", SINGLE_INSTANCE_PORT), timeout=1.0) as cli:
                    cli.sendall(b"SHOW\n")
                return None
            except OSError:
                # Previous instance just exited (e.g. during self-update); wait briefly and retry bind.
                if attempt < 9:
                    time.sleep(0.15)
                    continue
                return None

    if srv is None:
        return None

    def _listener():
        while True:
            try:
                conn, _ = srv.accept()
                with conn:
                    msg = conn.recv(64)
                    if b"SHOW" in msg:
                        on_activate()
            except Exception:
                break

    threading.Thread(target=_listener, daemon=True).start()
    return srv


def _setup_tray(api: HubApi, show_fn, quit_fn):
    try:
        import pystray  # type: ignore
        from PIL import Image

        icon_img = Image.open(resource("assets/logo.png")).resize((64, 64))
        menu = pystray.Menu(
            pystray.MenuItem("فتح QASSIMZ Hub", lambda *_: show_fn(), default=True),
            pystray.MenuItem("فحص التحديثات الآن", lambda *_: threading.Thread(target=api.refresh_catalog, daemon=True).start()),
            pystray.MenuItem("تحديث الكل", lambda *_: threading.Thread(target=api.update_all, daemon=True).start()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("إنهاء", lambda *_: quit_fn()),
        )
        tray = pystray.Icon("QASSIMZ Hub", icon_img, "QASSIMZ Hub", menu)
        threading.Thread(target=tray.run, daemon=True).start()
        return tray
    except Exception:
        return None


def main() -> None:
    # Enable Per-Monitor DPI Awareness V2 on Windows so WebView2 renders at native
    # physical resolution (crisp logos & text with zero OS bitmap stretching/aliasing).
    if os.name == "nt":
        try:
            import ctypes
            ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
        except Exception:
            try:
                import ctypes
                ctypes.windll.shcore.SetProcessDpiAwareness(2)
            except Exception:
                pass

    app_root = data_dir()
    init_crash_logging(app_root, VERSION)
    minimized = "--minimized" in sys.argv
    api = HubApi(app_root)
    quitting = {"flag": False}
    tray_ref = {"icon": None}

    def show_window():
        win = api.window
        if win is None:
            return
        try:
            win.show()
            win.restore()
            win.on_top = True
            win.on_top = False
            win.evaluate_js(
                "window.focus(); document.body && document.body.focus();"
                "var sh = document.querySelector('.cc-shell');"
                "if (sh) { sh.classList.remove('is-closing'); sh.classList.add('is-opening');"
                "setTimeout(function(){ sh.classList.remove('is-opening'); }, 260); }"
            )
        except Exception:
            pass

    lock_sock = _acquire_single_instance(show_window)
    if lock_sock is None:
        sys.exit(0)

    # Prevent WebView2 from claiming exclusive DirectComposition/hardware overlay swapchains
    # that conflict with NVIDIA GeForce Experience / AMD Adrenalin / Windows Game Bar.
    if os.name == "nt":
        existing_args = os.environ.get("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "").strip()
        gpu_safe_flags = (
            "--disable-direct-composition-video-overlays "
            "--disable-features=HardwareMediaKeyHandling,DirectCompositionUseNV12DecodeSwapChain "
            "--use-angle=d3d11"
        )
        if "--disable-direct-composition-video-overlays" not in existing_args:
            os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = (
                f"{existing_args} {gpu_safe_flags}".strip()
            )

    url = start_server(api)
    # Start as a compact centered Adobe-style Splash Card (480x310) and smoothly expand
    # to the full 1360x860 workspace via HubApi.win_reveal_main() once initialized.
    splash_w, splash_h = 480, 310
    splash_x, splash_y = None, None
    if os.name == "nt" and not minimized:
        work = api._get_windows_work_area(100, 100)
        if work is not None:
            wx, wy, ww, wh = work
            splash_x = wx + max(0, (ww - splash_w) // 2)
            splash_y = wy + max(0, (wh - splash_h) // 2)

    win = webview.create_window(
        "QASSIMZ Hub — مركز قَاسِمز الرسمي",
        url,
        x=splash_x,
        y=splash_y,
        width=splash_w if os.name == "nt" else 1360,
        height=splash_h if os.name == "nt" else 860,
        min_size=(480, 310),
        background_color="#1D1D1D",
        frameless=True,
        easy_drag=False,
        hidden=minimized,
        text_select=False,
    )
    api.window = win
    api._is_maximized = False
    api._splash_expanded = (os.name != "nt")

    def quit_app():
        quitting["flag"] = True
        try:
            api.save_window_state()
        except Exception:
            pass
        try:
            if tray_ref["icon"] is not None:
                tray_ref["icon"].stop()
        except Exception:
            pass
        try:
            lock_sock.close()
        except Exception:
            pass
        try:
            win.destroy()
        except Exception:
            pass
        os._exit(0)

    def on_closing():
        try:
            api.save_window_state()
        except Exception:
            pass
        if quitting["flag"]:
            return True
        if api.settings.all().get("minimize_to_tray", True):
            if api.cc_updater.has_pending_core_update():
                api.cc_updater.apply_pending_core_swap(relaunch_minimized=True)
                return False
            win.hide()
            return False
        return True

    def _handle_close_request():
        try:
            api.save_window_state()
        except Exception:
            pass
        if api.settings.all().get("minimize_to_tray", True):
            if api.cc_updater.has_pending_core_update():
                api.cc_updater.apply_pending_core_swap(relaunch_minimized=True)
                return
            win.hide()
        else:
            quit_app()

    api._on_close_request = _handle_close_request
    api._on_quit_request = quit_app

    def _release_lock():
        quitting["flag"] = True
        try:
            api.save_window_state()
        except Exception:
            pass
        try:
            if tray_ref["icon"] is not None:
                tray_ref["icon"].stop()
        except Exception:
            pass
        try:
            lock_sock.close()
        except Exception:
            pass

    api._on_release_lock = _release_lock

    def _enable_win11_frameless_animations() -> None:
        """Restore native Windows 11 DWM transitions, rounded corners, dark frame, and Mica backdrop."""
        if os.name != "nt":
            return
        try:
            import ctypes
            from ctypes import wintypes

            user32 = ctypes.windll.user32
            dwmapi = ctypes.windll.dwmapi
            hwnd = user32.FindWindowW(None, "QASSIMZ Hub — مركز قَاسِمز الرسمي")
            if not hwnd:
                hwnd = user32.GetForegroundWindow()
            if not hwnd:
                return
            api._hwnd = int(hwnd)

            GWL_STYLE = -16
            WS_MINIMIZEBOX = 0x00020000
            WS_MAXIMIZEBOX = 0x00010000
            WS_SYSMENU = 0x00080000
            style = user32.GetWindowLongW(hwnd, GWL_STYLE)
            new_style = style | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU
            if new_style != style:
                user32.SetWindowLongW(hwnd, GWL_STYLE, new_style)

            # DWMWA_TRANSITIONS_FORCEDISABLED (3) -> 0 (native Win11 transitions enabled)
            disable_transitions = ctypes.c_int(0)
            dwmapi.DwmSetWindowAttribute(hwnd, 3, ctypes.byref(disable_transitions), ctypes.sizeof(disable_transitions))
            # DWMWA_USE_IMMERSIVE_DARK_MODE (20) -> 1
            dark_mode = ctypes.c_int(1)
            dwmapi.DwmSetWindowAttribute(hwnd, 20, ctypes.byref(dark_mode), ctypes.sizeof(dark_mode))
            # DWMWA_WINDOW_CORNER_PREFERENCE (33) -> DWMWCP_ROUND (2)
            corner_pref = ctypes.c_int(2)
            dwmapi.DwmSetWindowAttribute(hwnd, 33, ctypes.byref(corner_pref), ctypes.sizeof(corner_pref))
            # DWMWA_SYSTEMBACKDROP_TYPE (38) -> DWMSBT_MAINWINDOW (2 = Windows 11 Native Mica)
            if api.feature_flags.is_enabled("win11_mica_material", True):
                mica = ctypes.c_int(2)
                dwmapi.DwmSetWindowAttribute(hwnd, 38, ctypes.byref(mica), ctypes.sizeof(mica))

            class MARGINS(ctypes.Structure):
                _fields_ = [("cxLeftWidth", ctypes.c_int), ("cxRightWidth", ctypes.c_int),
                            ("cyTopHeight", ctypes.c_int), ("cyBottomHeight", ctypes.c_int)]

            margins = MARGINS(0, 0, 0, 1)
            dwmapi.DwmExtendFrameIntoClientArea(hwnd, ctypes.byref(margins))

            SWP_FRAMECHANGED = 0x0020
            SWP_NOMOVE = 0x0002
            SWP_NOSIZE = 0x0001
            SWP_NOZORDER = 0x0004
            SWP_NOACTIVATE = 0x0010
            user32.SetWindowPos(hwnd, 0, 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE)
        except Exception:
            pass

    def on_loaded():
        _enable_win11_frameless_animations()
        try:
            win.evaluate_js("window.focus(); document.body && document.body.focus();")
        except Exception:
            pass

    win.events.closing += on_closing
    win.events.loaded += on_loaded

    tray_ref["icon"] = _setup_tray(api, show_window, quit_app)

    def background_auto_updater():
        time.sleep(2.0)
        while not quitting["flag"]:
            try:
                if api.settings.all().get("auto_check_updates", True):
                    api.run_auto_update_cycle()
            except Exception:
                pass
            # Re-check automatically every 4 hours while running in tray
            for _ in range(4 * 60):
                if quitting["flag"]:
                    return
                time.sleep(60)

    threading.Thread(target=background_auto_updater, daemon=True).start()

    webview.start(
        gui="edgechromium" if os.name == "nt" else None,
        debug="--debug" in sys.argv,
        icon=str(resource("assets/logo.ico")),
        private_mode=False,
        storage_path=str(data_dir() / "webview"),
    )


if __name__ == "__main__":
    main()
