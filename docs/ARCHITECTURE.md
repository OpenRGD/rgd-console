# Architecture Decision Record — Foundation v0.1

**Date:** 2026-10-19
**Status:** Local scaffold implemented; build/integration verification pending in a toolchain-enabled environment.
**Scope:** Dedicated `openrgd-console` source tree only. No upstream repository has been changed.

## 1. Upstream facts reviewed

- `OpenRGD/openrgd` README, reconciliation `RUNTIME_BOUNDARY.md` and `REPOSITORY_MAP.md`, and cross-component `contracts/agent/v0.1.0/STATUS.json` were inspected on GitHub.
- Standard bundle version `0.2.0` is Draft; toolchain `0.1.1` is alpha. The canonical tooling root is **non-actuating** and does not ship a physical runtime or Body Adapter.
- The agent contract package `v0.1.0` is a **candidate**, not a normative stable protocol. Its Chronon model reserves canonical evidence to immutable Chronons; memory projections may be rebuilt. Its Cognition Contract explicitly does not require retaining private chain-of-thought.
- Repo `OpenRGD/rgd-runtime` and `OpenRGD/rgd-studio` contain placeholder READMEs and were not treated as executable dependencies.

Relevant upstream reference paths:

- `https://github.com/OpenRGD/openrgd/blob/main/contracts/README.md`
- `https://github.com/OpenRGD/openrgd/blob/main/contracts/agent/v0.1.0/STATUS.json`
- `https://github.com/OpenRGD/openrgd/blob/main/contracts/agent/v0.1.0/contracts/00_TEMPORAL_CHRONON_PROFILE.md`
- `https://github.com/OpenRGD/openrgd/blob/main/docs/reconciliation/RUNTIME_BOUNDARY.md`
- `https://github.com/OpenRGD/openrgd/blob/main/docs/reconciliation/REPOSITORY_MAP.md`

These references govern future alignment; they are not copied or modified.

## 2. Component boundaries

```text
Browser (Next.js 16, React, TypeScript)
        │ same-origin /api/v1 + WS
        ▼
Local gateway (Caddy, loopback-only)
        ▼
Console API (Rust, Axum, Tokio)
  ├─ robot registry (validated declarations)
  ├─ telemetry snapshot read API
  ├─ WebSocket broadcast hub
  ├─ operational events ring buffer (not Chronons)
  ├─ module manifest registry (read-only)
  └─ TelemetryAdapter trait (read-only)
       ├─ SimulatorAdapter  → synthetic measurements, explicit provenance
       └─ UnboundAdapter    → all measurements null, no device I/O

FUTURE (not implemented / not linked):
Console API → verified OpenRGD service contract → Somatic Runtime
                                                │ independent RT control
                                                ▼
                                          Safety Gate → Backend Adapter
                                                        ├─ ROS 2
                                                        ├─ CAN
                                                        └─ Simulator
```

The user-visible relationship `Console → OpenRGD API → Somatic Runtime → Motion Backend Adapter → Hardware` is retained as a **future** physical path. Console's v0.1 `TelemetryAdapter` is a read-only ingest/projection boundary, not the motor backend adapter and not a substitute for the Somatic Safety Gate.

## 3. Data contracts

Transport version: `console.v1`, under `contracts/console/v1/`; this is an **internal Console contract**, not a normative RGT/Chronon schema.

REST endpoints:

| Method | Path | Use |
|---|---|---|
| GET | `/healthz` | Liveness / actuation disabled |
| GET | `/api/v1/status` | Read-only and integration status |
| GET | `/api/v1/robots` | Registry |
| GET | `/api/v1/robots/{id}` | Robot identity |
| GET | `/api/v1/robots/{id}/telemetry` | Last snapshot |
| GET | `/api/v1/events?robot_id=&limit=` | Operational event history (max 200 per page) |
| GET | `/api/v1/modules` | Manifest list |
| WS | `/api/v1/stream?robot_id=...` | `hello`, `telemetry`, `event`, `heartbeat` |

- WebSocket message envelope: `schema_version`, `type`, `robot_id`, `emitted_at`, `data`.
- Measurement: nullable `value`, unit, `source_id`, `source_kind`, `measured_at`, quality. `received_at` and clock domain are declared on snapshot. A missing sensor MUST have `value:null` and `measured_at:null`.
- No fabricated realtime CAN communication. The simulator's virtual CAN and all motors have IDs prefixed `SIM` and declare `source_kind:simulated`.
- Telemetry is sampled, **not** automatically transformed into Chronons. High-frequency raw data should later be held in a separate time-series store and linked with payload references.
- Operational events have `event_id`, `robot_id`, `stage`, `event_kind`, `correlation_id`, `causal_parent_event_ids`, `payload_ref`, `chronon_id`. In v0.1 `chronon_id` is always null and `evidence_class` states the event is *not* canonical evidence.
- The six requested action phases (request / admission / execution / feedback / result / anomalies) are permitted by the envelope but **not generated artificially** when only the simulator's observations exist.

### Why no live integration yet?

A physical runtime must publish a verified telemetry schema, boot/clock identity, source provenance, capability discovery, joint limits and a safety-authority contract before Console may ingest it. The candidate Agent contract is not a promise of an existing streaming API. `rgd run` is non-actuating by upstream decision; the Console must not try to repair it by directly opening SocketCAN.

## 4. Security invariants

1. No `POST`/`PUT`/`PATCH`/`DELETE` API routes. No motion command types or SDK exposed in Console.
2. Physical robot registry entries MUST resolve only to `console.unbound.v1` in this version, otherwise startup aborts.
3. Modules are passive manifest metadata. No dynamic install, execution, privilege grant or plugin supply-chain surface.
4. The WebSocket checks Origin against Host or an explicit allowlist; client-originated messages are ignored. Do not interpret this as user authentication.
5. Docker publishes only `127.0.0.1:8088` externally; backend and Next are internal Docker network endpoints. Remote access via authenticated SSH tunnel/VPN or future dedicated identity gateway.
6. Console failure cannot change the real-time motor loop because it never participates in that loop.
7. A hardware emergency stop is independent of this software. The Console does not offer a clickable pseudo-e-stop.
8. No physical robot position, voltage, temperature, controller or runtime status is inferred from the last known historical tests.
9. A stale browser sample (>5s old) is shown as stale, never silently live. Production ingestion must harden sequence validation and time-authority checks.

## 5. Modularity / later migrations

- Separate `RuntimeConnector` module will establish an **actual**, versioned read-only handshake, clearly reporting absence until ready.
- Model loader can later bind RGT joints, calibration, limits and geometry to telemetry without assuming a hardware device identifier is universal.
- Future historical adapter may resolve Chronon refs with Chronograph clock domains; do not treat `Date` from local simulator as Chronograph evidence.
- Module registry v1 can later add signed bundle/provenance checks, permission escalation approvals, per-module sandboxing, rollback, diagnostics and Hub distribution **only after** threat model and governance review.
- Multi-robot filtering already exists in registry + REST + WebSocket messages, but the current simulator runs only one profile.

## 6. Known limitations / risks

| Risk | Control in v0.1 | Required for later milestone |
|---|---|---|
| No installed physical runtime API | Fail closed; physical adapters unbound | Documented/verified somatic control and feedback contracts |
| Time/clock authority | Explicit simulated local domain | Chronograph anchors, boot IDs, uncertainty, synchronizer |
| Browser WS disconnect | Reconnect and metric stale indicator | Sequence gaps, replay/catch-up strategy |
| Memory fidelity | Volatile ring; clearly not Chronons | Canonical append-only Chronon provider, durable replay |
| Physical motor safety | No actuation paths | External gate, arm/disarm, limits, watchdog, local e-stop |
| Remote access | Loopback + SSH tunnel | Authenticated gateway with granular authorization and audit |
| Dependencies | Version pinned in package manifest; no lock in source zip | Lockfile, SBOM, license/security checks, proven builds |
| 3D body | Empty axes only | RGT/URDF import validation; joint mapping and feedback |

## 7. Incremental delivery waves

- **0.1A** Contract freeze, source inventory, registry and read-only safety boundary.
- **0.1B** API REST + WebSocket hub + simulator/unbound adapters + unit tests.
- **0.1C** Next.js dark UI with seven sections; sourced Electronics + diagnostic Timeline.
- **0.1D** Docker Compose, local gateway, contract checks and runtime smoke tests.
- **0.1E (exit gate pending)** Full Rust compile/tests, TypeScript build, Ubuntu container E2E, network isolation, WebSocket reconnect, stale-data behavior, offline rerun.
- **0.2A (future)** Verified Somatic Runtime telemetry handshake and Paky-01 physical read-only ingestion, no commands.

## 8. Foundation acceptance / exit gate

- [x] Upstream source inventory and explicit non-actuating runtime boundary
- [x] Independent repo tree and versioned local API contracts
- [x] No physical actuation API or device I/O
- [x] Synthetic values identify source and simulated clock domain
- [x] Unknown physical measurements represented by null, not zero
- [x] Multi-robot registry and simulated WS path implemented in source
- [x] Seven App Router UI views implemented in source
- [x] Module manifests and dependency/permission validation in source
- [x] Local Node contract checks and HTTP/WebSocket gateway checks (8/8 passed)
- [ ] `cargo test` and `cargo fmt` on a Rust-enabled machine
- [ ] `npm run typecheck` and `npm run build` after dependency installation
- [ ] Ubuntu `docker compose up --build` and API/WebSocket smoke test
- [ ] Browser QA, CSP/auth gateway validation and disconnect tests

A checked *implemented in source* item is **not** the same as a passed compiled integration test.

---

# ADDENDUM — Foundation v0.2 (Model-first Onboarding)

**Date:** 2026-10-21. **Scope:** Console's own non-normative API and UI only. Upstream OpenRGD remains untouched.

## Revised priority and authority boundaries

v0.1's speculative `0.2A physical Paky-01 telemetry` is superseded. v0.2 targets a **model-first, hardware-agnostic onboarding** flow with zero need for physical robot power or vendor SDK. Data layers:

1. **Source profile** — archive of the canonical modular `spec/` source files, not a new `.rgd` format.
2. **Parsed model preview** — a Console-produced, non-normative projection of declared links, joints, sensors, nominal limits. No motion or geometry assumptions.
3. **Robot instance** — a unique physical unit linked to a model hash, initially always unbound.
4. **Observed host** — only process/container system metadata, never a fictitious physical device inventory.
5. **Bindings** — local manual draft proposals, `proposed_unverified`, never passed to HAL or Somatic Runtime.
6. **Readiness** — known/unknown/not assessed/blocked findings, never an actuation permit.

Source archive SHA-256 identifies bytes; it does **not** prove canonical OpenRGD source-tree validity. The Console importer intentionally does not promote a model from structural inspection to `rgd check` conformance. No source program is executed and ZIP source code is not loaded as executable runtime plugins.

### Storage

For v0.2, small local `workspace.json` with atomic rename serializes models, robot instances and proposed bindings. The archive bytes are retained in `imports/<model_id>.zip` for future canonical revalidation. Both are stored under a Docker named volume; the API's root filesystem remains read-only. JSON-file persistence is an interim single-process store and **not** a multi-writer or transactional database, and backup/restore validation remains part of production hardening.

### 3D scope

The body page is now connected to imported description topology and nominal joint limits. It continues to display a **reference frame only**, not a fictitious BHL or SO-101 mesh: fully rendered geometry and articulations require trusted assets and correct forward-kinematic transform composition. A successful JSONC import does not establish those prerequisites.

### Discovery scope

`GET /host` reports OS/architecture of the **API process**. Inside Docker `/etc/os-release` describes the container image, not necessarily the Ubuntu/Fedora host. A later optional non-privileged Node Agent may collect carefully scoped actual host/device evidence. No CAN/USB/serial scan or physical binding verification is implemented in v0.2.

### Security boundaries

- Local API has write endpoints limited to profile upload, model instance creation and inert draft mapping persistence. `POST` is not synonymous with control authority.
- Imported instance adapters are always `console.unbound.v1`; all measured electrical and joint values remain null.
- Same-origin policy + custom header for write requests help reduce CSRF, but neither provides login/authorization. Gateway remains loopback-only and must be accessed remotely only with an authenticated SSH tunnel or an external authenticated access layer.
- Upload rejects dangerous paths, symlinks, oversized entries, malformed JSONC and duplicated selected refs. ZIP inspection never extracts archived paths onto host filesystem. Supply-chain protections for executable modules are out of scope.
- Module Registry remains manifest-only; no install, execution, or privilege granting.
- No changes to canonical Forging, Somatic Runtime, Calibration module or Chronon semantics.

### v0.2 exit gates

See `docs/VERIFICATION.md`. Do not merge/build for real robots until Cargo, Next.js, Docker, the importer and storage acceptance tests pass on a toolchain-enabled machine.


# ADDENDUM — Foundation v0.3 (Passive Host Snapshot & Bootstrap Diagnostics)

## Decision: source-derived model != operator-supplied host metadata != verified physical binding

- **Model:** RGD ZIP (structural preview, canonical source integrity unverified).
- **Host snapshot:** JSON generated by `scripts/host-snapshot.py` on the physical OS. Data comes from passive sysfs/devfs *file names/metadata*, then is manually uploaded. API explicitly marks it `operator_supplied_unverified`; it is a snapshot, not a live stream, and can be stale or forged.
- **Mapping draft:** a descriptive relationship between an imported logical component and a tentative endpoint string. Always `proposed_unverified`; no hardware driver reads these bindings.
- **Verified binding:** NOT IMPLEMENTED. Will require an independent provider contract, device identity/handshake evidence and safety negotiation; cannot be inferred from matching names.
- **Calibration:** separate module; NOT ASSESSED.
- **Runtime authority:** Somatic Runtime remains the sole potential authority; physical actuation is unavailable from the Console.

The Console API container does not mount `/dev`, `/sys` or the Docker socket. A future host agent may be considered after security design; v0.3's Python collector is an explicit, non-privileged local command, not a resident privileged service.

### Contracts

`HostInventoryUpload` is a bounded typed payload with `schema_version`, `collection_method`, `collected_at`, `platform`, `interfaces[]`. Only `passive_file_metadata_v1` is accepted; maximum 128 entries. Server wraps it in `HostInventory { report, imported_at, verification_state: operator_supplied_unverified }` and persists it in the existing workspace. The host report applies to the **local node**, not to a specific robot instance, and is never a Chronon or verified observation. Modules may refer to a future abstraction, but no plugin is executable in this wave.

`InstallationDiagnostics` reports API and data-directory presence while explicitly setting `hardware_scanned_by_backend=false`, `canonical_validator_integrated=false`, `software_installation_enabled=false`, `actuation_enabled=false`.

**Versioning:** console code `0.3.0`; transport remains `console.v1`; host inventory is `console.host-inventory.v1`; workspace format remains `console.workspace.v1` with `host_inventory` optional and `serde(default)` for compatibility.

### v0.3 acceptance gates

1. On Ubuntu 22.04 and Fedora: preflight script completes or reports required blockers clearly.
2. Cargo tests, TypeScript typecheck and Next build complete with network-fetched deps and lockfile generated.
3. Docker Compose builds, starts, persists state across restart, and `scripts/doctor.py` passes.
4. Passive Linux snapshot makes no device calls and creates a bounded JSON file; forged/invalid imports are rejected; snapshot is labelled unverified everywhere.
5. Imported RGD model + physical instance + draft binding retain null measured telemetry and blocked actuation.
6. Secure remote access uses SSH tunnel; no unauthenticated LAN binding is added.

**Status:** 1 and 3-6 need on-device verification; local test evidence is in `docs/VERIFICATION.md`. No actual physical handshake has been performed.

---

# ADDENDUM — Universal Module Manager v0.4A

## Boundaries and deployment

The core source-profile Console, Somatic Runtime and low-level robot adapters remain independent. The new **software distribution registry** (`OpenRGD/rgd-modules`) is distinct from canonical RGD `spec/00_core` modules and distinct from Console's internally bundled manifest registry. No changes to OpenRGD Canonical Core, Calibration source or BHL modules are performed.

```text
Browser -> Caddy(loopback:8088) -> Next + Rust Console API
                                                 |
                                         fixed REST bridge
                                                 v
                                     module-agent:8090 (internal)
                                         Python Registry API
                                                 |
                                       pinned rgd-modules
                                                 |
                                    Git pinned-source + Cargo
                                                 |
                                     module_data named volume
```

`module-agent` is a separate unprivileged user process in a read-only Docker container (apart from its own persisted `module_data` volume and `/tmp`), with all capabilities dropped and `no-new-privileges`. The service has **no published host port**, `/dev` or Docker socket. The Rust API is forbidden from invoking shells or custom binaries, and can only call known endpoints at a fixed Docker-hostname/loopback origin. The gateway still exposes only `127.0.0.1:8088` and Caddy retains its required `NET_BIND_SERVICE` capability.

## Registry manifest and safety gates

The `OpenRGD/rgd-modules` registry source is pinned by Docker build to `0268b3748042d04fd3561553616388368881e04a`. Its catalog descriptor pins `org.openrgd.calibration@0.2.0` to `81700401e2fa6d370a86b6c1f5a48802bc5f1fc7`. The official Python registry implementation is re-used, including commit validation, module manifest validation, Cargo.lock checks, build `--locked`, final SHA-256 fingerprinting and tamper detection. No parallel bespoke installer is introduced.

The Module Agent also requires `maturity=candidate`, empty permissions and `safety={non_actuating:true, automatic_motion_on_load:false, active_calibration_supported:false}` for v0.4A installs. Any catalog descriptor failing this gate is rejected. Console APIs refuse unknown install modes, invalid IDs, extra JSON fields, and mismatched explicit confirmation phrases. No startup/import action triggers installation.

**Limitations:** container boundaries reduce blast radius but do not establish formal safe execution of unknown Cargo build scripts, and an exact source pin is not a signed software supply-chain attestation. The frontend/agent do not have multi-user authentication. Keep gateway on loopback or behind an authenticated SSH tunnel; any locally authorized client may issue a REST request with explicit confirmation. An attacker with code execution inside the Docker network or an exposed gateway may trigger installs. Signed releases and an authenticated, policy-gated worker are required for a production Module Hub.

## API versioning and statuses

Console API: `console.v1` (additive endpoints); software manager: `console.module-manager.v0.4a`; Registry contract `0.1.0-candidate`. Catalog enumerates descriptors and status (`not_installed`, `source_only`, `ready`, `tampered`). `ready` **only** means the installed executable exists and passes local digest validation; it never implies physical calibration or motion readiness.

Install returns `202` and a non-reused 32-char hex `job_id`. `GET /modules/jobs/{job_id}` returns `queued/running/succeeded/failed`; jobs are transient across agent restart. The module binaries/sources persist in the Docker named volume `module_data`; existing RGD models, host report and bindings remain in the separate `console_data` volume. Module install cannot overwrite an existing version.

## Deferred deliberately to v0.4B+

- Canonical RGD ZIP -> verified, read-only, secure per-job `spec/` directory materialization for Calibration CLI.
- `rgd-calibration inspect` constrained invocation + schema-validation of passive report, provenance and UI report rendering.
- Signed binary distribution, staged rollbacks, upgrades/uninstalls, per-user authorization, high-risk module sandbox, Module Hub.
- No active calibration or motor/camera/sensor control in Console.
