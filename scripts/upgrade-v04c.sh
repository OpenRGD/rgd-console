#!/usr/bin/env bash
# OpenRGD Live Foundation v0.4C: SOURCE-ONLY upgrade from the tested v0.4B.
# No Docker volume change, no GUI/autologin modification, no host commands.
set -euo pipefail
umask 077
SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TARGET="${1:-$HOME/openrgd/repos/openrgd-console}"
BACKUPS="$HOME/openrgd/backups"

if [[ "$SOURCE" == "$TARGET" ]]; then
  echo 'Source and destination are identical; unpack v0.4C into a staging folder.' >&2
  exit 2
fi
for relative in apps/web/app/live/page.tsx apps/web/app/live/configure/page.tsx \
                apps/web/src/components/robot-live.tsx apps/web/src/components/robot-live.css \
                apps/web/src/components/live-configurator.tsx \
                apps/web/src/lib/display-profiles.ts scripts/doctor.py; do
  if [[ ! -f "$SOURCE/$relative" ]]; then
    echo "Incomplete v0.4C source package: $relative" >&2
    exit 2
  fi
done
if [[ ! -f "$TARGET/docker-compose.yml" || ! -d "$TARGET/config" || \
      ! -f "$TARGET/services/api/src/main.rs" || ! -f "$TARGET/apps/web/src/components/calibration-inspector.tsx" ]]; then
  echo 'Existing v0.4B Console installation not found. No changes applied.' >&2
  exit 2
fi
mkdir -p "$BACKUPS"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)-$$"
BACKUP="$BACKUPS/console-source-before-v04C-$STAMP.tar.gz"
echo "Backing up current Console source to: $BACKUP"
tar -C "$TARGET" --exclude='./node_modules' --exclude='./.next' \
  --exclude='./target' --exclude='./data' --exclude='./.git' -czf "$BACKUP" .
chmod 600 "$BACKUP"
echo 'Copying v0.4C source; preserving config, environment, local data and Docker volumes.'
# Directory permissions must remain readable by the non-root container users.
umask 022
tar -C "$SOURCE" --exclude='./config' --exclude='./data' --exclude='./.env' \
  --exclude='./.env.*' --exclude='./.git' --exclude='./node_modules' \
  --exclude='./.next' --exclude='./target' -cf - . | tar -C "$TARGET" -xf -

echo 'SUCCESS: source files updated. No containers or host session modified.'
echo "  cd '$TARGET'"
echo '  sudo docker compose up -d --build --no-deps web'
echo '  python3 scripts/doctor.py'
echo '  Open http://127.0.0.1:8088/live/configure'
