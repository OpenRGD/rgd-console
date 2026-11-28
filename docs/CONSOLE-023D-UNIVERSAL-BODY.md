# CONSOLE-023D — Universal Body / Kinematic Model Consolidation

**Source-only candidate.** This PR consolidates the earlier body experiments, retaining their Git ancestry but not their robot-specific implementation or data in the candidate tree. Depends on accepted nominal RPY semantics of Console #15, pinned at `f0817728722a4377c597c61ebeb4ca4cea741cc3`. No new endpoint, device, simulation runtime, canonical verification, calibration or actuation privilege.

## Ownership
- Console: a shared nominal frame-origin renderer for /body and /live, and a separate passive diagnostic projection. Every model is the selected robot's existing imported RGD model, never a built-in robot profile.
- Instance repository: mechanical dimensions, CAD source, sensor mounting/sign/zero, motor maps, hardware commissioning, actual fixture inputs and test reports. Do not copy robot-specific tables, dimensions, IDs or operator measurements into universal modules/tests. Preserve historical experiments in their original branches and owner records, not in the runtime.
- Core: RGD source/URDF importer, visual and Evolution candidates, root/integrity authority. CAL and physical binding owners: measured transforms/instance calibration. No locally invented attestation or second parser.
- The previous torso IMU overlay and experimental yaw are deliberately not activated by this universal renderer. A verified, versioned mount/as-built descriptor is needed before associating IMU orientation to any body geometry. Existing independent IMU sensor panel remains available.

## Kinematics and fallback
- Only explicitly declared XYZ (meters) and RPY (radians, fixed-axis Z*Y*X) from the imported model; mathematical root identity at local origin, not world orientation or installed pose. Supported fixed/revolute/continuous/prismatic joints at mathematical zero, which need not be within physical limits. Floating/planar/unknown joint type, missing transforms and numerical limits omit that branch; no implicit zero RPY, no guessed geometry.
- Reject cycles, duplicate IDs, multiple parents, disconnected/dangling references and preview budget overflow. Missing branch stays partial; no fabricated humanoid, base offset, left/right naming rules or joint counts. Camera Z-up is a display convention only, size auto-fit is not a physical rescaling of model data. Frame points and lines are not mesh or collision geometry.
- Read-only angular encoder diagnostics from current selected stream; explicit robot/model scope, physical source, observed rad, freshness, ambiguous motor/joint claims rejected. No measured value drives rendering; prismatic/angular-unit mismatches are excluded. No implied installed motor count or hardware readiness.
- Legacy stored models without RPY remain unknown. No implicit metadata migration/re-import; same archive dedup unchanged.
- WebGL fallback is textual. The active v0.4.3 installation is unchanged; prior isolated preview scripts are historical, not deployed by this PR.

## Verification
Generic synthetic tests and actual pinned Core -> Rust -> TS projection via the dedicated metadata CI. No hardware or instance fixtures in mandatory Console CI. External fixture runner is parameterized and only reads owner-provided nominal sources. Use a private temporary work directory outside the repository; record external source commits/blob hashes, expected results and test reports only with the instance owner.

```bash
# From candidate Console checkout, with explicitly pinned local Core and URDF:
python3 scripts/prepare_body_reference_fixture.py --core "$CORE" --urdf "$URDF" --inventory "$INVENTORY" --out "$TEMP/body-fixture"
CONSOLE_BODY_FIXTURE_ZIP="$TEMP/body-fixture/reference.rgd" CONSOLE_BODY_FIXTURE_JSON="$TEMP/body-fixture/model.json" cargo test --manifest-path services/api/Cargo.toml model_import::tests::export_nominal_body_fixture -- --ignored --exact
node --experimental-strip-types scripts/check_body_reference.mjs "$TEMP/body-fixture/model.json" "$TEMP/body-fixture/expected.json"
```

CSV inventory (optional) must provide joint_name,type,parent_link,child_link. The expected topology remains independent of the importer; add --require-complete only when owner expects every transform declared. No auto-download or repo-specific pin in these generic scripts; use exact local source pins. This is nominal software interoperability, not physical or mesh acceptance. No actual instance test is claimed until run.

## Next gates
#15 review/browser QA, then #10 candidate browser QA in isolated workspace; no merge/deploy until explicit review. Supersede #2 only after equivalent generic acceptance; previously measured instance overlays need an owner-side data contract, not a hardcoded fallback. Future VIS #14 asset delivery and Evolution require separate review; no binary mesh or as-built import here.
