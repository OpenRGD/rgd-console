# OpenRGD Peripheral Manager — common contracts v0.1 (candidate)

**25 October 2026 — design and pure validation only; no operational start/stop API or daemon installed.**

## Architectural decision

Build one **general-purpose, observation-only peripheral control plane** in OpenRGD Console, and use the physically tested Paky-01 IMU as the first implementation. Camera, microphone, depth, 2nd external camera, audio output, other environmental sensors and future simulated sources should reuse the same **identity, inventory, lifecycle, source-quality, capability and audit semantics**. This is an internal Console candidate (`console.peripheral-*.v0.1-candidate`), **not** a promoted canonical OpenRGD Runtime/Somatic contract.

Existing services stay owners of their proper responsibilities: Boot Manager validates a boot profile; Module Agent installs reviewed software modules; Calibration checks sensor frames and evidence; Peripheral Manager owns **declared acquisition-service lifecycle + status**, never motion. No physical motor commands, actuator enables, balance/estop functions, CAN writes or arbitrary shell execution.

The fundamental separation is:

```text
PHYSICAL DEVICE                         (identity/presence/transport/power capability)
   └─ HOST ACQUISITION OWNER            (one exclusive open on device, bounded lifecycle)
        ├─ OBSERVATION STREAM X         (schema, time, quality, retention, provenance)
        │   ├─ Console live dashboard
        │   ├─ Pulse / Chronoscope
        │   └─ Chronon ingress (FUTURE, separate reviewed evidence)
        └─ OBSERVATION STREAM Y         (if supported by the same owner)
```

**Start/Stop acquisition is not power ON/OFF.** A USB WIT IMU may remain electrically powered while the collector process is stopped. A future controllable USB hub would be a separate, explicit, hardware-qualified capability, **not inferred** from `usb_serial`.

A single acquisition **publisher** may own several logical output streams. Multiple consumers are read-only subscriptions to those output streams, not independent device opens.

## Four contracts — internal Console v0.1 candidate

Source: `contracts/console/v1/`.

| Contract (schema_version) | Responsibility |
|---|---|
| `console.peripheral-descriptor.v0.1-candidate` | Declarative install/inventory identity and allowlisted **capabilities**, robot-scoped ID, transport binding reference, host publisher/resource owner, streams and declared freshness |
| `console.peripheral-status.v0.1-candidate` | Independently observed state of USB/device, publisher, each observation stream, actual host control availability and status revision |
| `console.peripheral-action.v0.1-candidate` | Bounded, explicit operator **acquisition.start** or **acquisition.stop**, with request UUID and expected status revision |
| `console.peripheral-action-result.v0.1-candidate` | Broker acknowledgement / error and observed lifecycle, **not proof that the sensor is LIVE** |

They live beside existing `console.imu.v0.1-candidate` and `console.v1 StreamFrame`, not in competition with them. Device/publisher lifecycle events do not become measurement observations. A future `StreamFrame.type="peripheral.status"` can distribute the generic status object after adding this new event type in the Console WS contract, **but this event is not implemented**.

### 1. Descriptor (declaration, not a live assertion)

Scoped key: `(robot_id, peripheral_id)`. Both must remain stable when the USB device is unplugged, so `ttyUSB0` or the current USB bus address are **not** peripheral identities.

- `category`: `imu`, `camera`, `microphone`, `depth`, `lidar`, `environment`, `range_sensor`, `generic`.
- `binding`: `transport` + opaque `binding_ref` into the **host-installed, reviewed robot configuration**, with `verification` separate from mere presence. The browser never sends raw USB paths or driver commands to the broker.
- `publisher`: fixed `publisher_id`, `host_id`, `manager` (`systemd_user` or `external_read_only`), exact `service_ref`, `resource_lock`, ownership mode and **separately chosen** boot-start policy. An opaque service reference is resolved against a host allowlist; requests cannot supply arbitrary executable/unit names.
- `streams[]`: one or more `stream_id`, existing/explicitly proposed `sample_schema`, `data_class` (normal observations vs privacy-sensitive audio/video), independent `freshness_ms` and *nominal, not promised* sample rate, fan-out and bounded buffer policy.
- `capabilities[]`: exactly the non-actuating v0.1 vocabulary `observation.read`, `acquisition.start`, `acquisition.stop`. Not all peripherals support start/stop. **No wildcard permissions**. Adding `power.off`, calibration writes, motor outputs, microphone recording or arbitrary device settings will require separately versioned contracts, privacy/safety reviews and explicit approval.
- `actuation_enabled: false` is mandatory for this contract family.

A future camera may produce `video.frames` and `vision.detections` from **one** acquisition publisher and a common exclusive device resource lock. The camera example in `examples/peripherals/` is **not** evidence that any such service is installed.

A `capabilities[]` entry means *supported by design*, **not enabled for this user/host right now**. Actual executable controls come exclusively from `status.controls` after broker availability, host binding and permission checks.

### 2. Status (observed, independent dimensions)

At least three statuses exist simultaneously; treating them as a single Boolean would conceal failures.

| Dimension | Examples | Source of truth |
|---|---|---|
| `device.presence` | `present`, `absent`, `busy`, `unknown` | Host probe of the fixed, configured device identity; cannot be guessed by Console containers |
| `publisher.lifecycle` | `not_installed`, `stopped`, `starting`, `running`, `stopping`, `failed`, `busy`, `unknown` | Host service manager; not inferred from IMU samples |
| `streams[].state` | `live`, `stale`, `no_source`, `invalid`, `unknown` | Accepted observation stream with its own source provenance and freshness limit |
| `controls` | `can_start`, `can_stop`, `reason` | Explicit configured capability **and** host broker/permissions/device state |
| `publisher.desired_state` | `running`, `stopped`, `unknown` | Last accepted operator intent, **not** current process state |

For example `publisher.lifecycle="running"` + `streams[0].state="no_source"` is a valid **fault/commissioning state**, NOT a false claim of live IMU. Likewise `device.presence="present"` does not allow acquisition unless the binding is verified, ownership is free and the operator is authorized.

Do not assume the same freshness for every sensor: the existing Console IMU GET expires at **3000ms**, while Pulse K3 uses **800ms** display freshness; video/audio may have their own limits. Each stream carries an explicit `freshness_ms` and status age. `age_ms=null` means age unverified, **never live**. Publish `unknown` rather than fabricating `stopped` if the host broker is absent.

The `status_revision` increments on authoritative host state transitions. An old browser cannot silently overwrite a newer requested state.

### 3. Action (bounded intent, not a host command string)

Proposed generic routes (none are currently registered):

```http
GET  /api/v1/robots/{robot_id}/peripherals
GET  /api/v1/robots/{robot_id}/peripherals/{peripheral_id}
POST /api/v1/robots/{robot_id}/peripherals/{peripheral_id}/actions
Content-Type: application/json
X-OpenRGD-Console: peripheral.control.v0.1

{
  "schema_version": "console.peripheral-action.v0.1-candidate",
  "request_id": "<UUID>",
  "robot_id": "paky-01",
  "peripheral_id": "torso-imu-01",
  "action": "acquisition.start",
  "expected_status_revision": 12
}
```

- Only **`acquisition.start`** and **`acquisition.stop`** are admitted by v0.1. The API cannot accept a PID, shell string, USB path, service name, arbitrary parameters, calibration request, power switch or motor/CAN command.
- Exact robot/peripheral identity, declared capabilities, status revision, service ownership, operator authorization and broker peer identity must all pass. `request_id` supports deduplication during network retries; the broker must journal recent IDs in a bounded, time-limited cache (this is **planned**, not shipped).
- Repeated start while `running`, or stop while `stopped`, returns `no_op` instead of spawning/killing anything. Another publisher owning the same physical resource is `busy`; never kill an unrelated process.
- A successful command **acknowledges a lifecycle transition**, it does not assert USB presence or fresh data. An operator must see a pending state until the authoritative host service status updates, and separately `LIVE` only once observations arrive.
- Existing Caddy loopback restriction and same-origin header are **CSRF mitigations, not user authentication**. Before enabling buttons, require a reviewed local operator authority boundary and the peer-authenticated Unix socket host broker. Refuse if absent.
- Audit `peripheral.acquisition.start_requested` / `stop_requested` / `completed` / `failed` as operational Console events (`chronon_id=null`, `evidence_class=console_host_service_lifecycle_not_chronon`); never invent a canonical Chronon or store credentials.

### 4. Action result

Returns the same correlation request UUID, `disposition` (`accepted`, `no_op`, `rejected`, `failed`), the *reported* `publisher_lifecycle`, `status_revision`, `observed_at` and a bounded, allowlisted `error_code`. No motor-readiness flags. The UI re-fetches status after an acceptance rather than flipping to green optimistically.

## Ownership and physical safety

Use a **single rootless host-owned publisher per exclusive physical device**, managed by `systemd --user` on the Ubuntu mini-PC. A small dedicated host broker controls **allowlisted publisher service IDs** only and reports status, device presence and errors; the Console Docker API remains unprivileged with no `/dev` or `/var/run/docker.sock`. The broker's Unix socket must be explicitly installed/mounted with UID/GID and filesystem permissions tested; **a read-only socket bind mount alone does not authenticate the browser**.

Paky-01 IMU's current `imu_publish.py` has a bounded `--seconds 1..600` option: a managed continuous mode or explicit renewal/healthy-restart policy must be separately reviewed before marking `running` durable. Publisher token stays host-private, never passed to a browser or Pico. The current `openrgd.imu-sample.v0.1-candidate` POST schema and `console.imu.v0.1-candidate` read-only WS schema stay unchanged.

Future microphone/video capture requires explicit privacy-consent / recording indicator semantics before enabling the acquisition capability in the descriptor. Generic capability declarations do **not** authorize ambient recording. Motion-capable accessories and actuators are **not** admitted through Peripheral Manager; use separately reviewed Somatic/Safety Gate authority.

### Failure policy

- Broker not installed/disconnected → `manager_available=false`, start/stop disabled, **not** inferred `stopped`.
- USB unplugged → device `absent`, publisher may be `failed`; existing observation becomes `stale/no_source` after its own TTL.
- Publisher `running` but no accepted IMU data → `no_source` or `stale`; no green `LIVE`.
- Serial already exclusively owned by an *unmanaged* process → `busy`, no attempt to kill or force-open it.
- Console/Pulse consumer stopped → no lifecycle changes to sensor publisher (fan-out consumers do not own the device).
- Host reboot → follow explicit `startup_policy`, default manual, never silently auto-activate a camera or microphone.
- Console container/API crash → independently owned publisher may continue to run; stale data still ages out and cannot trigger motor decisions.

## First implementation: Paky-01 IMU

- Robot: `paky-01`; peripheral: `torso-imu-01`; logical stream: `imu.sensor_axes`.
- Existing sensor owner: WIT/CH340 `italiarobotica/paky-01/scripts/imu_publish.py`, default 9600bps exclusive serial, Console POST with local secret.
- Proposed host unit: `openrgd-paky01-imu.service` under Ubuntu user session. **Not yet installed.**
- Registered observation stream: `console.imu.v0.1-candidate`, sample frequency measured ~10Hz, Console stream freshness 3000ms. Pulse K3 consumes the Console WS read-only with its own 800ms UI freshness. Sensor→torso transform and absolute yaw remain **unverified**.
- Control support is *declared* in the descriptor but **status forbids buttons** until fixed host binding, dedicated broker and local authority are commissioned.

### Reuse beyond IMU

| Peripheral | Physical owner | Stream(s) | Additional gate |
|---|---|---|---|
| IMU WIT | Exclusive CH340 serial publisher | Euler, gyro, acceleration | Uncalibrated sensor axes + sequence/freshness |
| C920 POV camera | Single reviewed V4L2 capture service | Frames + derived detections | Explicit camera selection; consent & bounded bandwidth |
| External camera | Independent V4L2 capture service | Environment frames + annotations | Temporal alignment / Reality Ingress source identity |
| Microphone | One host audio capture owner | Audio frames + speech events | User-consent, capture indicator, retention controls |
| Depth/range | One reviewed hardware owner | Calibrated/unverified depth observations | Extrinsic frame and units provenance |

Future consumers can include Reality Ingress, Voice Studio, Chronoscope, recorded training data or Console dashboards, but no consumer automatically acquires permission to start the device.

## Contract files and executable checks

- `contracts/console/v1/peripheral-descriptor.v0.1-candidate.schema.json`
- `contracts/console/v1/peripheral-status.v0.1-candidate.schema.json`
- `contracts/console/v1/peripheral-action.v0.1-candidate.schema.json`
- `contracts/console/v1/peripheral-action-result.v0.1-candidate.schema.json`
- `examples/peripherals/` inert example records (IMU and **uninstalled future** camera).
- `services/api/src/peripherals.rs`: pure serde typed model and validation for unique resource ownership, capabilities, freshness independence, optimistic revision, motor-free API allowlisting; **no routes, no systemctl, no process start**.

The older IMU-specific RFC `docs/P01-IMU-PUBLISHER-CONTROL-v01.md` should be read as the initial use case, not a separate long-term management API. Its provisional per-IMU GET/POST URLs are superseded by the generic paths above **for the new work**. No already-live IMU read/WS endpoint is changed.

## Work waves and release gates

**PERIPH-0.1 — Domain/contract foundation (THIS PR):** schemas + fixtures + no-side-effect Rust model/tests. Zero host process or UI behavior changes.

**PERIPH-0.2 — Host service ownership & commissioning:** verify Ubuntu per-user systemd session, real serial-by-path and local 0.5 Console overlays, implement long-running/stoppable IMU publisher, exact host service allowlist and broker socket; prove duplicate-start is idempotent, SIGTERM closes serial, busy manual reader is not killed.

**PERIPH-0.3 — Console adapters + UX:** feature flag disabled-by-default, authorize operator via reviewed local boundary, add generic REST GET/status/action routes and read-only WS status events; render one reusable peripherals list/detail card, with separate status indicators and control buttons.

**PERIPH-0.4 — Physical acceptance / generalization:** operator validates start/stop/restart/replug, IMU `LIVE→STALE` (Console 3s, Pico 800ms), existing USB PULSE 20/100 ACK, no CAN/motor regressions. Only then register a **second** peripheral via the same descriptor without rewriting lifecycle code.

### Compatibility and rollback

Do not replace the local Console installed from later IMU v0.5 overlays with stale GitHub main. Compare runtime source hashes/diffs first. Preserve `.env`, token, RGD model imports, Docker named volumes, boot readiness and Pulse firmware. The unmerged contracts/examples/pure model can be dropped without any change to the running IMU publisher; the initial new routes/broker will be opt-in and reversible.

**Non-goals for v0.1:** power switching, RGD body calibration, motor control, arbitrary peripheral configuration, disk recording of video/audio, installed module orchestration and runtime authorization decisions.
