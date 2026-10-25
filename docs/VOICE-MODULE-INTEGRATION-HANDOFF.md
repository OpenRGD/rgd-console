# Voice Studio → Console Module Agent → Visual Feedback (handoff, 2026-10-25)

**Status:** architecture/documentation only. No Voice installation, host audio attachment, actuator authority or runtime deployment is enabled by this document.

## Verified baselines

| Component | Source | Verified state |
|---|---|---|
| Console | `OpenRGD/rgd-console` @ `3395b66` | Next.js, Rust/Axum, private Python Module Agent; robot boot `ready_non_actuating` |
| Voice Studio | local v0.3.1 candidate | working audio lab on Paky-01; proposed repo `OpenRGD/rgd-voice` **not yet published** as of this handoff |
| Module Registry | `OpenRGD/rgd-modules` candidate v0.1 | only `org.openrgd.calibration`, pinned Git/Cargo |
| Visual Feedback | `OpenRGD/rgd-visual-feedback` v0.2 | local Unix socket/CLI, BLE LED outputs, hardware-agnostic states |

Paky-01 operator-validated voice paths: BC-Master USB microphone, Bose SoundLink Bluetooth A2DP output, faster-whisper/Piper, ElevenLabs TTS; v4 Turbo WebSocket is **not yet hardware/provider-verified**.

## Responsibility boundaries

1. **Voice** owns capture, VAD, STT, TTS, audio playback, provider-specific adapters, voice selection and cost metrics. No identities, RGD/Chronon edits, cognitive decisions, motor commands or CAN access.
2. **Console** owns operator-facing discovery/configuration and informed module install approval, not provider SDK implementations.
3. **Registry** owns reviewed, pinned distribution metadata and verification, not device access.
4. **Host-side Voice runtime** owns user-session PulseAudio/PipeWire I/O, local cloud credentials and non-actuating audio lifecycle events.
5. **Visual Feedback** owns LED effects via its separate local Unix socket. Failure in visual output must never fail a voice turn.

## Existing constraints — do not bypass

- `services/module-agent/server.py` is a Docker-private no-device Python sidecar; its allowlist accepts only the existing registry distribution and a fixed safety descriptor shape.
- `rgd-modules/registry/schemas/module.v0.1.schema.json` has `distribution.kind = pinned_git_cargo` and no Python service package kind.
- The Console ↔ Module Agent `install` contract supports `source_only` / `build` with explicit exact-string confirmation. It does **not** support host-level audio deployment or privileged execution.
- `deploy/Dockerfile.module-agent` pins the current registry to a reviewed commit; updating an external registry does not automatically update the deployed Console.
- Do not add `/dev/snd`, host PulseAudio sockets, D-Bus, Docker socket or cloud API keys to the Module Agent container as a shortcut.
- Do not route the localhost-only Voice Lab (currently port 8765) through Caddy/LAN without reviewed authn/authz and CSRF threat model.
- Keep Boot Manager and Somatic Runtime non-actuating. No Docker volumes or existing installations are modified by this handoff.

## Suggested staged PR plan

### VOICE-0.4A — source provenance
Publish `OpenRGD/rgd-voice` privately, preserve baseline v0.3.1, verify no `.env`, private WAV or account usage DB is tracked. Pin a source SHA after offline CI and Ubuntu hardware regression checks. Keep `module.candidate.json` explicitly non-normative.

### VOICE-0.4B — registry contract
Propose a reviewed Python-service distribution type with verified wheel/source digests, reproducible dependencies, allowlisted build/install operations, versioned permissions (`audio.capture`, `audio.playback`, `network.provider`, `secrets.local`), supported OS/CPU and rollback. Keep `source_only` strictly non-executable. Do not register until installer and conformance tests exist.

### VOICE-0.4C — host voice service
Separate unprivileged user-level Voice Agent (e.g., systemd user unit), audio device access only via its own session. Local IPC with peer authorization, bounded payloads, explicit operator consent for cloud uploads and support for hardware being absent. Avoid privilege escalation, arbitrary command/path execution and credential reflection.

### VOICE-0.4D — Console integration
After registry and service are ready: minimal Console module status/actions through the existing private Module Agent, then voice profile editing and health. Branch + PR off current Console `main`; no direct pushes. Do not claim installed based on registry discovery. Keep errors from optional provider/LED modules isolated from motion control.

### VOICE-0.4E — Voice ↔ Visual Feedback contract
Emit real lifecycle events and coalesce superseded events in a non-blocking sender:

| True event source | State |
|---|---|
| Microphone capture actually begins | `listening` |
| Utterance closed and STT/cognitive processing begins | `thinking` |
| Actual audio playback starts (not TTS request or generated file) | `speaking` |
| Playback ends, no capture active | `idle` |
| Capture resumes | `listening` |
| Service unable to continue | `error` |
| Operator deactivates service | `off` |

A BLE `accepted` acknowledgement is not proof the lights visibly changed; no action/safety grants result from visual feedback.

## Exit gates

- Source repo pinned; 51 offline baseline tests reproduced on Paky-01 plus host audio smoke test.
- Registry schema and installer tests accept Python package with strict verification, permissions and no hidden auto-install.
- Host-side Voice Agent authenticated/local-only and independent of Module Agent's hardware/privilege boundary.
- Console module listing, approval, install, status, uninstall/rollback tests verified on Ubuntu 22.04 and Fedora.
- Voice lifecycle events driven by observed capture/playback with failure-injection tests; LED unavailable does not stop speech.
- Cloud keys never in Git, Console browser responses, image layers, Docker volumes of Module Agent or logs.

**Next action:** publish `rgd-voice`, obtain exact Git SHA, then split runtime changes into narrowly scoped implementation PRs. This document deliberately makes no claims of completed integration.
