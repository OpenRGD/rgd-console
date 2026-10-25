use crate::model::{
    CanTelemetry, ControllerTelemetry, Measurement, MotorTelemetry, PowerTelemetry, RobotKind,
    RobotRecord, TelemetrySnapshot, API_VERSION,
};

/// Console-side telemetry adapter. This interface is NOT a motion backend and
/// offers no actuation or command methods. Actual runtime connectors arrive
/// only after their contracts and safety authority have been verified.
pub trait TelemetryAdapter {
    fn snapshot(&self, robot: &RobotRecord, sequence: u64, timestamp: &str) -> TelemetrySnapshot;
}

pub struct UnboundAdapter;

impl TelemetryAdapter for UnboundAdapter {
    fn snapshot(&self, robot: &RobotRecord, _sequence: u64, _timestamp: &str) -> TelemetrySnapshot {
        let source_id = format!("{}:no-live-source", robot.id);
        let missing = |unit: &str| Measurement::unavailable(unit, &source_id, RobotKind::Physical);
        TelemetrySnapshot {
            schema_version: API_VERSION.into(),
            robot_id: robot.id.clone(),
            source_kind: RobotKind::Physical,
            connection_state: "disconnected".into(),
            runtime_state: "not_connected".into(),
            clock_domain: "unavailable".into(),
            sequence: None,
            received_at: None,
            power: PowerTelemetry {
                voltage: missing("V"),
                current: missing("A"),
                power: missing("W"),
                temperature: missing("°C"),
            },
            can: CanTelemetry {
                bus_state: "unknown".into(),
                measured_at: None,
                bitrate: missing("bit/s"),
                update_rate: missing("Hz"),
                source_id: source_id.clone(),
            },
            controllers: vec![],
            motors: vec![],
        }
    }
}

pub struct SimulatorAdapter;

impl TelemetryAdapter for SimulatorAdapter {
    fn snapshot(&self, robot: &RobotRecord, sequence: u64, timestamp: &str) -> TelemetrySnapshot {
        let t = sequence as f64 * 0.11;
        let source = "sim://console/reference-telemetry";
        let sim = |value: f64, unit: &str| Measurement::simulated(value, unit, source, timestamp);
        let voltage = 24.0 + 0.08 * t.sin();
        let current = 1.2 + 0.24 * t.cos();
        TelemetrySnapshot {
            schema_version: API_VERSION.into(),
            robot_id: robot.id.clone(),
            source_kind: RobotKind::Simulated,
            connection_state: "connected".into(),
            runtime_state: "simulated".into(),
            clock_domain: "simulator.local.wallclock".into(),
            sequence: Some(sequence),
            received_at: Some(timestamp.into()),
            power: PowerTelemetry {
                voltage: sim(voltage, "V"),
                current: sim(current, "A"),
                power: sim(voltage * current, "W"),
                temperature: sim(35.0 + 1.8 * (t / 2.0).sin(), "°C"),
            },
            can: CanTelemetry {
                bus_state: "simulated".into(),
                measured_at: Some(timestamp.into()),
                bitrate: sim(1_000_000.0, "bit/s"),
                update_rate: sim(1.0, "Hz"),
                source_id: source.into(),
            },
            controllers: vec![ControllerTelemetry {
                id: "SIM-CTRL-A".into(),
                measured_at: Some(timestamp.into()),
                transport: "virtual CAN (not a physical bus)".into(),
                state: "simulated".into(),
                source_id: source.into(),
            }],
            motors: (1..=4).map(|index| {
                let offset = f64::from(index) * 0.55;
                MotorTelemetry {
                    id: format!("SIM-M{:02}", index),
                    measured_at: Some(timestamp.into()),
                    joint: Some(format!("sim_joint_{}", index)),
                    state: "simulated".into(),
                    position: sim((t + offset).sin() * 0.4, "rad"),
                    velocity: sim((t + offset).cos() * 0.044, "rad/s"),
                    temperature: sim(32.0 + f64::from(index) + t.sin(), "°C"),
                    error: None,
                }
            }).collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn robot(id: &str, kind: RobotKind, adapter_id: &str) -> RobotRecord {
        RobotRecord { id: id.into(), name: id.into(), model: "test".into(), manufacturer: "test".into(), kind, adapter_id: adapter_id.into(), rgt_model_ref: None, rgd_model_id: None }
    }

    #[test]
    fn unbound_does_not_forge_measurements() {
        let value = UnboundAdapter.snapshot(&robot("paky-01", RobotKind::Physical, "console.unbound.v1"), 8, "2026-01-01T00:00:00Z");
        assert_eq!(value.power.voltage.value, None);
        assert_eq!(value.power.voltage.measured_at, None);
        assert_eq!(value.can.bus_state, "unknown");
        assert!(value.controllers.is_empty());
        assert!(value.motors.is_empty());
    }

    #[test]
    fn simulator_is_provenance_tagged() {
        let value = SimulatorAdapter.snapshot(&robot("sim-lab-01", RobotKind::Simulated, "console.simulated.v1"), 5, "2026-01-01T00:00:00Z");
        assert_eq!(value.source_kind, RobotKind::Simulated);
        assert_eq!(value.power.voltage.quality, "simulated");
        assert_eq!(value.clock_domain, "simulator.local.wallclock");
        assert!(value.motors.iter().all(|m| m.position.source_kind == RobotKind::Simulated));
    }
}
