"""Offline cross-repo test: actual pinned RI store/ref, synthetic IMU fixture.

No physical source is claimed by the test. No sensor/Console/WS is contacted.
"""
import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ri_periph_compat import correlate

RI_CHECKOUT = os.environ.get("RI_CHECKOUT")
ROOT = Path(__file__).resolve().parents[2]


def fixtures():
    original = {
        "schema_version": "openrgd.imu-sample.v0.1-candidate",
        "robot_id": "paky-01", "sensor_id": "torso-imu-01",
        "source_id": "paky01-wit-serial", "sensor_frame_id": "paky01_imu_sensor_unverified",
        "session_id": "a" * 32, "sequence": 7,
        "host_receive_utc": "2026-11-25T10:00:00Z", "host_monotonic_ns": 123456789,
        "acceleration_m_s2": [0.0, 0.1, 9.81],
        "angular_velocity_rad_s": [0.01, 0.0, 0.0],
        "orientation_euler_deg": [1.0, 2.0, -150.0],
        "temperature_c": None, "calibration_revision": None,
    }
    boot = "bc7e69f1-4482-4bfc-8bf9-615f56cf31b0"
    common = {
        "reference_frame": "imu_sensor_axes_unverified",
        "heading_calibrated": False, "decision_eligible": False,
        "observation_only": True, "calibration_revision": None,
    }
    console = dict(original, **{
        **common, "schema_version": "console.imu.v0.1-candidate",
        "source_kind": "physical", "console_received_at": "2026-11-25T10:00:00.010Z",
        "time_quality": "host_receive_only_not_chronograph", "motion_hint": "low_angular_rate",
    })
    row = {
        "schema_ref_str": "urn:openrgd:experimental:reality-ingress:source-sample:v0",
        "producer_str": "synthetic-conformance-fixture-not-a-real-publisher",
        "source": {
            "source_id_str": original["source_id"], "modality_str": "imu",
            "reference_frame_id_str": original["sensor_frame_id"],
            "sample_sequence_uint": original["sequence"],
            "session_id_str": original["session_id"],
        },
        "temporal_binding": {
            "received_monotonic_ns": original["host_monotonic_ns"],
            "received_unix_estimate_ns": 1795600800000000000,
            "host_wall_pair_span_ns": 100,
            "clock_domain_ref": {
                "clock_domain_id_str": "chronos.monotonic.boot:" + boot,
                "clock_kind_enum_str": "MONOTONIC", "boot_id_str": boot,
                "layer_enum_str": "CHRONOS", "epoch_ref_str": "linux-boot:" + boot,
                "timescale_enum_str": "MONOTONIC",
            },
            "receive_timestamp_method": "synthetic_fixture",
            "source_time": None, "source_time_status_str": "UNKNOWN_NOT_EXPOSED_BY_SOURCE",
        },
        "payload": dict(common, console_ingest_sample=original,
            console_delivery_status="accepted_http_202", source_kind_claim="physical",
            source_verified=False, robot_binding_verified=False, quality="unverified",
            history_committed=False, actuation_enabled=False),
    }
    return console, row


@unittest.skipUnless(RI_CHECKOUT, "pinned RI checkout is required for cross-repo tests")
class Compatibility(unittest.TestCase):
    def setUp(self):
        from reality_ingress.evidence import EvidenceStore
        from reality_ingress.generic import record_sample
        from reality_ingress.consumer_ref import verified_ref_from_store
        from jsonschema import Draft202012Validator
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.console, self.row = fixtures()
        self.store = EvidenceStore(Path(self.temp.name) / "store")
        envelope, created = record_sample(self.store, self.row)
        self.assertTrue(created)
        self.ref = verified_ref_from_store(self.store, envelope["observation_id_str"])
        self.payload_path = self.store.root / envelope["evidence"]["payload_ref_str"]
        self.raw = self.payload_path.read_bytes()
        # Use exact schemas; do not maintain an RI schema fork in Console.
        for root, path, obj in [
            (ROOT, "contracts/console/v1/imu-observation.v0.1.schema.json", self.console),
            (Path(RI_CHECKOUT), "contracts/consumer-observation-ref.v0.1-candidate.schema.json", self.ref),
        ]:
            schema = json.loads((root / path).read_text())
            Draft202012Validator.check_schema(schema)
            Draft202012Validator(schema).validate(obj)

    def test_actual_ri_store_ref_correlates_without_claiming_authority(self):
        result = correlate(self.console, self.ref, self.raw)
        self.assertTrue(result["matched"], result)
        self.assertEqual(result["observation_id"], self.ref["observation_id"])
        self.assertFalse(result["source_verified"])
        self.assertFalse(result["console_boot_verified"])
        self.assertFalse(result["history_committed"])
        self.assertFalse(result["actuation_enabled"])
        self.assertNotIn("session_id", self.ref)
        self.assertNotIn("payload", result)
        self.assertNotIn("live", result)
        self.assertNotIn("source_time", result)

    def test_same_sequence_different_session_or_source_time_never_matches(self):
        for field, value in [("session_id", "b" * 32),
                             ("host_monotonic_ns", 123456790),
                             ("source_id", "different"), ("sequence", 8),
                             ("orientation_euler_deg", [1.0, 2.0, -149.0])]:
            wrong = copy.deepcopy(self.console)
            wrong[field] = value
            self.assertFalse(correlate(wrong, self.ref, self.raw)["matched"], field)

    def test_missing_payload_mismatch_and_fake_authority_rejected(self):
        self.assertFalse(correlate(self.console, self.ref, None)["matched"])
        self.assertFalse(correlate(self.console, self.ref, self.raw + b"x")["matched"])
        for field, value in [("integrity_status", "not_verified"),
                             ("source_verified", True), ("robot_binding_verified", True),
                             ("history_committed", True), ("actuation_enabled", True),
                             ("origin_status", "source_claimed_physical")]:
            ref = dict(self.ref, **{field: value})
            self.assertFalse(correlate(self.console, ref, self.raw)["matched"], field)

    def test_boot_or_anchor_mismatch_is_not_repaired(self):
        for field, value in [("boot_id", "unknown"), ("clock_domain_id", "other-clock"),
                             ("chronograf_anchor_ref", "invented-anchor"),
                             ("received_monotonic_ns", 10)]:
            ref = copy.deepcopy(self.ref)
            ref["time"][field] = value
            self.assertFalse(correlate(self.console, ref, self.raw)["matched"], field)

    def test_tampered_store_cannot_issue_verified_reference(self):
        from reality_ingress.consumer_ref import verified_ref_from_store
        from reality_ingress.evidence import IntegrityError
        self.payload_path.write_bytes(self.raw + b"tamper")
        with self.assertRaises(IntegrityError):
            verified_ref_from_store(self.store, self.ref["observation_id"])
        self.assertFalse(correlate(self.console, self.ref, self.payload_path.read_bytes())["matched"])

    def test_no_ri_ref_is_not_a_live_telemetry_or_lifecycle_failure(self):
        before = copy.deepcopy(self.console)
        self.assertFalse(correlate(self.console, None, None)["matched"])
        self.assertEqual(before, self.console)
        # No status conversion; existing Console/Pulse TTLs remain their owners' policy.


if __name__ == "__main__":
    unittest.main(verbosity=2)
