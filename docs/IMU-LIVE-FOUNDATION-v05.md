# OpenRGD Console — P01 IMU / Physical Observation Foundation v0.5 (candidate)

## Actual topology

```
Paky-01 torso WIT/CH340 serial on Ubuntu host
       ↓ scripts/imu_publish.py (separate device process, NO motor privileges)
       ↓ HTTP POST 127.0.0.1:8088/api/v1/imu/observations  (private token)
Caddy loopback-only  → Rust Axum API (memory-only, per-robot freshest sample)
       ↓ existing broadcast::Sender<StreamFrame> (type="imu")
       ↓ existing read-only WebSocket /api/v1/stream?robot_id=paky-01
Browser /live · IMU panel (only when physical, fresh, WebSocket live)
```

The browser never accesses USB, USB is **not** mapped to any container, and no module installation or motoring permission is implied. Existing robot's `console.unbound.v1` adapter remains unbound; physical IMU telemetry and physical motor-control readiness are distinct states. Model source imports, Boot Manager, Calibration, current Docker volumes, module registry and installed module digests remain intact.

## Ownership boundaries

- Private `italiarobotica/paky-01`: physical sensor mounting, identity, source-protocol driver and per-instance configuration.
- Candidate generic `OpenRGD/rgd-imu` repository: reusable contract, normalization/QA/publisher module; not yet published, not installable by `rgd-modules`.
- `OpenRGD/rgd-modules`: future pinned distribution descriptor **only after a tested module executable exists**; current registry candidate schema admits pinned Git/Cargo CLI modules and cannot silently accept a Python sensor daemon.
- Console: authenticated passive ingress, per-robot memory state, WebSocket fan-out, UI; *not* device drivers.
- `OpenRGD/rgd-calibration`: coordinate-frame transform/extrinsics and sensor bias with evidence; no automatic approval.
- Canonical sensor_health_monitor.jsonc: contains an illustrative 0.1s timeout; **do not apply it blindly to a 10Hz sensor**. Its stated "ENTER_SAFE_BALANCE_MODE" policy is declarative, not executable here.
- Chronograph/Somatic/Cognition: no actual connection in v0.5; observation clocks remain host receive clocks.

## Authentication and provenance

- The ingest endpoint is disabled when `CONSOLE_IMU_INGEST_TOKEN` is absent or <32 characters. Only a matching `X-OpenRGD-IMU-Token` can publish; the allowed robot id list is controlled by `CONSOLE_IMU_ALLOWED_ROBOT_IDS` (default `paky-01`).
- API validates body size <=4096B, bounded finite SI vectors, RFC3339 host timestamp within ±5s, physical robot identity, and monotonically increasing `(sequence, monotonic_ns)` per collector session. It never trusts the sender's statement of frame calibration or motor readiness, and it discards samples from unsupported schemas.
- Console generates a separate **server receipt** timestamp. It does **not** fabricate a sensor acquisition timestamp or Chronograph synchronization. It never persists measurements to the Console model registry or Chronon store.
- For v0.1 one IMU source is accepted per physical robot. A collector restart changes `session_id` without falsely claiming dropped-frame accounting. External requests from another host are unsupported; gateway binds only to 127.0.0.1 by default. A leaked token would compromise observation integrity, so keep secret file mode 0600.
- The frontend uses a 3-second freshness window and closes live indicators when WebSocket is disconnected, even if the API is online. A connection to WS does not imply an actual IMU or controller connected.

## Status/data semantics

- Acceleration: m/s² in **sensor axes**, not a COM/body-frame vector.
- Angular velocity: rad/s in **sensor axes**.
- Orientation: roll/pitch/yaw in degrees from *vendor fusion*, **not** quaternion or verified world heading. The preview cube depicts *sensor axes only*, not Paky-01 CAD or torso pose.
- `motion_hint` = low angular rate vs rotation observed, advisory only, threshold 0.05rad/s in sensor axes. It is not a fall detector or locomotion safety input.
- `decision_eligible=false` and `observation_only=true` are mandatory until identity, transform, calibration revision, clock and independent safety path are validated. No actuation or dynamic module execution path is provided.
- In current candidate v0.5 there is no automatic `HEALTHY` claim from passing checksums. Stale means unavailable.

## Mini-PC manual deployment

1. Confirm Console v0.4D **import hotfix** sources installed and existing Docker services running. Keep existing robot/model/import data.
2. Extract `openrgd-console-imu-v0.5-overlay.zip` to a staging directory outside the repo.
3. Run `bash staging/openrgd-console/scripts/upgrade-v05-imu.sh`. It verifies old source SHA256 before copying and creates a source backup, never changes local `config/`, `.env`, `.git`, `data/`, or volumes.
4. Run `bash ~/openrgd/repos/openrgd-console/scripts/setup-imu-ingest-token.sh` to generate a private token **once**, stored in user config and Compose `.env`.
5. `sudo docker compose config --quiet`; `sudo docker compose up -d --build --no-deps api web`; `sudo docker compose ps`; `python3 scripts/doctor.py`. Never run `docker compose down -v`.
6. Verify `curl -fsS http://127.0.0.1:8088/api/v1/robots/paky-01/imu` yields JSON `null` until a real sensor bridge is started. Start the private Paky-01 `imu_publish.py` in a second Ubuntu terminal (the only process opening the USB serial port).
7. Choose **Paky-01** in `/live` and `/live` → `TELEMETRIA`. Readings must become physical/live and then stale when publisher exits. Simulator and body-runtime remain distinctly unavailable/unbound.

Never expose the gateway over the LAN without a proper authenticated reverse proxy. No USB device mount, root serial access or loss of Docker volumes is required.

## Future cognition gate

ObservationCandidate → sensor health/freshness → corrected orientation in verified torso frame → fusion with encoders/feet/vision → somatic state estimator → decision policy review → safety gate. Cognitive context can describe `moving` / `low angular velocity` as *observations* but must not authorize motor operations, estimate support polygon, balance state, or trigger an emergency stop based solely on this uncalibrated IMU.
