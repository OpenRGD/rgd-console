# CONSOLE → RGD-PERIPH — PERIPH-EXTRACT-01

**Status: source-only extraction handoff, candidate/non-normative/non-actuating.** This document accompanies the consolidation of Console PR #22. Use the immutable merge commit recorded in the PR and [Console master tracker #19](https://github.com/OpenRGD/rgd-console/issues/19) only after the merge and checks are confirmed. This document itself does not assert that the merge or commissioning occurred.

## Provenance and owner decision

- User-approved destination: `OpenRGD/rgd-periph`, an autonomous module that can run without Console. If the repository already exists, reconcile its content and history; do not initialize or overwrite it blindly.
- Original combined tested source: `OpenRGD/rgd-console@82049654438cc2061d17643440806ad09ed684e5` (#22); release baseline `a0ef857cf425c1bb14ad8f62acec21f8c1324866`. PR #5 `b0c390ae11302108839b9fad443b21fa5c51cb4d`, #6 `ca50d89f384bcf60a559ef2ec486d2d574a979d8`, #21 `20d24d5a3a43c09141c02f0a9d68fde0b84c1f1e` are ancestors. All original code and candidate schema identities are preserved.
- [Extraction readiness audit (26 Nov)](https://github.com/OpenRGD/rgd-console/issues/19#issuecomment-7193640026) is the detailed inventory and static review; do not repeat or duplicate it. [RI handoff](PERIPH-TO-RI.md) remains a Console consumer artifact.
- The previously tested source was green in Foundation (4), PERIPH (3), RI compatibility (1). Re-check actual PR/merge CI results before treating any newer commit as accepted. No physical commissioning follows from CI.

## Extraction allowlist (20 PERIPH-origin paths; some split by responsibility)

- Seven candidate schemas under `contracts/console/v1/peripheral-*.schema.json`. Preserve exact existing bytes, IDs, version tags and compatibility fixtures; use a separately reviewed version if semantics change. Candidate names are not a canonical namespace decision.
- `services/api/src/peripherals.rs`: pure Rust domain, extract standalone library with serde/std; tests use serde_json and fixtures. No Axum or Console dependency.
- `services/peripheral-manager/{host_broker.py,control_cli.py,tests/test_host_manager.py}`: generic rootless broker, CLI, lifecycle and bounded validation. Split tests that require instance installation.
- Five `examples/peripherals/*.json` are inert example/compatibility fixtures, not deployed configuration. Add synthetic second robot / multiple streams and explicit instance selection.
- `scripts/{peripheral-contract.test.mjs,peripheral-host-contract.test.mjs}`, `docs/PERIPHERAL-MANAGER-CORE-v01.md`, `.github/workflows/peripheral-contract.yml`: preserve checks; split Console-specific Docker invariants into consumer CI and add actual Draft 2020-12 schema checks.
- Generate an extraction provenance manifest with immutable source commit, source paths, blob SHA and SHA-256; verify original and extracted contents. Retain MIT notices and review licenses, private material and visibility. Never publish complete source history or secrets indiscriminately.

## Do not migrate as autonomous PERIPH runtime

**Instance owner (4 paths):** `services/peripheral-manager/install_paky01_imu.py`, `scripts/peripheral-host-preflight.sh`, `docs/P01-IMU-PUBLISHER-CONTROL-v01.md`, `docs/PERIPH-0.2-HOST-MANAGER-BENCH.md`. Keep concrete bindings, token locations and commissioning with Paky-01; extract only reusable mechanics as a separately reviewed generic installer. No live config or secret transfer.

**Console consumer (6 paths):** `services/api/src/main.rs`, README, `scripts/ri_periph_compat.py`, `scripts/tests/test_ri_periph_compat.py`, `.github/workflows/periph-ri-compat.yml`, `docs/handoffs/PERIPH-TO-RI.md`. Console owns read-side correlation and UI/receiver. RI owns evidence persistence/ref issuance; no duplicate store. Keep existing token-protected producer POST, GET/WS IMU and Pulse K3 unchanged. No new routes or privileges.

## Open gates before autonomous runtime acceptance

1. **Parity and fail-closed policy:** shared Rust/Python acceptance/rejection fixtures, full schema validation, bounds, identity and response validation, duplicate JSON rejection, replay/epoch/ledger limits; no inferred capabilities or device binding.
2. **Timeout and uncertain outcomes:** current CLI timeout 3s versus 4s per subprocess (potentially multiple calls). Define bounded end-to-end budgets; on timeout/disconnect report unknown outcome and reconcile via status/revision, never infer no side effect or blindly retry. Isolate failed reply sends inside per-client handler. Mock failure/disconnect/slow-operation cases.
3. **Ownership and installation:** one authorized acquisition owner, explicit stable device binding, generic broker unit separate from instance publisher; no implicit scan/start/enable, no wildcard capabilities, no USB/audio/video/motor access from Console containers. Same-UID IPC is OS identity, not operator authentication.
4. **Compatibility:** independent package/CI plus existing exact candidate wire fixtures. Cross-repo IMU/RI interoperability must continue to pass; coordinate with current IMU/Paky owner before any migration. No automatic switch of publisher or duplicate serial reader. No hardware tests in CI.
5. **PERIPH-0.3:** only after software extraction acceptance, design operator authn/authz/delegation, scoped capabilities, consent, audit and revocation. Keep default deny and candidate schemas; no browser start/stop or new host privileges before separate review.
6. **PERIPH-CONSOLE-01:** version-pinned client, explicit unavailable/unknown fallback, read-only first, no dependence of existing live telemetry on RI or broker availability. Keep old code inactive as compatibility source until verified migration/rollback; retire only after cutover review.

## Delivery and return

Start with a read-only check of destination repo and current source pins. Prepare extraction as a dedicated Draft PR with provenance, exact schema parity, standalone runtime-free tests, license/visibility review and inventory of intentionally retained code. Report the exact PR/head, CI links, unresolved hardening gates, compatibility and rollback plan to Console #19. Console #22 consolidates only the source; **no service installation, activation, hardware acceptance, deployment or canonical promotion is approved.** No automatic merge of the new extraction PR.
