"""Offline invariants for the opt-in Voice Console diagnostics reporter."""
import json
import unittest
from http.client import HTTPException, IncompleteRead
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import MagicMock, patch

from voice_status_export import build_report, _count_devices, _get_json, _probe, export_file, MAX_REPLY


class VoiceStatusTests(unittest.TestCase):
    def setUp(self):
        self.now = "2026-11-22T09:00:00Z"

    def test_redacts_hostnames_paths_devices_and_secrets(self):
        health = {
            "version": "0.3.1", "audio": True, "ready_local": 3,
            "connected_cloud": 2, "host": "private-minipc", "python": "/secret/python",
            "credentials": {"api_key": "SHOULD_NOT_LEAK"}, "piper_runtime": {
                "loaded": True, "model_filename": "private-model"
            },
        }
        devices = {"available": True, "sources": ["usb.secret.mic"], "sinks": ["bluez.private.sink"]}
        r = build_report("paky-01", health, devices, self.now)
        self.assertTrue(r["service_reachable"])
        self.assertEqual(r["input_device_count"], 1)
        self.assertEqual(r["output_device_count"], 1)
        serialized = json.dumps(r)
        for token in ("private-minipc", "/secret/python", "SHOULD_NOT_LEAK",
                      "usb.secret.mic", "bluez.private.sink", "private-model"):
            self.assertNotIn(token, serialized)
        self.assertFalse(r["live_connection"])
        self.assertTrue(r["non_actuating"])

    def test_missing_service_yields_unknown_not_zero(self):
        r = build_report("paky-01", None, None, self.now)
        self.assertFalse(r["service_reachable"])
        for key in ("voice_lab_version", "audio_available", "input_device_count",
                    "output_device_count", "ready_local_models",
                    "ready_cloud_models", "piper_model_loaded"):
            self.assertIsNone(r[key])

    def test_malformed_fields_rejected(self):
        r = build_report("paky-01", {
            "version": "0.3.1", "audio": "true", "ready_local": True,
            "connected_cloud": -1, "piper_runtime": {"loaded": "yes"},
        }, {"sources": "raw_private_name", "sinks": [42]}, self.now)
        self.assertIsNone(r["audio_available"])
        self.assertIsNone(r["ready_local_models"])
        self.assertIsNone(r["ready_cloud_models"])
        self.assertIsNone(r["piper_model_loaded"])
        self.assertIsNone(r["input_device_count"])
        self.assertIsNone(r["output_device_count"])

    def test_device_list_is_bounded(self):
        self.assertIsNone(_count_devices({"available": True, "sources": ["s"] * 65}, "sources"))

    def test_failed_enumeration_is_unknown_not_zero(self):
        health = {"version": "0.3.1", "audio": True}
        r = build_report("paky-01", health, {"available": False, "sources": [], "sinks": []}, self.now)
        self.assertIsNone(r["input_device_count"])
        self.assertIsNone(r["output_device_count"])
        r = build_report("paky-01", health, {"available": True, "sources": [], "sinks": []}, self.now)
        self.assertEqual(r["input_device_count"], 0)
        self.assertEqual(r["output_device_count"], 0)
        r = build_report("paky-01", dict(health, audio=False), {"available": True, "sources": ["x"], "sinks": ["y"]}, self.now)
        self.assertIsNone(r["input_device_count"])
        self.assertIsNone(r["output_device_count"])

    def test_version_and_robot_are_bounded(self):
        for version in ("0.3.1\n", "9" * 50 + ".1.1", "1.2.3-secret"):
            self.assertFalse(build_report("paky-01", {"version": version}, None, self.now)["service_reachable"])
        with self.assertRaises(ValueError):
            build_report("paky-01\n", None, None, self.now)

    def test_http_uses_only_fixed_loopback_and_allowed_get(self):
        with patch("voice_status_export.HTTPConnection") as connect:
            conn = connect.return_value
            response = conn.getresponse.return_value
            response.status = 200
            response.getheader.return_value = "application/json; charset=utf-8"
            response.read.return_value = b'{"version":"0.3.1"}'
            self.assertEqual(_get_json("/api/health"), {"version": "0.3.1"})
            connect.assert_called_once_with("127.0.0.1", 8765, timeout=2)
            conn.request.assert_called_once_with("GET", "/api/health", headers={"Host":"127.0.0.1:8765","Accept":"application/json"})
            response.read.assert_called_once_with(MAX_REPLY + 1)
            conn.close.assert_called_once()
        with self.assertRaises(ValueError):
            _get_json("/api/credentials")

    def test_probe_fail_closed_on_transport_and_malformed_json(self):
        for exc in (OSError(), HTTPException(), IncompleteRead(b"x"), ValueError(), RecursionError()):
            with patch("voice_status_export._get_json", side_effect=exc):
                self.assertIsNone(_probe("/api/health"))
        with patch("voice_status_export.HTTPConnection") as connect:
            response = connect.return_value.getresponse.return_value
            response.status = 200
            response.getheader.return_value = "application/json"
            for raw in (b'{"x":1,"x":2}', b'{"x":NaN}', b'[]', b'x' * (MAX_REPLY + 1)):
                response.read.return_value = raw
                self.assertIsNone(_probe("/api/health"))
            response.status = 302
            self.assertIsNone(_probe("/api/health"))
            response.status = 200
            response.getheader.return_value = "text/html"
            self.assertIsNone(_probe("/api/health"))

    def test_file_is_private_and_replace_is_explicit(self):
        with TemporaryDirectory() as temp:
            p = Path(temp) / "report.json"
            first = build_report("paky-01", None, None, self.now)
            export_file(p, first)
            self.assertEqual(p.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(p.read_text()), first)
            second = build_report("paky-01", {"version": "0.3.1"}, None, self.now)
            export_file(p, second)
            self.assertEqual(json.loads(p.read_text()), second)
            self.assertEqual(list(Path(temp).iterdir()), [p])


if __name__ == "__main__":
    unittest.main()
