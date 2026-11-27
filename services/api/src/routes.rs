use axum::{
    extract::{DefaultBodyLimit, Multipart, Path, Query, State, ws::{Message, WebSocket, WebSocketUpgrade}},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::sync::broadcast;
use crate::{model::{BindingDraft, ConsoleEvent, HostInventory, HostInventoryUpload, ImportedModel, ModuleManifest, RobotRecord, RobotKind, StreamFrame, TelemetrySnapshot, API_VERSION}, host_inventory, imu, model_import, module_manager, boot_manager, state::AppState};

#[derive(Serialize)]
struct ApiError { code: &'static str, message: String }
type HttpError = (StatusCode, Json<ApiError>);
fn fail(code: StatusCode, key: &'static str, message: impl Into<String>) -> HttpError {
    (code, Json(ApiError { code: key, message: message.into() }))
}
fn not_found() -> HttpError { fail(StatusCode::NOT_FOUND, "not_found", "robot/model not registered") }

#[derive(Deserialize)]
struct EventQuery { robot_id: Option<String>, limit: Option<usize> }
#[derive(Deserialize)]
struct StreamQuery { robot_id: String }
#[derive(Deserialize)]
struct CreateInstance { model_id: String, name: String }
#[derive(Deserialize)]
struct ProposeBinding { component_id: String, endpoint_hint: String }

async fn health() -> Json<Value> {
    Json(json!({"ok":true,"api_version":API_VERSION,"actuation_enabled":false}))
}
async fn status(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "api_version": API_VERSION,
        "console_version": env!("CARGO_PKG_VERSION"),
        "read_only": false,
        "writes_scope": "profile_import_instance_registry_unverified_bindings_host_report_explicit_install_passive_inspect_boot_profile_selection_only",
        "actuation_enabled": false,
        "physical_runtime_connected":false,
        "chronon_store_connected":false,
        "adapter_mode":"simulator_and_unbound",
        "registered_robots":state.all_robots().await.len(),
        "control_surface":"none"
    }))
}
async fn robots(State(state): State<AppState>) -> Json<Vec<RobotRecord>> {
    Json(state.all_robots().await)
}
async fn robot(Path(id): Path<String>, State(state): State<AppState>) -> Result<Json<RobotRecord>, HttpError> {
    state.find_robot(&id).await.map(Json).ok_or_else(not_found)
}
async fn telemetry(Path(id): Path<String>, State(state): State<AppState>) -> Result<Json<TelemetrySnapshot>, HttpError> {
    state.snapshot(&id).await.map(Json).ok_or_else(not_found)
}
/// A physically measured but uncalibrated sensor reading is NOT body readiness.
/// Publishing is authenticated separately from browser-side CSRF protection.
async fn imu_ingest(
    State(state): State<AppState>, headers: HeaderMap,
    Json(input): Json<imu::ImuUpload>,
) -> Result<(StatusCode, Json<Value>), HttpError> {
    let expected = std::env::var("CONSOLE_IMU_INGEST_TOKEN").unwrap_or_default();
    let token = headers.get("x-openrgd-imu-token").and_then(|v| v.to_str().ok());
    if !imu::token_matches(token, &expected) {
        return Err(fail(StatusCode::UNAUTHORIZED, "imu_unauthorized", "Token IMU mancante o non valido"));
    }
    input.validate().map_err(|code| fail(StatusCode::UNPROCESSABLE_ENTITY, "imu_invalid", code))?;
    let robot = state.find_robot(&input.robot_id).await.ok_or_else(not_found)?;
    if robot.kind != RobotKind::Physical {
        return Err(fail(StatusCode::CONFLICT, "physical_only", "Il simulatore non puo ricevere IMU fisiche"));
    }
    let allowed = std::env::var("CONSOLE_IMU_ALLOWED_ROBOT_IDS").unwrap_or_default();
    if !allowed.split(',').any(|id| id.trim() == robot.id.as_str()) {
        return Err(fail(StatusCode::FORBIDDEN, "robot_not_allowed", "Robot non autorizzato per ingresso IMU"));
    }
    // One sensor stream per physical robot during v0.1. Session ID may change
    // after collector restart; within one session seq and monotonic time must rise.
    let mut latest = state.imu_latest.write().await;
    if let Some(previous) = latest.get(&robot.id) {
        if previous.sensor_id != input.sensor_id || previous.source_id != input.source_id {
            return Err(fail(StatusCode::CONFLICT, "imu_source_conflict", "Sorgente IMU fisica gia registrata"));
        }
        if previous.session_id == input.session_id &&
           (input.sequence <= previous.sequence || input.host_monotonic_ns < previous.host_monotonic_ns) {
            return Err(fail(StatusCode::CONFLICT, "imu_replay", "Sequenza IMU non crescente"));
        }
    }
    let observation = imu::observe(input);
    latest.insert(robot.id.clone(), observation.clone());
    drop(latest);
    // The existing read-only websocket fan-out; never emit motor readiness.
    let _ = state.stream.send(StreamFrame::new("imu", Some(&robot.id), json!(observation)));
    Ok((StatusCode::ACCEPTED, Json(json!({"accepted":true,"schema_version":imu::OBSERVATION_SCHEMA,"actuation_enabled":false}))))
}

async fn imu_latest(
    Path(id): Path<String>, State(state): State<AppState>,
) -> Result<Json<Value>, HttpError> {
    if state.find_robot(&id).await.is_none() { return Err(not_found()); }
    let latest = state.imu_latest.read().await;
    let candidate = latest.get(&id).filter(|o| imu::is_fresh(o, 3000));
    Ok(Json(candidate.map_or(Value::Null, |o| json!(o))))
}

async fn events(State(state): State<AppState>, Query(query): Query<EventQuery>) -> Json<Vec<ConsoleEvent>> {
    let max = query.limit.unwrap_or(60).clamp(1, 200);
    let rows = state.events.read().await;
    Json(rows.iter().filter(|e| query.robot_id.as_ref().map(|id| &e.robot_id == id).unwrap_or(true)).take(max).cloned().collect())
}
async fn modules(State(state): State<AppState>) -> Json<Vec<ModuleManifest>> {
    Json(state.modules.as_ref().clone())
}
async fn module_catalog() -> Result<Json<Value>, HttpError> {
    module_manager::catalog().await.map(Json)
        .map_err(|error| fail(error.status, "module_agent_error", error.message))
}

async fn module_agent_health() -> Result<Json<Value>, HttpError> {
    module_manager::health().await.map(Json)
        .map_err(|error| fail(error.status, "module_agent_error", error.message))
}

async fn module_install(headers: HeaderMap, Json(request): Json<module_manager::InstallRequest>)
    -> Result<(StatusCode, Json<Value>), HttpError> {
    if !mutation_allowed(&headers) { return Err(mutation_error()); }
    module_manager::install(request).await
        .map(|result| (StatusCode::ACCEPTED, Json(result)))
        .map_err(|error| fail(error.status, "module_install_rejected", error.message))
}

async fn module_job(Path(job_id): Path<String>) -> Result<Json<Value>, HttpError> {
    module_manager::job_status(&job_id).await.map(Json)
        .map_err(|error| fail(error.status, "module_agent_error", error.message))
}

/// Operator-requested read-only CAL-0.2 model inspection. It cannot run
/// without an imported, model-linked physical instance or a ready module.
async fn calibration_inspect(
    Path(robot_id): Path<String>, State(state): State<AppState>, headers: HeaderMap,
) -> Result<Json<Value>, HttpError> {
    if !mutation_allowed(&headers) { return Err(mutation_error()); }
    let robot = state.find_robot(&robot_id).await.ok_or_else(not_found)?;
    let model_id = robot.rgd_model_id.ok_or_else(|| fail(
        StatusCode::CONFLICT, "model_not_attached", "Importa un modello RGD e registra una distinta istanza fisica"))?;
    let model = state.find_model(&model_id).await.ok_or_else(not_found)?;
    if model.source_format != "openrgd-source-profile-zip" {
        return Err(fail(StatusCode::UNPROCESSABLE_ENTITY, "unsupported_profile", "Formato di profilo non supportato"));
    }
    let archive_path = state.data_dir.join("imports").join(format!("{}.zip", model.model_id));
    let metadata = tokio::fs::symlink_metadata(&archive_path).await.map_err(|_| fail(
        StatusCode::NOT_FOUND, "archive_not_found", "Archivio ZIP originale non disponibile"))?;
    if !metadata.file_type().is_file() || metadata.len() > 8 * 1024 * 1024 {
        return Err(fail(StatusCode::UNPROCESSABLE_ENTITY, "unsafe_archive", "Archivio ZIP mancante o non regolare"));
    }
    let bytes = tokio::fs::read(&archive_path).await.map_err(|_| fail(
        StatusCode::INTERNAL_SERVER_ERROR, "archive_read_failed", "Impossibile leggere l'archivio ZIP"))?;
    let actual_digest = format!("sha256:{:x}", Sha256::digest(&bytes));
    if actual_digest != model.source_sha256 {
        return Err(fail(StatusCode::CONFLICT, "archive_integrity_mismatch", "Archivio originale modificato: ispezione rifiutata"));
    }
    let inspection = module_manager::inspect_calibration(bytes).await
        .map_err(|error| fail(error.status, "calibration_inspect_failed", error.message))?;
    let envelope = json!({
        "schema_version":"console.calibration-inspection.v0.4b",
        "robot_id":robot_id.clone(),
        "source_model_id":model.model_id.clone(),
        "source_profile_sha256":model.source_sha256.clone(),
        "source_integrity":"canonical_not_verified",
        "generated_at":chrono::Utc::now().to_rfc3339(),
        "evidence_class":"declared_profile_only_not_physical_observation",
        "physical_calibration_certified":false,
        "actuation_enabled":false,
        "inspection":inspection
    });
    state.save_calibration_preview(&robot_id, &envelope).await.map_err(|_| fail(
        StatusCode::INTERNAL_SERVER_ERROR, "report_persistence_failed", "Ispezione completata, salvataggio del report non riuscito"))?;
    Ok(Json(envelope))
}

async fn calibration_last(
    Path(robot_id): Path<String>, State(state): State<AppState>,
) -> Result<Json<Value>, HttpError> {
    if state.find_robot(&robot_id).await.is_none() { return Err(not_found()); }
    Ok(Json(state.last_calibration_preview(&robot_id).await.unwrap_or(Value::Null)))
}

/// Boot health differs from boot readiness. A failed profile check must
/// never make the Console itself unavailable.
async fn boot_health() -> Result<Json<Value>, HttpError> {
    boot_manager::health().await.map(Json)
        .map_err(|e| fail(e.status, "boot_manager_error", e.message))
}
async fn boot_status() -> Result<Json<Value>, HttpError> {
    boot_manager::status().await.map(Json)
        .map_err(|e| fail(e.status, "boot_manager_error", e.message))
}
async fn boot_history() -> Result<Json<Value>, HttpError> {
    boot_manager::history().await.map(Json)
        .map_err(|e| fail(e.status, "boot_manager_error", e.message))
}
async fn boot_recheck(headers: HeaderMap) -> Result<Json<Value>, HttpError> {
    if !mutation_allowed(&headers) { return Err(mutation_error()); }
    boot_manager::recheck().await.map(Json)
        .map_err(|e| fail(e.status, "boot_manager_error", e.message))
}
async fn boot_select(
    State(state): State<AppState>, headers: HeaderMap,
    Json(input): Json<boot_manager::Selection>,
) -> Result<Json<Value>, HttpError> {
    if !mutation_allowed(&headers) { return Err(mutation_error()); }
    let robot = state.find_robot(&input.instance_id).await.ok_or_else(not_found)?;
    if robot.kind != crate::model::RobotKind::Physical ||
        robot.rgd_model_id.as_deref() != Some(input.model_id.as_str()) {
        return Err(fail(StatusCode::CONFLICT, "model_instance_mismatch", "Istanza fisica e modello RGD non corrispondono"));
    }
    boot_manager::select(input).await.map(Json)
        .map_err(|e| fail(e.status, "boot_manager_error", e.message))
}

async fn models(State(state): State<AppState>) -> Json<Vec<ImportedModel>> {
    Json(state.all_models().await)
}
async fn model(Path(model_id): Path<String>, State(state): State<AppState>) -> Result<Json<ImportedModel>, HttpError> {
    state.find_model(&model_id).await.map(Json).ok_or_else(not_found)
}
async fn robot_model(Path(robot_id): Path<String>, State(state): State<AppState>) -> Result<Json<ImportedModel>, HttpError> {
    state.model_for_robot(&robot_id).await.map(Json).ok_or_else(not_found)
}


/// Inspect HAL declarations from the original uploaded RGD archive.
/// Only source metadata is returned: no CAN socket is opened and no draft
/// physical binding is created. Existing imported profiles need no migration.
async fn robot_hal_declarations(
    Path(robot_id): Path<String>, State(state): State<AppState>,
) -> Result<Json<model_import::HalInspection>, HttpError> {
    let robot = state.find_robot(&robot_id).await.ok_or_else(not_found)?;
    let model_id = robot.rgd_model_id.ok_or_else(|| fail(
        StatusCode::CONFLICT, "model_not_attached", "Seleziona una istanza con profilo RGD importato"))?;
    let model = state.find_model(&model_id).await.ok_or_else(not_found)?;
    if model.source_format != "openrgd-source-profile-zip" ||
        model.model_id.len() != 24 ||
        !model.model_id.starts_with("rgd-") ||
        !model.model_id[4..].bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(fail(StatusCode::UNPROCESSABLE_ENTITY, "unsupported_model_id", "Identità archivio RGD non valida"));
    }
    let archive_path = state.data_dir.join("imports").join(format!("{}.zip", model.model_id));
    let meta = tokio::fs::symlink_metadata(&archive_path).await.map_err(|_| fail(
        StatusCode::NOT_FOUND, "archive_not_found", "Archivio RGD originale non disponibile"))?;
    if !meta.file_type().is_file() || meta.len() > model_import::MAX_UPLOAD_BYTES as u64 {
        return Err(fail(StatusCode::UNPROCESSABLE_ENTITY, "invalid_archive", "Archivio RGD non regolare o troppo grande"));
    }
    let bytes = tokio::fs::read(&archive_path).await.map_err(|_| fail(
        StatusCode::INTERNAL_SERVER_ERROR, "archive_read_failed", "Lettura archivio RGD non riuscita"))?;
    let hash = format!("sha256:{:x}", Sha256::digest(&bytes));
    if hash != model.source_sha256 {
        return Err(fail(StatusCode::CONFLICT, "archive_digest_mismatch", "Archivio modificato rispetto alla registrazione"));
    }
    let report = model_import::inspect_hal_declarations(&bytes, &model)
        .map_err(|error| fail(StatusCode::UNPROCESSABLE_ENTITY, "hal_inspection_failed", error))?;
    Ok(Json(report))
}

fn same_origin(headers: &HeaderMap) -> bool {
    let Some(origin) = headers.get(header::ORIGIN) else { return true; };
    let Ok(origin) = origin.to_str() else { return false; };
    let same_host = headers.get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .map(|host| origin == format!("http://{host}") || origin == format!("https://{host}"))
        .unwrap_or(false);
    let explicit = std::env::var("CONSOLE_ALLOWED_ORIGINS").unwrap_or_default()
        .split(',').any(|candidate| !candidate.trim().is_empty() && candidate.trim() == origin);
    same_host || explicit
}
/// A custom request header helps block ordinary cross-site form POSTs. This is
/// CSRF mitigation, NOT authentication. Keep the entire API loopback-only.
fn mutation_allowed(headers: &HeaderMap) -> bool {
    same_origin(headers)
        && headers.get("x-openrgd-console")
            .and_then(|v| v.to_str().ok()) == Some("onboarding.v1")
}
fn mutation_error() -> HttpError {
    fail(StatusCode::FORBIDDEN, "mutation_rejected", "Origin/header non consentito per il provisioning locale")
}

async fn import_model(
    State(state): State<AppState>, headers: HeaderMap, mut multipart: Multipart
) -> Result<(StatusCode, Json<ImportedModel>), HttpError> {
    if !mutation_allowed(&headers) { return Err(mutation_error()); }
    let field = multipart.next_field().await.map_err(|_| fail(StatusCode::BAD_REQUEST, "invalid_upload", "Upload multipart non leggibile"))?
        .ok_or_else(|| fail(StatusCode::BAD_REQUEST, "missing_file", "Campo 'file' obbligatorio"))?;
    if field.name() != Some("file") { return Err(fail(StatusCode::BAD_REQUEST, "wrong_field", "Usare il campo 'file'")); }
    let name = field.file_name().unwrap_or("").to_owned();
    let contents = field.bytes().await.map_err(|_| fail(StatusCode::BAD_REQUEST, "invalid_upload", "Impossibile leggere file"))?;
    if multipart.next_field().await.map_err(|_| fail(StatusCode::BAD_REQUEST, "invalid_upload", "Upload malformato"))?.is_some() {
        return Err(fail(StatusCode::BAD_REQUEST, "too_many_files", "Caricare un solo archivio ZIP"));
    }
    let inspected = model_import::inspect_bundle(contents.as_ref(), &name)
        .map_err(|err| fail(StatusCode::UNPROCESSABLE_ENTITY, "invalid_rgd_profile", err))?;
    state.import_model(inspected, contents.as_ref()).await
        .map(|model| (StatusCode::CREATED, Json(model)))
        .map_err(|err| fail(StatusCode::INTERNAL_SERVER_ERROR, "persistence_failed", err))
}

async fn create_instance(
    State(state): State<AppState>, headers: HeaderMap, Json(request): Json<CreateInstance>
) -> Result<(StatusCode, Json<RobotRecord>), HttpError> {
    if !mutation_allowed(&headers) { return Err(mutation_error()); }
    state.create_instance(&request.model_id, &request.name).await
        .map(|robot| (StatusCode::CREATED, Json(robot)))
        .map_err(|err| fail(StatusCode::BAD_REQUEST, "invalid_instance", err))
}

async fn bindings(Path(robot_id): Path<String>, State(state): State<AppState>) -> Result<Json<Vec<BindingDraft>>, HttpError> {
    if state.find_robot(&robot_id).await.is_none() { return Err(not_found()); }
    Ok(Json(state.bindings(&robot_id).await))
}
async fn propose_binding(
    Path(robot_id): Path<String>, State(state): State<AppState>, headers: HeaderMap, Json(request): Json<ProposeBinding>
) -> Result<(StatusCode, Json<BindingDraft>), HttpError> {
    if !mutation_allowed(&headers) { return Err(mutation_error()); }
    state.propose_binding(&robot_id, &request.component_id, &request.endpoint_hint).await
        .map(|binding| (StatusCode::CREATED, Json(binding)))
        .map_err(|err| fail(StatusCode::BAD_REQUEST, "invalid_binding_draft", err))
}

async fn installation_diagnostics(State(state): State<AppState>) -> Json<Value> {
    let data_path = state.data_dir.as_path();
    Json(json!({
        "schema_version":"console.installation-diagnostics.v1",
        "console_version":env!("CARGO_PKG_VERSION"),
        "api_reachable":true,
        "data_directory_present":data_path.is_dir(),
        "registered_robots":state.all_robots().await.len(),
        "imported_models":state.all_models().await.len(),
        "host_report_imported":state.host_inventory().await.is_some(),
        "server_container_scope_only":true,
        "canonical_validator_integrated":false,
        "hardware_scanned_by_backend":false,
        "software_installation_enabled":false,
        "actuation_enabled":false,
    }))
}

async fn latest_host_inventory(State(state): State<AppState>) -> Json<Option<HostInventory>> {
    Json(state.host_inventory().await)
}

async fn upload_host_inventory(
    State(state): State<AppState>, headers: HeaderMap, Json(input): Json<HostInventoryUpload>
) -> Result<(StatusCode, Json<HostInventory>), HttpError> {
    if !mutation_allowed(&headers) { return Err(mutation_error()); }
    let report = host_inventory::inspect_host_inventory(input)
        .map_err(|err| fail(StatusCode::UNPROCESSABLE_ENTITY, "invalid_host_inventory", err))?;
    state.save_host_inventory(report).await
        .map(|saved| (StatusCode::CREATED, Json(saved)))
        .map_err(|err| fail(StatusCode::INTERNAL_SERVER_ERROR, "persistence_failed", err))
}

async fn host_inspect() -> Json<Value> {
    let in_container = std::path::Path::new("/.dockerenv").exists()
        || std::path::Path::new("/run/.containerenv").exists();
    let release = std::fs::read_to_string("/etc/os-release").ok();
    let distro = release.as_ref().and_then(|raw| raw.lines().find_map(|line| {
        line.strip_prefix("PRETTY_NAME=").map(|name| name.trim_matches('"').to_owned())
    }));
    Json(json!({
        "inspection_scope":if in_container {"container_process_environment"} else {"local_process_environment"},
        "operating_system":std::env::consts::OS,
        "architecture":std::env::consts::ARCH,
        "environment_distribution":distro,
        "logical_cpus":std::thread::available_parallelism().ok().map(|n| n.get()),
        "host_operating_system_verified":false,
        "devices_scanned":false,
        "probe_mode":"passive_process_metadata_only",
        "software_installation_enabled":false,
        "actuation_enabled":false
    }))
}

async fn discovery(Path(robot_id): Path<String>, State(state): State<AppState>) -> Result<Json<Value>, HttpError> {
    if state.find_robot(&robot_id).await.is_none() { return Err(not_found()); }
    Ok(Json(json!({
        "robot_id":robot_id, "status":"not_enabled", "devices":[],
        "observed_at":null, "note":"Nessun device scan né handshake runtime effettuato",
        "hardware_access":false
    })))
}

async fn readiness(Path(robot_id): Path<String>, State(state): State<AppState>) -> Result<Json<Value>, HttpError> {
    let robot = state.find_robot(&robot_id).await.ok_or_else(not_found)?;
    let model = state.model_for_robot(&robot_id).await;
    let draft_count = state.bindings(&robot_id).await.len();
    let has_host_report = state.host_inventory().await.is_some();
    let structural = model.as_ref().map(|m| m.profile_state.as_str()).unwrap_or("not_imported");
    Ok(Json(json!({
        "robot_id":robot_id,
        "status":"not_ready_for_actuation",
        "actuation_enabled":false,
        "checks":[
            {"key":"model_profile","state":structural,"detail":"Dati estratti dalla descrizione RGD, non dalla macchina fisica"},
            {"key":"canonical_integrity","state":"not_verified","detail":"Eseguire rgd check prima di dichiarare un profilo valido"},
            {"key":"body_topology","state":model.as_ref().map(|m| m.geometry_state.as_str()).unwrap_or("unknown"),"detail":"Geometria nominale dichiarata"},
            {"key":"host_environment","state":"process_metadata_only","detail":"Rilevamento host fisico non disponibile in container"},
            {"key":"host_inventory","state":if has_host_report {"operator_supplied_unverified"} else {"not_uploaded"},"detail":"I metadati dell'host non verificano l'hardware né autorizzano binding"},
            {"key":"physical_discovery","state":"not_enabled","detail":"Nessun dispositivo hardware interrogato dalla Console"},
            {"key":"physical_bindings","state":if draft_count > 0 {"unverified_drafts"} else {"not_mapped"},"detail":format!("{draft_count} proposte, 0 binding verificati")},
            {"key":"calibration","state":"not_assessed","detail":"Modulo calibrazione indipendente"},
            {"key":"somatic_runtime","state":"not_connected","detail":"Nessuna integrazione con runtime fisico"},
            {"key":"actuation","state":"blocked","detail":"Nessun controllo motori nella Console"}
        ],
        "robot_kind":robot.kind
    })))
}

async fn stream(
    State(state): State<AppState>, Query(query): Query<StreamQuery>, headers: HeaderMap, ws: WebSocketUpgrade,
) -> Response {
    if state.find_robot(&query.robot_id).await.is_none() { return not_found().into_response(); }
    if !same_origin(&headers) { return fail(StatusCode::FORBIDDEN, "origin_rejected", "WebSocket origin not allowed").into_response(); }
    ws.max_message_size(1024).max_frame_size(1024).on_upgrade(move |socket| socket_loop(socket, state, query.robot_id))
}
async fn send_frame(socket: &mut WebSocket, frame: &StreamFrame) -> bool {
    let Ok(payload) = serde_json::to_string(frame) else { return false; };
    socket.send(Message::Text(payload.into())).await.is_ok()
}
async fn socket_loop(mut socket: WebSocket, state: AppState, robot_id: String) {
    let mut receiver = state.stream.subscribe();
    let hello = StreamFrame::new("hello", Some(&robot_id), json!({
        "read_only_telemetry":true,
        "robot_id":robot_id,
        "data_provenance":"no physical samples without a source"
    }));
    if !send_frame(&mut socket, &hello).await { return; }
    if let Some(snapshot) = state.snapshot(&robot_id).await {
        let initial = StreamFrame::new("telemetry", Some(&robot_id), json!(snapshot));
        if !send_frame(&mut socket, &initial).await { return; }
    }
    if let Some(sample) = state.imu_latest.read().await.get(&robot_id).filter(|o| imu::is_fresh(o, 3000)).cloned() {
        if !send_frame(&mut socket, &StreamFrame::new("imu", Some(&robot_id), json!(sample))).await { return; }
    }
    let mut heartbeat = tokio::time::interval(std::time::Duration::from_secs(15));
    loop {
        tokio::select! {
            received = receiver.recv() => {
                match received {
                    Ok(frame) => {
                        if frame.robot_id.as_deref() == Some(robot_id.as_str()) && !send_frame(&mut socket, &frame).await { break; }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        if let Some(snapshot) = state.snapshot(&robot_id).await {
                            let frame = StreamFrame::new("telemetry", Some(&robot_id), json!(snapshot));
                            if !send_frame(&mut socket, &frame).await { break; }
                        }
                        if let Some(sample) = state.imu_latest.read().await.get(&robot_id).filter(|o| imu::is_fresh(o, 3000)).cloned() {
                            if !send_frame(&mut socket, &StreamFrame::new("imu", Some(&robot_id), json!(sample))).await { break; }
                        }
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            incoming = socket.recv() => {
                match incoming {
                    None | Some(Err(_)) | Some(Ok(Message::Close(_))) => break,
                    Some(Ok(_)) => { /* No command messages accepted. */ }
                }
            }
            _ = heartbeat.tick() => {
                let frame = StreamFrame::new("heartbeat", Some(&robot_id), json!({"actuation_enabled":false}));
                if !send_frame(&mut socket, &frame).await { break; }
            }
        }
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(health))
        .route("/api/v1/status", get(status))
        .route("/api/v1/robots", get(robots))
        .route("/api/v1/robots/{id}", get(robot))
        .route("/api/v1/robots/{id}/telemetry", get(telemetry))
        .route("/api/v1/robots/{id}/imu", get(imu_latest))
        .route("/api/v1/imu/observations", axum::routing::post(imu_ingest).layer(DefaultBodyLimit::max(4096)))
        .route("/api/v1/robots/{id}/model", get(robot_model))
        .route("/api/v1/robots/{id}/hal-declarations", get(robot_hal_declarations))
        .route("/api/v1/robots/{id}/calibration/inspect", axum::routing::post(calibration_inspect))
        .route("/api/v1/robots/{id}/calibration/last", get(calibration_last))
        .route("/api/v1/robots/{id}/readiness", get(readiness))
        .route("/api/v1/robots/{id}/discovery", get(discovery))
        .route("/api/v1/robots/{id}/bindings", get(bindings).post(propose_binding))
        .route("/api/v1/models", get(models))
        .route("/api/v1/models/{model_id}", get(model))
        .route("/api/v1/models/import", axum::routing::post(import_model))
        .route("/api/v1/instances", axum::routing::post(create_instance))
        .route("/api/v1/host", get(host_inspect))
        .route("/api/v1/installation/diagnostics", get(installation_diagnostics))
        .route("/api/v1/host-reports/latest", get(latest_host_inventory))
        .route("/api/v1/host-reports/import", axum::routing::post(upload_host_inventory))
        .route("/api/v1/events", get(events))
        .route("/api/v1/modules", get(modules))
        .route("/api/v1/modules/catalog", get(module_catalog))
        .route("/api/v1/modules/agent-health", get(module_agent_health))
        .route("/api/v1/modules/install", axum::routing::post(module_install))
        .route("/api/v1/modules/jobs/{job_id}", get(module_job))
        .route("/api/v1/boot/health", get(boot_health))
        .route("/api/v1/boot/status", get(boot_status))
        .route("/api/v1/boot/history", get(boot_history))
        .route("/api/v1/boot/recheck", axum::routing::post(boot_recheck))
        .route("/api/v1/boot/select", axum::routing::post(boot_select))
        .route("/api/v1/stream", get(stream))
        .layer(DefaultBodyLimit::max(model_import::MAX_UPLOAD_BYTES + 64 * 1024))
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::{Method, Request}};
    use tower::ServiceExt;
    fn fixture() -> AppState {
        let base = concat!(env!("CARGO_MANIFEST_DIR"), "/../../config/");
        AppState::from_files(&format!("{base}robots.json"), &format!("{base}modules.json")).unwrap()
    }
    #[tokio::test]
    async fn physical_robot_has_no_fake_voltage() {
        let app = router(fixture());
        let response = app.oneshot(Request::builder().uri("/api/v1/robots/paky-01/telemetry").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert!(value["power"]["voltage"]["value"].is_null());
        assert_eq!(value["runtime_state"], "not_connected");
    }
    #[tokio::test]
    async fn no_actuation_post_routes_exist() {
        let app = router(fixture());
        let response = app.oneshot(Request::builder().method(Method::POST).uri("/api/v1/robots/paky-01/command").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
    #[tokio::test]
    async fn profile_mutations_need_explicit_header() {
        let app = router(fixture());
        let response = app.oneshot(Request::builder().method(Method::POST).uri("/api/v1/instances")
            .header(header::CONTENT_TYPE,"application/json")
            .body(Body::from(r#"{"model_id":"absent","name":"Example"}"#)).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
    #[tokio::test]
    async fn host_snapshot_mutation_needs_protection_header() {
        let app = router(fixture());
        let payload = serde_json::json!({
            "schema_version": "console.host-inventory.v1",
            "collection_method": "passive_file_metadata_v1",
            "collected_at": "2026-10-21T08:00:00+02:00",
            "platform": {"os_id":"ubuntu", "pretty_name":"Ubuntu 22.04", "architecture":"x86_64", "kernel_release":"6.1"},
            "interfaces": []
        }).to_string();
        let response = app.oneshot(Request::builder().method(Method::POST)
            .uri("/api/v1/host-reports/import")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(payload)).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn module_install_requires_local_csrf_protection() {
        let app = router(fixture());
        let response = app.oneshot(Request::builder().method(Method::POST)
            .uri("/api/v1/modules/install")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(r#"{"module_id":"org.openrgd.calibration","version":"0.2.0","mode":"build","confirmation":"INSTALL org.openrgd.calibration@0.2.0 build"}"#))
            .unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn passive_calibration_requires_local_authorization_header() {
        let app = router(fixture());
        let response = app.oneshot(Request::builder().method(Method::POST)
            .uri("/api/v1/robots/paky-01/calibration/inspect")
            .body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn passive_calibration_requires_imported_model_instance() {
        let app = router(fixture());
        let response = app.oneshot(Request::builder().method(Method::POST)
            .uri("/api/v1/robots/paky-01/calibration/inspect")
            .header("x-openrgd-console", "onboarding.v1")
            .body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn hal_inspection_does_not_probe_physical_bhl_without_uploaded_model() {
        let app = router(fixture());
        let response = app.oneshot(Request::builder()
            .uri("/api/v1/robots/paky-01/hal-declarations")
            .body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::CONFLICT);
    }

    #[test]
    fn rejects_cross_origin_websocket() {
        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, "127.0.0.1:8088".parse().unwrap());
        headers.insert(header::ORIGIN, "https://malicious.example".parse().unwrap());
        assert!(!same_origin(&headers));
        headers.insert(header::ORIGIN, "http://127.0.0.1:8088".parse().unwrap());
        assert!(same_origin(&headers));
    }
}
