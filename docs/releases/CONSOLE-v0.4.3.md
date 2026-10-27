# OpenRGD Console v0.4.3 — GitHub baseline release

**Scope:** reproducible, **non-actuating software baseline**, intended as the common starting point for independently reviewed OpenRGD integrations. This is not a hardware-safety or deployment certification.

## Contents

- Rust/Axum Console API + Next.js interface, local-only Caddy gateway.
- RGD ZIP import, model and physical-instance registry, operator-supplied host inventory, unverified HAL preview.
- Dedicated Boot Manager with canonical pinned `rgd check` / `rgd boot`; a verified profile does **not** enable physical execution.
- Module Agent and passive Calibration inspection.
- Robot Live read-only interface and Paky-01 WIT IMU observation ingress (token-bound localhost), read-only HTTP and WebSocket fan-out.
- IMU replay protection: `sequence` must increase strictly; `host_monotonic_ns` can stay equal and must never decrease.
- Unbound physical adapters, no motor-command endpoint and no host USB device mount.

The IMU data are **sensor-frame observations**, not calibrated robot-body/world pose: `decision_eligible=false`, `calibration_revision=null`, yaw uncalibrated. `workspace.json`, personal config, tokens, installed modules and hardware calibration stay outside Git.

## Source and version integrity

- Rust package version: `0.4.3`.
- Next.js package version: `0.4.3`.
- `/api/v1/status` and `/api/v1/installation/diagnostics`: version derives from `CARGO_PKG_VERSION` (same authoritative version).
- Robot Live badge: `v0.4.3`.
- Source release **must** be tagged at the exact, tested `main` commit (never at a moving feature branch).

## Acceptance criteria for a stable software tag

1. The final `main` commit runs **all four** `Console Foundation checks` jobs successfully: `contracts`, `api`, `web`, `docker-smoke`.
2. The `release-version.test.mjs` assertion passes.
3. `rgd-console` remote `main` and the release tag refer to the same commit SHA.
4. The GitHub Release points to that tag and names the outstanding physical/operational acceptance limitations.

The GitHub CI uses explicit synthetic fixtures in `.github/fixtures/`, never Paky-01 local config. It performs a **software integration smoke test**, not IMU sensor calibration or CAN motor verification. A running mini-PC is a **separate** acceptance gate.

## Excluded and pending feature branches

Do **not** fold Draft/stacked PRs into this baseline without their own review and testing. At release preparation, the following belong to separate PRs:

- Paky-01 CORPO 3D and whole-body/encoder preview.
- Peripheral Manager 0.1/0.2.
- Visual Feedback and expressive visual scenes/studios.
- Voice Studio integration and candidate contracts.
- Physical Binding Workspace for the 22 BHL V1 actuated joints.

A feature being present on GitHub does not mean it is merged into `main` or installed on the mini-PC.

## Update/rollback boundary for the mini-PC

Use a separate Git worktree to review and build a candidate tag first. **Do not** perform an automatic `git pull`, switch a running production checkout to a feature branch, or run `docker compose down -v`.

Before any deployment, record the current mini-PC Git SHA and complete `docker compose ps` / `scripts/doctor.py` results, plus a separate offline backup of persistent Docker volumes and locally ignored `config/` and `.env`. Test the exact release on the target hardware in a controlled window and retain a known-good recovery procedure.

There are no commands in this release to actuate motors, enable Somatic Runtime, modify CAN wiring, reflash STM32 or change Ubuntu's bootloader.

## Follow-up

Once the software CI is verified and the exact release commit is tagged, begin with the reviewed **Voice Studio** handoff on a dedicated feature branch, after confirming that the Voice repository's baseline and Module Agent contracts are actually available.
