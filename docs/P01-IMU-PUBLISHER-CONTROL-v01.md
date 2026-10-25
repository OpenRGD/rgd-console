# First peripheral adapter: Paky-01 IMU — service-control implementation RFC

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

## Shared Peripheral Manager contracts (supersedes IMU-only URLs)

**Architectural decision (2026-10-25):** This is the **first instance** of the common [Peripheral Manager v0.1 core](PERIPHERAL-MANAGER-CORE-v01.md), not a standalone IMU service API. The originally drafted `/peripherals/imu/publisher` URLs were provisional and have not shipped; do not implement them independently.

The versioned, generic candidate contracts now live at:

- `contracts/console/v1/peripheral-descriptor.v0.1-candidate.schema.json`
- `contracts/console/v1/peripheral-status.v0.1-candidate.schema.json`
- `contracts/console/v1/peripheral-action.v0.1-candidate.schema.json`
- `contracts/console/v1/peripheral-action-result.v0.1-candidate.schema.json`

New future route shape (DESIGN ONLY):

```text
GET  /api/v1/robots/{robot_id}/peripherals
GET  /api/v1/robots/{robot_id}/peripherals/{peripheral_id}
POST /api/v1/robots/{robot_id}/peripherals/{peripheral_id}/actions
```

The existing IMU read-only observation endpoint **continues unchanged** at `GET /api/v1/robots/{id}/imu` and the established `console.v1/type=imu` WebSocket. New lifecycle control requests are restricted to `acquisition.start` and `acquisition.stop` with a unique `request_id` and an optimistic `expected_status_revision`. The Console service never accepts user-supplied host paths, PIDs, shell commands, service names or motor-related actions.

For Paky-01, `peripheral_id=torso-imu-01`, stream `imu.sensor_axes` (existing `console.imu.v0.1-candidate` schema), publisher `paky01-wit-publisher`, and a future, allowlisted host user unit `openrgd-paky01-imu.service`.

The common snapshot reports **device**, **publisher**, and **observation streams** independently. In particular, a running service does **not** prove fresh IMU data, and a connected device does **not** imply the browser may start acquisition. The host broker must supply its actual status/permissions, or the Console reports `manager_unavailable` and disables actions.

The existing local `mutation_allowed` header is CSRF mitigation only, **not authentication**; before exposing the new control mutation API to a browser, implement and test the missing operator authority gate and trusted Unix peer permissions. The actual host broker / user service / UI control are **not yet installed**.

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

**Current branch contains common candidate schemas, inert examples, pure Rust validation and two implementation RFCs — not a working on/off toggle.** Implement the generic Peripheral Manager behind an opt-in feature flag, then the reviewed IMU host-service/broker, API/UI and physical commissioning. Never present unimplemented controls as active.
