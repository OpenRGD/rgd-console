# OpenRGD Boot Manager — Foundation v0.4D

## Identity and authority

The **OpenRGD Boot Manager** is a *Docker-local, non-actuating profile verifier*. It is not a BIOS, UEFI component, Linux bootloader, init system, hardware readiness gate, e-stop, or motion permission authority. It never calls any motor hardware API, never repairs hashes, and never mutates RGD source files. Linux and Docker start independently; the Console stays available if the profile fails validation.

The implementation uses `OpenRGD/openrgd` canonical commands pinned to Git commit `afe1a831b950a4e6560f0285a0103fc4eaa343b7`, installed into the `boot-manager` container during image build. The build initially needs Internet and PyPI; runtime does not. It invokes fixed argv arrays `[rgd, --quiet, check|boot, --output, json]` with timeouts, requiring their known JSON artifacts. This is not a custom replacement of the canonical integrity checker.

## Actual sequence after Docker starts

```
Ubuntu/UEFI → systemd → Docker → Console + Boot Manager
                                         │
                                load boot_data/selection.json
                                         │
                              no selection → setup_required
                                         │
                           read console_data/workspace.json
                                         │
                              instance-model link check
                                         │
                       original imported ZIP source digest check
                                         │
                               bounded ZIP spec/*.jsonc and optional spec/MANIFESTO.md extraction
                                         │
                         canonical rgd check --output json
                                         │
                          canonical rgd boot --output json
                                         │
                ┌─────────────────────────┴─────────────────────────┐
                │                                                   │
       ready_non_actuating                                recovery_required
       Console /live usable                                Console /boot usable
       NO MOTOR PERMISSION                                 NO MOTOR PERMISSION
```

A missing or partial profile gives Setup/Recovery, **not** an invented success. `validator_unavailable` means no canonical CLI exists; it is not a validation pass. Both successful `check` and `boot` are required for `ready_non_actuating`, and the grounding context must declare `physical_execution.authorized = false`. A successful static check does not prove device mapping, calibration, homing, current joint pose or Somatic Runtime readiness.

## Data and safety boundary

- `console_data` mounted **read-only** in Boot Manager; it reads `workspace.json` and `imports/<model-id>.zip`. It cannot modify or resave a profile, and no other host directories are mounted.
- `boot_data` is a separate persistent, writable named Docker volume storing `selection.json`, `last-report.json`, and the last 20 boot reports. No automatic purge of existing data.
- Boot Manager uses an isolated Docker `boot-internal` network (`internal: true`), reachable only by the Console API container. No gateway or host port published.
- Runs as unprivileged UID 10003, `read_only` root filesystem, `cap_drop: ALL`, `no-new-privileges`, 64 PID limit, and a temporary `/tmp`.
- The Console UI may select **only existing model-linked physical instances**, under the local write protection header. This is not user authentication; retain loopback-only exposure, use authenticated SSH tunneling for remote administration.
- The boot report contract is `console.boot.v0.1`, with states `checking`, `setup_required`, `ready_non_actuating`, `recovery_required`, and `validator_unavailable`.
- The static module registry is not automatically updated, installed, enabled or executed by the Boot Manager.
- The CLI's `rgd boot` context is reduced to safe summary fields, not published or stored in full. It may contain user-provided module data that should not be mirrored into the web UI.

## Endpoints

| Console route | Method | Purpose |
|---|---|---|
| `/api/v1/boot/health` | GET | Boot service liveness, *not model readiness* |
| `/api/v1/boot/status` | GET | Latest report |
| `/api/v1/boot/history` | GET | Last 20 reports |
| `/api/v1/boot/select` | POST | Select a model-linked physical robot instance |
| `/api/v1/boot/recheck` | POST | Explicit rerun of static checks |

POST calls use Console's existing `X-OpenRGD-Console: onboarding.v1` guard and a fixed internal URL. They cannot submit shell commands, paths to execute, or other runtime actions.

## UI

`http://127.0.0.1:8088/boot` — view status, select the imported robot instance, run checks and see Recovery details. `Robot Live` links to the page. Development mode remains the default and the Ubuntu graphical login/kiosk is **not changed** by this wave.

If the physical robot does not yet have an imported RGD instance (Paky-01's initial static registry entry does not have `rgd_model_id`), the default is `setup_required`. That is correct. The bundled synthetic partial RGD fixture is supposed to produce `recovery_required` when checked canonically: it has no `spec/00_core/kernel.jsonc`.

## Physical observation and motion

This wave does not install a Somatic Runtime and does not add CAN/serial/USB device access. There is no command for waking, powering, homing, moving, arming or stopping motors. The hardware e-stop must remain independent of this software.

A future optional kiosk/login session could open `/boot` before `/live`, while Linux services and Recovery remain accessible. **Do not** enable automatic GUI login or a privileged desktop-switch button without a local host-control policy and authenticated operator session.

## Exit gates

1. Hermetic Python tests of profile absent/invalid/tampered, path traversal, wrong authority, valid synthetic CLI, history, persistence.
2. Static JS/TS checks and Docker Compose schema parsing.
3. Rust API build/test and Next.js build on mini-PC.
4. `sudo docker compose up -d --build --no-deps boot-manager api web`; validate health and `/boot` page.
5. Run `python3 scripts/doctor.py` and `python3 scripts/boot-smoke.py`.
6. Import a complete canonical RGD profile; verify `ready_non_actuating` **only** for a valid profile, with hardware powered off. Select intentionally incomplete test fixture to see Recovery.
7. Restart Docker/host and ensure selected profile is re-checked, even when offline.

Tests run in the creation environment do not establish full end-to-end build or the actual mini-PC boot behavior.
