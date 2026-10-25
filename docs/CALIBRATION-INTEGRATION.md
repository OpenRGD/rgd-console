# Console v0.4B ↔ RGD Calibration CAL-0.2

## Verified upstream contracts

The external module `OpenRGD/rgd-calibration@0.2.0` has an `inspect --bundle <directory>` CLI and a versioned passive report schema (`contracts/passive-report.v0.2.schema.json`). The official Module Registry `OpenRGD/rgd-modules` pins Calibration to commit `81700401e2fa6d370a86b6c1f5a48802bc5f1fc7`. It only considers the binary `ready` after source + installed binary integrity checks.

## New integration boundary

```text
Browser Modules page
  └─ explicit click "Ispeziona profilo RGD"
      └─ Console Rust API  POST /api/v1/robots/{instance}/calibration/inspect
          ├─ validates instance -> imported RGD model association
          ├─ reads stored original ZIP and recomputes SHA-256 (no canonical validation)
          └─ private HTTP request with ZIP bytes to Module Agent
              ├─ checks exact org.openrgd.calibration@0.2.0 ready + digest
              ├─ bounded allowlist-only Foundation JSONC temp extraction
              └─ fixed argv: [resolved_binary, inspect, --bundle, tmpdir]
                  └─ read-only CAL-0.2 JSON report (no --profile/--out)
          └─ stores last report as non-authoritative preview in console_data
              └─ GET /api/v1/robots/{instance}/calibration/last
```

No physical device is opened, no CAN process started, no robot backend adapter introduced. The Module Agent remains on an internal Docker network with **no** mounted `/dev`, `/sys` or Docker daemon socket, and is executed under UID 10002.

## Source data safety

The Console's ZIP import has already constrained archive shape. The API rechecks original bytes against `source_sha256` (digest of the ZIP itself, **not** the canonical OpenRGD source-tree hash). The Agent independently validates archive entry types, path traversal, total size (8 MiB compressed, 16 MiB uncompressed, 256 entries), and extracts only allowlisted Foundation `*.jsonc` files, each <=2 MiB. It never extracts or executes other source code.

Only `description.jsonc`, `calibration.jsonc`, `actuation_topology.jsonc`, `hal_mapping.jsonc`, `sensor_fidelity.jsonc` are materialized in an isolated temporary directory. The Agent invokes the exact installed binary path returned by Registry `resolve_binary`; no operator-controlled command line is accepted. `--profile`, `--model-hash` and `--out` are explicitly absent in v0.4B. Runtime has a fixed timeout; report length is bounded.

## Trust and provenance

- `profile_state` in the Console describes structural inspection, **not** `rgd check` canonical validation.
- `report_version` is `0.2.0`. A report must explicitly set `current_robot_position_observed = false`, `physical_drift_evaluated = false`, `claims_physical_calibration_certified = false`, `export_preview = null`.
- A software `ready` state never implies the robot is calibrated. Any historical measurement evidence is a stored claim, not independently certified sensor evidence.
- `calibration_previews/<robot_id>.json` is an operational preview stored on `console_data`, **not a Chronon**. It is never merged into the Canonical RGD `calibration.jsonc` and never used for actuation decisions.
- The API and Module Agent still lack first-party user authentication; the entire Console is intended for loopback-only use or via authenticated SSH tunnel. Header and Origin checks are CSRF mitigation, not identity verification.

## Future CAL-0.3 and physical measurements

A separate guided measurement workflow should bring verified physical observations through a new, reviewable provider contract. It must not reuse the non-attuating ZIP inspection route for movement. The candidate `physical-observation.v0.1-candidate.schema.json` and `docs/PHYSICAL-OBSERVATION-CONTRACT.md` are **design-only**, with no executable hardware adapter in v0.4B.
