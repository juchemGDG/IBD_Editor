"""IBD Editor – Desktop-Version.

Zeigt die Web-Oberflaeche (web/static) in einem eigenen Fenster, ganz ohne
Internet. Es gibt dadurch nur EINE Implementierung von Editor und
Fehlerpruefung (ibd.js) – Web- und Desktop-Version koennen nicht
auseinanderlaufen.

    python3 desktop/ibd_desktop.py            # eigenes Fenster (pywebview)
    python3 desktop/ibd_desktop.py --browser  # im Standardbrowser oeffnen

Ist pywebview nicht installiert, wird automatisch der Browser benutzt.
"""

import base64
import functools
import http.server
import os
import socketserver
import sys
import threading
import webbrowser

APP_NAME = "IBD Editor"


def static_dir():
    """Ordner mit index.html – im PyInstaller-Paket liegt er unter _MEIPASS."""
    base = getattr(sys, "_MEIPASS", None)
    if base:
        return os.path.join(base, "static")
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "..", "web", "static")


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):   # kein Konsolenfenster vorhanden
        pass


def start_server():
    """Lokaler Server nur auf 127.0.0.1 mit freiem Port."""
    handler = functools.partial(_QuietHandler, directory=static_dir())
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}/index.html?desktop=1"


class Api:
    """Von ibd.js aufgerufen (window.pywebview.api): nativer Speichern-Dialog."""

    def __init__(self):
        self.window = None
        self.last_dir = os.path.expanduser("~")

    def save_file(self, name, data_b64):
        import webview

        ext = os.path.splitext(name)[1].lstrip(".") or "*"
        dialog = getattr(getattr(webview, "FileDialog", None), "SAVE", None)
        if dialog is None:                      # aeltere pywebview-Versionen
            dialog = webview.SAVE_DIALOG
        result = self.window.create_file_dialog(
            dialog, directory=self.last_dir, save_filename=name,
            file_types=(f"{ext.upper()}-Datei (*.{ext})", "Alle Dateien (*.*)"),
        )
        if not result:
            return None
        path = result if isinstance(result, str) else result[0]
        if not os.path.splitext(path)[1] and ext != "*":
            path += "." + ext
        with open(path, "wb") as handle:
            handle.write(base64.b64decode(data_b64))
        self.last_dir = os.path.dirname(path)
        return path


def main():
    httpd, url = start_server()
    use_browser = "--browser" in sys.argv
    webview = None
    if not use_browser:
        try:
            import webview  # pywebview
        except ImportError:
            print("pywebview ist nicht installiert – der Editor oeffnet sich im Browser.")
    if webview is None:
        webbrowser.open(url)
        print(f"{APP_NAME} laeuft unter {url}\nBeenden mit Strg+C.")
        try:
            threading.Event().wait()
        except KeyboardInterrupt:
            pass
        return
    api = Api()
    api.window = webview.create_window(
        APP_NAME, url, js_api=api, width=1360, height=860, min_size=(900, 600)
    )
    # unter Linux direkt GTK: sonst versucht pywebview auf KDE zuerst Qt
    webview.start(gui="gtk" if sys.platform.startswith("linux") else None)
    httpd.shutdown()


if __name__ == "__main__":
    main()
