#!/usr/bin/env bash
# Startet die Desktop-Version (mit pywebview im eigenen Fenster, sonst im Browser).
cd "$(dirname "$0")"
exec python3 desktop/ibd_desktop.py "$@"
