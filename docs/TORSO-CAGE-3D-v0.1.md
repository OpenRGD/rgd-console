# CORPO 3D — Paky-01 schematic torso cage v0.1

**Status:** Source prepared on GitHub feature branch; NOT yet installed or browser-tested on the Ubuntu mini-PC. Frontend-only: no change to Rust API, HAL, firmware, Boot Manager, IMU driver, Module Agent, Docker Compose, configuration, or volumes.

## Physical provenance

Based on operator-reported measurements of the actual Paky-01 torso cage (2026-10-24):

| Operator cage axis | Value |
| --- | --- |
| X, core width | 0.15 m |
| Y, total height | 0.24 m |
| Z, depth | 0.14 m |
| Uprights | 0.20 m |
| Approx profile thickness | 0.02 m |
| Upper transverse | 0.25 m, overhang 0.05 m each side |
| IMU mounting height | 0.11 m above the EXTERNAL lowest cage edge |

The visible beams depict a SCHEMATIC measured-envelope approximation and are not certified mechanical CAD/URDF or actual link transforms. X/Y/Z are the operator's cage description, not the BHL/OpenRGD canonical axes. The amber plane represents ONLY the IMU vertical level Y=0.11 m. The exact sensor X and Z coordinates, chip origin and extrinsic quaternion are still unknown. Never label the plane as a physically located sensor chip.

Sources: italiarobotica/paky-01 branch feat/imu-console-bridge, parameters/torso_cage_observed_20261024.json and parameters/imu_instance.json.

## IMU/Console contract reused

Uses the existing useConsole() hook, populated by the already operating read-only Console WebSocket and local GET. No serial opens, new endpoints, background data collectors or commands.

- POST producer (unchanged): /api/v1/imu/observations
- GET latest (unchanged): /api/v1/robots/paky-01/imu
- WS existing: /api/v1/stream?robot_id=paky-01, event type=imu
- Payload schema: console.imu.v0.1-candidate, source_kind=physical, sensor frame=imu_sensor_axes_unverified, calibration_revision=null, heading_calibrated=false, decision_eligible=false, observation_only=true.

Freshness requires the selected robot/source IDs and uncalibrated trust flags, connected WS and Console receive age <=3 seconds (1.5 seconds future skew tolerance). A connected WebSocket alone is not a functioning physical sensor. Stale data freeze the LAST observed visual pose and display a visible STALE overlay; numerical current readings disappear.

## Display-only transform and safety

On the first valid sample of each publisher session, the frontend sets a session-local zero baseline. The operator may reset this baseline using the on-screen zero button; this only changes local React state and never changes sensor/robot calibration or writes to the network.

Candidate experimental directions from four separate passive tests:
- Robot right tilt -> IMU X gyro/roll positive; left -> negative.
- Robot forward tilt -> IMU Y gyro/pitch positive; backward -> negative.

Using an explicitly schematic viewer frame X=right,Y=up,Z=front, sensor roll delta makes the cage lean to the right; sensor pitch delta leans forward. Sensor yaw is shown numerically as YAW* NON CALIBRATO but NEVER applied to the scene. Visual movement is clipped to +/-35 degrees (warning shown), and no output enters Somatic Runtime or motor safety authority.

Robot Completo is intentionally disabled until an actual model-linked, calibrated and independently verified Paky-01 RGD/URDF profile exists.

## Changed files

- apps/web/src/lib/torso-cage-geometry.ts — geometry and pure source/freshness/relative angle gates.
- apps/web/src/components/torso-cage-preview.tsx — lazily imported WebGL cage and controls.
- apps/web/src/components/torso-cage-preview.css — dedicated responsive layout.
- apps/web/src/components/robot-live.tsx — new CORPO 3D tab; existing Overview, Telemetria, Eventi unchanged.
- scripts/torso-cage-3d.test.mjs — Node 22 pure TS geometry/guard tests and source boundary tests.

## Mini-PC validation (read-only before deploy)

Do not use any old ZIP/overlay or replace the active Console tree. The authoritative source is the GitHub OpenRGD/rgd-console branch. The previously reported active checkout is ~/openrgd/repos/openrgd-console, but first confirm with git remote -v and git status. On Ubuntu, Node.js may not be installed on the host; reuse the ALREADY EXISTING web container image for host-side Node tests.

    cd ~/openrgd/repos/openrgd-console
    git status --short --branch
    git remote -v
    git fetch origin

    # Identify the existing image from the RUNNING production web container.
    WEB_CONTAINER=$(sudo docker compose ps -q web)
    WEB_IMAGE=$(sudo docker inspect --format '{{.Image}}' "$WEB_CONTAINER")
    printf 'Existing web image: %s\n' "$WEB_IMAGE"

    # Separate worktree; does NOT switch or modify the active Console checkout.
    git worktree add --detach ../rgd-console-torso-review origin/feat/torso-cage-3d
    cd ../rgd-console-torso-review

    # Read-only tests, offline: no ports, no hardware devices, no serial drivers.
    sudo docker run --rm --pull=never --network none \
      --mount type=bind,source="$PWD",target=/workspace,readonly \
      --workdir /workspace --entrypoint node "$WEB_IMAGE" \
      --test scripts/torso-cage-3d.test.mjs \
             scripts/live-profiles.test.mjs \
             scripts/imu-ingest-contract.test.mjs

For an independent Next.js production build, if the required Docker image and npm packages are available, build an ISOLATED image tag without starting any containers or touching live volumes:

    cd ~/openrgd/repos/rgd-console-torso-review
    sudo docker build -f deploy/Dockerfile.web -t rgd-console-torso-review:local .

Do not use docker compose up from the detached review worktree: it can collide with production ports, services and named volumes. A failed offline image fetch is a network issue, not a reason to alter the active instance. GitHub Actions separately verifies the web build and TypeScript on the feature branch.

**Deployment only after PR review and acceptance:** in the ACTIVE Console checkout, save/check current local modifications and roll back plan, merge into main, fast-forward the checkout, then rebuild/recreate **web only**:

    cd ~/openrgd/repos/openrgd-console
    git status --short --branch
    git pull --ff-only
    sudo docker compose build web
    sudo docker compose up -d --no-deps --no-build web
    sudo docker compose ps
    python3 scripts/doctor.py

This is an operator procedure, NOT evidence these commands have yet been run. Never run docker compose down -v.

## Acceptance checklist

1. Select Paky-01 in /live and open CORPO 3D; show a proportional cage, 25cm top rail and 11cm amber horizontal plane.
2. Read real IMU from the existing publisher only; no second serial access. Live tilt changes relative roll/pitch according to operator motion, NOT yaw rotation.
3. Stop publisher or WS: within <=3 seconds the widget becomes STALE and freezes the model without synthetic values.
4. Change to a different/simulated robot: Paky-01 cage is not shown as that robot.
5. Button Imposta zero grafico resets only local visual offset. No sensor calibration or motor permissions change.
6. Existing Overview, Telemetria, Eventi, Calibration, Boot and HAL remain operational.

## Known CI baseline

At main commit 3395b66, before this branch, web job was green but the full workflow failed: contract test reads an absent local config/robots.json; 11 Rust tests fail due test-fixture/route assumptions; Docker smoke fails to start API without local runtime data. This frontend PR does not change those unrelated areas. Distinguish new regressions from existing failures in CI before merging.

**Critical compatibility:** preserve the deployed anti-replay check: strictly increasing sequence and non-decreasing host monotonic receipt times (equal timestamps are permitted within one UART read chunk). Never reintroduce timestamp <= previous timestamp as a rejection.
