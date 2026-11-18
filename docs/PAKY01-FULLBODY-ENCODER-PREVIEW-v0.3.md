# Paky-01 CORPO 3D v0.3 — BHL V1 whole-body reference + encoder coverage

**State:** Candidate staged frontend implementation on branch `feat/paky01-fullbody-encoder-preview`, stacked onto `feat/torso-cage-3d` (PR #2). NOT currently deployed on the mini-PC. Not a physical posture estimator. No CAN reader is added here.

## Verified source of reference geometry

Source: `HybridRobotics/berkeley-humanoid-lite-assets`
- commit: `fc90fedd008b1e56a22e3c5221548d6b24f49707`
- path: `data/robots/berkeley_humanoid/berkeley_humanoid_lite/urdf/berkeley_humanoid_lite.urdf`
- Git blob SHA: `13261c106eff81726e1d788d3ccf671a246a6fb3`
- **Third-party rights:** the upstream `berkeley-humanoid-lite-assets` repository uses **CC BY-SA 4.0** for its assets, distinct from the MIT license of the upstream software. `bhl-v1-reference.ts` is a transformed/extracted snapshot; this draft must preserve the source credit, indicate changes, and comply with applicable CC BY-SA terms. OpenRGD's MIT grant does not relicense copyrighted upstream assets.
- 26 URDF joints total, **22 actuated revolute** + 4 fixed, 27 links including base.

An exact snapshot of the original 26 joint names, parent/child links, local origins and RPY orientations is stored in `apps/web/src/lib/bhl-v1-reference.ts` with the source pin. `bhl-reference-kinematics.ts` computes all 22 pivot locations from the zero-angle URDF transform chain. It renders reference bones and joint points. No fabricated STL meshes, head/neck CAD, actuator joint zeros, encoder motion or measured link lengths are implied.

**This is the original BHL V1 reference, NOT the as-built/current Paky-01 body**. Our operator-reported physical torso cage still comes from `italiarobotica/paky-01` (15x24x14cm, IMU Y=11cm); only that cage follows the existing read-only IMU visualization, not the static BHL limbs.

The URDF uses Z-up, X-forward, Y-left. Three.js viewer uses X=operator right, Y-up, Z=depth, with a known display-only axis permutation [-urdfY,urdfZ,-urdfX]. The centroid/reference display anchor is the pinned URDF base inertial Z=0.675059 m; not a physically measured Paky-01 COM.

## Display behavior

The existing **CORPO 3D** page now has modes:
- **GABBIA** — already physically tested v0.2 IMU-driven relative roll/pitch and optional experimental relative yaw, unchanged.
- **STRUTTURA BHL V1 · 22 GIUNTI** — skeletal reference with 22 orange joint pivot points, four terminal link markers and neutral BHL zero-angle link geometry, plus the same rotating physical-IMU cage overlaid. Limbs remain **static** until independent verified motor-joint mapping/absolute output calibration exists.
- **ROBOT COMPLETO · NON VERIFICATO** — still disabled; geometry, as-built joints, offsets and body-wide pose are not certified.

An adjacent list has **one row for each of the 22 expected actuated joints**, independent of whether that motor was assembled, connected or commissioned. It reads only the existing `useConsole().snapshot` (no new API/USB/CAN access):
- If there is no motor provider: 0/22 observed, all rows `NESSUNA LETTURA`, no invented numerical angles.
- It accepts only a physical `console.v1` snapshot for the selected robot, connected WebSocket, physical source and recent snapshot; per-joint reported value must be finite in `rad`, `quality:observed`, `source_kind:physical`, with both motor and position timestamps newer than 1.5s and no duplicated motor-to-joint claims.
- Simulated, old, non-finite, non-radian, ambiguous or unknown-joint values are explicitly not accepted as valid observed readings. A diagnostic can show an observed source number, but the label remains `OSSERVATO* / MAPPATURA NON VERIFICATA`. 
- **0/22 animated from encoders**, always for this wave, even if a future source reports a numeric angle: existing `MotorTelemetry.joint` does not attest identity/zero/gear ratio/axis sign, and cannot be promoted to a certified body pose.

### Why encoder articulation is intentionally gated

Inspection of `OpenRGD/rgd-console` main shows `UnboundAdapter.snapshot()` returns `motors: []` for the physical `console.unbound.v1` robot. The only populated motor adapter is the clearly tagged simulator (four simulated joints). The existing physical IMU publisher only carries acceleration, angular speed and Euler observations; it does **not** carry motor encoders.

In `italiarobotica/paky-01`, `electronics/can/joint_nodes.csv` currently records all 22 BHL revolute joint names as `NOT_MAPPED`, despite ongoing individual motor bring-up. Do not infer a verified mapping from a CAN node ID, a raw rotor encoder count, actuator feedback, or a motor-side gear ratio; output-joint position is a different physical quantity.

An actual read-only **encoder provider wave** must supply independently validated:
1. Robot identity and pinned RGD/URDF model identity; exact motor serial/node ↔ joint identity with evidence.
2. Output-angle definition, absolute-vs-relative encoder semantics, axis sign, gear ratio and zero/calibration revision per joint.
3. Time/clock provenance, source sequence/session, freshness and plausibility checks; device-origin timestamps if available versus host receipt.
4. Per-joint confidence and partial coverage, duplicate/source conflict detection and system fault handling.
5. A single non-actuating read-only bus owner/fan-out (no second CAN controller or motor write/probe from the browser). Configuration/bus/actuator permissions explicitly separated from reads.
6. Host API/WS serialization as measured observations, with a fail-closed mapping gate before FK. No authorization to move motors.

A later wave can feed a vetted joint angle map into a separately reviewed forward-kinematics pose projection, animate **only** mapped and current joints, mark missing limbs explicitly, and never use it to authorize physical actuation.

## Tests and source changes

- `apps/web/src/lib/bhl-v1-reference.ts`: pinned static URDF joints.
- `apps/web/src/lib/bhl-reference-kinematics.ts`: source-only URDF FK at reference zero; no hardware input.
- `apps/web/src/lib/bhl-encoder-diagnostics.ts`: strict physical-only, fresh-only diagnostic summarizer, 22 expected IDs, no FK authority.
- `apps/web/src/components/bhl-reference-body.tsx`: 3D skeletal reference geometry with no motor readings or sensor drivers.
- `apps/web/src/components/torso-cage-preview.tsx` and `.css`: mode selection, 22 joint list and source labels; IMU pipeline remains unchanged.
- `apps/web/src/components/robot-live.tsx`: passes the already-present `snapshot` into the view.
- `apps/web/tsconfig.json`: supports explicit `.ts` source imports for Node22 strip-types and Next bundler.
- `scripts/full-body-encoder-preview.test.mjs`: exercises the real TS neutral FK (22 joints, 26 links graph) and diagnostic gates including 0-valued real angles, simulated data rejection, stale/ambiguous/missing, plus no motor/serial calls.

Global CI on main/stacked PRs may remain red due to **pre-existing** missing `config/robots.json` and Rust/Docker fixtures; evaluate new tests and **web** build separately, without modifying unrelated app/boot files.

## Safe isolated preview of v0.3

**Not automatic; requires operator validation.** Keep production `:8088` untouched and do not create a second CAN/IMU reader. Assuming the existing canary on `:8099` is running from v0.2 and the previous Git worktree is still present:

```bash
cd ~/openrgd/repos/rgd-console-torso-review
bash scripts/torso-cage-canary.sh down

cd ~/openrgd/repos/openrgd-console
git status --short --branch
git fetch origin

# This is a NEW isolated sibling worktree based on the new feature branch.
git worktree add --detach ../rgd-console-fullbody-review \
  origin/feat/paky01-fullbody-encoder-preview
cd ../rgd-console-fullbody-review

# No hardware is opened; tests run in the already installed web image.
WEB_IMAGE=$(sudo docker image inspect -f '{{.Id}}' rgd-console-torso-preview:v0.2)
sudo docker run --rm --pull=never --network none \
  --mount type=bind,src="$PWD",dst=/workspace,readonly \
  --workdir /workspace --entrypoint node "$WEB_IMAGE" \
  --test scripts/full-body-encoder-preview.test.mjs \
         scripts/torso-cage-3d.test.mjs

sudo docker build --pull=false -f deploy/Dockerfile.web \
  -t rgd-console-torso-preview:v0.3 .

bash scripts/torso-cage-canary.sh up
```

The script tag for this stacked branch must be **v0.3** so the preview runs the correct image. If the local `rgd-console-torso-preview:v0.2` is absent, use the running production web image for the Node test, not a made-up image.

Open `http://127.0.0.1:8099/live` locally. Select Paky-01 -> CORPO 3D -> STRUTTURA BHL V1. Verify 22 pivot points, 0/22 encoder live (expected today), and the cage still reacts to IMU; note that limb orientation is strictly a neutral reference, not current pose. Close only preview via `bash scripts/torso-cage-canary.sh down`.

Do not merge the draft feature before live WebGL inspection and explicit approval. After the torso PR #2 is accepted, this stacked PR can be retargeted onto main. The two changes must not be conflated.
