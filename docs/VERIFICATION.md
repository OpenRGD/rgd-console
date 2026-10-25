# Verification Log — 2026-10-19

## Environment available during creation

- Node.js 22 and Python available.
- No Rust compiler (`rustc`), no `cargo`, and no Docker installed.
- npm registry DNS access unavailable (`EAI_AGAIN`).
- Therefore **there is no basis to claim successful Rust compilation, Next.js build, Docker boot, or full end-to-end robot integration**.

## Completed locally

- **PASS** `node --test scripts/contract-check.test.mjs`: 8/8 assertions, including REST gateway and WebSocket upgrade forwarding.
- **PASS** TypeScript/TSX syntax parser: 13 files, 0 parse errors (not a full typecheck).
- **PASS** all JSON files parsed, both YAML documents parsed.
- **PASS** three module manifests validated against JSON Schema.
- **PASS** ZIP archive checksum / integrity check (on final source package).

## Run on an Ubuntu workstation with network/toolchains

1. `node --test scripts/contract-check.test.mjs` — contract and local proxy checks.
2. `cargo fmt --manifest-path services/api/Cargo.toml --check`
3. `cargo test --manifest-path services/api/Cargo.toml` — physical unknown values, simulated provenance, adapter validation, Origin checks, no actuation.
4. `cd apps/web && npm install && npm run typecheck && npm run build`.
5. `cd ../.. && docker compose up --build -d` — fetch dependencies/images during this first build.
6. `node scripts/ws-smoke.mjs` — API+WS initial frames, simulated provenance, physical null measurements.
7. Browser QA at `http://127.0.0.1:8088` for seven views, keyboard navigation, robot selection, error handling and WS disconnect/reconnect.
8. On a second run, disconnect the internet and verify Console still starts from already-built images; **offline-first does not mean air-gapped bootstrap**.
9. Commit generated npm/Cargo lockfiles and use lock-only builds before v0.1 release tagging.

## Physical safety gate

Testing must never require Paky-01 or SO-101 to be powered, attached or moving. `curl -X POST http://127.0.0.1:8088/api/v1/robots/paky-01/command` must return `404`. WebSocket inbound command messages must not result in hardware actions.

---

# Foundation v0.2 verification addendum — 2026-10-21

## Verified within the authoring container

- `node --test scripts/contract-check.test.mjs` — **11/11 passed** (static contracts, safe-route checks, module/robot registration assertions, gateway HTTP and WS forwarding; **not** a live Rust API test).
- TypeScript compiler `transpileModule` syntax parse — **13 .ts/.tsx files, 0 syntax errors**; this does **not** include semantic checking (`tsc --noEmit`), package linking or Next.js production build.
- The JSON Schemas parse as JSON; OpenAPI YAML and Docker Compose YAML can be parsed independently.
- Example `examples/synthetic-foundation-partial.zip` contains a declared synthetic Foundation-only profile, not a validated canonical source tree.

## Not verified here — MUST execute before deployment

- Rust/Cargo compile (`cargo fmt`, `cargo test`, `cargo clippy`, `cargo build`) and Rust importer endpoint integration: toolchain unavailable in authoring environment.
- Node `npm install`, `npm run typecheck`, `npm run build`: dependency registry unavailable in authoring environment.
- Docker Compose build + network isolation and service start: Docker unavailable in authoring environment.
- Manual UI/browser exploration, ZIP upload, instance selection, persistence after restart, origin/CSRF denial, unbound telemetry on new instances.
- Actual Ubuntu 22.04/Fedora compatibility, named volume permissions, offline relaunch and resource usage.
- Canonical `rgd check` verification (intentionally **not integrated**, all uploaded profiles report `canonical_not_verified`).
- Firmware/driver/hardware access (intentionally **absent**).

This is a **source milestone**; it is not a production-certified installation release.


# Foundation v0.3 verification addendum — 2026-10-21

## Locally executed in the authoring container

- **PASS: 13/13** Node `node --test scripts/contract-check.test.mjs`: static source/contract rules and gateway HTTP/WS proxy tests; does NOT boot API or Next.js.
- **PASS: 3/3** Python `python3 -m unittest discover -s scripts -p 'test_host_snapshot.py' -v`: hermetic sample `/sys`/`/dev` metadata fixtures; no physical device reads.
- **PASS: 14 files, zero syntax errors** TypeScript parser analysis of `.tsx` / `.ts` sources; NOT a full dependency-aware `tsc --noEmit` typecheck.
- **PASS: 14 JSON files, 3 YAML files, 10 JSON Schema definitions** structural parsing; NO canonical `rgd check` result.
- Prepared offline-friendly local scripts for operator-side preflight, smoke test and passive snapshot.

## Not yet performed

- Rust compilation, `cargo fmt`, `cargo test`, full Next.js build, Docker build/start, browser walkthrough on Ubuntu/Fedora.
- E2E input persistence test on real Docker named volume.
- Real CAN/USB communication, device identity verification, calibration, motor safety or plugin installation.

Any source-level test assertion is **not** a substitute for a green Cargo/Next build. The installation attempt should collect `docker compose logs` and record failures rather than treating startup as proven.

---

# Foundation v0.4A — Local verification

**Source distribution only**: local tests cover the bounded API bridge, Python Module Agent and UI contracts with synthetic/mock registry behavior. This build environment lacks Rust/Cargo and Docker, and npm registry dependencies are unavailable. Do not claim a successful Rust release compile, Next production build, Docker boot or pinned-source calibration installation from these checks.

The installation verification sequence on Ubuntu 22.04 is `sudo docker compose up --build -d`, `python3 scripts/doctor.py` and an **operator-approved** CAL-0.2 module compile through the Modules page. The GitHub registry commit and Calibration source commit are pinned; no automatic module install occurs on startup. The manager is inaccessible via a published Docker host port.

Manual security tests must include: malformed install payload -> 422; wrong confirmation -> 403/422; unsupported/tampered module -> reject; duplicate install -> reject; bad manager state -> Console continues showing robot dashboard; no motion endpoints available; old `console_data` persists across upgrade. Run source unit tests before deployment.


## v0.4A local test results (2026-10-22)

- PASS: `node --test scripts/contract-check.test.mjs` — **16/16** tests.
- PASS: `python3 -m unittest discover -s services/module-agent/tests -p 'test_*.py'` — **8/8** mocked HTTP-agent tests.
- PASS: `python3 -m unittest discover -s scripts -p 'test_host_snapshot.py'` — **3/3** passive discovery tests.
- PASS: `python3 -m unittest discover -s scripts -p 'test_upgrade_v04a.py'` — **1/1** source upgrade preservation tests.
- PASS: TypeScript/TSX source syntax parsing (15 files, 0 syntax errors). This is NOT a semantic typecheck/build.
- PASS: 13 JSON schemas and Compose/OpenAPI/CI YAML parsed and validated with available tools.
- UNVERIFIED: `cargo test`/`cargo build`, `npm run typecheck`, Next.js production build, Docker build/start, and live Git/Cargo module installation. Those require the mini-PC or CI with network access and the required toolchains.

# Foundation v0.4B verification addendum — 2026-10-22

**Supported operator evidence:** v0.4A has started successfully on the Ubuntu mini-PC and Calibration `org.openrgd.calibration@0.2.0` reports `ready` and a non-null installed binary SHA-256. **This does not establish v0.4B runtime readiness.**

**Authoring environment:** no Rust compiler, Docker daemon or installed Next.js dependencies available; cannot claim successful v0.4B Cargo / Next.js build or an actual CAL-0.2 executable run on the mini-PC from this environment.

**Local checks:** Console static Node suite, Module Agent HTTP tests (includes actual subprocess execution with a synthetic stand-in binary), Ubuntu upgrade script regression, Python passive discovery suite, TypeScript syntax parse and JSON Schema/YAML parsing. See the exact test commands in README.

**Pending mini-PC acceptance:** `sudo docker compose up --build -d`, `python3 scripts/doctor.py`, Calibration module still `ready`, import synthetic RGD ZIP, register physical test instance, click passive inspection, verify report/provenance and persisted last-read, restart containers without `-v`, verify no motors moved.

**Verified in the final v0.4B source archive before packaging:** 19/19 Node contract/gateway tests, 14/14 Module Agent HTTP and subprocess tests, 5/5 source-upgrade/passive-discovery Python tests; syntax parser accepts 15 TypeScript/TSX sources; 15 JSON Schema documents are structurally valid and three YAML documents parse. No actual live CAL-0.2 binary was available in the authoring container: the Agent integration tests use a synthetic executable substitute. The previously installed real CAL-0.2 binary has been verified `ready` by the user on the Ubuntu mini-PC, but v0.4B has not been deployed there.


# Robot Live Foundation v0.4C verification

### Source-level checks in authoring environment

- **PASS 22/22** Node contract tests (19 existing + 3 Live), including actual TypeScript helper execution under Node 22 type stripping, preset bounds/defaults, API/host safety invariants and route wiring.
- **PASS 7/7** Python Console tests, including 2 upgrade-v0.4C tests: backup, local env/config/data preservation and safe failures.
- **PASS 14/14** Module Agent tests, using no physical hardware or real Calibration executable.
- **PASS** TypeScript AST syntax validation: 22 `.ts`/`.tsx` files, 0 parse errors (not a full semantic typecheck or Next production build).
- No changes to Rust API, Module Agent, Docker volumes, host startup or physical device integration.

### Not verified in this environment

- `npm run typecheck`, `npm run build`, container Web rebuild on Ubuntu/Fedora.
- Browser QA for 800×480, 480×800, touchscreen gestures, actual 5-inch panel.
- Real reboot persistence of Docker startup and GUI session.

The design is a functional code contribution, not an end-to-end acceptance claim.

---

# Foundation v0.4D — Robot Boot Manager creation verification

## Performed locally in source-authoring environment

- **27/27 Node tests pass**, including UI and Boot Manager contract/source safety boundaries.
- **9/9 Boot Manager hermetic Python tests pass**, covering setup, simulated successful canonical JSON, integrity and kernel failures, authority violations, ZIP traversal/duplicates, identity mismatch and persistence; the canonical command success tests use an intentionally artificial CLI stub.
- **14/14 Module Agent tests pass**, ensuring Calibration and module installation behavior remains unchanged.
- **9/9 local script tests pass**, including v0.4D upgrade preserving local files.
- **24 TypeScript/TSX syntax parses pass**. Not a dependency-resolved `tsc --noEmit` or Next build.
- **16 JSON schemas validated**, including `boot-report.v0.1.schema.json`; all Compose/OpenAPI/CI YAML parse.
- **Boot Manager HTTP smoke within authoring container**: real private Python HTTP server returns `setup_required`, `200` health and report history. It did not contain the canonical OpenRGD command and therefore cannot claim successful canonical profile validation.

## Important outstanding tests

1. Docker image build for `boot-manager` downloads the **pinned** canonical OpenRGD repository and Python dependencies; this has not been run in the authoring environment.
2. Rust API and Next.js source must be compiled/QA-tested on Ubuntu mini-PC after applying upgrade. Legacy v0.4B backend builds were verified on the user's mini-PC, **not** this v0.4D modification.
3. Positive check/boot against a genuine complete RGD profile using the canonical `rgd` CLI from its image (not mocked).
4. Docker service auto-restart, volume persistence after restart, and GUI/fullscreen QA.
5. The mini-PC's physical boot path remains Ubuntu/UEFI/systemd. No bootloader, auto-login, display power or Somatic actuator checks have been modified.
