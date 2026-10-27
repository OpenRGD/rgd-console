# OpenRGD Console — GitHub software baseline v0.4.3

**Canonical development source:** `OpenRGD/rgd-console` on GitHub. Development uses feature branches and Pull Requests; do not use archived ZIP upgrade instructions to replace an existing checkout.

**Release scope and acceptance:** [Console v0.4.3 software baseline](docs/releases/CONSOLE-v0.4.3.md). The API, Web package, Live badge and diagnostics expose the aligned version `0.4.3`. This is a **non-actuating** software baseline; physical robot compatibility, IMU calibration and motor readiness remain unverified.

The historical wave documentation below is retained for traceability only.

---

# OpenRGD Console — Robot Boot Foundation v0.4D

**Boot & Recovery implemented as an independent, non-actuating service.** This update builds directly on v0.4C Live and the mini-PC-tested v0.4B stack (Rust API, Next.js, Module Agent, Calibration). It does not modify any upstream OpenRGD repositories, Linux bootloader, GNOME login, CAN controller or Somatic Runtime.

## New in v0.4D

- Private `boot-manager` service on internal Docker network, starts with Docker after Ubuntu boot; separate persistent `boot_data` volume. It sees the Console's imported RGD files as **read-only** and retains selection/history across container restarts.
- Validates selected physical instance and model identity; confirms uploaded ZIP SHA-256; extracts only bounded RGD `spec/*.jsonc` and optional `spec/MANIFESTO.md`; calls the **canonical pinned OpenRGD `rgd check` then `rgd boot`**. No custom approval of a profile's canonical integrity.
- `/boot` full-screen Boot & Recovery page with profile selection, checkpoint progress, re-check, read-only report and history. Links from Robot Live and Console sidebar.
- Explicit statuses: `setup_required`, `checking`, `ready_non_actuating`, `recovery_required`, `validator_unavailable`. Every report declares `physical_execution.authorized = false`, `motor_commands_sent = false`, `hardware_scanned = false`.
- On invalid/missing RGD, **Console and Ubuntu continue to work**; no invented motor readiness, no automatic hash repair. The included synthetic partial fixture intentionally *fails canonical boot* because it lacks a kernel. That's an expected Recovery test, not a regression.
- New local routes `/api/v1/boot/{health,status,history,select,recheck}`, only proxied to the allowlisted private agent. Mutations use existing local CSRF defense, which is **not authentication**. Keep Console on localhost or a secured tunnel.
- Existing Docker volumes `console_data` and `module_data` are **preserved**, including Calibration installed as `ready`.

### Update an existing v0.4C installation on Ubuntu

Use the script after extracting the source into a **staging directory**, not directly over the running project:

```bash
mkdir -p ~/openrgd/artifacts/console-v04d
unzip -q ~/Downloads/openrgd-console-foundation-v0.4D.zip -d ~/openrgd/artifacts/console-v04d
bash ~/openrgd/artifacts/console-v04d/openrgd-console/scripts/upgrade-v04d.sh
cd ~/openrgd/repos/openrgd-console
sudo docker compose config --quiet
sudo docker compose up -d --build --no-deps boot-manager api web
sudo docker compose ps
python3 scripts/doctor.py
python3 scripts/boot-smoke.py
```

Then open **http://127.0.0.1:8088/boot**. The first startup reports `setup_required` until you explicitly select an imported model-linked physical instance. Don't create a fake robot merely to make boot pass. More information: [technical design](docs/ROBOT-BOOT-MANAGER.md) and [installation guide](docs/UPGRADE-V04D-BOOT.md).

**Initial build requires Internet** to fetch the pinned `OpenRGD/openrgd` canonical source and its Python dependencies. Runtime validation is offline. Source commit: `afe1a831b950a4e6560f0285a0103fc4eaa343b7`. The embedded toolchain is pinned at its source commit; transitive Python packages are not yet separately locked or attested, so this remains a candidate integration.

### Verification boundary

Python hermetic tests exercise failure states and success via an artificial `rgd` JSON command stub. The authoring environment has no Cargo/Docker/Next dependency registry, so the full Rust, Next.js and container build, **and the genuine canonical binary against an imported physical model**, still require testing on the mini-PC. A green stub test is not proof of canonical conformance.

**Development remains the default display mode.** To preview a boot-style fullscreen display manually without changing autologin, use `bash scripts/boot-preview.sh` from an existing graphical desktop and exit with Alt+F4. We deliberately do not enable a kiosk session or power-control APIs in this wave; `/boot` is a browser page, not a BIOS. A future explicit Robot Mode could open `/boot` before `/live` after a graphical login, while preserving access to desktop Linux.

---

# OpenRGD Console — Robot Live Foundation v0.4C

**Ubuntu/Fedora model-first Console with a new responsive, read-only `/live` surface.** Built on the v0.4B installation of Next.js, Rust/Axum, Module Agent, and Calibration. The robot's motor/control path is unchanged.

## v0.4C — new capabilities

- `/live`: full-viewport Robot Live, large touch controls, switchable robot, Overview / Telemetry / Events views. Synthetic measurements are explicitly labelled; physical robots without a provider show missing data.
- `/live/configure`: local display profiles (5-inch 800×480, 7-inch 1024×600, operator 1280×800, 5-inch portrait 480×800, custom). Real responsive preview, high-contrast mode, reduced motion, text scaling and card visibility.
- Browser Fullscreen button, explicit link back to `/overview` (normal Console).
- No kiosk auto-login, desktop session switch, BIOS, Wake-on-LAN or power management at this milestone. Development mode stays the default.
- No backend or Docker Compose changes. Existing Calibration remains installed in the persistent `module_data` volume.

**Update from the working v0.4B mini-PC install:** [docs/UPGRADE-V04C-ROBOT-LIVE.md](docs/UPGRADE-V04C-ROBOT-LIVE.md). This guide includes reboot persistence checks, how to preview layouts before connecting the five-inch display, and the exact safe web-only rebuild command.

**Architecture and trust boundary:** [docs/ROBOT-LIVE-ARCHITECTURE.md](docs/ROBOT-LIVE-ARCHITECTURE.md).

**Verification:** local Node/Python tests and TypeScript syntax checks are run before packaging. A complete Next.js production build of THIS version on the mini-PC, and real browser/5-inch hardware QA, are still required. Docker still reports backend API `console_version=0.4.1`, since only the Live UI changed. The v0.4B backend and installed Calibration module have been tested running on the mini-PC according to the operator's console logs.

### Quick update

```bash
mkdir -p ~/openrgd/artifacts/console-v04c
unzip -q ~/Downloads/openrgd-console-foundation-v0.4C.zip -d ~/openrgd/artifacts/console-v04c
bash ~/openrgd/artifacts/console-v04c/openrgd-console/scripts/upgrade-v04c.sh
cd ~/openrgd/repos/openrgd-console
sudo docker compose up -d --build --no-deps web
python3 scripts/doctor.py
```

See historical v0.4B information below.

---

# OpenRGD Console — Foundation v0.4B (Calibration Passive Integration)

**Model-first, offline-first after bootstrap, local-only, and non-actuating.** This source distribution extends the mini-PC-tested v0.4A Console, retaining its eight sections and source-profile onboarding, while adding a real **OpenRGD Software Module Registry** frontend backed by a dedicated **Module Agent** container.

**Build/test status:** the previous v0.4A stack and Calibration binary were verified running on the Ubuntu mini-PC by operator logs (`ready`, SHA-256 present). Local Node/Python and TypeScript syntax/schema checks are run on this new source wave. **Rust + Next.js v0.4B build, Docker restart, and actual CAL-0.2 inspection on Ubuntu are not yet verified.** Do not treat local mock tests as live deployment verification. This project is still a candidate foundation, not a signed production distribution.


## What's new in v0.4B

- The **Modules** page exposes **Calibration · Passive Inspection** when `org.openrgd.calibration@0.2.0` has `ready` status.
- Select a separate imported physical robot instance with an RGD ZIP from Onboarding. The bundled `paky-01` placeholder alone has no linked source profile.
- Clicking **Ispeziona profilo RGD** sends a request to the Console API, which verifies the stored ZIP digest and asks the private Module Agent to run the *already installed* CAL-0.2 executable using the exact `inspect --bundle` command.
- Only allowlisted source Foundation JSONC files are materialized temporarily. No `--profile` or calibration correction is applied; results are stored as **non-authoritative passive previews** and shown as coverage, parameters, findings, and downloadable JSON.
- The `/api/v1/robots/{id}/calibration/last` endpoint returns the latest preview (or `null`). Reports survive container restarts in existing `console_data`.
- A candidate *Universal Physical Observation* JSON contract is documented for future v0.5A. **No hardware adapter, CAN reader, homing, motor command or physical-calibration procedure** has been implemented.

**Update the working v0.4A mini-PC Console using [docs/UPGRADE-V04B-UBUNTU.md](docs/UPGRADE-V04B-UBUNTU.md).** Do not follow the historical v0.4A installation instructions for an already updated machine.

## What changed from v0.3

- The **Modules** page now consumes the real pinned `OpenRGD/rgd-modules` software catalog, rather than displaying only `config/modules.json`.
- The external Module Agent is a **fourth container** (`module-agent`) with its own named Docker volume `module_data`; no `/dev` mounts or host Docker socket, running as UID 10002, `cap_drop: ALL`, `no-new-privileges`.
- Exact module version/source commit, required permissions, safety declarations and local installation status are visible in the UI.
- Manual installation explicitly asks for operator text confirmation, then starts a background job (approval, Git checkout pinned SHA, Cargo `--locked` build, digest verification) using the **original registry implementation**, not a custom ad-hoc installer. The browser polls for completion.
- The first registered external module is `org.openrgd.calibration@0.2.0` (CAL-0.2 passive calibration, Rust). It can become **software ready**; it is NOT automatically loaded as a browser extension or used to calibrate physical joints.
- Backend proxies only specific `catalog`, `agent-health`, `install`, `job-status` routes to the private agent. No generic execution, motor control or dynamic plugin-sandbox bypass.
- Caddy gateway retains the mini-PC fix `cap_add: [NET_BIND_SERVICE]` to avoid `exec /usr/bin/caddy: operation not permitted`.
- v0.3 `console_data` volume and physical robot registry remain unchanged.

## Historic v0.4A installation context (v0.4B users: follow UPGRADE-V04B instead)

**For this release follow [the current v0.4B upgrade guide](docs/UPGRADE-V04B-UBUNTU.md)**. From the downloaded ZIP:

```bash
mkdir -p ~/openrgd/artifacts/console-v04b
unzip -q ~/Downloads/openrgd-console-foundation-v0.4B.zip -d ~/openrgd/artifacts/console-v04b
bash ~/openrgd/artifacts/console-v04b/openrgd-console/scripts/upgrade-v04b.sh
cd ~/openrgd/repos/openrgd-console
sudo docker compose config --quiet
sudo docker compose up --build -d
sudo docker compose ps
python3 scripts/doctor.py
```

Open `http://127.0.0.1:8088/modules` **on the mini-PC**. Calibration should still show `ready`; the new Passive Inspection panel appears below. Do not expose 8088 or the agent port on an unauthenticated LAN interface; use an authenticated SSH tunnel for remote access.

### Source pins and registry contracts

- Registry source: `https://github.com/OpenRGD/rgd-modules` at Git commit `0268b3748042d04fd3561553616388368881e04a`.
- Calibration source installed by the Registry: `https://github.com/OpenRGD/rgd-calibration` at Git commit `81700401e2fa6d370a86b6c1f5a48802bc5f1fc7`.
- Registry contract: `0.1.0-candidate`; Calibration version: `0.2.0`; Console Manager contract: `console.module-manager.v0.4a`.
- Module installation via Python Registry CLI is pinned and validated; **not a signed binary release**. Dependencies may execute build scripts and require network access when compiling for the first time.

### Local APIs (Console gateway)

| Method | Endpoint | Function |
|---|---|---|
| GET | `/api/v1/modules` | Bundled Console modules (legacy), **not** external software |
| GET | `/api/v1/modules/catalog` | Pinned external catalog + per-module status |
| GET | `/api/v1/modules/agent-health` | Private manager availability (proxied) |
| POST | `/api/v1/modules/install` | Explicit approved install job request (no other operations allowed) |
| GET | `/api/v1/modules/jobs/{job_id}` | Job status/result (non-actuating) |

Allowed installation request fields are exactly `module_id`, `version`, `mode` (`build` or `source_only`) and `confirmation` (must equal `INSTALL <module-id>@<version> <mode>`). The UI currently presents the `build` flow only, avoiding unusable source-only installs. All installation requests are checked by both the Console API and the private Module Agent. Neither `Origin` nor a confirmation phrase is authentication: do **not** expose these APIs publicly.

### Release limitations

- The Module Registry **does not automatically upgrade**, roll back, execute arbitrary installed modules, authenticate users, or enable motor movement. Installed source-only/tampered states remain non-launchable.
- Calibration `inspect` is now exposed explicitly from Modules for imported RGD model instances. Its output is a passive source report, not physical calibration.
- Job status is in memory and can be lost if the Module Agent restarts; actual installations persist in `module_data` and are reverified from disk.
- Signing, release attestations, permissions for high-risk modules and robust multi-user authorization are future gates. A SHA-256 digest alone is not a verified supply-chain identity.
- Docker images and package dependencies must be downloaded on a network-enabled machine for initial bootstrap. There are no Rust/Cargo or npm lockfiles for the Console itself in this source package yet; reproducibility hardening is required before a stable tag.

## Development/test commands

```bash
node --test scripts/contract-check.test.mjs
python3 -m unittest discover -s scripts -p 'test_host_snapshot.py' -v
python3 -m unittest discover -s services/module-agent/tests -p 'test_*.py' -v
python3 -m unittest discover -s scripts -p 'test_upgrade_v04b.py' -v
cargo test --manifest-path services/api/Cargo.toml
cd apps/web && npm install && npm run typecheck && npm run build
cd ../..
sudo docker compose up --build -d
python3 scripts/doctor.py
```

The local suite mocks registry execution and uses synthetic/no-device fixtures only. Real Cargo/Git installation must be verified independently on the mini-PC. No other OpenRGD repository has been modified.

## Previous milestones

- [Foundation v0.3 source/readme](docs/README-v0.3-ARCHIVE.md) (model-first import + passive host snapshot).
- [Architecture and ongoing safety boundaries](docs/ARCHITECTURE.md).
- [Verification report](docs/VERIFICATION.md).
- [Ubuntu/Fedora first-install guide](docs/INSTALL-UBUNTU-FEDORA.md).
