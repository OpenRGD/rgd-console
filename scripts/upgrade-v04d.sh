#!/usr/bin/env bash
# Source-only upgrade from v0.4C to v0.4D. NEVER changes local Docker volumes,
# Ubuntu service startup, desktop auto-login, power modes, .env or config/.
set -euo pipefail
umask 077
SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TARGET="${1:-$HOME/openrgd/repos/openrgd-console}"
BACKUPS="$HOME/openrgd/backups"

if [[ "$SOURCE" == "$TARGET" ]]; then
  echo 'Unpack the v0.4D ZIP into a separate staging folder first.' >&2; exit 2
fi
for relative in services/boot-manager/boot_core.py services/boot-manager/server.py \
  deploy/Dockerfile.boot-manager apps/web/app/boot/page.tsx \
  apps/web/src/components/boot-dashboard.tsx services/api/src/boot_manager.rs \
  contracts/console/v1/boot-report.v0.1.schema.json; do
  [[ -f "$SOURCE/$relative" ]] || { echo "Missing v0.4D source: $relative" >&2; exit 2; }
done
if [[ ! -f "$TARGET/docker-compose.yml" || ! -f "$TARGET/services/api/src/module_manager.rs" || \
      ! -f "$TARGET/apps/web/src/components/robot-live.tsx" ]]; then
  echo 'Existing v0.4C Console installation not found. No changes applied.' >&2; exit 2
fi
mkdir -p "$BACKUPS"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)-$$"
BACKUP="$BACKUPS/console-source-before-v04D-$STAMP.tar.gz"
echo "Saving source backup: $BACKUP"
tar -C "$TARGET" --exclude='./.git' --exclude='./node_modules' --exclude='./.next' \
  --exclude='./target' --exclude='./data' --exclude='./.env' --exclude='./.env.*' \
  -czf "$BACKUP" .
chmod 600 "$BACKUP"
echo 'Applying v0.4D (preserving config/, .env*, persistent data and Docker volumes).'
umask 022
tar -C "$SOURCE" --exclude='./.git' --exclude='./node_modules' --exclude='./.next' \
  --exclude='./target' --exclude='./data' --exclude='./config' --exclude='./.env' \
  --exclude='./.env.*' --exclude='./__pycache__' -cf - . | tar -C "$TARGET" -xf -
echo 'SUCCESS. Source files updated; no containers or GUI/autologin settings modified.'
echo "cd '$TARGET'"
echo 'sudo docker compose config --quiet'
echo 'sudo docker compose up -d --build --no-deps boot-manager api web'
echo 'python3 scripts/doctor.py'
echo 'Then: http://127.0.0.1:8088/boot'
