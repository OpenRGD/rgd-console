#!/usr/bin/env bash
# Bootstrap scoped IMU telemetry token. No root, no token to stdout.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p "$HOME/.config/openrgd"
TOKEN_FILE="$HOME/.config/openrgd/imu-ingest-token"
if [[ ! -f "$TOKEN_FILE" ]]; then
  if ! command -v openssl >/dev/null 2>&1; then echo 'openssl required' >&2; exit 1; fi
  openssl rand -hex 32 > "$TOKEN_FILE"
fi
chmod 600 "$TOKEN_FILE"
TOKEN="$(head -n 1 "$TOKEN_FILE")"
if [[ ${#TOKEN} -lt 32 ]]; then echo 'Refusing short token' >&2; exit 1; fi
if [[ -f .env ]] && grep -q '^CONSOLE_IMU_INGEST_TOKEN=' .env; then
  CONFIGURED="$(sed -n 's/^CONSOLE_IMU_INGEST_TOKEN=//p' .env | tail -n 1)"
  if [[ "$CONFIGURED" != "$TOKEN" ]]; then echo 'Existing token in .env differs: no changes made' >&2; exit 1; fi
else
  printf '
CONSOLE_IMU_INGEST_TOKEN=%s
' "$TOKEN" >> .env
fi
if ! grep -q '^CONSOLE_IMU_ALLOWED_ROBOT_IDS=' .env; then
  printf 'CONSOLE_IMU_ALLOWED_ROBOT_IDS=paky-01
' >> .env
fi
chmod 600 .env
unset TOKEN CONFIGURED
printf 'IMU token provisioned locally (no secret printed). Rebuild API container to apply.
'
