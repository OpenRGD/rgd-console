# PERIPH-CONSOLE-01 — offline read-only consumer and cutover preparation

Pin: [PERIPH a36c2d7c42b0bb3f4b2e4c78b42b999be0fac6cd](https://github.com/OpenRGD/rgd-periph/commit/a36c2d7c42b0bb3f4b2e4c78b42b999be0fac6cd), candidate 0.1.0-alpha.1 / Python 0.1.0a1. RC #24 remains the single combined source candidate. No merge or deployment.

- 01A: seven existing Console schema files byte-identical to owner; [lock](../release/periph-consumer-pin.json). Four schemas projected into generated browser module, checked against exact owner source in CI. Pinned direct Ajv 8.17.1 / formats 3.0.1, no full npm transitive lock claim. Old Rust domain is inactive; owner is stricter on revision range, identity and presence/binding. CI-only comparison; no runtime Python or Rust PERIPH install or Registry enrollment.
- 01B/C: offline status-only exchange, injected replay, no default transport. Single bounded LF frame (2048 bytes), full Draft 2020-12 and formats, duplicate key/unsafe integer rejection, exact version, scope/UUID/revision/service correlation, optional revision floor only for caller-established same lineage. Imported UUID/revision and owner pin are declared, not attested. Public stream report accepted as historical only if same declared revision; no actual LIVE state. Unknown, unavailable, recovery_unavailable and reconciliation_required explicit; no retry. Controls disabled irrespective of capability. Browser-only snapshot import, robot-keyed and late file reads ignored. The wrapper is Console-local preview transport, not canonical or owner-issued.
- 01D: source readiness only; no cutover. Keep inactive legacy code until reviewed owner package, operator authn/authz/delegation, authorized transport and commissioning. No socket mount, weakened SO_PEERCRED, new privileges, old installer, second broker/reader, journal copy/reset/rollback. Registry service distribution is a separate owner decision. Live adapter needs authenticated bounded scope, 30s nominal deadline, no implicit retry, verified freshness independent of revision/lineage. No new API or device access. IMU GET/WS, PULSE, RI correlation unchanged. Rollback current source to prior RC 04088c8cd5cafc123368ad46e88b9ca3fc200fb5 only in isolated lab; retain data and never touch production or journal.
- Generic synthetic fixture generator and exact-owner conformance CI added. Instance-specific inputs and results stay with instance owner. Actual browser/host QA not claimed.

## Offline lab test

Use a separately pinned local owner checkout, its locked test dependencies in an isolated Python environment, and the Console web dependencies (no service installation).

```bash
python scripts/prepare_periph_consumer_fixture.py --owner "$OWNER_CHECKOUT" --out "$TEMP/periph-fixtures"
node --experimental-strip-types scripts/check_periph_consumer.mjs "$OWNER_CHECKOUT" "$TEMP/periph-fixtures"
```

Select synthetic robot rc-lab-unbound in the isolated 8188 lab, import running.json, quarantine.json or unavailable.json. The generator uses actual owner status code with mocked probes/runner, not devices, real socket, journal or lifecycle actions. The quarantine mock demonstrates consumer semantics, not durable recovery proof. Wrong-scope import is rejected; no current stream is inferred. Browser QA remains separate.

CI verifies all seven Git blobs, generated browser schema objects, actual status/reconciliation, no implicit retry, rejection of non-read requests, invalid frames, scope, unsafe revisions, mismatched service, invalid timestamp, false authority, wrong schema pin and stale stream claims. A temporary CI-only copy of old Rust domain is compared against the actual owner library; it is not linked into the new consumer. No new contract changes requested; future authorized transport and registry distribution still need owner review.
