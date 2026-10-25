#!/usr/bin/env python3
"""OpenRGD Console passive host snapshot v1.

Reads ordinary Linux file metadata only. Does not open devices, scan buses,
connect to controllers, load drivers, change permissions or execute commands.
The resulting JSON is operator-supplied UNVERIFIED context, not device proof.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import platform
import re

SCHEMA_VERSION = "console.host-inventory.v1"
COLLECTION_METHOD = "passive_file_metadata_v1"
MAX_ENTRIES = 128


def read_trimmed(path: Path, default: str = "unknown", limit: int = 160) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace").strip()[:limit] or default
    except (OSError, UnicodeError):
        return default


def read_os_release(path: Path) -> tuple[str, str]:
    try:
        rows = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return "unknown", "unknown"
    values: dict[str, str] = {}
    for row in rows:
        if "=" not in row or row.lstrip().startswith("#"):
            continue
        k, v = row.split("=", 1)
        if k in ("ID", "PRETTY_NAME"):
            values[k] = v.strip().strip('"').strip("'")
    return values.get("ID", "unknown")[:80], values.get("PRETTY_NAME", "unknown")[:160]


def detect_interfaces(sys_net: Path, dev_root: Path) -> list[dict[str, str]]:
    """Only names and existence/operstate; no device handle is opened."""
    found: list[dict[str, str]] = []
    try:
        net_nodes = sorted(sys_net.iterdir(), key=lambda p: p.name)
    except OSError:
        net_nodes = []
    for node in net_nodes:
        # ARPHRD_CAN = 280. Do not rely on interface name or interrogate CAN.
        if read_trimmed(node / "type") != "280":
            continue
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", node.name):
            continue
        found.append({
            "id": f"can-{node.name}", "category": "can_interface",
            "endpoint": node.name,
            "state": read_trimmed(node / "operstate", "unknown", 48),
            "evidence_source": "linux_sysfs",
        })
    for pattern, category in (("ttyACM*", "serial_endpoint"), ("ttyUSB*", "serial_endpoint"),
                              ("video[0-9]*", "video_endpoint")):
        for node in sorted(dev_root.glob(pattern), key=lambda p: p.name):
            if not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", node.name):
                continue
            # os.path.lexists includes existing symlinks without opening them.
            if not os.path.lexists(node):
                continue
            found.append({
                "id": f"{category}-{node.name}", "category": category,
                "endpoint": f"/dev/{node.name}", "state": "present_not_probed",
                "evidence_source": "linux_devfs_metadata",
            })
    # Deterministic ordering, bounded result; duplicate target names are eliminated.
    deduped: dict[tuple[str, str], dict[str, str]] = {}
    for row in found:
        deduped[(row["category"], row["endpoint"])] = row
    return sorted(deduped.values(), key=lambda item: (item["category"], item["endpoint"]))[:MAX_ENTRIES]


def collect_snapshot(sys_net: Path = Path("/sys/class/net"),
                     dev_root: Path = Path("/dev"),
                     os_release: Path = Path("/etc/os-release")) -> dict:
    os_id, pretty_name = read_os_release(os_release)
    return {
        "schema_version": SCHEMA_VERSION,
        "collection_method": COLLECTION_METHOD,
        "collected_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "platform": {
            "os_id": os_id,
            "pretty_name": pretty_name,
            "architecture": platform.machine() or "unknown",
            "kernel_release": platform.release() or "unknown",
        },
        "interfaces": detect_interfaces(sys_net, dev_root),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture passive Linux host metadata; NO device probing")
    parser.add_argument("--output", default="openrgd-host-report.json", help="JSON path to write (overwrite only when explicitly run)")
    args = parser.parse_args()
    output = Path(args.output)
    if output.is_symlink():
        parser.error("refusing symlink destination")
    payload = collect_snapshot()
    output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Host snapshot saved: {output} ({len(payload['interfaces'])} interface names)")
    print("UNVERIFIED operator-supplied inventory — no physical handshake, CAN commands or motor movement.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
