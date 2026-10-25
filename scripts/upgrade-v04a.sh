#!/usr/bin/env bash
# Explicit source-only upgrade, NO Docker commands or device operations.
# Keeps local robot configs, .env files, volumes and runtime state untouched.
set -euo pipefail
umask 077
SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TARGET="${1:-$HOME/openrgd/repos/openrgd-console}"
BACKUPS="$HOME/openrgd/backups"

if [[ "$SOURCE" == "$TARGET" ]]; then
  echo "Source and target are the same. Extract v0.4A into a separate staging folder." >&2
  exit 2
fi
if [[ ! -f "$SOURCE/deploy/Dockerfile.module-agent" || ! -f "$SOURCE/services/api/src/module_manager.rs" ]]; then
  echo "v0.4A source distribution incomplete. No changes applied." >&2
  exit 2
fi
if [[ ! -f "$TARGET/docker-compose.yml" || ! -f "$TARGET/services/api/src/main.rs" ]]; then
  echo "Existing Console not found at: $TARGET. No changes applied." >&2
  exit 2
fi
if [[ ! -d "$TARGET/config" ]]; then
  echo "Existing robot configuration folder missing. No changes applied." >&2
  exit 2
fi
mkdir -p "$BACKUPS"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)-$$"
BACKUP="$BACKUPS/console-source-before-v04A-$STAMP.tar.gz"
echo "Backing up current Console SOURCE to: $BACKUP"
tar -C "$TARGET" --exclude='./node_modules' --exclude='./.next' --exclude='./target' --exclude='./data' -czf "$BACKUP" .
# No config/, data/, .env, user Git repo, or generated asset overwrites.
# GNU tar from the distribution itself is available on supported Linux hosts.
echo "Overlaying v0.4A source, preserving local config and state ..."
tar -C "$SOURCE" \
  --exclude='./config' --exclude='./data' --exclude='./.env' \
  --exclude='./.env.local' --exclude='./.git' --exclude='./node_modules' \
  --exclude='./.next' --exclude='./target' -cf - . \
  | tar -C "$TARGET" -xf -
echo "Source update applied. Docker volumes were not touched."
echo "Next steps:"
echo "  cd '$TARGET'"
echo "  sudo docker compose config --quiet"
echo "  sudo docker compose up -d --build"
echo "  python3 scripts/doctor.py"
