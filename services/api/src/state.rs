use std::{collections::{HashMap, HashSet, VecDeque}, fs, path::PathBuf, sync::Arc};
use tokio::sync::{broadcast, Mutex, RwLock};

use crate::{
    adapters::{SimulatorAdapter, TelemetryAdapter, UnboundAdapter},
    model::{BindingDraft, ConsoleEvent, HostInventory, ImportedModel, ModuleManifest, ModuleRegistry, RobotKind, RobotRecord, RobotRegistry, StreamFrame, TelemetrySnapshot, Workspace, API_VERSION},
};

const EVENT_LIMIT: usize = 300;

#[derive(Clone)]
pub struct AppState {
    pub robots: Arc<Vec<RobotRecord>>,
    pub modules: Arc<Vec<ModuleManifest>>,
    pub snapshots: Arc<RwLock<HashMap<String, TelemetrySnapshot>>>,
    pub events: Arc<RwLock<VecDeque<ConsoleEvent>>>,
    pub stream: broadcast::Sender<StreamFrame>,
    pub imu_latest: Arc<RwLock<HashMap<String, crate::imu::ImuObservation>>>,
    pub workspace: Arc<RwLock<Workspace>>,
    pub data_dir: Arc<PathBuf>,
    pub write_serial: Arc<Mutex<()>>,
}

pub fn validate_registry(registry: &RobotRegistry) -> Result<(), String> {
    if registry.registry_version != "console.robots.v1" {
        return Err("unsupported robot registry version".into());
    }
    if registry.robots.is_empty() {
        return Err("robot registry cannot be empty".into());
    }
    let mut unique = HashSet::new();
    for robot in &registry.robots {
        if robot.id.is_empty() || !robot.id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
            return Err(format!("invalid robot id: {}", robot.id));
        }
        if !unique.insert(robot.id.as_str()) {
            return Err(format!("duplicate robot id: {}", robot.id));
        }
        let expected = match robot.kind {
            RobotKind::Simulated => "console.simulated.v1",
            RobotKind::Physical => "console.unbound.v1",
        };
        if robot.adapter_id != expected {
            return Err(format!("unsupported/unverified adapter for {}: {}", robot.id, robot.adapter_id));
        }
        if robot.rgd_model_id.is_some() {
            return Err(format!("physical model bindings must be introduced by onboarding: {}", robot.id));
        }
        if robot.rgt_model_ref.is_some() {
            return Err(format!("RGT model loading is not implemented in v0.1: {}", robot.id));
        }
    }
    Ok(())
}

pub fn validate_modules(registry: &ModuleRegistry) -> Result<(), String> {
    if registry.registry_version != "console.modules.v1" {
        return Err("unsupported module registry version".into());
    }
    let mut ids = HashSet::new();
    for module in &registry.modules {
        if module.manifest_version != "console.module.v1" || module.compatibility.console_api != API_VERSION {
            return Err(format!("unsupported module contract: {}", module.id));
        }
        if !ids.insert(module.id.as_str()) {
            return Err(format!("duplicate module id: {}", module.id));
        }
        if module.status != "installed" && module.status != "planned_not_installed" {
            return Err(format!("unknown module lifecycle state: {}", module.id));
        }
        if module.status == "planned_not_installed" && (!module.permissions.is_empty() || !module.capabilities.is_empty()) {
            return Err(format!("planned module must have no active grants: {}", module.id));
        }
        if module.permissions.iter().any(|p| p.contains("actuate") || p.contains("motor.command")) {
            return Err(format!("unsafe console permission: {}", module.id));
        }
    }
    for module in &registry.modules {
        for dependency in &module.dependencies {
            if !ids.contains(dependency.as_str()) {
                return Err(format!("missing dependency {} for {}", dependency, module.id));
            }
        }
    }
    Ok(())
}

impl AppState {
    pub fn from_files(robots_path: &str, modules_path: &str) -> Result<Self, Box<dyn std::error::Error>> {
        Self::from_files_with_data(robots_path, modules_path, "data")
    }

    pub fn from_files_with_data(robots_path: &str, modules_path: &str, data_dir: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let registry: RobotRegistry = serde_json::from_str(&fs::read_to_string(robots_path)?)?;
        let module_registry: ModuleRegistry = serde_json::from_str(&fs::read_to_string(modules_path)?)?;
        validate_registry(&registry)?;
        validate_modules(&module_registry)?;

        let now = chrono::Utc::now().to_rfc3339();
        let mut snapshots = HashMap::new();
        let mut events = VecDeque::new();
        for robot in &registry.robots {
            let snapshot = match robot.kind {
                RobotKind::Simulated => SimulatorAdapter.snapshot(robot, 0, &now),
                RobotKind::Physical => UnboundAdapter.snapshot(robot, 0, &now),
            };
            snapshots.insert(robot.id.clone(), snapshot);
            if robot.kind == RobotKind::Simulated {
                events.push_back(ConsoleEvent {
                    event_id: format!("console:{}:sim-start", robot.id),
                    robot_id: robot.id.clone(),
                    event_kind: "simulator.started".into(),
                    stage: "system".into(),
                    severity: "info".into(),
                    title: "Simulatore integrato avviato (nessun hardware connesso)".into(),
                    source_id: "console.simulated.v1".into(),
                    source_kind: RobotKind::Simulated,
                    observed_at: now.clone(),
                    received_at: now.clone(),
                    correlation_id: None,
                    causal_parent_event_ids: vec![],
                    chronon_id: None,
                    payload_ref: None,
                    evidence_class: "console_diagnostic_not_chronon".into(),
                });
            }
        }
        let data_dir = PathBuf::from(data_dir);
        let workspace_path = data_dir.join("workspace.json");
        let workspace: Workspace = if workspace_path.is_file() {
            serde_json::from_slice(&fs::read(&workspace_path)?)?
        } else { Workspace::default() };
        if workspace.workspace_version != "console.workspace.v1" {
            return Err("unsupported workspace format".into());
        }
        let mut known: HashSet<String> = registry.robots.iter().map(|r| r.id.clone()).collect();
        let model_ids: HashSet<&str> = workspace.models.iter().map(|m| m.model_id.as_str()).collect();
        if model_ids.len() != workspace.models.len() { return Err("duplicated stored models".into()); }
        for robot in &workspace.instances {
            if robot.kind != RobotKind::Physical || robot.adapter_id != "console.unbound.v1"
                || robot.rgd_model_id.as_ref().is_none_or(|id| !model_ids.contains(id.as_str()))
                || !known.insert(robot.id.clone()) {
                return Err(format!("unsafe or invalid stored robot instance: {}", robot.id).into());
            }
        }
        let (stream, _) = broadcast::channel(256);
        Ok(Self {
            robots: Arc::new(registry.robots),
            modules: Arc::new(module_registry.modules),
            snapshots: Arc::new(RwLock::new(snapshots)),
            events: Arc::new(RwLock::new(events)),
            stream,
            imu_latest: Arc::new(RwLock::new(HashMap::new())),
            workspace: Arc::new(RwLock::new(workspace)),
            data_dir: Arc::new(data_dir),
            write_serial: Arc::new(Mutex::new(())),
        })
    }

    pub async fn all_robots(&self) -> Vec<RobotRecord> {
        let mut records = self.robots.as_ref().clone();
        records.extend(self.workspace.read().await.instances.iter().cloned());
        records
    }

    pub async fn find_robot(&self, id: &str) -> Option<RobotRecord> {
        if let Some(known) = self.robots.iter().find(|x| x.id == id) { return Some(known.clone()); }
        self.workspace.read().await.instances.iter().find(|x| x.id == id).cloned()
    }

    pub async fn find_model(&self, model_id: &str) -> Option<ImportedModel> {
        self.workspace.read().await.models.iter().find(|m| m.model_id == model_id).cloned()
    }

    pub async fn model_for_robot(&self, robot_id: &str) -> Option<ImportedModel> {
        let robot = self.find_robot(robot_id).await?;
        self.find_model(robot.rgd_model_id.as_deref()?).await
    }

    pub async fn all_models(&self) -> Vec<ImportedModel> {
        self.workspace.read().await.models.clone()
    }

    pub async fn host_inventory(&self) -> Option<HostInventory> {
        self.workspace.read().await.host_inventory.clone()
    }

    pub async fn save_host_inventory(&self, report: HostInventory) -> Result<HostInventory, String> {
        let _serial = self.write_serial.lock().await;
        let mut next = self.workspace.read().await.clone();
        next.host_inventory = Some(report.clone());
        self.commit_workspace(next).await?;
        Ok(report)
    }

    pub async fn bindings(&self, robot_id: &str) -> Vec<BindingDraft> {
        self.workspace.read().await.bindings.iter().filter(|b| b.robot_id == robot_id).cloned().collect()
    }

    pub async fn import_model(&self, model: ImportedModel, archive: &[u8]) -> Result<ImportedModel, String> {
        let _serial = self.write_serial.lock().await;
        let mut next = self.workspace.read().await.clone();
        if let Some(existing) = next.models.iter().find(|m| m.model_id == model.model_id) {
            if existing.source_sha256 != model.source_sha256 { return Err("model ID collision".into()); }
            return Ok(existing.clone());
        }
        fs::create_dir_all(self.data_dir.join("imports")).map_err(|e| e.to_string())?;
        let archive_path = self.data_dir.join("imports").join(format!("{}.zip", model.model_id));
        if !archive_path.exists() {
            let temp = self.data_dir.join("imports").join(format!(".{}.tmp", model.model_id));
            fs::write(&temp, archive).map_err(|e| e.to_string())?;
            fs::rename(&temp, &archive_path).map_err(|e| e.to_string())?;
        }
        next.models.push(model.clone());
        self.commit_workspace(next).await?;
        Ok(model)
    }

    pub async fn create_instance(&self, model_id: &str, raw_name: &str) -> Result<RobotRecord, String> {
        let name = raw_name.trim();
        if name.is_empty() || name.chars().count() > 80 || name.chars().any(char::is_control) {
            return Err("Nome robot mancante o non valido (massimo 80 caratteri)".into());
        }
        let _serial = self.write_serial.lock().await;
        let mut next = self.workspace.read().await.clone();
        let model = next.models.iter().find(|m| m.model_id == model_id)
            .ok_or("Modello RGD non presente nel registro locale")?.clone();
        let index = next.instances.len() + 1;
        let mut number = index;
        let id = loop {
            let value = format!("instance-{number:04}");
            if !next.instances.iter().any(|r| r.id == value) && !self.robots.iter().any(|r| r.id == value) { break value; }
            number += 1;
        };
        let robot = RobotRecord {
            id, name: name.into(), model: model.name, manufacturer: model.manufacturer.unwrap_or_else(|| "unknown".into()),
            kind: RobotKind::Physical, adapter_id: "console.unbound.v1".into(),
            rgt_model_ref: None, rgd_model_id: Some(model_id.to_owned()),
        };
        next.instances.push(robot.clone());
        self.commit_workspace(next).await?;
        let now = chrono::Utc::now().to_rfc3339();
        self.add_event(ConsoleEvent {
            event_id: format!("console:{}:registered", robot.id),
            robot_id: robot.id.clone(), event_kind: "onboarding.instance_registered".into(),
            stage: "system".into(), severity: "info".into(),
            title: "Istanza registrata. Nessun dispositivo fisico collegato.".into(),
            source_id: "console.onboarding.v0.2".into(), source_kind: RobotKind::Physical,
            observed_at: now.clone(), received_at: now,
            correlation_id: None, causal_parent_event_ids: vec![], chronon_id: None, payload_ref: None,
            evidence_class: "console_diagnostic_not_chronon".into(),
        }).await;
        Ok(robot)
    }

    pub async fn propose_binding(&self, robot_id: &str, component_id: &str, endpoint_hint: &str) -> Result<BindingDraft, String> {
        let hint = endpoint_hint.trim();
        if hint.is_empty() || hint.chars().count() > 180 || hint.chars().any(char::is_control) {
            return Err("Riferimento endpoint assente o non valido (massimo 180 caratteri)".into());
        }
        let _serial = self.write_serial.lock().await;
        let mut next = self.workspace.read().await.clone();
        let robot = next.instances.iter().find(|r| r.id == robot_id)
            .ok_or("Solo le istanze importate possono ricevere proposte di mapping")?;
        let model = next.models.iter().find(|m| robot.rgd_model_id.as_deref() == Some(m.model_id.as_str()))
            .ok_or("Modello di riferimento non trovato")?;
        let known = model.links.iter().any(|l| l.id == component_id)
            || model.joints.iter().any(|j| j.id == component_id)
            || model.sensors.iter().any(|s| s.id == component_id);
        if !known { return Err("Componente non presente nel profilo RGD importato".into()); }
        let existing = next.bindings.iter().find(|b| b.robot_id == robot_id && b.component_id == component_id).cloned();
        let id = existing.as_ref().map(|b| b.id.clone()).unwrap_or_else(|| format!("draft-{}-{}", robot_id, next.bindings.len() + 1));
        let item = BindingDraft {
            id, robot_id: robot_id.into(), component_id: component_id.into(),
            endpoint_hint: hint.into(), status: "proposed_unverified".into(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        next.bindings.retain(|b| !(b.robot_id == robot_id && b.component_id == component_id));
        next.bindings.push(item.clone());
        self.commit_workspace(next).await?;
        Ok(item)
    }

    /// Store only a non-authoritative last-read passive report. No Chronon,
    /// calibration update, HAL mapping or motor control is produced.
    pub async fn save_calibration_preview(&self, robot_id: &str, report: &serde_json::Value) -> Result<(), String> {
        let _guard = self.write_serial.lock().await;
        if !self.workspace.read().await.instances.iter().any(|r| r.id == robot_id && r.rgd_model_id.is_some()) {
            return Err("Ispezione disponibile solo per un'istanza importata".into());
        }
        let directory = self.data_dir.join("calibration_previews");
        fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let target = directory.join(format!("{robot_id}.json"));
        let temp = directory.join(format!("{robot_id}.tmp"));
        let bytes = serde_json::to_vec_pretty(report).map_err(|e| e.to_string())?;
        if bytes.len() > 4 * 1024 * 1024 + 16 * 1024 {
            return Err("Report di ispezione troppo grande".into());
        }
        fs::write(&temp, bytes).map_err(|e| e.to_string())?;
        fs::rename(&temp, &target).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn last_calibration_preview(&self, robot_id: &str) -> Option<serde_json::Value> {
        let robot = self.find_robot(robot_id).await?;
        let model_id = robot.rgd_model_id?;
        let archive = self.find_model(&model_id).await?;
        let path = self.data_dir.join("calibration_previews").join(format!("{robot_id}.json"));
        let meta = fs::symlink_metadata(&path).ok()?;
        if !meta.file_type().is_file() || meta.len() > 4 * 1024 * 1024 + 16 * 1024 { return None; }
        let result: serde_json::Value = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
        if result.get("source_profile_sha256")?.as_str()? != archive.source_sha256.as_str()
            || result.get("robot_id")?.as_str()? != robot_id
            || result.get("actuation_enabled")?.as_bool()? != false
            || result.get("physical_calibration_certified")?.as_bool()? != false {
            return None;
        }
        Some(result)
    }

    async fn commit_workspace(&self, updated: Workspace) -> Result<(), String> {
        fs::create_dir_all(self.data_dir.as_path()).map_err(|e| e.to_string())?;
        let path = self.data_dir.join("workspace.json");
        let tmp = self.data_dir.join("workspace.json.tmp");
        let content = serde_json::to_vec_pretty(&updated).map_err(|e| e.to_string())?;
        fs::write(&tmp, content).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
        *self.workspace.write().await = updated;
        Ok(())
    }

    pub async fn snapshot(&self, id: &str) -> Option<TelemetrySnapshot> {
        if let Some(value) = self.snapshots.read().await.get(id).cloned() { return Some(value); }
        let robot = self.find_robot(id).await?;
        Some(UnboundAdapter.snapshot(&robot, 0, ""))
    }

    pub async fn add_event(&self, event: ConsoleEvent) {
        let mut events = self.events.write().await;
        events.push_front(event.clone());
        events.truncate(EVENT_LIMIT);
        drop(events);
        let _ = self.stream.send(StreamFrame::new(
            "event", Some(&event.robot_id), serde_json::to_value(&event).expect("serializable event"),
        ));
    }

    pub fn spawn_simulators(&self) {
        for robot in self.robots.iter().filter(|r| r.kind == RobotKind::Simulated).cloned() {
            let state = self.clone();
            tokio::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
                let mut sequence = 0u64;
                loop {
                    interval.tick().await;
                    sequence = sequence.saturating_add(1);
                    let now = chrono::Utc::now().to_rfc3339();
                    let snapshot = SimulatorAdapter.snapshot(&robot, sequence, &now);
                    state.snapshots.write().await.insert(robot.id.clone(), snapshot.clone());
                    let _ = state.stream.send(StreamFrame::new(
                        "telemetry", Some(&robot.id), serde_json::to_value(&snapshot).expect("serializable telemetry"),
                    ));
                    if sequence % 10 == 0 {
                        state.add_event(ConsoleEvent {
                            event_id: format!("console:{}:sample:{}", robot.id, sequence),
                            robot_id: robot.id.clone(),
                            event_kind: "telemetry.sample".into(),
                            stage: "observed".into(),
                            severity: "info".into(),
                            title: format!("Campione simulato #{} ricevuto", sequence),
                            source_id: "console.simulated.v1".into(),
                            source_kind: RobotKind::Simulated,
                            observed_at: now.clone(),
                            received_at: now,
                            correlation_id: None,
                            causal_parent_event_ids: vec![],
                            chronon_id: None,
                            payload_ref: Some(format!("telemetry://{}/{}", robot.id, sequence)),
                            evidence_class: "console_diagnostic_not_chronon".into(),
                        }).await;
                    }
                }
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_duplicate_robot() {
        let sample = RobotRecord { id: "robot-a".into(), name: "A".into(), model: "X".into(), manufacturer: "Y".into(), kind: RobotKind::Physical, adapter_id: "console.unbound.v1".into(), rgt_model_ref: None, rgd_model_id: None };
        let registry = RobotRegistry { registry_version: "console.robots.v1".into(), robots: vec![sample.clone(), sample] };
        assert!(validate_registry(&registry).unwrap_err().contains("duplicate"));
    }

    #[test]
    fn refuses_physical_connection_without_verified_adapter() {
        let robot = RobotRecord { id: "robot-a".into(), name: "A".into(), model: "X".into(), manufacturer: "Y".into(), kind: RobotKind::Physical, adapter_id: "can.direct".into(), rgt_model_ref: None, rgd_model_id: None };
        assert!(validate_registry(&RobotRegistry { registry_version: "console.robots.v1".into(), robots: vec![robot] }).is_err());
    }

    #[test]
    fn rejects_actuation_permission() {
        let m = ModuleManifest { manifest_version: "console.module.v1".into(), id: "unsafe".into(), version: "0.1.0".into(), status: "installed".into(), origin: "test".into(), compatibility: crate::model::ModuleCompatibility{ console_api: API_VERSION.into() }, dependencies: vec![], capabilities: vec![], permissions: vec!["actuate:joints".into()] };
        assert!(validate_modules(&ModuleRegistry{ registry_version:"console.modules.v1".into(), modules:vec![m]}).is_err());
    }
    #[test]
    fn legacy_v02_workspace_without_host_report_deserializes() {
        let old = serde_json::json!({
            "workspace_version": "console.workspace.v1",
            "models": [], "instances": [], "bindings": []
        });
        let parsed: Workspace = serde_json::from_value(old).unwrap();
        assert!(parsed.host_inventory.is_none());
    }

    #[tokio::test]
    async fn host_snapshot_is_persistent_but_remains_unverified() {
        use crate::model::{HostInventoryUpload, HostPlatform, ObservedInterface};
        let dir = std::env::temp_dir().join(format!(
            "openrgd-host-test-{}-{}", std::process::id(), chrono::Utc::now().timestamp_micros()
        ));
        let base = concat!(env!("CARGO_MANIFEST_DIR"), "/../../config/");
        let make_state = || AppState::from_files_with_data(
            &format!("{base}robots.json"), &format!("{base}modules.json"),
            dir.to_str().unwrap(),
        ).unwrap();
        let state = make_state();
        let upload = HostInventoryUpload {
            schema_version: "console.host-inventory.v1".into(),
            collection_method: "passive_file_metadata_v1".into(),
            collected_at: "2026-10-21T08:00:00+02:00".into(),
            platform: HostPlatform {
                os_id: "fedora".into(), pretty_name: "Fedora Test".into(),
                architecture: "x86_64".into(), kernel_release: "6.15".into(),
            },
            interfaces: vec![ObservedInterface {
                id: "serial-ttyACM0".into(), category: "serial_endpoint".into(),
                endpoint: "/dev/ttyACM0".into(), state: "present_not_probed".into(),
                evidence_source: "linux_devfs_metadata".into(),
            }],
        };
        let report = crate::host_inventory::inspect_host_inventory(upload).unwrap();
        state.save_host_inventory(report).await.unwrap();
        drop(state);
        let restarted = make_state();
        let stored = restarted.host_inventory().await.unwrap();
        assert_eq!(stored.verification_state, "operator_supplied_unverified");
        assert_eq!(stored.report.interfaces[0].endpoint, "/dev/ttyACM0");
        assert_eq!(restarted.snapshot("paky-01").await.unwrap().power.voltage.value, None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn onboarding_persists_model_and_instance_without_live_telemetry() {
        use std::io::{Cursor, Write};
        use zip::{write::SimpleFileOptions, ZipWriter};
        let dir = std::env::temp_dir().join(format!(
            "openrgd-console-test-{}-{}", std::process::id(), chrono::Utc::now().timestamp_micros()
        ));
        let base = concat!(env!("CARGO_MANIFEST_DIR"), "/../../config/");
        let init = || AppState::from_files_with_data(
            &format!("{base}robots.json"), &format!("{base}modules.json"),
            dir.to_str().unwrap(),
        ).unwrap();
        let state = init();
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        writer.start_file("spec/01_foundation/description.jsonc", SimpleFileOptions::default()).unwrap();
        writer.write_all(br#"{"meta_group":{"species_name_str":"Synthetic"},"joint_topology_map":{"joint-a":{"type_enum":"REVOLUTE"}}}"#).unwrap();
        let bytes = writer.finish().unwrap().into_inner();
        let model = crate::model_import::inspect_bundle(&bytes, "synthetic.zip").unwrap();
        state.import_model(model.clone(), &bytes).await.unwrap();
        let robot = state.create_instance(&model.model_id, "Synthetic test instance").await.unwrap();
        assert_eq!(robot.adapter_id, "console.unbound.v1");
        let snapshot = state.snapshot(&robot.id).await.unwrap();
        assert!(snapshot.power.voltage.value.is_none());
        let passive_report = serde_json::json!({
            "robot_id": robot.id,
            "source_profile_sha256": model.source_sha256,
            "actuation_enabled": false,
            "physical_calibration_certified": false,
            "inspection": {"report": {"current_robot_position_observed": false}},
        });
        state.save_calibration_preview(&robot.id, &passive_report).await.unwrap();
        drop(state);
        let restarted = init();
        assert!(restarted.find_model(&model.model_id).await.is_some());
        assert!(restarted.find_robot(&robot.id).await.is_some());
        let last = restarted.last_calibration_preview(&robot.id).await.unwrap();
        assert_eq!(last["physical_calibration_certified"], false);
        assert!(restarted.last_calibration_preview("paky-01").await.is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

}
