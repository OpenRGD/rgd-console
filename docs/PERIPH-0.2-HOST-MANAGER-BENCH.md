# PERIPH-0.2 — Rootless Peripheral Host Manager: Paky-01 IMU pilot

**Status (25 October 2026):** generic host broker, installer, local CLI, opt-in `systemd --user` units and offline tests **implemented in source**, with separate Paky-01 continuous publisher source candidate. **Nothing is installed, started, enabled or tested on the physical Ubuntu mini-PC**. Do not claim an on/off button in the Console; that is PERIPH-0.3.

The four public candidate Console contracts are in `contracts/console/v1/peripheral-{descriptor,status,action,action-result}.v0.1-candidate.schema.json`. This wave introduces an additional **private, local host-broker protocol** under `peripheral-host-{request,response,allowlist}.v0.1-candidate.schema.json`, never an arbitrary host command interface.

## Boundary

```text
Operator's Ubuntu session (owner of serial reader)
  +-- systemd --user "openrgd-peripheral-broker.service"
  |     +-- private AF_UNIX socket: $XDG_RUNTIME_DIR/openrgd/peripherals.sock
  |     +-- permissions: parent 0700, socket 0600, same UID (SO_PEERCRED)
  |     +-- rootless fixed allowlist 0600 under ~/.config/openrgd/peripherals/
  |     +-- read-only systemctl show / udevadm info (NO IMU serial open)
  |     +-- explicit start/stop only on allowlisted IMU service
  |
  +-- systemd --user "openrgd-paky01-imu.service"
        +-- existing scripts/imu_publish.py --continuous
        +-- exact tested CH340 by-path, 9600, exclusive=True
        +-- private publisher token file, POST localhost to Console
        +-- SIGTERM gracefully closes serial via Python context manager
        +-- no CAN, motor, power or calibration commands

Console Docker API (UID10001) DOES NOT CONNECT to this v0.2 socket.
First review an explicit local operator authorization and Unix socket
peer delegation before PERIPH-0.3 API/UI buttons; same-origin CSRF alone
is NOT authentication. No /dev, Docker socket or privileged host mount.
Pulse/Chronoscope merely subscribes to Console's existing read-only
WebSocket; it does not own the physical WIT/CH340 port.
```

The broker remains *peripheral-category agnostic in lifecycle policy*, but its **first physical discovery adapter is usb_serial only**, matching the IMU. A future V4L2 camera or ALSA/PipeWire microphone will need its own validated identity/probe and explicit privacy/consent gate before it can be placed in the service allowlist. Do not infer camera readiness from the current IMU udevadm check.

## Actual source evidence

- `italiarobotica/paky-01`, `feat/imu-console-bridge`, original `scripts/imu_publish.py`: exclusive `serial.Serial(args.port, args.baud, timeout=0.2, exclusive=True)`; default `--seconds 60`, strict 1..600, bounded source aggregation, token-protected POST to 127.0.0.1:8088; NO indefinite mode before this wave.
- `italiarobotica/paky-01/parameters/imu_instance.json`: operator-reported WIT/CH340 (USB VID:PID `1a86:7523`), exact candidate `/dev/serial/by-path/pci-0000:00:14.0-usb-0:2.4:1.0-port0`, baud **9600**, torso transform **UNVERIFIED**. These are source records, **not a fresh Ubuntu hardware probe**.
- `italiarobotica/paky-01`, **new** `feat/periph-0.2-imu-managed-publisher`: adds opt-in `--continuous` (never default), mutual exclusion with `--seconds`, graceful SIGTERM, no changes to WIT decoder, data schema, endpoint, token or sensor writes. Offline tests mock serial and signal safely.
- `OpenRGD/rgd-console`, **new** `feat/periph-0.2-host-manager`: broker, client, source-only installer and isolated CI. This source branch **stacks on** `feat/imu-publisher-host-control-design` and has NOT been merged into the running Console.

## Installation policy

**Never switch the deployed `~/openrgd/repos/openrgd-console` to an older GitHub branch blindly.** The mini-PC may contain unpublished Console v0.5 IMU overlay and anti-replay fixes. First run read-only `git status` and `sha256sum` on its live source. Keep deployed Docker services, `config/`, `.env`, imported models, volumes, token, Boot Manager and Calibrations untouched.

Safest initial method: create **separate durable clones** to test the host scripts without touching existing deployed checkouts. Commands to run on Ubuntu (not run automatically by this PR):

```bash
mkdir -p ~/openrgd/worktrees
gh repo clone OpenRGD/rgd-console ~/openrgd/worktrees/rgd-console-periph02 -- \
    --branch feat/periph-0.2-host-manager
gh repo clone italiarobotica/paky-01 ~/openrgd/worktrees/paky-01-periph02 -- \
    --branch feat/periph-0.2-imu-managed-publisher
```

**First, read-only preflight** (does not open IMU USB or change `systemd`):
```bash
cd ~/openrgd/worktrees/rgd-console-periph02
python3 services/peripheral-manager/install_paky01_imu.py \
    --console-repo ~/openrgd/worktrees/rgd-console-periph02 \
    --paky-repo ~/openrgd/worktrees/paky-01-periph02
```

Preflight verifies robot IMU schema/identity, both script paths, opt-in `--continuous` support, configured by-path/VID:PID/9600, user-owned **0600 token metadata** (secret NOT printed), and user HOME confinement. It also checks that the explicitly selected Python interpreter can `import serial`, **without opening the device**. This does **not** claim the actual USB is connected.

**If the default `/usr/bin/python3` lacks `pyserial`:** use the same reviewed virtual environment that currently runs the physical publisher and explicitly provide `--python-bin /home/<operator>/<verified-venv>/bin/python` to both preflight and install commands. The installer does not install dependencies globally or guess another Python executable. To locate the interpreter **inside that already activated environment**, run `python3 -c 'import sys,serial; print(sys.executable)'`. Use that exact path; do not pass a shell command or options through `--python-bin`.

Optional additional *read-only* host checks:
```bash
echo '=== HOST SESSION ==='
id -u
systemctl --user is-system-running || true
echo '=== PHYSICAL SERIAL IDENTITY (READ ONLY) ==='
IMU_PORT='/dev/serial/by-path/pci-0000:00:14.0-usb-0:2.4:1.0-port0'
ls -l "$IMU_PORT"
udevadm info --query=property --name="$IMU_PORT" | grep -E '^ID_(VENDOR_ID|MODEL_ID)='
echo '=== EXISTING MANAGED UNIT (NO CHANGE) ==='
systemctl --user show openrgd-paky01-imu.service --property=LoadState,ActiveState --no-pager
echo '=== OLD MANUAL READER CHECK (NO SIGNALS) ==='
pgrep -af 'imu_publish.py' || true
echo '=== CONSOLE READ-ONLY IMU ==='
curl -fsS --max-time 3 http://127.0.0.1:8088/api/v1/robots/paky-01/imu \
    | python3 -m json.tool
```

**DO NOT INSTALL until the operator has finished a previously started manual publisher session.** The installer will never stop or kill it. If a manual reader holds the serial, the managed user service must fail its exclusive acquisition rather than stealing the port.

After reviewing preflight and ensuring no unrelated publisher is running, an explicit **operator installation action** (NOT performed in this change) is:

```bash
python3 services/peripheral-manager/install_paky01_imu.py \
    --console-repo ~/openrgd/worktrees/rgd-console-periph02 \
    --paky-repo ~/openrgd/worktrees/paky-01-periph02 \
    --install --confirm 'INSTALL PAKY01 IMU'\n# If preflight required a venv, repeat the identical --python-bin argument here.
```

This creates **only**:
- `~/.config/openrgd/peripherals/allowlist.json` mode `0600`, containing **exactly** the Paky-01 IMU service + by-path + VID/PID + lock identity (no token).
- `~/.config/systemd/user/openrgd-paky01-imu.service`.
- `~/.config/systemd/user/openrgd-peripheral-broker.service`.

It calls `systemctl --user daemon-reload` but **does not start/enable** either unit and never changes Docker Compose, host `.env` or hardware. Refuses to overwrite any existing unit/config.

## Manual host commissioning (a separate user action)

After explicit installation and no manual serial publisher:

```bash
systemctl --user start openrgd-peripheral-broker.service
python3 services/peripheral-manager/control_cli.py status
```

An initial status with IMU connected and publisher stopped should show `device.presence="present"`, `device.binding_verified=true`, `publisher.lifecycle="stopped"`. If `manager_available=false`, `device=unknown`, or binding is not verified, **do not start** until the specific device by-path and VID/PID are resolved.

Only if preflight and read-only status are correct, the operator may deliberately start:

```bash
python3 services/peripheral-manager/control_cli.py start \
    --confirm 'START paky-01/torso-imu-01'
```

Re-run `status` and the established Console IMU GET, then verify actual `LIVE` observations. **`publisher.lifecycle=running` alone is not LIVE**.

Cleanly stop (no `pkill`, no `killall`, no motor command):

```bash
python3 services/peripheral-manager/control_cli.py stop \
    --confirm 'STOP paky-01/torso-imu-01'
```

The unit sends SIGTERM to `imu_publish.py` and its Python serial context manager closes the exclusive file handle. Repeat start/stop safely and test `status` for missing/busy hardware. Existing Console IMU latest should expire after **3s**; Pulse K3 (when USB live bridge is connected) becomes STALE after **800ms**.

**Do not use `systemctl --user enable` or `loginctl enable-linger` in this wave.** Whether the IMU acquires automatically at user login/host boot is a separate explicit policy decision. The sensor still receives electrical 5V USB power while acquisition is stopped.

## Private broker API semantics (NOT browser/public)

One JSON object plus newline over the authenticated same-UID **Unix socket** `$XDG_RUNTIME_DIR/openrgd/peripherals.sock`, using 0700 parent, 0600 socket and Linux SO_PEERCRED. Current broker refuses connecting UID != host broker UID; Docker UID10001 is deliberately excluded until a reviewed PERIPH-0.3 delegation.

Allowed request:
```json
{"schema_version":"openrgd.peripheral-host-request.v0.1-candidate",
 "request_id":"2bd48625-77e8-4a4b-ab5c-c910f0de2411",
 "robot_id":"paky-01","peripheral_id":"torso-imu-01",
 "action":"acquisition.start","expected_status_revision":1}
```

`status` omits `expected_status_revision`. This host wire is **not** the public Console `PeripheralAction`; the future Console adapter translates authenticated browser intent into this allowlisted host command. Unsupported IDs/actions, unknown fields, wrong revision or missing manager are rejected; no generic `exec`, `sudo`, raw paths or PIDs accepted. Each start/stop re-checks the current systemd state and requires verified udev VID:PID identity. Deduplication remembers recent request IDs in a bounded in-memory ledger; `systemctl start/stop` are inherently idempotent across broker restarts.

`status` returns separately sourced `device.presence`, `binding_verified`, `publisher.lifecycle`, `manager_available`, `enabled_on_boot` and `status_revision`; **it does not assert observation LIVE**. The Console itself joins accepted stream freshness from its existing IMU observation store during PERIPH-0.3.

A disconnected/absent sensor is `absent`, not "switched off". A publisher whose serial file is busy may transition to `failed`; the broker never takes ownership by killing an unmanaged reader. A systemd action that starts but then fails is **not proof of captured samples**: always read the follow-up status/Console observations.

### Security constraints to preserve in PERIPH-0.3

- Do **not** mount the entire `/run/user`, host `/dev`, docker.sock or process namespace into the Console API.
- Socket uses same-user SO_PEERCRED deliberately: an arbitrary read-only bind mount into the current Docker UID10001 will **not** work. Design a new, tested, authenticated delegated client before adding buttons to the browser.
- The Console's current same-origin `X-OpenRGD-Console` header prevents basic CSRF but is **not user authentication**. Browser start/stop controls remain gated off.
- Do not claim package signature, canonical Chronons, calibrated IMU torso axes or actuator safety. This module only owns an acquisition process.
- Generic future camera/microphone owners need vetted identity adapters and a separate privacy-consent/recording indicator contract before any new physical allowlist entry.

## Software acceptance

Targeted checks:
```bash
cd ~/openrgd/worktrees/rgd-console-periph02
python3 -m py_compile services/peripheral-manager/*.py
python3 -m unittest discover -s services/peripheral-manager/tests -p 'test_*.py' -v

cd ~/openrgd/worktrees/paky-01-periph02
python3 -m unittest discover -s tests -p 'test_imu_publish.py' -v
```

GitHub Actions `Peripheral Manager Candidate Contracts` additionally verifies the shared PERIPH-0.1 contract and generic domain tests. Paky-01 `static-audit` exercises the unchanged safety and repository validators. **These checks never touch a real IMU, service, container or motor**.

## Deployment/rollback policy

- Current running Console may have local 0.5 overlay/hotfixes beyond GitHub main; this source-only pilot is in separate worktrees. Avoid `git reset --hard`, `docker compose down -v`, or copying new source into the live Console.
- The managed user unit is not enabled on boot. To stop the pilot, explicitly request `STOP` then `systemctl --user stop openrgd-peripheral-broker.service`.
- To remove installed files, inspect `systemctl --user status` and manually remove only the three exact reviewed files, followed by `systemctl --user daemon-reload`. Do not remove `~/.config/openrgd/imu-ingest-token` or touch Docker named volumes.
- If any stage fails, the earlier manual publisher workflow remains available and untouched; do not run old manual publisher concurrently with managed service.

**Explicit physical tests remain pending:** fresh by-path and VID/PID, systemd user session and units, exclusive ownership during duplicate attempts, graceful SIGTERM, Console accepted samples, temporary USB unplug/replug, and the Chronoscope K3 LIVE→STALE smoke.
