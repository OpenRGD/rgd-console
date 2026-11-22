"""Offline invariants for the opt-in Voice Console diagnostics reporter."""
import json
import unittest

from voice_status_export import build_report, _count_devices


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
        devices = {"sources": ["usb.secret.mic"], "sinks": ["bluez.private.sink"]}
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
        self.assertIsNone(_count_devices({"sources": ["s"] * 65}, "sources"))


if __name__ == "__main__":
    unittest.main()
