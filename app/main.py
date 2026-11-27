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

from server import HubApi, data_dir, resource, start_server

SINGLE_INSTANCE_PORT = 49617


def _acquire_single_instance(on_activate) -> socket.socket | None:
    """Bind localhost IPC port; if already running, signal existing instance to show window and exit."""
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        srv.bind(("127.0.0.1", SINGLE_INSTANCE_PORT))
        srv.listen(4)
    except OSError:
        try:
            with socket.create_connection(("127.0.0.1", SINGLE_INSTANCE_PORT), timeout=1.5) as cli:
                cli.sendall(b"SHOW\n")
        except OSError:
            pass
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
    minimized = "--minimized" in sys.argv
    api = HubApi(data_dir())
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
            win.evaluate_js("window.focus(); document.body && document.body.focus();")
        except Exception:
            pass

    lock_sock = _acquire_single_instance(show_window)
    if lock_sock is None:
        sys.exit(0)

    url = start_server(api)
    win = webview.create_window(
        "QASSIMZ Hub — مركز قَاسِمز الرسمي",
        url,
        width=1360,
        height=860,
        min_size=(1040, 680),
        background_color="#1D1D1D",
        frameless=True,
        easy_drag=False,
        hidden=minimized,
        text_select=False,
    )
    api.window = win
    api._is_maximized = False

    def quit_app():
        quitting["flag"] = True
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
        if quitting["flag"]:
            return True
        if api.settings.all().get("minimize_to_tray", True):
            win.hide()
            return False
        return True

    api._on_close_request = lambda: (win.hide() if api.settings.all().get("minimize_to_tray", True) else quit_app())
    api._on_quit_request = quit_app

    def _release_lock():
        try:
            lock_sock.close()
        except Exception:
            pass

    api._on_release_lock = _release_lock

    def on_loaded():
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
