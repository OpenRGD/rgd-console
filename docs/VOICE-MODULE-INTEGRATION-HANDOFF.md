# HANDOFF — Voice Studio → Console / PERIPH / Module Registry

**CONSOLE-023B · 27 November 2026 · candidate / source-only.** Reconciles the documentation-only [Console #3](https://github.com/OpenRGD/rgd-console/pull/3) with [Console #20](https://github.com/OpenRGD/rgd-console/pull/20). Historical source `3dc80bb4027b6862be328ed6bc5ce9bd8a610488` remains traceable in its PR; this version retains the technical decisions and operator evidence without copying host login, MAC/device addresses or private paths into main.

## Verified baseline and evidence

| Owner | Pin / evidence | Status |
|---|---|---|
| Console | `b331dd32415eeda0d107676920a6dea91170cc4f`, [#22](https://github.com/OpenRGD/rgd-console/pull/22) | PERIPH candidate source consolidated; post-merge [Foundation](https://github.com/OpenRGD/rgd-console/actions/runs/45983897526) and [PERIPH](https://github.com/OpenRGD/rgd-console/actions/runs/45983897534) PASS. Published/deployed v0.4.3 remains separate. |
| Voice | `f2f04087fcd80e796f244e40f68365100695a111`, [#2](https://github.com/OpenRGD/rgd-voice/pull/2), [#5](https://github.com/OpenRGD/rgd-voice/pull/5) | VAD/Visual IPC and resident Piper merged. Host manual lab remains independent. |
| Visual Feedback | `08a9f14b4114eff75987dda682e51975b7e617d3` | Merged Voice lifecycle IPC; no Console BLE ownership. |
| PERIPH | [extraction handoff](CONSOLE-TO-PERIPH-EXTRACT-01.md) | Independent owner extraction and PERIPH-0.3 still separate gates; no audio capability or operator authorization shipped by #22. Destination visibility/availability not independently verified here. |
| RI | [RI #4](https://github.com/OpenRGD/rgd-reality-ingress/pull/4), [Voice #9](https://github.com/OpenRGD/rgd-voice/pull/9) | Candidate; optional consented segment metadata, default off; no PCM export, automatic recording, ObservationRef or live Console dependency. |

Historical operator report 26 October: 3/3 ECHO turns with USB microphone, local Whisper base CPU int8, Piper Serena High and Bose A2DP; resident warm median 4.595 s vs 6.772 s without resident cache (full WAV before playback; short trial, not streaming or duplex). LED state was physically observed by operator; driver applied acknowledgement is not optical verification. These results are not current host availability or acceptance of the Console #20 exporter. Voice #4 browser playback events and #7 progressive PCM remain drafts; Voice #3 [audio ownership ADR](https://github.com/OpenRGD/rgd-voice/blob/23e93d4b722848f7f35fc02889cc642c778bd74f/docs/ADR-AUDIO-PERIPHERAL-OWNERSHIP-v0.1.md) remains candidate. Do not change the existing sink to HFP automatically.

## Ownership and actual interface

- Voice owns capture, VAD, STT/TTS, local presets, real playback lifecycle, provider credentials and usage metrics. Console owns discovery and operator-facing diagnostics, not a second Voice Studio, inference SDK, microphone reader or lifecycle source.
- Existing lab is local/unmanaged, `127.0.0.1:8765`. Actual `GET /api/health` and `GET /api/devices` at pinned Voice main supply the report in [VOICE-CONSOLE-0.1](VOICE-CONSOLE-0.1.md). They are not an authenticated network-management API. No direct proxy, CORS change, host network, socket mount, credential exposure or automatic recording.
- Voice→Visual remains the already merged IPC (real capture, inference and actual playback evidence, session/sequence; no synthetic speaking from a generated WAV). Keep delivery best effort and separate from RI reports. Neither Console readiness snapshot nor LED ACK proves physical sound/light.
- PERIPH owns generic inventory, resource/lifecycle policy and eventual authenticated control. Audio-specific discovery/consent/ownership require its owner review. Do not add Voice to the IMU allowlist or duplicate the extracted broker. A future host Audio Agent is an approved Voice/PERIPH adapter, not a second capture service. No raw audio or persistent transcript in Console.
- Current Module Agent accepts only reviewed pinned Git/Cargo distributions. Voice Python package/manifest is not a verified registry-installed module. No `/dev/snd`, PulseAudio/D-Bus/Bluetooth/Docker socket or private credentials mounted into Module Agent. A future package kind requires separate versioned review of distribution digests, locked dependencies, install/start approvals, isolation, audit and rollback. No claim of installed Voice from an HTTP report.
- Cognitive decisions, RGD identity, Chronograf, History, Somatic and motor/CAN are excluded. Candidate lifecycle and manual report contracts are not canonical or attested evidence.

## Consolidation acceptance and return

1. #20 is the single implementation candidate; #3 remains historical until #20 is accepted. The document is carried forward without importing stale operational details or merging #3's obsolete baseline. No automatic main merge until new CI and the previously declared host/browser QA gate.
2. Software: validate schema/actual parser, Python projection, unavailable/unknown/freshness/race/privacy regression. Reconcile with protected Console main; no changes to backend routes, PERIPH broker, RI helper, Docker or registry.
3. Host/browser QA: explicitly run the manual exporter against already-running lab on Paky-01, import matching file in a separately prepared preview; test absence, wrong robot, stale, future, duplicate keys, malformed and superseded file; verify no capture/playback or live claim. Existing installed release remains untouched. Synthetic tests do not establish this gate.
4. Future live diagnostics requires PERIPH-EXTRACT-01/0.3 and Voice owner handoff, reviewed host identity and operator authorization, bounded transport/redaction, independent packaging review. Start read-only, never install/start or grant hardware access from this handoff.
5. Record source commit/CI and QA in Console #19 and return only compatible integration expectations to Voice owner. Existing Voice and Visual PRs remain separate.
