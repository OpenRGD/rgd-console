/** Console transport v1. Deliberately NOT a Chronon schema or motor protocol. */
export type RobotKind = 'simulated' | 'physical';

export interface RobotRecord {
  id: string;
  name: string;
  model: string;
  manufacturer: string;
  kind: RobotKind;
  adapter_id: string;
  rgt_model_ref: string | null;
  rgd_model_id?: string | null;
}

export interface Measurement {
  value: number | null;
  unit: string;
  source_id: string;
  source_kind: RobotKind;
  measured_at: string | null;
  quality: 'simulated' | 'unavailable' | 'observed' | 'stale';
}

export interface PowerTelemetry {
  voltage: Measurement;
  current: Measurement;
  power: Measurement;
  temperature: Measurement;
}

export interface CanTelemetry {
  bus_state: string;
  measured_at: string | null;
  bitrate: Measurement;
  update_rate: Measurement;
  source_id: string;
}

export interface MotorTelemetry {
  id: string;
  measured_at: string | null;
  joint: string | null;
  state: string;
  position: Measurement;
  velocity: Measurement;
  temperature: Measurement;
  error: string | null;
}

export interface ControllerTelemetry {
  id: string;
  measured_at: string | null;
  transport: string;
  state: string;
  source_id: string;
}

export interface TelemetrySnapshot {
  schema_version: 'console.v1';
  robot_id: string;
  source_kind: RobotKind;
  connection_state: 'connected' | 'disconnected' | 'unknown';
  runtime_state: string;
  clock_domain: string;
  sequence: number | null;
  received_at: string | null;
  power: PowerTelemetry;
  can: CanTelemetry;
  controllers: ControllerTelemetry[];
  motors: MotorTelemetry[];
}

export interface ConsoleEvent {
  event_id: string;
  robot_id: string;
  event_kind: string;
  stage: string;
  severity: string;
  title: string;
  source_id: string;
  source_kind: RobotKind;
  observed_at: string;
  received_at: string;
  correlation_id: string | null;
  causal_parent_event_ids: string[];
  chronon_id: string | null;
  payload_ref: string | null;
  evidence_class: string;
}

export interface ModuleManifest {
  manifest_version: 'console.module.v1';
  id: string;
  version: string;
  status: 'installed' | 'planned_not_installed';
  origin: string;
  compatibility: { console_api: 'console.v1' };
  dependencies: string[];
  capabilities: string[];
  permissions: string[];
}

export interface ConsoleStatus {
  api_version: 'console.v1';
  console_version: string;
  read_only: boolean;
  writes_scope?: string;
  actuation_enabled?: boolean;
  physical_runtime_connected: boolean;
  chronon_store_connected: boolean;
  adapter_mode: string;
  registered_robots: number;
  control_surface: string;
}

/** Candidate passive IMU sample: SENSOR axes, not calibrated robot frame. */
export interface ImuObservation {
  schema_version: 'console.imu.v0.1-candidate';
  robot_id: string;
  sensor_id: string;
  source_id: string;
  sensor_frame_id: string;
  session_id: string;
  sequence: number;
  source_kind: 'physical';
  host_receive_utc: string;
  host_monotonic_ns: number;
  console_received_at: string;
  acceleration_m_s2: [number, number, number];
  angular_velocity_rad_s: [number, number, number];
  orientation_euler_deg: [number, number, number];
  temperature_c: number | null;
  calibration_revision: string | null;
  reference_frame: 'imu_sensor_axes_unverified';
  time_quality: 'host_receive_only_not_chronograph';
  heading_calibrated: false;
  decision_eligible: false;
  observation_only: true;
  motion_hint: 'rotation_observed' | 'low_angular_rate';
}

function isTriple(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3
    && value.every(x => typeof x === 'number' && Number.isFinite(x));
}

export function isImuObservation(value: unknown): value is ImuObservation {
  if (!value || typeof value !== 'object') return false;
  const sample = value as Partial<ImuObservation>;
  return sample.schema_version === 'console.imu.v0.1-candidate'
    && sample.source_kind === 'physical'
    && typeof sample.robot_id === 'string'
    && typeof sample.sensor_id === 'string'
    && typeof sample.console_received_at === 'string'
    && typeof sample.sequence === 'number'
    && isTriple(sample.acceleration_m_s2)
    && isTriple(sample.angular_velocity_rad_s)
    && isTriple(sample.orientation_euler_deg)
    && sample.reference_frame === 'imu_sensor_axes_unverified'
    && sample.decision_eligible === false
    && sample.heading_calibrated === false;
}

export type StreamFrame = {
  schema_version: 'console.v1';
  type: 'hello' | 'heartbeat' | 'telemetry' | 'event' | 'imu';
  robot_id: string | null;
  emitted_at: string;
  data: unknown;
};

export function isTelemetrySnapshot(value: unknown): value is TelemetrySnapshot {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<TelemetrySnapshot>;
  return data.schema_version === 'console.v1' && typeof data.robot_id === 'string'
    && (data.source_kind === 'simulated' || data.source_kind === 'physical')
    && !!data.power && !!data.can && Array.isArray(data.motors);
}

export function isConsoleEvent(value: unknown): value is ConsoleEvent {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<ConsoleEvent>;
  return typeof data.event_id === 'string' && typeof data.robot_id === 'string'
    && typeof data.stage === 'string' && (data.source_kind === 'simulated' || data.source_kind === 'physical');
}


/** Source-derived descriptions, never physical measurements or verified calibration. */
export interface RgdLink { id: string; mass_kg: number | null }
export interface RgdJoint {
  id: string;
  joint_type: string | null;
  parent_link: string | null;
  child_link: string | null;
  origin_xyz_m: number[] | null;
  /** Optional for legacy stored RGD imports; never infer a physical zero. */
  origin_rpy_rad?: number[] | null;
  axis_xyz: number[] | null;
  lower_limit: number | null;
  upper_limit: number | null;
}
export interface RgdSensor { id: string; sensor_type: string | null; parent_frame: string | null }
export interface ImportedModel {
  model_id: string;
  name: string;
  manufacturer: string | null;
  source_file: string;
  source_sha256: string;
  source_format: 'openrgd-source-profile-zip';
  imported_at: string;
  standard_version: string | null;
  kernel_identity: string | null;
  profile_state: 'structurally_inspected' | 'partial_foundation';
  integrity_state: 'canonical_not_verified';
  geometry_state: 'declared_joint_topology_only' | 'no_joint_topology';
  module_refs: string[];
  missing_modules: string[];
  warnings: string[];
  links: RgdLink[];
  joints: RgdJoint[];
  sensors: RgdSensor[];
}
/** Source-file declarations, not installed motor identities or validated CAN bindings. */
export interface RgdHalDeclaration {
  source_key: string;
  logical_actuator_ref: string | null;
  communication_protocol: string | null;
  bus_interface: string | null;
  device_node_id: number | null;
  joint_id: string | null;
  joint_resolution: 'explicit_joint_in_profile' | 'unresolved_joint_reference';
}
export interface RgdHalInspection {
  schema_version: 'console.rgd.hal-inspection.v0.1';
  model_id: string;
  source_profile_sha256: string;
  source_path: string;
  hal_mapping_id: string | null;
  hal_present: boolean;
  declared_actuator_count: number;
  linked_joint_count: number;
  declarations: RgdHalDeclaration[];
  evidence_class: 'rgd_source_declaration_unverified_not_physical_evidence';
  physical_mapping_verified: false;
  device_discovery_performed: false;
  actuation_enabled: false;
}

export interface BindingDraft {
  id: string;
  robot_id: string;
  component_id: string;
  endpoint_hint: string;
  status: 'proposed_unverified';
  created_at: string;
}
export interface ReadinessCheck { key: string; state: string; detail: string }
export interface ReadinessReport { robot_id: string; status: 'not_ready_for_actuation'; actuation_enabled: false; checks: ReadinessCheck[]; robot_kind: RobotKind }
export interface HostInspection {
  inspection_scope: string;
  operating_system: string;
  architecture: string;
  environment_distribution: string | null;
  logical_cpus: number | null;
  host_operating_system_verified: false;
  devices_scanned: false;
  probe_mode: string;
  software_installation_enabled: false;
  actuation_enabled: false;
}
export interface DiscoveryReport { robot_id: string; status: 'not_enabled'; devices: []; observed_at: null; note: string; hardware_access: false }


/** Operator-supplied passive host metadata, never a verified device identity. */
export interface ObservedInterface {
  id: string;
  category: 'can_interface' | 'serial_endpoint' | 'video_endpoint';
  endpoint: string;
  state: string;
  evidence_source: string;
}
export interface HostInventoryUpload {
  schema_version: 'console.host-inventory.v1';
  collection_method: 'passive_file_metadata_v1';
  collected_at: string;
  platform: {
    os_id: string;
    pretty_name: string;
    architecture: string;
    kernel_release: string;
  };
  interfaces: ObservedInterface[];
}
export interface HostInventory {
  report: HostInventoryUpload;
  imported_at: string;
  verification_state: 'operator_supplied_unverified';
}
export interface InstallationDiagnostics {
  schema_version: 'console.installation-diagnostics.v1';
  console_version: string;
  api_reachable: boolean;
  data_directory_present: boolean;
  registered_robots: number;
  imported_models: number;
  host_report_imported: boolean;
  server_container_scope_only: boolean;
  canonical_validator_integrated: false;
  hardware_scanned_by_backend: false;
  software_installation_enabled: false;
  actuation_enabled: false;
}


/** Candidate software distribution manifest from pinned OpenRGD/rgd-modules. */
export interface RegistryDescriptor {
  schema_version: '0.1.0-candidate';
  id: string;
  version: string;
  display_name: string;
  publisher: string;
  category: string;
  summary: string;
  maturity: string;
  capabilities: string[];
  permissions_required: string[];
  safety: { non_actuating: boolean; automatic_motion_on_load: boolean; active_calibration_supported: boolean };
  source: { git_url: string; commit_sha: string; module_manifest: string };
  distribution: { kind: string; hosts: string[]; package: string; binary: string };
  integration?: { interface: string; read_only_command: string; report_contract: string };
}
export interface RegistryEntry {
  descriptor: RegistryDescriptor;
  installation: { state: 'not_installed' | 'ready' | 'source_only' | 'tampered'; binary_sha256: string | null };
}
export interface ModuleCatalog {
  manager_contract: 'console.module-manager.v0.4a';
  registry_contract: '0.1.0-candidate';
  source: string;
  catalog: RegistryEntry[];
  auto_install: false;
  actuation_enabled: false;
}
export interface ModuleInstallJob {
  job_id: string;
  module_id: string;
  version: string;
  mode: 'build' | 'source_only';
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  created_at: string;
  finished_at: string | null;
  error: string | null;
  result: {state: 'ready' | 'source_only'; source_commit: string | null; binary_sha256: string | null} | null;
  hardware_access: false;
}

/** CAL-0.2 candidate passive report. Claims are model metadata, NOT physical sensing. */
export interface CalibrationCoverage {
  candidate_fields: number;
  declared_fields: number;
  saved_evidence_fields: number;
  without_saved_measurements: number;
  without_declared_values: number;
}
export interface CalibrationParameter {
  parameter_ref: string;
  component_kind: 'joint' | 'sensor';
  component_id: string;
  unit: string;
  nominal_ref: string | null;
  nominal_value: unknown;
  declared_value: unknown;
  stored_measurements: unknown[];
  coverage: 'absent' | 'declared_only' | 'saved_evidence';
}
export interface CalibrationFinding {
  severity: 'information' | 'warning';
  code: string;
  source: string;
  reference: string;
  detail: string;
}
export interface CalibrationPassiveReport {
  report_version: '0.2.0';
  model_id: string;
  profile_id: string | null;
  profile_state: string | null;
  profile_binding: string;
  claims_physical_calibration_certified: false;
  current_robot_position_observed: false;
  physical_drift_evaluated: false;
  coverage: CalibrationCoverage;
  parameters: CalibrationParameter[];
  findings: CalibrationFinding[];
  source_digests: {role: string; path: string; raw_file_sha256: string}[];
  export_preview: null;
}
export interface CalibrationInspection {
  schema_version: 'console.calibration-inspection.v0.4b';
  robot_id: string;
  source_model_id: string;
  source_profile_sha256: string;
  source_integrity: 'canonical_not_verified';
  generated_at: string;
  evidence_class: 'declared_profile_only_not_physical_observation';
  physical_calibration_certified: false;
  actuation_enabled: false;
  inspection: {
    inspection_contract: 'console.passive-calibration.v0.4b';
    module_id: 'org.openrgd.calibration';
    module_version: '0.2.0';
    binary_sha256: string;
    generated_at: string;
    extracted_sources: string[];
    evidence_class: 'declared_profile_only_not_physical_observation';
    actuation_enabled: false;
    physical_calibration_certified: false;
    report: CalibrationPassiveReport;
  };
}

/** A console boot report is a diagnostic, NEVER a physical runtime permit. */
export type BootState = 'checking' | 'setup_required' | 'ready_non_actuating' | 'recovery_required' | 'validator_unavailable';
export interface BootCheck { id: string; state: string; detail: string }
export interface BootReport {
  schema_version: 'console.boot.v0.1';
  status: BootState;
  reason: string;
  message: string;
  checked_at: string;
  selection: { instance_id: string; model_id: string } | null;
  checks: BootCheck[];
  validation: { robot_id: string; modules_count: number; source_root: string | null; source_root_matches: boolean } | null;
  grounding: { robot_id: string; joint_count: number | null; module_count: number | null; execution_authorized: false } | null;
  physical_execution: { assessed: false; authorized: false; status: 'NOT_AUTHORIZED_BY_BOOT' };
  hardware_scanned: false;
  motor_commands_sent: false;
}
