"""PERIPH-RI-01 offline compatibility helper, NOT a runtime subscriber/API.

Compare a separately captured Console IMU observation with an RI reference
and the exact bytes of the corresponding source sample, resolved by an
authorized RI-side reader. This never creates an ObservationRef, opens a
device, performs store IO, authorizes media access or determines freshness.
A match is content correlation only, not proof of provenance or storage.
"""
import hashlib
import hmac
import json
import math
import re
from uuid import UUID

REF_SCHEMA = "ri.consumer-observation-ref.v0.1-candidate"
CONSOLE_SCHEMA = "console.imu.v0.1-candidate"
SAMPLE_SCHEMA = "openrgd.imu-sample.v0.1-candidate"
RI_SAMPLE = "urn:openrgd:experimental:reality-ingress:source-sample:v0"
MEDIA_TYPE = "application/vnd.openrgd.experimental.sensor-sample+json"
MAX_BYTES = 4096  # IMU-RI-01 source export budget; not a general media limit.
SOURCE_FIELDS = (
    "robot_id", "sensor_id", "source_id", "sensor_frame_id",
    "session_id", "sequence", "host_receive_utc", "host_monotonic_ns",
    "acceleration_m_s2", "angular_velocity_rad_s", "orientation_euler_deg",
    "temperature_c", "calibration_revision",
)


def _require(condition, reason):
    if not condition:
        raise ValueError(reason)


def _no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        _require(key not in result, "duplicate_json_key")
        result[key] = value
    return result


def _bad_constant(_value):
    raise ValueError("nonfinite_json")


def _number(x):
    return type(x) in (int, float) and math.isfinite(x)


def _same(a, b):
    # JSON equality must not confuse booleans with integers.
    if type(a) is bool or type(b) is bool:
        return type(a) is type(b) and a == b
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_same(x, y) for x, y in zip(a, b))
    return a == b


def correlate(console, ref, payload_bytes):
    """Return a correlation-only summary; fail closed on an incomplete match.

    Callers must obtain the reference and authorized payload from RI itself.
    No self-asserted verified_local_hash is accepted as an authentication
    credential. This helper checks consistency, not the caller's ACL or an
    independent store attestation. No result contains a payload or local path.
    """
    try:
        return _correlate(console, ref, payload_bytes)
    except (KeyError, TypeError, ValueError, OverflowError, UnicodeError):
        # Stable diagnostic; avoid exposing observations or private paths.
        return {"matched": False, "reason": "incompatible_or_incomplete",
                "source_verified": False, "robot_binding_verified": False,
                "history_committed": False, "actuation_enabled": False}


def _correlate(console, ref, payload_bytes):
    _require(isinstance(console, dict) and isinstance(ref, dict), "shape")
    _require(console["schema_version"] == CONSOLE_SCHEMA, "console_schema")
    _require(ref["schema_version"] == REF_SCHEMA, "ri_schema")
    _require(ref["integrity_status"] == "verified_local_hash", "unverified_ref")
    _require(ref["origin_status"] == "unknown", "unexpected_origin")
    _require(ref["modality"] == "imu", "wrong_modality")
    _require(re.fullmatch(r"obs_[0-9a-f]{32}", ref["observation_id"]) is not None, "observation_id")
    _require(ref["payload_media_type"] == MEDIA_TYPE, "media_type")
    for flag in ("source_verified", "robot_binding_verified", "history_committed", "actuation_enabled"):
        _require(ref[flag] is False, "authority_claim")
    _require(type(payload_bytes) is bytes and 0 < len(payload_bytes) <= MAX_BYTES, "payload_budget")
    _require(type(ref["payload_size_bytes"]) is int and ref["payload_size_bytes"] == len(payload_bytes), "size")
    _require(re.fullmatch(r"[0-9a-f]{64}", ref["payload_sha256_hex"]) is not None, "digest_shape")
    _require(hmac.compare_digest(hashlib.sha256(payload_bytes).hexdigest(), ref["payload_sha256_hex"]), "hash")
    row = json.loads(payload_bytes, object_pairs_hook=_no_duplicates, parse_constant=_bad_constant)
    _require(row["schema_ref_str"] == RI_SAMPLE, "source_sample_schema")
    source, temporal, wrapper = row["source"], row["temporal_binding"], row["payload"]
    sample = wrapper["console_ingest_sample"]
    _require(sample["schema_version"] == SAMPLE_SCHEMA, "publisher_schema")
    _require(wrapper["console_delivery_status"] == "accepted_http_202", "producer_delivery_report")
    _require(wrapper["source_kind_claim"] == "physical", "source_claim")
    _require(wrapper["quality"] == "unverified", "quality")
    _require(console["source_kind"] == "physical", "console_source_claim")
    for document in (wrapper, console):
        _require(document["reference_frame"] == "imu_sensor_axes_unverified", "frame")
        _require(document["calibration_revision"] is None, "calibration")
        _require(document["heading_calibrated"] is False and document["decision_eligible"] is False
                 and document["observation_only"] is True, "measurement_authority")
    for flag in ("source_verified", "robot_binding_verified", "history_committed", "actuation_enabled"):
        _require(wrapper[flag] is False, "source_authority_claim")
    _require(console["time_quality"] == "host_receive_only_not_chronograph", "time_quality")
    _require(sample["robot_id"] == "paky-01" and sample["sensor_id"] == "torso-imu-01"
             and sample["source_id"] == "paky01-wit-serial"
             and sample["sensor_frame_id"] == "paky01_imu_sensor_unverified", "pilot_scope")
    _require(re.fullmatch(r"[0-9a-f]{32}", sample["session_id"]) is not None
             and sample["session_id"] != "0" * 32, "session")
    for name in ("sequence", "host_monotonic_ns"):
        _require(type(sample[name]) is int and sample[name] > 0
                 and type(console[name]) is int, "sequence_or_time")
    for name in ("acceleration_m_s2", "angular_velocity_rad_s", "orientation_euler_deg"):
        for obj in (sample, console):
            _require(isinstance(obj[name], list) and len(obj[name]) == 3
                     and all(_number(v) for v in obj[name]), "vector")
    for obj in (sample, console):
        _require(obj["temperature_c"] is None or _number(obj["temperature_c"]), "temperature")
    for name in SOURCE_FIELDS:
        _require(_same(sample[name], console[name]), "source_sample_mismatch")

    # A compact ObservationRef does not contain session_id. Never join on
    # source_id/sequence alone: the resolved, hash-checked row supplies it.
    _require(source["source_id_str"] == sample["source_id"] == ref["source_id"], "source_id")
    _require(source["reference_frame_id_str"] == sample["sensor_frame_id"] == ref["reference_frame_id"], "native_frame")
    _require(source["modality_str"] == "imu", "source_modality")
    _require(source["session_id_str"] == sample["session_id"], "source_session")
    _require(type(source["sample_sequence_uint"]) is int
             and type(ref["sample_sequence"]) is int
             and source["sample_sequence_uint"] == sample["sequence"] == ref["sample_sequence"], "source_sequence")

    time, domain = ref["time"], temporal["clock_domain_ref"]
    boot = domain["boot_id_str"]
    _require(isinstance(boot, str) and str(UUID(boot)) == boot and UUID(boot).int != 0, "boot_id")
    _require(domain["clock_domain_id_str"] == "chronos.monotonic.boot:" + boot
             and domain["clock_kind_enum_str"] == "MONOTONIC", "domain")
    _require(time["boot_id"] == boot and time["clock_domain_id"] == domain["clock_domain_id_str"], "ref_domain")
    _require(type(temporal["received_monotonic_ns"]) is int
             and type(time["received_monotonic_ns"]) is int
             and temporal["received_monotonic_ns"] == sample["host_monotonic_ns"] == time["received_monotonic_ns"], "ref_time")
    _require(type(temporal["host_wall_pair_span_ns"]) is int
             and 0 <= temporal["host_wall_pair_span_ns"] <= 50_000_000
             and type(temporal["received_unix_estimate_ns"]) is int
             and temporal["received_unix_estimate_ns"] >= 0, "receipt_bracket")
    _require(temporal["source_time"] is None
             and temporal["source_time_status_str"] == "UNKNOWN_NOT_EXPOSED_BY_SOURCE"
             and time["source_time_status"] == "unknown"
             and time["source_measurement_time"] is None
             and time["chronograf_anchor_ref"] is None, "time_authority")
    return {
        "matched": True,
        "reason": "same_source_content",
        "observation_id": ref["observation_id"],
        "origin_status": ref["origin_status"],
        "integrity_status": ref["integrity_status"],
        "source_verified": False,
        "robot_binding_verified": False,
        "history_committed": False,
        "actuation_enabled": False,
        # Console v0.1 omits boot_id. We matched receipt values and verified
        # ref-vs-payload domain consistency, not Console boot identity.
        "console_boot_verified": False,
    }
