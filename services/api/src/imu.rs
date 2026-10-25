//! Generic, non-actuating, local Console IMU observation ingress.
//! The host owns device drivers; a Console container never opens /dev.
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub const INGEST_SCHEMA: &str = "openrgd.imu-sample.v0.1-candidate";
pub const OBSERVATION_SCHEMA: &str = "console.imu.v0.1-candidate";

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImuUpload {
    pub schema_version: String,
    pub robot_id: String,
    pub sensor_id: String,
    pub source_id: String,
    pub sensor_frame_id: String,
    pub session_id: String,
    pub sequence: u64,
    pub host_receive_utc: String,
    pub host_monotonic_ns: u64,
    pub acceleration_m_s2: [f64; 3],
    pub angular_velocity_rad_s: [f64; 3],
    pub orientation_euler_deg: [f64; 3],
    pub temperature_c: Option<f64>,
    pub calibration_revision: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ImuObservation {
    pub schema_version: &'static str,
    pub robot_id: String,
    pub sensor_id: String,
    pub source_id: String,
    pub sensor_frame_id: String,
    pub session_id: String,
    pub sequence: u64,
    pub host_receive_utc: String,
    pub host_monotonic_ns: u64,
    pub console_received_at: String,
    pub source_kind: &'static str,
    pub acceleration_m_s2: [f64; 3],
    pub angular_velocity_rad_s: [f64; 3],
    pub orientation_euler_deg: [f64; 3],
    pub temperature_c: Option<f64>,
    pub calibration_revision: Option<String>,
    pub reference_frame: &'static str,
    pub time_quality: &'static str,
    pub heading_calibrated: bool,
    pub decision_eligible: bool,
    pub observation_only: bool,
    pub motion_hint: &'static str,
}

fn identifier_ok(value: &str, limit: usize) -> bool {
    !value.is_empty() && value.len() <= limit &&
        value.bytes().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-' || byte == b'_')
}

impl ImuUpload {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.schema_version != INGEST_SCHEMA { return Err("unsupported_imu_schema"); }
        if !identifier_ok(&self.robot_id, 80) || !identifier_ok(&self.sensor_id, 80) ||
           !identifier_ok(&self.source_id, 80) || !identifier_ok(&self.sensor_frame_id, 100) {
            return Err("invalid_imu_identity");
        }
        if self.session_id.len() != 32 || !self.session_id.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("invalid_session_id");
        }
        if self.host_monotonic_ns == 0 { return Err("missing_source_monotonic_time"); }
        if !self.acceleration_m_s2.iter().all(|v| v.is_finite() && v.abs() < 250.0) ||
           !self.angular_velocity_rad_s.iter().all(|v| v.is_finite() && v.abs() < 50.0) ||
           !self.orientation_euler_deg.iter().all(|v| v.is_finite() && v.abs() <= 180.0) ||
           self.temperature_c.is_some_and(|v| !v.is_finite() || !(-55.0..=125.0).contains(&v)) {
            return Err("invalid_imu_values");
        }
        if self.calibration_revision.is_some() { return Err("calibration_claim_not_supported_in_v01"); }
        let capture_time = DateTime::parse_from_rfc3339(&self.host_receive_utc)
            .map_err(|_| "invalid_capture_timestamp")?.with_timezone(&Utc);
        // Mini-PC host and Console Docker container share a wall clock.
        // Bound the age of an observation before accepting a new physical claim.
        if (Utc::now() - capture_time).num_milliseconds().abs() > 5000 {
            return Err("stale_or_future_capture_timestamp");
        }
        Ok(())
    }
}

pub fn observe(input: ImuUpload) -> ImuObservation {
    let speed = input.angular_velocity_rad_s.iter().map(|v| v * v).sum::<f64>().sqrt();
    ImuObservation {
        schema_version: OBSERVATION_SCHEMA,
        robot_id: input.robot_id,
        sensor_id: input.sensor_id,
        source_id: input.source_id,
        sensor_frame_id: input.sensor_frame_id,
        session_id: input.session_id,
        sequence: input.sequence,
        host_receive_utc: input.host_receive_utc,
        host_monotonic_ns: input.host_monotonic_ns,
        console_received_at: Utc::now().to_rfc3339(),
        source_kind: "physical",
        acceleration_m_s2: input.acceleration_m_s2,
        angular_velocity_rad_s: input.angular_velocity_rad_s,
        orientation_euler_deg: input.orientation_euler_deg,
        temperature_c: input.temperature_c,
        calibration_revision: None,
        reference_frame: "imu_sensor_axes_unverified",
        time_quality: "host_receive_only_not_chronograph",
        heading_calibrated: false,
        decision_eligible: false,
        observation_only: true,
        motion_hint: if speed > 0.05 { "rotation_observed" } else { "low_angular_rate" },
    }
}

/// Constant-time equal-length secret comparison; empty/short configuration fails closed.
pub fn token_matches(provided: Option<&str>, expected: &str) -> bool {
    let Some(candidate) = provided else { return false; };
    if expected.len() < 32 || candidate.len() != expected.len() { return false; }
    let diff = expected.as_bytes().iter().zip(candidate.as_bytes())
        .fold(0u8, |acc, (a, b)| acc | (*a ^ *b));
    diff == 0
}

pub fn is_fresh(observation: &ImuObservation, window_ms: i64) -> bool {
    DateTime::parse_from_rfc3339(&observation.console_received_at)
        .ok()
        .is_some_and(|received| {
            let age = Utc::now().signed_duration_since(received.with_timezone(&Utc)).num_milliseconds();
            (0..=window_ms).contains(&age)
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn good_sample() -> ImuUpload {
        ImuUpload {
            schema_version: INGEST_SCHEMA.into(), robot_id: "paky-01".into(),
            sensor_id: "torso-imu-01".into(), source_id: "paky01-wit-serial".into(),
            sensor_frame_id: "paky01_imu_sensor_unverified".into(),
            session_id: "fedcba9876543210fedcba9876543210".into(), sequence: 1,
            host_receive_utc: Utc::now().to_rfc3339(), host_monotonic_ns: 100,
            acceleration_m_s2: [0.1, -0.1, 9.8], angular_velocity_rad_s: [0.0, 0.0, 0.0],
            orientation_euler_deg: [-4.7, -4.9, -150.0], temperature_c: Some(23.7),
            calibration_revision: None,
        }
    }
    #[test]
    fn accepts_valid_but_never_motion_authoritative() {
        let request = good_sample();
        assert!(request.validate().is_ok());
        let event = observe(request);
        assert!(!event.decision_eligible);
        assert_eq!(event.reference_frame, "imu_sensor_axes_unverified");
        assert!(!event.heading_calibrated);
        assert!(is_fresh(&event, 3000));
    }
    #[test]
    fn refuses_bad_scales_and_replayed_wall_clock() {
        let mut request = good_sample();
        request.acceleration_m_s2[0] = f64::NAN;
        assert!(request.validate().is_err());
        request = good_sample();
        request.host_receive_utc = "2020-01-01T00:00:00Z".into();
        assert!(request.validate().is_err());
        request = good_sample();
        request.calibration_revision = Some("unsafe-self-declared".into());
        assert!(request.validate().is_err());
    }
    #[test]
    fn ingest_requires_a_real_secret() {
        assert!(!token_matches(Some(""), ""));
        assert!(!token_matches(Some("wrong"), "x".repeat(64).as_str()));
        assert!(token_matches(Some("0123456789abcdef0123456789abcdef"), "0123456789abcdef0123456789abcdef"));
    }
}
