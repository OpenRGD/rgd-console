# CONSOLE-025A — Integrated release candidate (source only)

Five feature PRs in a single source tree with original ancestry retained. [Exact component pins](../release/console-025a.json). Main and tag v0.4.3 remain unchanged. API/package version remains 0.4.3 for compatibility; this is not yet a published 0.5.0 release. Identify the lab by checked-out Git SHA, lab image labels, gateway header and loopback port.

## Integration
- #20 Voice manual diagnostics (#3 handoff reconciled); #23 CAL report and source-byte checks; #15 nominal metadata included via #10 universal Body; #18 universal Visual Studio. Shared shell preserves both Voice and Visual entry points; CI preserves Voice tests and CAL schema dependency/check. Identical TS config overlap. Historical prototypes remain in Git history, not the current implementation.
- PERIPH foundation already on main; autonomous CONSOLE-024 separate. No broker execution, new permissions or live peripheral client. Existing registry/Core pins unchanged.
- Full CI includes owner conformance plus isolated synthetic API/HTTP lab checks, two model imports and separate unbound instances, exact ZIP SHA, zero/missing RPY, safe absent-CAL refusal. Not browser E2E or hardware acceptance.

## Ubuntu acceptance first (CONSOLE-025B)
Use a clean detached worktree of the exact candidate. Check local disk/RAM, Docker context and existing services before building. If insufficient resources, stop and assess; do not stop production. Lab project `openrgd-console-rc-lab`, localhost 8188, distinct volumes/networks/images, synthetic registry. Do not merge compose files, copy production .env or mount production data. No IMU token or host device mounts. Lab gateway rejects publisher, host import and module install. Agent runtime internal network. Build uses ordinary upstream dependencies. SELinux private relabel applies only to isolated lab source mounts; Fedora compatibility not yet tested.

```bash
bash scripts/rc-lab.sh plan
bash scripts/rc-lab.sh start START-RC-LAB
python3 scripts/rc_lab_smoke.py
# Explicit optional seed, only empty marked lab:
python3 scripts/rc_lab_smoke.py --seed-synthetic
```

Open http://127.0.0.1:8188. Existing lab containers or volumes cause start to refuse. Inspect rather than overwrite. Lab is a local operator workspace, not multi-user authentication.

### Generic acceptance gates
- [ ] Exact candidate SHA and isolated project/port/images/volumes; existing 8088 production status unchanged.
- [ ] Two synthetic instances: correct selected model, partial topology, RPY unknown/zero, WebGL and textual fallback, no stale cross-robot data.
- [ ] Voice: correct/mismatched/stale/malformed/concurrent imports, missing service, no persistence/upload/capture. Existing host Voice Lab probe only under separately scoped operator test; no new service.
- [ ] Visual: two owner-generated synthetic profiles, revision comparison, Composer/Director output, scoped asynchronous imports; status remains unbound; no approval/physical output claim.
- [ ] CAL initial absent module must refuse and save nothing. Positive real API/installed binary, malformed report/digest, old preview and mixed-image rollback need separately reviewed isolated CAL installation/test. Do not copy production module_data.
- [ ] Physical authority remains false, no new publisher or hardware operation. Record actual instance test results only in instance repositories.
- [ ] Browser QA on Ubuntu, owner contract review, all exact-head CI, separate merge/release approval. Fedora/SO-101 later with own configuration.

Rollback: `bash scripts/rc-lab.sh stop STOP-RC-LAB` stops only lab, retains its volumes/images. Verify 8088 independently. No prune, destructive volume removal or production restart. Production backup/restore and version/tag promotion are separate tasks. Keep individual PRs open until combined acceptance, then reconcile only verified history/superseded content.

## PERIPH-CONSOLE-01 (28 November)

The RC includes an offline-only Peripherals panel. See [consumer and cutover boundary](PERIPH-CONSOLE-01.md). The smoke waits for all nine web routes before synthetic API tests. No live PERIPH transport or new privileges.
