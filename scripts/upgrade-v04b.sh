#!/usr/bin/env bash
# Explicit source-only upgrade for the already working mini-PC v0.4A Console.
# This script NEVER touches Docker volumes, .env, config, controllers or hardware.
set -euo pipefail
umask 077
SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TARGET="${1:-$HOME/openrgd/repos/openrgd-console}"
BACKUPS="$HOME/openrgd/backups"

if [[ "$SOURCE" == "$TARGET" ]]; then
  echo 'Source and target are identical. Extract v0.4B into a staging folder.' >&2
  exit 2
fi
for relative in services/module-agent/calibration_passive.py services/api/src/module_manager.rs \
                apps/web/src/components/calibration-inspector.tsx deploy/Dockerfile.module-agent; do
  if [[ ! -f "$SOURCE/$relative" ]]; then
    echo "Incomplete v0.4B source archive: $relative" >&2
    exit 2
  fi
done
if [[ ! -f "$TARGET/docker-compose.yml" || ! -f "$TARGET/services/api/src/main.rs" || ! -d "$TARGET/config" ]]; then
  echo "Existing v0.4A Console not detected at $TARGET. No changes applied." >&2
  exit 2
fi
mkdir -p "$BACKUPS"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)-$$"
BACKUP="$BACKUPS/console-source-before-v04B-$STAMP.tar.gz"
echo "Backup current Console sources: $BACKUP"
tar -C "$TARGET" --exclude='./node_modules' --exclude='./.next' --exclude='./target' \
  --exclude='./data' -czf "$BACKUP" .
echo 'Copying v0.4B source, preserving local config, .env and state...'
tar -C "$SOURCE" --exclude='./config' --exclude='./data' --exclude='./.env' \
  --exclude='./.env.*' --exclude='./.git' --exclude='./node_modules' \
  --exclude='./.next' --exclude='./target' -cf - . | tar -C "$TARGET" -xf -
# Older extraction scripts ran under umask 077. Permissions for copied code in
# the module-agent IMAGE must not depend on host-side archive permissions.
# Dockerfile.module-agent uses COPY --chmod=0644 for all Python sources.
echo 'Upgrade copied. Docker data volumes, Calibration ready binary and robot projects were not modified.'
echo "  cd '$TARGET'"
echo '  sudo docker compose config --quiet'
echo '  sudo docker compose up --build -d'
echo '  python3 scripts/doctor.py'
