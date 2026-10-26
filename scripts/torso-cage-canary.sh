#!/usr/bin/env bash
# Non-invasive Paky-01 CORPO 3D browser preview.
# Runs an additional Next.js container + local-only Caddy proxy on :8099.
# NEVER recreates production Compose services, edits .env, or opens robot hardware.
set -euo pipefail

ACTION="${1:-}"
WEB='rgd-torso-v01-web'
GATEWAY='rgd-torso-v01-gateway'
NETWORK='openrgd-console_default'
IMAGE='rgd-console-torso-preview:v0.3'
CADDY_IMAGE='caddy:2.10-alpine'
PORT='8099'
CONFIG_DIR="${HOME}/openrgd/preview/torso-cage-v01"
CADDYFILE="${CONFIG_DIR}/Caddyfile"

usage() {
  echo "Usage: bash scripts/torso-cage-canary.sh {up|status|down}"
  exit 2
}

exists() {
  sudo docker container inspect "$1" >/dev/null 2>&1
}

stop_one() {
  if exists "$1"; then
    sudo docker rm -f "$1" >/dev/null
  fi
}

status() {
  sudo docker ps --filter "name=^/${WEB}$" --filter "name=^/${GATEWAY}$" \
    --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
  if exists "$GATEWAY"; then
    curl -fsS --max-time 4 -o /dev/null \
      -w 'PREVIEW /live HTTP %{http_code}\n' \
      "http://127.0.0.1:${PORT}/live" || true
  fi
}

case "$ACTION" in
  up)
    if exists "$WEB" || exists "$GATEWAY"; then
      echo "Preview containers already exist. Use 'status' or 'down'; refusing to replace." >&2
      exit 1
    fi
    sudo docker network inspect "$NETWORK" >/dev/null
    sudo docker image inspect "$IMAGE" >/dev/null
    sudo docker image inspect "$CADDY_IMAGE" >/dev/null

    # Only run alongside a currently healthy existing Console.
    curl -fsS --max-time 4 -o /dev/null 'http://127.0.0.1:8088/healthz'

    mkdir -p "$CONFIG_DIR"
    # No auth tokens or data are copied into the proxy.
    cat >"$CADDYFILE" <<'EOF'
:8080 {
  encode zstd gzip
  # Separate, local preview: forward ONLY read-side requests to the real API.
  # WS upgrade is an HTTP GET and still passes through.
  @api_read {
    path /api/* /healthz
    method GET HEAD
  }
  @api_block path /api/*
  route {
    reverse_proxy @api_read api:8080
    respond @api_block "Preview API is read-only" 405
    reverse_proxy rgd-torso-v01-web:3000
  }
}
EOF

    ready=0
    cleanup_on_fail() {
      if [[ "$ready" != '1' ]]; then
        # Keep failed containers until their status/logs are captured.
        # Do not inspect complete container configuration or print environment/secrets.
        echo '=== PREVIEW STARTUP DIAGNOSTICS (temporary containers only) ===' >&2
        for name in "$GATEWAY" "$WEB"; do
          if exists "$name"; then
            echo "--- $name: state / exit code ---" >&2
            sudo docker inspect --format '{{.State.Status}} exit={{.State.ExitCode}} error={{.State.Error}}' "$name" >&2 || true
            echo "--- $name: last 35 log lines ---" >&2
            sudo docker logs --tail 35 "$name" >&2 || true
          else
            echo "--- $name: no container to inspect ---" >&2
          fi
        done
        stop_one "$GATEWAY" || true
        stop_one "$WEB" || true
        echo 'Preview startup failed; only temporary preview containers removed. Active Console unchanged.' >&2
      fi
    }
    trap cleanup_on_fail EXIT

    # Validate config with the existing local image before creating any preview service.
    sudo docker run --rm --pull=never --network none \
      --mount "type=bind,src=${CADDYFILE},dst=/etc/caddy/Caddyfile,readonly" \
      --cap-drop ALL --cap-add NET_BIND_SERVICE --security-opt no-new-privileges \
      --entrypoint caddy "$CADDY_IMAGE" validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null

    sudo docker run -d --pull=never --name "$WEB" \
      --network "$NETWORK" \
      --read-only --tmpfs '/tmp:mode=1777' \
      --cap-drop ALL --security-opt no-new-privileges \
      "$IMAGE" >/dev/null

    # Caddy's binary has a file cap for NET_BIND_SERVICE. The running
    # production Compose service also adds it; dropping ALL without re-adding
    # can make Caddy exit during exec even when listening on unprivileged 8080.
    # Do not --rm here: retain a crashed container long enough to read logs.
    sudo docker run -d --pull=never --name "$GATEWAY" \
      --network "$NETWORK" \
      --publish "127.0.0.1:${PORT}:8080" \
      --mount "type=bind,src=${CADDYFILE},dst=/etc/caddy/Caddyfile,readonly" \
      --cap-drop ALL --cap-add NET_BIND_SERVICE --security-opt no-new-privileges \
      "$CADDY_IMAGE" >/dev/null

    # The preview gets API + WebSocket from the EXISTING Console API,
    # and the 3D web frontend from the candidate image. No fake IMU data.
    for attempt in {1..12}; do
      if curl -fsS --max-time 3 -o /dev/null "http://127.0.0.1:${PORT}/live" &&
         curl -fsS --max-time 3 -o /dev/null "http://127.0.0.1:${PORT}/healthz"; then
        ready=1
        break
      fi
      sleep 1
    done
    if [[ "$ready" != '1' ]]; then
      echo 'Preview HTTP smoke failed (see docker logs before retrying).' >&2
      exit 1
    fi
    echo "PREVIEW LIVE: http://127.0.0.1:${PORT}/live"
    echo 'Original Console remains at http://127.0.0.1:8088/live'
    echo 'Stop preview: bash scripts/torso-cage-canary.sh down'
    ;;
  status)
    status
    ;;
  down)
    stop_one "$GATEWAY"
    stop_one "$WEB"
    echo 'Preview containers removed. Original Console services untouched.'
    ;;
  *)
    usage
    ;;
esac
