#!/usr/bin/env python3
"""Opt-in host-only installer for the first Peripheral Manager instance.

DEFAULT = READ-ONLY preflight: never installs, starts or enables units.
--install requires exact typed operator confirmation. Installation creates
a fixed systemd --user IMU publisher and generic broker unit, plus a
restrictive allowlist. It deliberately does NOT call systemctl start/enable.
No API/Docker/container or robot-actuation side effects.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

from host_broker import ALLOWLIST_SCHEMA, read_allowlist

IMU_UNIT = "openrgd-paky01-imu.service"
BROKER_UNIT = "openrgd-peripheral-broker.service"
CONFIRM = "INSTALL PAKY01 IMU"
FIXED_ROBOT = "paky-01"
FIXED_SENSOR = "torso-imu-01"
IMU_INSTANCE_SCHEMA = "italiarobotica.paky01.imu-instance.v0.1-candidate"
# systemd percent specifiers, quotes, backslashes and spaces in generated
# executable paths could change arguments: reject rather than interpolate.
SAFE_ABSOLUTE = re.compile(r"^/[A-Za-z0-9_./-]+$")


def safe_path(value: Path) -> str:
    resolved = value.expanduser().resolve()
    text = str(resolved)
    if not SAFE_ABSOLUTE.fullmatch(text) or ".." in resolved.parts:
        raise ValueError("unsafe_systemd_exec_path")
    return text


def source_info(paky_repo: Path, console_repo: Path,
                python_bin: Path | None = None) -> dict:
    paky = paky_repo.expanduser().resolve(strict=True)
    console = console_repo.expanduser().resolve(strict=True)
    # Paths must be confined to the operator's HOME, not /tmp or root.
    home = Path.home().resolve(strict=True)
    if not paky.is_relative_to(home) or not console.is_relative_to(home):
        raise ValueError("repos_must_reside_within_operator_home")
    imu_script = paky / "scripts/imu_publish.py"
    broker_script = console / "services/peripheral-manager/host_broker.py"
    instance = paky / "parameters/imu_instance.json"
    if not all(p.is_file() and not p.is_symlink()
               for p in (imu_script, broker_script, instance)):
        raise ValueError("missing_reviewed_imu_or_broker_sources")
    if "--continuous" not in imu_script.read_text(encoding="utf-8"):
        raise ValueError("imu_script_does_not_support_managed_continuous_mode")
    data = json.loads(instance.read_text(encoding="utf-8"))
    if (data.get("schema") != IMU_INSTANCE_SCHEMA
            or data.get("robot_id") != FIXED_ROBOT
            or data.get("sensor_id") != FIXED_SENSOR
            or data.get("safety", {}).get("actuator_commands_permitted") is not False):
        raise ValueError("unexpected_imu_robot_identity_or_safety")
    host = data.get("host", {})
    device = host.get("port_by_path")
    vidpid = host.get("device_usb_vid_pid")
    baud = host.get("baud_observed")
    if (not isinstance(device, str) or not device.startswith("/dev/serial/by-path/")
            or not re.fullmatch(r"/dev/serial/by-path/[A-Za-z0-9_.:-]+", device)
            or not re.fullmatch(r"[0-9a-f]{4}:[0-9a-f]{4}", str(vidpid))
            or baud != 9600):
        raise ValueError("unverified_imu_device_instance")
    # A venv's bin/python is usually a symlink: preserve that pathname
    # rather than resolve() to /usr/bin/python3 (which would lose its venv).
    chosen_python = python_bin or Path("/usr/bin/python3")
    chosen_python = chosen_python.expanduser().absolute()
    if not chosen_python.is_file() or not os.access(chosen_python, os.X_OK):
        raise ValueError("imu_python_interpreter_not_executable")
    if (not SAFE_ABSOLUTE.fullmatch(str(chosen_python))
            or not (chosen_python == Path("/usr/bin/python3")
                    or chosen_python.is_relative_to(home))):
        raise ValueError("imu_python_interpreter_outside_allowlist")
    secret = home / ".config/openrgd/imu-ingest-token"
    if secret.is_symlink() or not secret.exists():
        raise ValueError("publisher_token_missing")
    mode = secret.stat()
    if not stat.S_ISREG(mode.st_mode) or mode.st_uid != os.getuid() or mode.st_mode & 0o077:
        raise ValueError("publisher_token_permissions_invalid")
    return {
        "imu_script": safe_path(imu_script),
        "broker_script": safe_path(broker_script),
        "baud": int(baud),
        "python_bin": str(chosen_python),
        "device": device,
        "vidpid": vidpid,
    }


def render_imu_unit(info: dict) -> str:
    return f"""# OpenRGD managed publisher / Paky-01 WIT sensor axes ONLY.
# Installation does NOT enable/start the unit.
[Unit]
Description=OpenRGD Paky-01 read-only IMU observation publisher
StartLimitIntervalSec=60
StartLimitBurst=3
[Service]
Type=simple
ExecStart={info['python_bin']} {info['imu_script']} --port {info['device']} --baud {info['baud']} --robot-id paky-01 --sensor-id torso-imu-01 --continuous --token-file %h/.config/openrgd/imu-ingest-token
Restart=on-failure
RestartSec=4
TimeoutStopSec=5
KillSignal=SIGTERM
UMask=0077
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=read-only
[Install]
WantedBy=default.target
"""


def render_broker_unit(info: dict) -> str:
    return f"""# Generic rootless broker; current allowlist grants only Paky-01 IMU.
# Installation does NOT enable/start the unit.
[Unit]
Description=OpenRGD Peripheral Host Manager (same-UID Unix socket)
[Service]
Type=simple
ExecStart=/usr/bin/python3 {info['broker_script']} --allowlist %h/.config/openrgd/peripherals/allowlist.json --serve
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=read-only
[Install]
WantedBy=default.target
"""


def render_allowlist(info: dict) -> str:
    return json.dumps({
        "schema_version": ALLOWLIST_SCHEMA,
        "services": [{
            "robot_id": FIXED_ROBOT,
            "peripheral_id": FIXED_SENSOR,
            "service_ref": IMU_UNIT,
            "device_by_path": info["device"],
            "usb_vid_pid": info["vidpid"],
            "resource_lock": "paky01:imu_serial_exclusive",
        }],
    }, indent=2) + "\n"


def safe_write_new(path: Path, text: str, mode: int) -> None:
    """Write only to a non-existent file; never overwrite operator files."""
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    path.chmod(mode)


def install(info: dict, home: Path, runner=subprocess.run) -> list[Path]:
    unit_dir = home / ".config/systemd/user"
    conf_dir = home / ".config/openrgd/peripherals"
    plans = [
        (conf_dir / "allowlist.json", render_allowlist(info), 0o600),
        (unit_dir / IMU_UNIT, render_imu_unit(info), 0o644),
        (unit_dir / BROKER_UNIT, render_broker_unit(info), 0o644),
    ]
    if any(path.exists() or path.is_symlink() for path, _, _ in plans):
        raise ValueError("existing_config_or_unit_refusing_overwrite")
    for directory in (conf_dir, unit_dir):
        if directory.exists() and directory.is_symlink():
            raise ValueError("symlink_directory_forbidden")
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        if directory.stat().st_uid != os.getuid():
            raise ValueError("installation_directory_wrong_owner")
    created = []
    try:
        for path, contents, mode in plans:
            safe_write_new(path, contents, mode)
            created.append(path)
        read_allowlist(plans[0][0])
        process = runner(["/usr/bin/systemctl", "--user", "daemon-reload"],
                         capture_output=True, text=True, timeout=5, check=False)
        if process.returncode != 0:
            raise ValueError("systemd_user_reload_failed")
    except BaseException:
        for path in reversed(created):
            path.unlink(missing_ok=True)
        raise
    return created


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--paky-repo", type=Path,
                        default=Path.home() / "openrgd/repos/paky-01")
    parser.add_argument("--console-repo", type=Path,
                        default=Path.home() / "openrgd/repos/openrgd-console")
    parser.add_argument("--python-bin", type=Path, default=Path("/usr/bin/python3"),
                        help="Verified Python executable with pyserial (venv path supported)")
    parser.add_argument("--install", action="store_true",
                        help="Explicitly write systemd user units and allowlist; no start/enable")
    parser.add_argument("--confirm", default="")
    args = parser.parse_args(argv)
    info = source_info(args.paky_repo, args.console_repo, args.python_bin)
    # Execute exactly the selected interpreter with a fixed import-only
    # preflight, never the publisher (no device or HTTP operations here).
    check = subprocess.run([info["python_bin"], "-c", "import serial"],
                           capture_output=True, text=True, timeout=5, check=False)
    if check.returncode != 0:
        raise ValueError("pyserial_missing_for_selected_interpreter")
    print("PERIPH-0.2 preflight: Paky-01 IMU identity, pyserial and private token metadata OK")
    print("Device binding: configured by-path and VID:PID from robot instance (not freshly probed)")
    print("No hardware opens, USB capture, Console POST or motors touched.")
    if not args.install:
        print("READ ONLY: no service installed, started or enabled")
        return 0
    if args.confirm != CONFIRM:
        parser.error(f"--install requires --confirm '{CONFIRM}'")
    created = install(info, Path.home())
    print("INSTALL READY (not started, not enabled):")
    for path in created:
        print(path)
    print("Next: manually inspect systemctl --user status and start only after stopping any old manual IMU publisher.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, json.JSONDecodeError, subprocess.TimeoutExpired) as exc:
        # Fixed internal error labels are safe to show; never output a
        # subprocess stderr, publisher token or raw file content.
        reason = str(exc) if isinstance(exc, ValueError) and re.fullmatch(
            r"[a-z][a-z0-9_]{1,80}", str(exc)) else type(exc).__name__
        print(f"PERIPH-0.2 install/preflight stopped: {reason}", file=sys.stderr)
        sys.exit(1)
