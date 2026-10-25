#!/usr/bin/env bash
# Optional GUI-only preview. Not an auto-login or kiosk bootstrap service.
set -euo pipefail
URL='http://127.0.0.1:8088/boot'
if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
  echo 'This command must be run from an Ubuntu graphical session.' >&2
  exit 1
fi
command -v firefox >/dev/null || { echo 'Firefox not installed' >&2; exit 1; }
if ! curl -fsS --max-time 4 'http://127.0.0.1:8088/healthz' >/dev/null; then
  echo 'Console API is not available yet. Use scripts/doctor.py.' >&2
  exit 1
fi
echo 'OpenRGD Boot preview (close Firefox with Alt+F4 to return to Linux).'
exec firefox --kiosk "$URL"
