# Visual Feedback integration — host observation boundary (proposal)

**Date:** 2026-10-25. **Status:** architecture and schema proposal, NOT a running Console feature. Scope: Console baseline `3395b66`, Visual Feedback v0.2.0 (physically checked by operator on Paky-01). A separately published `rgd-voice` implementation is not yet available.

## Why a host-side observer is required

The installed Visual Feedback daemon runs under the Ubuntu user's `systemd --user` and exclusively owns the Miracles.Star BLE controller. Its existing IPC is a mode-0600 Unix socket:

```
$XDG_RUNTIME_DIR/paky01-visual-feedback.sock
```

The Console API, Module Agent, Boot Manager and web UI run in *separate containers*. The Module Agent is intentionally denied host devices and privileged process execution. **Do not bind-mount the user's runtime socket into a container**, let a container independently pair BLE, or give the Console Docker/device access to make a UI feature work.

Preferred first stage (read-only):

```
Voice Studio [future] --explicit lifecycle--> Visual Feedback daemon (host user, single BLE owner)
                                               |
                                               | same-user IPC: status only
                                               v
                                Visual Status Relay (host user, not implemented)
                                               |
                                  bounded, token-authenticated POST
                                               v
Console Rust API (candidate ingest) --> latest source-tagged snapshot --> Web UI
```

The host relay is a separate optional reporting process; it must never forward browser commands to hardware. No transport from Console to the BLE daemon is part of this stage.

## Candidate read-only data contract

See `contracts/console/v1/visual-feedback-host-report.v0.1-candidate.schema.json`. Candidate POST path:

```
POST /api/v1/visual-feedback/observations
x-openrgd-visual-token: <dedicated private token, not the IMU token>
Content-Type: application/json
```

**This route and token verifier do not exist yet.** The route is specified solely to coordinate a future implementation, not to invite requests to a live Console.

Required declaration fields:

- Source identity: `robot_id`, `source_id`, host relay `session_id` and monotonically increasing `sequence`.
- Host clock, **not Chronograph**: `host_receive_utc` and `host_monotonic_ns`. Console adds its own receipt time.
- `service_running` and `ble_connected` are separate. A daemon can run while the controller is disconnected.
- `desired`: latest requested state; `applied`: last successfully written BLE state, or null while disconnected. Neither is a sensor measurement of physical emitted light.
- `last_error`: sanitized and bounded; never emit raw host paths, MAC addresses, credentials or user data.
- `physical_led_observed:false`, `non_actuating:true`, `clock_quality:"host_receive_only_not_chronograph"`.

When the daemon is absent, the reporter can publish an explicit offline report with `service_running:false`, `desired:null`, `applied:null`, `ble_connected:false`. If the reporter is absent, the Console itself must mark the last report as **stale**, never silently display it as live.

## Rust Console implementation gates (future branch)

1. Add a dedicated per-feature secret, constant-time token comparison, explicit allowlist of physical `robot_id`, payload body limit and strict field validation. Do not reuse browser CSRF protection as producer authentication.
2. Reject a changed `source_id` for an already-bound robot, replayed/out-of-order sequences, invalid sessions and inconsistent `applied`/connection claims. Treat relay-process restarts as new sessions only with bounded provenance.
3. Keep latest status in Console's in-memory observation view with receipt timestamp (persisting history requires a separate decision). Use a freshness cutoff (proposed >5s) and map unavailable/stale to *unknown*, not false safe/ready.
4. Broadcast status only through existing read-only stream infrastructure; never turn this into a command or Somatic admission endpoint.
5. Present a clear label such as **"Reported by host Visual service — not physical light observation"** in Console. Surface `desired`, `applied`, `ble_connected`, service present/offline and last error separately.
6. Test invalid token, local CSRF bypass assumptions, forged robot IDs, replay, stale data, disconnection/reconnection and service outage before even staging on Paky-01.
7. Rollout only through a reviewed Console PR and deliberate mini-PC update. Do not modify IMU ingestion, saved robot profiles, Boot Manager, Docker volumes or Somatic Runtime.

## Module Agent / Registry compatibility

The existing `OpenRGD/rgd-modules` v0.1 candidate accepts only `pinned_git_cargo` (Cargo binary) descriptors with **no requested host permissions**, and the Console Module Agent allows a constrained build/source-only workflow. Visual Feedback is an already-running Python user service, not a Cargo executable. Its repository is currently private.

**Therefore do not register it as an installable Cargo module**, fabricate a `ready` installation state in the Module Agent, or expose `INSTALL ... build` to the user for this adapter.

To make Visual Feedback discoverable in Modules later, first define a separately reviewed descriptor kind such as `external_user_service` with a dedicated status `unmanaged_host_service` and **no installation action**. This requires coordinated versioned contract changes in the Registry, Module Agent, and Console UI, including permission and provenance review. Private-source distribution and packaging/installation belong to a subsequent wave.

The proposal-only `module.openrgd.json` in Visual Feedback's draft PR is not an accepted Registry v0.1 descriptor.

## Voice Studio dependency

The candidate Voice event contract is owned by `OpenRGD/rgd-visual-feedback` and describes explicit producer lifecycle events. No inference from TTS text or simulated microphone activity is allowed. A full live Voice→Visual E2E check requires reviewing the actual `rgd-voice` callbacks once its source is published.

**Non-goals:** hardware pairing, BLE transport in containers, LED configuration writes from browsers, actuation/safety authority, physical light verification, time-sync certification or Chronon evidence.
