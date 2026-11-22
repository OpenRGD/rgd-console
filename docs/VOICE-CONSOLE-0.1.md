# VOICE-CONSOLE-0.1 — manual diagnostics handoff (candidate)

Status: source-only Draft PR. This is not an installed module or a Console↔Voice live bridge.

## Goal and ownership

- Voice Lab owns real audio capture/playback, VAD, Whisper/Piper, provider access and local audio preferences.
- Console owns operator-facing diagnostics and a strict manual report preview.
- Visual Feedback owns BLE and visual lifecycle; no Voice/Visual behavior is modified here.
- The existing `rgd-modules` registry is pinned Git/Cargo only. Do NOT advertise Voice as installed/managed by that Registry.
- No 8765 proxy, container host networking, mounts of ~/.config, `/dev/snd`, D-Bus, Bluetooth, token, or direct connection to Voice Lab is introduced.

## Reproducible local-only manual probe

On the Paky-01 Ubuntu host (not inside the Console container), while Voice Lab runs on 127.0.0.1:8765, run:

    cd ~/openrgd/repos/openrgd-console
    python3 scripts/voice_status_export.py --robot-id paky-01 --out ~/openrgd/voice-readiness-paky-01.json

Open Console → Voice Lab and select that JSON file manually. The file is read in browser memory only, is limited to 8 KiB, is scoped to the selected robot, and is never sent to any Console API.

Only `/api/health` and `/api/devices` of the existing lab service are used from the host via literal loopback and GET. Returned hostname, executable/model paths, source/sink names, credentials, recordings and spoken content are NEVER exported. Only bounded counts, sanitized version and booleans are exported. The report is created with private mode 0600, and can be deleted immediately after preview.

An unreachable Voice Lab yields a report with `service_reachable=false` and null metrics; it is not evidence of a physical device failure.

## Truth and freshness

- Schema: `contracts/console/voice-readiness.v0.1-candidate.schema.json`.
- `source_kind=manual_localhost_probe`, `live_connection=false`, `non_actuating=true` are always required.
- Report age >90 seconds, or from the future, is stale and cannot be shown as currently available.
- Even when recent, a manual report is NOT an authenticated live Console connection. `audio_available=true` is not proof of microphone capture or acoustic output.
- The source robot ID is supplied by the operator, not authenticated physical identity.

## Exit criteria and future wave

1. Python reporter tests pass; Console Node, Next typecheck and build pass on GitHub PR CI.
2. Browser import accepts a matching sanitized report, rejects added properties, wrong robot, malformed types and oversized files.
3. Paky-01 host pilot succeeds without changing the running Voice Lab, microphone ownership, or Docker deployment.
4. The subsequent live link requires an explicitly reviewed host-owned Audio Agent, authenticated/authorized bounded IPC, local CSRF protections, strict redaction, and explicit install distribution review. Do not reuse the lab port as an unauthenticated management API.

Source baselines: `rgd-console@a0ef857` and `rgd-voice@f2f04087`; Voice's own `docs/CONSOLE_HANDOFF.md` is the authority for remaining prerequisites.
