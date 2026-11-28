#!/usr/bin/env bash
# Explicit operator-only standalone RC lab. No production compose commands.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PROJECT=openrgd-console-rc-lab
SHA="$(git rev-parse HEAD)"
test "$(git rev-parse --show-toplevel)" = "$ROOT"
test -z "$(git status --porcelain --untracked-files=all)" || { echo "Checkout not clean; use a clean detached candidate"; exit 1; }
export CONSOLE_RC_SHA="$SHA"
dc=(docker compose --env-file /dev/null -f "$ROOT/compose.rc-lab.yml" -p "$PROJECT" --project-directory "$ROOT")
case "${1:-plan}" in
  plan)
    "${dc[@]}" config --quiet
    echo "RC lab source: $SHA; http://127.0.0.1:8188; project $PROJECT"
    echo "No changes. Existing 8088 production stack is outside this project."
    ;;
  start)
    test "${2:-}" = "START-RC-LAB" || { echo "Explicit START-RC-LAB required"; exit 2; }
    test -z "$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT")" || { echo "Lab containers already exist; inspect first"; exit 1; }
    test -z "$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT")" || { echo "Lab volumes already exist; preserve and review before reuse"; exit 1; }
    "${dc[@]}" config --quiet
    "${dc[@]}" up --build -d
    "${dc[@]}" ps
    echo "Run python3 scripts/rc_lab_smoke.py before seeding."
    ;;
  status) "${dc[@]}" ps ;;
  stop)
    test "${2:-}" = "STOP-RC-LAB" || { echo "Explicit STOP-RC-LAB required"; exit 2; }
    "${dc[@]}" down
    echo "Lab stopped; lab data and images retained, production untouched."
    ;;
  *) echo "Usage: bash scripts/rc-lab.sh {plan|start START-RC-LAB|status|stop STOP-RC-LAB}"; exit 2 ;;
esac
