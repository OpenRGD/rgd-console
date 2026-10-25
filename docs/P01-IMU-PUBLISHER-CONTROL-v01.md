# Console IMU Publisher Control v0.1 — design and physical commissioning gate

**Status: implementation RFC only (25 October 2026). No start/stop control has been installed or activated.** The `OpenRGD/rgd-console` code contains a **read-only IMU panel** and an authenticated **publisher POST ingress**; the actual Paky-01 IMU publisher runs on **Ubuntu outside Docker**, and the current `api` container is deliberately unprivileged, has no `/dev` or Docker socket, and must remain that way.

## User goal

From **Robot Live → TELEMETRIA → Periferiche → IMU (Paky-01)**, allow a local operator to:

1. See if the **USB IMU device exists**.
2. See whether the dedicated host **publisher service is stopped, starting, running, busy, failed, or not installed**.
3. **Start / Stop acquisition** on explicit click, idempotently, with an actual host-service acknowledgement (not an optimistic UI toggle).
4. See **last accepted physical sample age** independently of the publisher process and peripheral presence, and whether Console / Chronoscope data are `LIVE` or `STALE`.
5. Later optionally configure **start on host boot**, independently of the current running state.

**Important language:** `Ferma acquisizione` stops the reader process. It **does not switch off 5V USB power** or electrically disable the IMU. A genuine electronic power toggle would require a compatible controllable USB hub or hardware power switch and a separate, physical test.

## Current implementation evidence

- Console API: `services/api/src/imu.rs` validates input from `scripts/imu_publish.py` using a token. `services/api/src/routes.rs` contains publisher-ingress `POST /api/v1/imu/observations` plus read-only `GET /api/v1/robots/{id}/imu` (3s freshness); `state.rs` broadcasts already accepted `StreamFrame::new("imu", ...)`.
- Console UI: `apps/web/src/components/robot-live.tsx` renders the read-only `ImuPanel` on physical robots, including the `TELEMETRIA` view. `apps/web/src/hooks/use-console.ts` already consumes the IMU WebSocket.
- Docker: `docker-compose.yml` publishes the gateway only on `127.0.0.1:8088`; `api` runs as UID 10001, `read_only: true`, `cap_drop: [ALL]`, with no USB device mount or host Docker socket.
- IMU device owner: `italiarobotica/paky-01/scripts/imu_publish.py` opens the separately verified WIT/CH340 serial by-path at 9600 bps with **exclusive=True**, and publishes at ~10Hz to Console. Its existing `--seconds` range is **1..600**, so a persistent daemon requires a separately reviewed `--continuous` mode or a managed bounded restart policy; **do not assume the current command runs forever**.
- Pulse: the new candidate `PULSE-0.3B` subscribes **read-only** to Console's `console.v1 type=imu` WebSocket. It must not become the publisher owner or an independent serial reader. No motor control is involved.

## Architecture decision

Use a **rootless Ubuntu host-owned user service + narrowly scoped host broker**, not an arbitrary subprocess launch from Docker.

```text
Local browser (Robot Live → IMU)
      |
      | GET  /api/v1/robots/paky-01/peripherals/imu/publisher
      | POST /api/v1/robots/paky-01/peripherals/imu/publisher
      |      {"desired_state":"running"|"stopped"}
      v
Console Rust/Axum API in isolated Docker
      |
      | opt-in, versioned **Unix domain socket** client only
      | /run/openrgd-imu-control/imu-manager.sock
      | no Docker socket, no host /dev and no arbitrary shell access
      v
Rootless host IMU control broker (operator-owned systemd user service)
      |
      | exact fixed systemd unit start/stop/status, not command strings
      v
systemd --user: openrgd-paky01-imu.service
      |
      | ONE exclusive WIT/CH340 serial reader
      v
existing imu_publish.py → existing token-protected Console POST
      |
      +→ read-only Console UI + Chronoscope Pulse fan-out
```

**Important:** these REST routes and Unix socket are **PROPOSED**, not implemented in current Console. No new endpoints are needed for *reading* physical IMU observations; these new control routes would concern only the lifecycle of its separate process.

### Why not simpler implementations?

- **No `docker exec`, `sudo`, `pkill -f`, `killall`, `systemctl` executed inside the container**, user-supplied commands/PIDs, arbitrary process names, or Docker socket mount.
- **No second IMU serial listener** and no stopping an unrelated process that might own the CH340 interface. The publisher uses `exclusive=True`: if another owner already exists, return a bounded `DEVICE_BUSY`/error, not two active streams.
- No USB device mount into the API container, motor/CAN permissions, or synchronization with the Somatic Runtime control loop.
- Do not create an unauthenticated host TCP API, especially one reachable from the LAN. A Unix socket mounted from a verified host-only directory is the explicit boundary.

## Contracts (candidate)

### GET (read-only status)

`GET /api/v1/robots/paky-01/peripherals/imu/publisher`

Example response, always independently sourced:

```json
{
  "schema_version": "console.imu-publisher-control.v0.1-candidate",
  "robot_id": "paky-01",
  "peripheral_id": "torso-imu-01",
  "publisher": {
    "unit": "openrgd-paky01-imu.service",
    "state": "running",
    "enabled_on_boot": false,
    "manager_available": true
  },
  "device": {
    "connection": "present",
    "identity": "configured_by_path"
  },
  "observation": {
    "state": "live",
    "last_received_at": "<verified source timestamp>",
    "age_ms": 103
  },
  "operations": {
    "can_start": true,
    "can_stop": true,
    "actuation_enabled": false
  }
}
```

Proposed finite values:
- `publisher.state`: `not_installed` | `stopped` | `starting` | `running` | `stopping` | `failed` | `busy` | `unknown`.
- `device.connection`: `present` | `missing` | `unknown`.
- `observation.state`: `live` | `stale` | `no_source`.
- The frontend must not display `LIVE` merely because `systemd` reports `running`. Console IMU `is_fresh(...,3000)` and actual websocket sample provenance remain the source of truth.

If host broker or socket is not installed, return a **specific `manager_available:false` with `not_installed`/503**, not a fake stopped sensor. The button must then be disabled with an explanation; **never silently start a fallback Python reader**.

### POST (idempotent operator request, no arbitrary arguments)

`POST /api/v1/robots/paky-01/peripherals/imu/publisher`

Allowed JSON exactly:

```json
{ "desired_state": "running" }
```

or `{"desired_state":"stopped"}`.

- Reject any other `robot_id`, unknown fields, arbitrary executable/path/PID/service name, frequency, baud, command arguments, motor-related operation or host path.
- Only same-origin local browser requests with explicit scoped mutation header and CSRF protection; **this is not user authentication**. The Console gateway must remain loopback-only until a proper local-user auth gate exists.
- Broker must verify its own Unix socket peer identity and constrain operations to the exact unit. No shell interpolation; if process ownership or unit configuration does not match, fail closed.
- Return actual service transition/status; repeated `running` while already running and `stopped` while already stopped are safe/idempotent.
- Prefer an audit `ConsoleEvent` with `event_kind="peripheral.imu.publisher.start_requested"/"stop_requested"` and `evidence_class="console_host_service_lifecycle_not_chronon"`, `chronon_id=null`. Never include token values, raw IMU JSON, arbitrary stdout/stderr or user secrets.

## Host service lifecycle

**Do not auto-install or auto-start** on an existing robot. Planned manual installer (new reviewed script, not yet present):

- Uses `systemd --user` for the Ubuntu operator account running the approved publisher; requires **no sudo** for routine start/stop.
- Resolves the existing `italiarobotica/paky-01` checkout and the exact verified `/dev/serial/by-path/...` device from the robot's existing instance configuration; refuses to guess `ttyUSB0` or choose a free serial port by enumeration.
- Preserves the private `~/.config/openrgd/imu-ingest-token` in mode `0600` and never forwards it into a browser/URL/USB packet.
- Implements a long-running publisher profile through a separately tested `--continuous` flag **or** an explicit bounded `--seconds 600` renewal contract with a new source session. Treat unmanaged external readers as `busy`, not owned.
- Should have bounded restart/backoff, health/status and clean SIGTERM (serial handle closes), stop idempotence, no `enable --now` unless the user separately chooses a start-on-boot preference.
- The rootless local broker exposes only `status`, `start`, `stop` for this one systemd unit. Its Unix socket directory is explicitly bind-mounted **read-only** into Console API (socket connect must be proven in a runtime test), with restrictive host ownership/group permissions. No host `/dev`, host process namespace, `/run/docker.sock` or privilege escalation.

## UX in Robot Live

Add controls alongside the existing `ImuPanel` (including on the `TELEMETRIA` panel for Paky-01):

```text
Paky-01   /   Periferiche   /   IMU · torso-imu-01

  PERIFERICA USB          COLLETTORE            TELEMETRIA
  ● Collegata             ● In esecuzione       ● LIVE · 103 ms

  [ Ferma acquisizione ]  Avvio al boot: DISATTIVO

  Assi del sensore non calibrati · nessun controllo motori
```

- Only render controls for the allowlisted **physical** robot `paky-01`, never simulated robots or unspecified peripherals.
- Buttons show `Avvia acquisizione` or `Ferma acquisizione`, with pending and clear error states. They do **not** say `Spegni IMU`: the USB sensor remains electrically powered.
- Keep a visible `Apri Input Lab / Chronoscope` information link only when implemented; no promise that the Console manages the Pico process.
- If acquisition stops, Console IMU turns stale after its **3s** TTL; Chronoscope Pulse marks the last sample stale after its **800ms** visual threshold (or `N/A` after CDC reset). Status must not remain green.
- Explicitly distinguish *publisher user service*, *physical USB device*, *Console data freshness*, and *Pulse subscriber*; a stop of the publisher does not necessarily stop an already-open Pulse bridge process.

## Security / deployment prerequisites and acceptance gates

1. **Local installation diff:** current `~/openrgd/repos/openrgd-console` may have IMU overlay/hotfixes after the version published in GitHub. Check `git status` and source hashes first; never `git reset --hard` or overwrite local `.env`, `config/`, data volumes.
2. **Read-only preflight:** verify actual sensor by-path identity, publisher status, token file mode (without printing token), current Console `GET /api/v1/robots/paky-01/imu`, Docker gateway binding and rootless host `systemd --user` availability.
3. **Host service test:** separate stop/start/status unit, duplicate start idempotence, no second serial open; manual publisher already running must give `busy` without killing it.
4. **Endpoint safety:** unknown robot/method/body/service → 4xx, missing socket/broker → explicit unavailable, same-origin/header gate, no arbitrary shell/process execution; no caller can request motor or actuator actions.
5. **UI test:** Robot Live physical Paky-01 button displays actual service state, never optimistic connected/healthy; service on with no packets → `running` + `no_source`; USB unplug → `failed` or `missing`; stop → `stopped` + `stale/no_source`.
6. **Pico regression:** `PULSE/IMU-1` K3 values eventually stale on stop, but existing `PULSE/1` synthetic 20/20 and 100/100 ACK, 4 skins and Color Lab remain unchanged.
7. **Rollback:** stopping the managed service is safe; removing the optional API/broker/socket mount restores today's manual publisher workflows and Docker state without volume loss.

**Current branch is deliberately an RFC, not a working on/off toggle.** Implement behind `CONSOLE_IMU_PUBLISHER_CONTROL_ENABLED=false` by default, in one small host service/broker wave followed by API/UI and physical commissioning. Never present unimplemented controls as active.
