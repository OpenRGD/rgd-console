#!/usr/bin/env python3
"""Opt-in, read-only Voice Lab diagnostic export for a manual Console preview.

This script runs on the user's Ubuntu host. It never sends credentials, audio,
transcripts, hostname, executable paths or raw device identifiers to Console.
It uses literal 127.0.0.1:8765 and writes only to an explicitly chosen file.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from http.client import HTTPConnection
import json
import os
from pathlib import Path
import re
import tempfile

SCHEMA = "console.voice-readiness.v0.1-candidate"
MAX_REPLY = 32768
ROBOT_RE = re.compile(r"[a-z0-9][a-z0-9-]{0,63}\Z")


def _get_json(path: str) -> dict:
    if path not in ("/api/health", "/api/devices"):
        raise ValueError("Disallowed Voice Lab endpoint")
    conn = HTTPConnection("127.0.0.1", 8765, timeout=2)
    try:
        conn.request("GET", path, headers={"Host": "127.0.0.1:8765", "Accept": "application/json"})
        response = conn.getresponse()
        if response.status != 200:
            raise ValueError("Voice Lab did not return HTTP 200")
        raw = response.read(MAX_REPLY + 1)
        if len(raw) > MAX_REPLY:
            raise ValueError("Oversized Voice Lab response")
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("Voice Lab response is not an object")
        return data
    finally:
        conn.close()


def _count_devices(devices: dict | None, key: str) -> int | None:
    if not isinstance(devices, dict):
        return None
    value = devices.get(key)
    return len(value) if isinstance(value, list) and len(value) <= 64 and all(isinstance(x, str) for x in value) else None


def _count_ready(value: object) -> int | None:
    return value if type(value) is int and 0 <= value <= 100 else None


def build_report(robot_id: str, health: dict | None, devices: dict | None, now: str) -> dict:
    if not ROBOT_RE.fullmatch(robot_id):
        raise ValueError("Robot ID non valido")
    version = health.get("version") if isinstance(health, dict) else None
    reachable = isinstance(version, str) and bool(re.fullmatch(r"[0-9]+[.][0-9]+[.][0-9]+", version))
    audio = health.get("audio") if reachable else None
    piper = health.get("piper_runtime") if reachable else None
    piper_loaded = piper.get("loaded") if isinstance(piper, dict) else None

    return {
        "schema_version": SCHEMA,
        "robot_id": robot_id,
        "generated_at_utc": now,
        "source_kind": "manual_localhost_probe",
        "service_reachable": bool(reachable),
        "voice_lab_version": version if reachable else None,
        "audio_available": audio if type(audio) is bool else None,
        "input_device_count": _count_devices(devices, "sources") if reachable else None,
        "output_device_count": _count_devices(devices, "sinks") if reachable else None,
        "ready_local_models": _count_ready(health.get("ready_local")) if reachable else None,
        "ready_cloud_models": _count_ready(health.get("connected_cloud")) if reachable else None,
        "piper_model_loaded": piper_loaded if type(piper_loaded) is bool else None,
        "live_connection": False,
        "non_actuating": True,
    }


def export_file(target: Path, report: dict) -> None:
    target = target.expanduser()
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(target.parent, 0o700) if not target.parent.exists() else None
    fd, temp = tempfile.mkstemp(prefix=".voice-readiness-", suffix=".tmp", dir=str(target.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temp, 0o600)
        os.replace(temp, target)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def main() -> int:
    parser = argparse.ArgumentParser(description="Export sanitized read-only Voice Lab status for manual Console import")
    parser.add_argument("--robot-id", required=True)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    if not ROBOT_RE.fullmatch(args.robot_id):
        parser.error("Invalid robot ID")
    os.umask(0o077)
    try:
        health = _get_json("/api/health")
    except (OSError, ValueError):
        health = None
    try:
        devices = _get_json("/api/devices") if health is not None else None
    except (OSError, ValueError):
        devices = None

    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    report = build_report(args.robot_id, health, devices, now)
    export_file(args.out, report)
    label = "report host osservato" if report["service_reachable"] else "nessun Voice Lab verificato"
    print("Voice readiness: " + label + "; file locale creato (nessun dato audio o segreto).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
