# PERIPH → Reality Ingress — PERIPH-RI-01 return handoff

**2026-11-25 — candidate / non-normative / non-actuating / offline conformance.**
This is not approval, merge, deployment, capture consent, or a new authority.

## Verified repository audit

- RI PR #4: commit `5372f758df79c93fc887f3858d878635447f4a4d`, handoff `docs/handoffs/RI-TO-CONSOLE-PERIPH-IMU.md`, consumer schema and `consumer_ref.py` reviewed.
- Console PERIPH #5: `b0c390ae11302108839b9fad443b21fa5c51cb4d` (descriptor/status/action/result).
- Console PERIPH #6: `ca50d89f384bcf60a559ef2ec486d2d574a979d8` (host manager, installer, preflight, same-UID broker). Targeted CI passed; broad Foundation checks failed separately. Neither draft constitutes installed service evidence.
- Paky-01 #2/#3: existing IMU publisher / managed continuous candidate. Paky-01 #8 (IMU-RI-01) `2e673242337f483db62970a910d942f53628d914` already adds the bounded source-authored RI export; static audit and pinned RI conformance passed. No new capture authorization or physical deployment follows.
- Console main `a0ef857cf425c1bb14ad8f62acec21f8c1324866`; checked-in IMU REST/WS source preserves publisher fields. Actual installed local revision, running publisher, and fresh same-source physical acceptance have not been independently verified in this review.
- No separate accessible OpenRGD/rgd-periph repository was located; PERIPH ownership remains in rgd-console. Do not create a parallel module/registry.

## Decisions

| Owner | Responsibility | Must NOT duplicate |
|---|---|---|
| PERIPH | Registry, device/publisher/stream state, explicit acquisition lifecycle | EvidenceStore, IMU decoder, clocks, sensor capture |
| Paky-01 IMU publisher | Single WIT/CH340 serial owner, source/session/sequence/native clock | A second reader or POST publisher |
| Console / Pulse | Existing live GET/WS, physical-claim telemetry, freshness and K3 | RI storage on the live path, historical proof |
| Reality Ingress | Optional stored evidence validation and authorized ref publication | Host service control, calibrated attitude, canonical history |
| Chronograf / Core History / Somatic | Independent time/history/effect authorities | Authority inferred from hash or lifecycle |

Maintain the existing POST `127.0.0.1:8088/api/v1/imu/observations`, token private to the producer; Console read schema `console.imu.v0.1-candidate`; read-only `/api/v1/stream?robot_id=paky-01`. No new REST or WS endpoint in this PR. Do not change the installed publisher, allowlist, broker, Docker, sensor serial, IMU measurement schema, or Pulse protocol. Device presence, publisher running and per-stream LIVE/STALE remain independent, including when RI is unavailable.

**Minimum producer adapter is already in Paky-01 #8.** It selects samples only after existing Console HTTP 202, at most 1 Hz / 60 samples / 8 queue slots / 256 KiB, with original host monotonic/wall bracket and Linux boot ID; local private sealed JSONL, asynchronous fail-soft writer. It accepts only explicit bounded non-dry-run sessions, rejects `--continuous` with RI export. Do not add export flags to the PERIPH #6 continuous unit. The first optional pilot must be performed by the existing sole reader, with explicit operator approval and local retention, never concurrent with the managed publisher.

## Remaining interoperability gap and minimum Console-side adapter

RI PR #4 compact `ri.consumer-observation-ref.v0.1-candidate` has `source_id`, `sample_sequence`, native reference frame, payload hash and clock/boot metadata, **but no session_id**. A ref alone is insufficient to associate a Console sample after a publisher restart; sequence may reset. Console v0.1 also lacks the actual source boot ID/wall pair, so it must never reconstruct them from WS receipt or certify equal boot clocks.

The source-authored generic RI JSON payload preserves the full original `console_ingest_sample`, including robot/sensor/source/session, sequence, native frame, host receipt UTC/monotonic and SI values. The minimal consumer is an **offline correlation check** using an RI-issued ref plus the exact payload bytes supplied by an authorized RI resolver, not a second ingestion adapter. A match checks byte hash/size, source/session/sequence, values, native frame, source receipt timestamp and RI ref/payload clock-domain consistency. It cannot verify the Console boot ID (not in its contract), prove physical binding or certify that an arbitrary caller-supplied ref came from the RI store.

This PR introduces `scripts/ri_periph_compat.py` (pure offline helper) and `scripts/tests/test_ri_periph_compat.py`. The dedicated workflow checks both actual schemas and uses the real RI `record_sample` / `verified_ref_from_store` with a **synthetic fixture**, pinned to the exact PR #4 commit, not a fork of RI contracts or storage. It exercises same-sequence/different-session, altered source values, missing/corrupt payload, fake verified/source/history/motion flags and clock/boot mismatch. A missing ref is not a lifecycle or live-data failure. No application code imports this helper; no runtime dependency on RI, no output of media or filesystem paths, no new permissions. A successful offline check proves correlation/compatibility only, not live deployment.

## Points open / requested response from RI

1. Accept the source-owned export in Paky-01 #8 as the **only** IMU → RI adapter for this pilot. Preserve the generic source session in stored payload/envelope. No extra consumer-ref field without joint schema review.
2. Specify the future authorized metadata/payload query surface (scope, access restrictions, expiry, unavailable/denied/missing distinction). Only RI issues references after actual store verification; local hash is not authentication. Current `consumer_ref.py` sets origin `unknown`, source_verified/robot_binding_verified/history_committed/actuation_enabled false, source measurement time and Chronograf anchor null. Consumer must display them faithfully.
3. Decide whether a later version needs a compact, RI-authored session correlation descriptor or whether authorized payload resolution suffices. Keep candidate v0.1 unchanged in the meantime.
4. Continuous fan-out needs separately reviewed bounded rotation, quotas, consent/retention and failure handling. No implicit archive or PERIPH lifecycle dependency on RI.
5. Host preflight/actual deployment and physical comparison remain open. Operator must compare same source/session/sequence in existing Console observations and sealed spool; temporarily disable export / keep RI offline; verify uninterrupted live delivery, stale after publisher stop and new session after restart. Never run a second reader. Rollback is the unchanged publisher invocation without export. No changes to the live service merely to test this PR.

## References

- [RI #4](https://github.com/OpenRGD/rgd-reality-ingress/pull/4)
- [Console PERIPH #5](https://github.com/OpenRGD/rgd-console/pull/5), [#6](https://github.com/OpenRGD/rgd-console/pull/6)
- [Paky-01 #3](https://github.com/italiarobotica/paky-01/pull/3), [IMU-RI-01 #8](https://github.com/italiarobotica/paky-01/pull/8)
- This branch: `feat/periph-ri-01-readonly-conformance`, stacked on Console #6. No merge requested or performed.

**Disposition:** compatible architecture; accept for candidate cross-repo review, not normative promotion. Keep PERIPH-0.2 host commissioning and PERIPH-0.3 operator-authenticated control as independent gates. RI adoption must not unblock host controls or change safety authority.
