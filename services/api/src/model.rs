use serde::{Deserialize, Serialize};

pub const API_VERSION: &str = "console.v1";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RobotKind {
    Simulated,
    Physical,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RobotRecord {
    pub id: String,
    pub name: String,
    pub model: String,
    pub manufacturer: String,
    pub kind: RobotKind,
    pub adapter_id: String,
    pub rgt_model_ref: Option<String>,
    #[serde(default)]
    pub rgd_model_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RobotRegistry {
    pub registry_version: String,
    pub robots: Vec<RobotRecord>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModuleManifest {
    pub manifest_version: String,
    pub id: String,
    pub version: String,
    pub status: String,
    pub origin: String,
    pub compatibility: ModuleCompatibility,
    pub dependencies: Vec<String>,
    pub capabilities: Vec<String>,
    pub permissions: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModuleCompatibility {
    pub console_api: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModuleRegistry {
    pub registry_version: String,
    pub modules: Vec<ModuleManifest>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Measurement {
    pub value: Option<f64>,
    pub unit: String,
    pub source_id: String,
    pub source_kind: RobotKind,
    pub measured_at: Option<String>,
    pub quality: String,
}

impl Measurement {
    pub fn unavailable(unit: &str, source_id: &str, source_kind: RobotKind) -> Self {
        Self {
            value: None,
            unit: unit.to_owned(),
            source_id: source_id.to_owned(),
            source_kind,
            measured_at: None,
            quality: "unavailable".into(),
        }
    }

    pub fn simulated(value: f64, unit: &str, source_id: &str, measured_at: &str) -> Self {
        Self {
            value: Some(value),
            unit: unit.into(),
            source_id: source_id.into(),
            source_kind: RobotKind::Simulated,
            measured_at: Some(measured_at.into()),
            quality: "simulated".into(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PowerTelemetry {
    pub voltage: Measurement,
    pub current: Measurement,
    pub power: Measurement,
    pub temperature: Measurement,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CanTelemetry {
    pub bus_state: String,
    pub measured_at: Option<String>,
    pub bitrate: Measurement,
    pub update_rate: Measurement,
    pub source_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ControllerTelemetry {
    pub id: String,
    pub measured_at: Option<String>,
    pub transport: String,
    pub state: String,
    pub source_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MotorTelemetry {
    pub id: String,
    pub measured_at: Option<String>,
    pub joint: Option<String>,
    pub state: String,
    pub position: Measurement,
    pub velocity: Measurement,
    pub temperature: Measurement,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TelemetrySnapshot {
    pub schema_version: String,
    pub robot_id: String,
    pub source_kind: RobotKind,
    pub connection_state: String,
    pub runtime_state: String,
    pub clock_domain: String,
    pub sequence: Option<u64>,
    pub received_at: Option<String>,
    pub power: PowerTelemetry,
    pub can: CanTelemetry,
    pub controllers: Vec<ControllerTelemetry>,
    pub motors: Vec<MotorTelemetry>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConsoleEvent {
    pub event_id: String,
    pub robot_id: String,
    pub event_kind: String,
    pub stage: String,
    pub severity: String,
    pub title: String,
    pub source_id: String,
    pub source_kind: RobotKind,
    pub observed_at: String,
    pub received_at: String,
    pub correlation_id: Option<String>,
    pub causal_parent_event_ids: Vec<String>,
    pub chronon_id: Option<String>,
    pub payload_ref: Option<String>,
    pub evidence_class: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StreamFrame {
    pub schema_version: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub robot_id: Option<String>,
    pub emitted_at: String,
    pub data: serde_json::Value,
}

impl StreamFrame {
    pub fn new(event_type: &str, robot_id: Option<&str>, data: serde_json::Value) -> Self {
        Self {
            schema_version: API_VERSION.into(),
            event_type: event_type.into(),
            robot_id: robot_id.map(str::to_owned),
            emitted_at: chrono::Utc::now().to_rfc3339(),
            data,
        }
    }
}


/// A source-derived *description*, not a physical measurement.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RgdLink {
    pub id: String,
    pub mass_kg: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RgdJoint {
    pub id: String,
    pub joint_type: Option<String>,
    pub parent_link: Option<String>,
    pub child_link: Option<String>,
    pub origin_xyz_m: Option<Vec<f64>>,
    pub axis_xyz: Option<Vec<f64>>,
    pub lower_limit: Option<f64>,
    pub upper_limit: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RgdSensor {
    pub id: String,
    pub sensor_type: Option<String>,
    pub parent_frame: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImportedModel {
    pub model_id: String,
    pub source_file: String,
    pub source_sha256: String,
    pub source_format: String,
    pub imported_at: String,
    pub name: String,
    pub manufacturer: Option<String>,
    pub standard_version: Option<String>,
    pub kernel_identity: Option<String>,
    pub profile_state: String,
    pub integrity_state: String,
    pub geometry_state: String,
    pub module_refs: Vec<String>,
    pub missing_modules: Vec<String>,
    pub warnings: Vec<String>,
    pub links: Vec<RgdLink>,
    pub joints: Vec<RgdJoint>,
    pub sensors: Vec<RgdSensor>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BindingDraft {
    pub id: String,
    pub robot_id: String,
    pub component_id: String,
    pub endpoint_hint: String,
    pub status: String,
    pub created_at: String,
}

/// Host metadata supplied by an explicitly run local script. Not a live
/// hardware measurement, and never authorization for physical operations.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HostPlatform {
    pub os_id: String,
    pub pretty_name: String,
    pub architecture: String,
    pub kernel_release: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ObservedInterface {
    pub id: String,
    pub category: String,
    pub endpoint: String,
    pub state: String,
    pub evidence_source: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HostInventoryUpload {
    pub schema_version: String,
    pub collection_method: String,
    pub collected_at: String,
    pub platform: HostPlatform,
    pub interfaces: Vec<ObservedInterface>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HostInventory {
    pub report: HostInventoryUpload,
    pub imported_at: String,
    pub verification_state: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Workspace {
    pub workspace_version: String,
    pub models: Vec<ImportedModel>,
    pub instances: Vec<RobotRecord>,
    pub bindings: Vec<BindingDraft>,
    #[serde(default)]
    pub host_inventory: Option<HostInventory>,
}

impl Default for Workspace {
    fn default() -> Self {
        Self {
            workspace_version: "console.workspace.v1".into(),
            models: vec![],
            instances: vec![],
            bindings: vec![],
            host_inventory: None,
        }
    }
}
