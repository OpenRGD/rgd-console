# VOICE-CONSOLE-0.1 — manual diagnostics handoff (candidate)

Status: source-only candidate consolidated in PR #20 (CONSOLE-023B). This is not an installed module or a Console↔Voice live bridge. The historic Console #3 handoff is reconciled in [VOICE-MODULE-INTEGRATION-HANDOFF.md](VOICE-MODULE-INTEGRATION-HANDOFF.md).

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

Only `/api/health` and `/api/devices` of the existing lab service are used from the host via literal loopback and GET. Returned hostname, executable/model paths, source/sink names, credentials, recordings and spoken content are NEVER exported. Only bounded counts, sanitized version and booleans are exported. The report is written atomically with private mode 0600 to the explicitly selected output (replaces that file if present), and can be deleted immediately after preview. Failed enumeration yields null counts, not zero. The host probe uses only literal localhost and allowed GET paths, a per-socket-operation timeout and bounded replies; it does not guarantee a global request deadline.

An unreachable Voice Lab yields a report with `service_reachable=false` and null metrics; it is not evidence of a physical device failure.

## Truth and freshness

- Schema: `contracts/console/voice-readiness.v0.1-candidate.schema.json`.
- `source_kind=manual_localhost_probe`, `live_connection=false`, `non_actuating=true` are always required.
- Report age >90 seconds or >5 seconds ahead of the browser clock is not recent; the timestamp is taken before probing. The browser clock is not a verified shared time domain. Recent means only age-compatible manual evidence, never a live connection.
- Even when recent, a manual report is NOT an authenticated live Console connection. `audio_available=true` is not proof of microphone capture or acoustic output.
- The source robot ID is supplied by the operator, not authenticated physical identity. A locally supplied report may be edited; it does not attest the host.
- `ready_cloud_models` counts locally configured cloud model entries, not verified provider connections; `piper_model_loaded` describes that Voice Lab server process, not all audio processes. `audio_available` reports the enumeration probe, not active recording or playback.

## Exit criteria and future wave

1. Python reporter tests pass; Console Node, Next typecheck and build pass on GitHub PR CI.
2. Automated tests execute the actual browser-side parser (not a browser E2E test) and compare the actual Python projection using a synthetic fixture. Manual browser QA: matching report, failed/wrong robot/oversized/duplicate fields, switching robots during import, newer import winning, 90-second expiration, future clock. No raw parser errors or data leave the page.
3. Paky-01 host pilot succeeds without changing the running Voice Lab, microphone ownership, or Docker deployment. Keep PR Draft until host/browser QA and CI acceptance; this is not a request to launch or install Voice on Fedora. If the service is absent, record only the unavailable fallback; do not mark the actual host pilot complete.
4. The subsequent live link requires an explicitly reviewed host-owned Audio Agent, authenticated/authorized bounded IPC, local CSRF protections, strict redaction, and explicit install distribution review. Do not reuse the lab port as an unauthenticated management API.

Source baselines: `rgd-console@b331dd32415eeda0d107676920a6dea91170cc4f` (PERIPH source consolidation only), `rgd-voice@f2f04087fcd80e796f244e40f68365100695a111`. No automatic installation, host IPC, audio/video ownership, or RI evidence promotion. See the owner handoff for remaining prerequisites.
