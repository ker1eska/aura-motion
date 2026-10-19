"""
AURA Motion FX Studio - Application Launcher.
Runs desktop preview with PyWebView or launches local server.
"""

import sys
import time
import threading
import webbrowser
from server import app

HOST = "127.0.0.1"
PORT = 8080
URL = f"http://{HOST}:{PORT}/"


def run_flask():
    app.run(host=HOST, port=PORT, debug=False, use_reloader=False)


def main():
    print(f"[*] Starting AURA Motion FX Studio server on {URL}...")
    server_thread = threading.Thread(target=run_flask, daemon=True)
    server_thread.start()
    time.sleep(0.8)

    # Attempt native PyWebView window
    try:
        import webview
        print("[+] PyWebView detected. Launching native studio window...")
        webview.create_window(
            title="AURA // Motion FX Studio",
            url=URL,
            width=1100,
            height=850,
            min_size=(700, 500),
            background_color='#07080a'
        )
        webview.start()
    except Exception as e:
        print(f"[*] Native window fallback ({e}). Opening in default browser...")
        webbrowser.open(URL)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n[*] Exiting AURA Studio...")


if __name__ == "__main__":
    main()
