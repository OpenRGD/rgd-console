# OpenRGD Console — Model-first Foundation v0.3

**Local-first, hardware-agnostic, non-actuating** Next.js + Rust/Axum console. Install the same application on Ubuntu 22.04 (Paky-01 mini-PC) and Fedora (SO-101 notebook). No BHL, SO-101, ROS 2, CAN, USB motor or other specific middleware is required to launch the UI or import a model.

**This source distribution is not yet a compiled/tested release.** The code passes Node static contract and TypeScript syntax checks in the authoring environment, but Cargo and Next.js builds and Docker integration need execution on a machine with their toolchains and an available dependency registry. See [Verification](docs/VERIFICATION.md).

## What v0.3 provides

- All eight pages: Overview, **Onboarding**, Body, Electronics, Mind, Memory, Modules, Settings.
- A six-step model-first onboarding wizard: (1) environment overview, (2) RGD import + robot instance, (3) body topology, (4) process environment/discovery status, (5) **unverified** manual mapping proposals, (6) readiness report.
- A bounded ZIP importer (max 8 MiB compressed, 16 MiB declared uncompressed, 256 entries, 2 MiB per JSONC) for `spec/01_foundation/description.jsonc`, optional canonical manifest/kernel and selected modules. ZIP-slip paths and symlink entries are rejected. Never executes uploaded content.
- Persistent model and robot-instance registry; same model may be associated with several physical robot instances. Imported physical instances remain `console.unbound.v1`, with **all live readings unavailable**.
- Clear separation between **source-derived description** and physical observations; the Body page shows declared joints and limits, not made-up poses or geometry. R3F still shows only reference axes until supported geometry assets can be reliably loaded.
- Host info is **only the process/container OS**, not an inventory of physical devices. Hardware scanning is **not enabled**. Binding proposals are persistently stored with status `proposed_unverified` but never applied to drivers.
- A readiness report that explicitly marks canonical integrity **not verified**, calibration **not assessed**, physical runtime **not connected**, motor actuation **blocked**.
- Existing read-only simulator telemetry, WebSocket events, and module manifest list from v0.1.

**Scope of allowed writes:** create/import model preview; register physical instance; store a manual *unverified draft*. No motion, installation, runtime, firmware update, device probe, verified mapping, calibration or dynamic module execution endpoint exists.

## v0.3: passive host snapshots and installation diagnostics

A robot model and an observed Linux endpoint are **not the same thing**. This wave adds an operator-controlled bridge that never interrogates hardware:

- **`scripts/preflight.py`** checks operating system, architecture, Docker Engine/Compose access, and the loopback port *before building*. It is read-only and never installs packages.
- **`scripts/doctor.py`** probes a running local stack (health, diagnostics, model registry, UI and null readings on physical robots) with Python's standard library. It does not mutate workspace data.
- **`scripts/host-snapshot.py`** runs outside Docker, on the Ubuntu/Fedora host. It reads Linux **file metadata only**: CAN interface names/`operstate` under `/sys/class/net`, candidate `/dev/ttyACM*`, `/dev/ttyUSB*`, `/dev/video*` names, and OS/kernel metadata. It never opens bus/device handles, identifies controllers, queries sensors or moves motors. Run:

  ```bash
  python3 scripts/host-snapshot.py --output openrgd-host-report.json
  ```

  Then in **Onboarding → Host inventory**, upload the JSON. The stored report is marked `operator_supplied_unverified`. It is only used to *suggest* endpoint strings for manual **unverified binding drafts**. It is **not** a trusted device identity, a verified HAL mapping, or evidence that a CAN interface is correctly configured.
- **`GET /api/v1/installation/diagnostics`** reports runtime and persistence visibility, not physical readiness.
- **`GET /api/v1/host-reports/latest`** returns the optional stored host snapshot; **`POST /api/v1/host-reports/import`** accepts only a typed, bounded passive report with the same local CSRF guard as other onboarding writes.

The existing workspace has a new optional `host_inventory` field, defaulting to `null`, so **v0.2 workspace.json remains readable**. The stored version remains `console.workspace.v1` and API transport remains `console.v1`. Do not use this data for actual motion or firmware decisions.

**Not yet implemented:** canonical `rgd check` execution, automatic/verified discovery, physical calibration, module installer, privileged Node Agent, motor control, real hardware adapter, authenticated remote access. Host snapshot timestamps depend on the local host clock; do not infer Chronograph-grade synchronization from them.

## Tomorrow's mini-PC installation sequence

> Installation requires Docker Engine with the Compose plugin installed and an initial Internet connection to fetch images and dependencies. **No Docker or motor permissions are automatically changed.**

```bash
unzip openrgd-console-foundation-v0.3.zip
cd openrgd-console
python3 scripts/preflight.py
docker compose up --build -d
docker compose ps
python3 scripts/doctor.py
python3 scripts/host-snapshot.py
```

Open `http://127.0.0.1:8088/onboarding` **on the same machine** and first upload `examples/synthetic-foundation-partial.zip`. Register a new synthetic *physical instance* only as an explicit **test**, not as Paky-01. In the **Host inventory** step import `openrgd-host-report.json`. The physical robot should remain unbound and read-only throughout.

If using your notebook browser to access the Ubuntu mini-PC, connect through SSH first (see the commands below). Do **not** change the gateway's loopback bind to `0.0.0.0` without implementing authentication and TLS.

To inspect an error:

```bash
docker compose logs --tail=100 api web gateway
```

To shut down without deleting data: `docker compose down`. **Never use `docker compose down -v`** when preserving stored profiles matters.

For the detailed checklist, see [INSTALL-UBUNTU-FEDORA.md](docs/INSTALL-UBUNTU-FEDORA.md).

## Important: RGD packaging

The canonical [OpenRGD repository](https://github.com/OpenRGD/openrgd) currently describes profiles as a **modular `spec/` source tree**, including `spec/manifest.jsonc`, `spec/00_core/kernel.jsonc`, `spec/01_foundation/description.jsonc`, and references to other `*.jsonc` modules. There is **no accepted single-file `.rgd` container** exposed by this toolchain today. Therefore, v0.3 imports a ZIP containing `spec/`; it does **not** pretend the ZIP is an official new RGD format. An archive may have a single top-level directory containing `spec/`.

On a Linux terminal in the robot project directory:

```bash
python3 - <<'PY'
from zipfile import ZipFile, ZIP_DEFLATED
from pathlib import Path
with ZipFile('my-robot-profile.zip', 'w', ZIP_DEFLATED) as archive:
    for f in sorted(Path('spec').rglob('*.jsonc')):
        archive.write(f, f.as_posix())
PY
```

Upload `my-robot-profile.zip` in **Onboarding → Import RGD**. A partial Foundation-only export is also accepted but explicitly labelled `partial_foundation` and is never motion ready. For an artificial UI example, load [`examples/synthetic-foundation-partial.zip`](examples/synthetic-foundation-partial.zip), generated by [`generate-synthetic-profile.py`](examples/generate-synthetic-profile.py). **It is synthetic and does not represent any real robot.**

**Canonical verification is a separate pending integration.** The importer uses JSONC/JSON5 structural inspection and a SHA-256 commitment to *uploaded bytes*. It does not implement `OPENRGD_SOURCE_TREE_SHA256_V1` or run `rgd check`. The `canonical_not_verified` status must remain even if every referenced file is readable. `rgd import` currently handles URDF and a limited USDA source, but their result may be a partial Foundation profile; consult the canonical project for full details.

## Install Ubuntu / Fedora using Docker Compose

Prerequisites: Docker Engine + Docker Compose plugin (installed through the distribution's supported method), a browser, and internet **for first build** of container images and dependency downloads. A Podman configuration for Fedora can be designed later after verifying Compose compatibility; Docker Compose is the supported baseline in this source package.

```bash
unzip openrgd-console-foundation-v0.3.zip
cd openrgd-console
docker compose up --build -d
docker compose ps
curl -fsS http://127.0.0.1:8088/healthz
```

Open **http://127.0.0.1:8088/onboarding** in the browser of the machine running the stack. The external gateway binds to **loopback only**. For a notebook browser to reach the mini-PC Console, use an authenticated SSH tunnel:

```bash
ssh -L 8088:127.0.0.1:8088 ubuntu-user@mini-pc-hostname
```

Then open `http://127.0.0.1:8088/onboarding` locally. Never expose port 8088 directly to the LAN/Internet: **no user authentication is implemented in this milestone**. Origin checking and the required `X-OpenRGD-Console: onboarding.v1` header reduce CSRF opportunities but are **not authentication**.

### Persistent state

`docker-compose.yml` provisions the writable **named volume `console_data`**, mounted as `/app/data` into the Rust API container. It contains `workspace.json` plus `imports/<model_id>.zip`. Stop and restart with `docker compose down`/`up` to preserve data. **Never use `docker compose down -v` unless you intentionally want to delete the volume and lose imported models/mappings.** Back up this volume before updating or removing the stack.

The backend container stays read-only except for that data volume and the temporary directory. The frontend has no secrets or direct device access.

### Native development (no Docker)

Requires Rust/Cargo, Node.js ≥22 and npm (dependencies fetched once):

```bash
# Terminal 1, project root
CONSOLE_DATA_DIR=./data cargo run --manifest-path services/api/Cargo.toml
# Terminal 2
cd apps/web && npm install && npm run dev
# Terminal 3, project root
node scripts/dev-gateway.mjs
```

Open `http://127.0.0.1:8088` (gateway), not the Next.js port, to ensure same-origin REST+WS. The first build and package download require network; once images/dependencies are available, the application is designed to operate without Internet.

## Verification

```bash
node --test scripts/contract-check.test.mjs
python3 -m unittest discover -s scripts -p 'test_host_snapshot.py' -v
cargo fmt --manifest-path services/api/Cargo.toml --check
cargo test --manifest-path services/api/Cargo.toml
cd apps/web && npm install && npm run typecheck && npm run build
cd ../..
docker compose up --build -d
node scripts/ws-smoke.mjs
```

The full exit gate additionally requires browser QA, an end-to-end import of a ZIP, persistence across container restarts, rejection of malformed profiles/ZIP traversal, and Ubuntu/Fedora tests on the intended machines. **Do not treat unexecuted tests as passed.** No lockfiles are included in this source snapshot; generate and commit npm/Cargo lockfiles on the network-enabled build and enforce `npm ci` / `cargo --locked` before shipping a reproducible stable release.

## Contract paths and technical documents

- [`contracts/console/v1/openapi.yaml`](contracts/console/v1/openapi.yaml) — Console transport v1 (adds strictly scoped v0.3 host-inventory and diagnostics routes).
- [`contracts/console/v1/model.schema.json`](contracts/console/v1/model.schema.json) — source-derived model preview, not canonical RGD schema.
- [`contracts/console/v1/binding.schema.json`](contracts/console/v1/binding.schema.json) — unverified proposal, not HAL binding.
- [`contracts/console/v1/readiness.schema.json`](contracts/console/v1/readiness.schema.json) — never grants execution authority.
- [`contracts/console/v1/host-inventory-upload.schema.json`](contracts/console/v1/host-inventory-upload.schema.json) — untrusted host snapshot input.
- [`contracts/console/v1/host-inventory.schema.json`](contracts/console/v1/host-inventory.schema.json) — stored snapshot with backend trust label.
- [`contracts/console/v1/installation-diagnostics.schema.json`](contracts/console/v1/installation-diagnostics.schema.json) — non-actuating deployment diagnostics.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — original v0.1 architecture + v0.2 / v0.3 changes.
- [`docs/VERIFICATION.md`](docs/VERIFICATION.md) — verified vs pending checks.

**No other OpenRGD repository has been modified.** The package is a local source artifact ready for review and installation testing. It has not been pushed to GitHub.
