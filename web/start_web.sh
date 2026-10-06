#!/usr/bin/env bash
# Web-Version lokal testen: http://localhost:5001  (im Netz: http://<IP>:5001)
cd "$(dirname "$0")/static"
exec python3 -m http.server "${PORT:-5001}"
