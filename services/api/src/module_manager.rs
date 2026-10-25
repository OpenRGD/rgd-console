//! Thin and strictly bounded Console -> private Module Agent bridge.
//! Console NEVER invokes git/cargo or module binaries itself. The agent is
//! not exposed by the Caddy gateway and has no host-device permissions.
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::Value;
use std::time::Duration;

const DEFAULT_AGENT: &str = "http://module-agent:8090";

#[derive(Debug)]
pub struct ManagerError {
    pub status: StatusCode,
    pub message: String,
}
impl ManagerError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self { status, message: message.into() }
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InstallRequest {
    module_id: String,
    version: String,
    mode: String,
    confirmation: String,
}

impl InstallRequest {
    fn validate(&self) -> Result<(), ManagerError> {
        let segments: Vec<&str> = self.module_id.split('.').collect();
        let valid_id = segments.len() > 1 && segments.iter().all(|segment| {
            !segment.is_empty()
                && segment.as_bytes().first().is_some_and(|b| b.is_ascii_lowercase())
                && segment.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        });
        if !valid_id || self.module_id.len() > 128 {
            return Err(ManagerError::new(StatusCode::UNPROCESSABLE_ENTITY, "ID modulo non valido"));
        }
        let parts: Vec<&str> = self.version.split('.').collect();
        if parts.len() != 3 || parts.iter().any(|part| part.is_empty() || !part.bytes().all(|ch| ch.is_ascii_digit()))
            || self.version.len() > 32 {
            return Err(ManagerError::new(StatusCode::UNPROCESSABLE_ENTITY, "Versione non valida"));
        }
        if self.mode != "build" && self.mode != "source_only" {
            return Err(ManagerError::new(StatusCode::UNPROCESSABLE_ENTITY, "Modalità installazione sconosciuta"));
        }
        let phrase = format!("INSTALL {}@{} {}", self.module_id, self.version, self.mode);
        if self.confirmation != phrase {
            return Err(ManagerError::new(StatusCode::FORBIDDEN, "Approvazione esplicita non corrispondente"));
        }
        Ok(())
    }
}

fn agent_origin() -> Result<String, ManagerError> {
    let value = std::env::var("CONSOLE_MODULE_AGENT_URL")
        .unwrap_or_else(|_| DEFAULT_AGENT.to_owned());
    // This setting is only for a Docker-local service or an explicit loopback
    // developer test; never allow the browser or request to choose a remote URL.
    if value == "http://module-agent:8090" || value == "http://127.0.0.1:8090" {
        Ok(value)
    } else {
        Err(ManagerError::new(StatusCode::SERVICE_UNAVAILABLE, "URL Module Agent non consentito"))
    }
}

async fn relay(method: reqwest::Method, path: &str, payload: Option<Value>) -> Result<Value, ManagerError> {
    let base = agent_origin()?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(18))
        .build()
        .map_err(|_| ManagerError::new(StatusCode::SERVICE_UNAVAILABLE, "Impossibile inizializzare client locale"))?;
    let mut request = client.request(method, format!("{base}{path}"));
    if let Some(json) = payload { request = request.json(&json); }
    let response = request.send().await
        .map_err(|_| ManagerError::new(StatusCode::SERVICE_UNAVAILABLE, "Module Agent non raggiungibile o scaduto"))?;
    let status = response.status();
    let body: Value = response.json().await
        .map_err(|_| ManagerError::new(StatusCode::BAD_GATEWAY, "Risposta Module Agent non valida"))?;
    if !status.is_success() {
        return Err(ManagerError::new(
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            body.get("error").and_then(Value::as_str).unwrap_or("Module Agent ha rifiutato la richiesta"),
        ));
    }
    Ok(body)
}

pub async fn catalog() -> Result<Value, ManagerError> {
    relay(reqwest::Method::GET, "/internal/v1/catalog", None).await
}
pub async fn health() -> Result<Value, ManagerError> {
    relay(reqwest::Method::GET, "/internal/v1/healthz", None).await
}
pub async fn install(request: InstallRequest) -> Result<Value, ManagerError> {
    request.validate()?;
    let body = serde_json::json!({
        "module_id": request.module_id, "version": request.version,
        "mode": request.mode, "confirmation": request.confirmation,
    });
    relay(reqwest::Method::POST, "/internal/v1/install", Some(body)).await
}
pub async fn job_status(job_id: &str) -> Result<Value, ManagerError> {
    if job_id.len() != 32 || !job_id.bytes().all(|ch| ch.is_ascii_hexdigit()) {
        return Err(ManagerError::new(StatusCode::BAD_REQUEST, "Job ID non valido"));
    }
    relay(reqwest::Method::GET, &format!("/internal/v1/jobs/{job_id}"), None).await
}


/// Send only the previously imported ZIP bytes to the isolated, non-actuating
/// Module Agent. No arbitrary executable/args/path is chosen by the caller.
pub async fn inspect_calibration(zip_bytes: Vec<u8>) -> Result<Value, ManagerError> {
    if zip_bytes.is_empty() || zip_bytes.len() > 8 * 1024 * 1024 {
        return Err(ManagerError::new(StatusCode::PAYLOAD_TOO_LARGE, "Profilo ZIP oltre 8 MiB"));
    }
    let base = agent_origin()?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(55))
        .build()
        .map_err(|_| ManagerError::new(StatusCode::SERVICE_UNAVAILABLE, "Client Module Agent non disponibile"))?;
    let response = client.post(format!("{base}/internal/v1/calibration/inspect"))
        .header(reqwest::header::CONTENT_TYPE, "application/zip")
        .body(zip_bytes)
        .send().await
        .map_err(|_| ManagerError::new(StatusCode::SERVICE_UNAVAILABLE, "Ispezione Calibration non raggiungibile o scaduta"))?;
    let status = response.status();
    if response.content_length().is_some_and(|length| length > 4 * 1024 * 1024 + 8192) {
        return Err(ManagerError::new(StatusCode::BAD_GATEWAY, "Risposta Calibration troppo grande"));
    }
    let response_bytes = response.bytes().await
        .map_err(|_| ManagerError::new(StatusCode::BAD_GATEWAY, "Risposta Calibration illeggibile"))?;
    if response_bytes.len() > 4 * 1024 * 1024 + 8192 {
        return Err(ManagerError::new(StatusCode::BAD_GATEWAY, "Risposta Calibration troppo grande"));
    }
    let body: Value = serde_json::from_slice(&response_bytes)
        .map_err(|_| ManagerError::new(StatusCode::BAD_GATEWAY, "Calibration non ha restituito JSON valido"))?;
    if !status.is_success() {
        return Err(ManagerError::new(
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            body.get("error").and_then(Value::as_str).unwrap_or("Ispezione Calibration rifiutata"),
        ));
    }
    let report = body.get("report").ok_or_else(|| ManagerError::new(StatusCode::BAD_GATEWAY, "Report CAL-0.2 mancante"))?;
    let declared_only = body.get("inspection_contract").and_then(Value::as_str) == Some("console.passive-calibration.v0.4b")
        && body.get("actuation_enabled").and_then(Value::as_bool) == Some(false)
        && body.get("physical_calibration_certified").and_then(Value::as_bool) == Some(false)
        && body.get("module_id").and_then(Value::as_str) == Some("org.openrgd.calibration")
        && body.get("module_version").and_then(Value::as_str) == Some("0.2.0")
        && report.get("report_version").and_then(Value::as_str) == Some("0.2.0")
        && report.get("current_robot_position_observed").and_then(Value::as_bool) == Some(false)
        && report.get("physical_drift_evaluated").and_then(Value::as_bool) == Some(false)
        && report.get("claims_physical_calibration_certified").and_then(Value::as_bool) == Some(false)
        && report.get("export_preview").is_some_and(Value::is_null)
        && body.get("evidence_class").and_then(Value::as_str) == Some("declared_profile_only_not_physical_observation");
    if !declared_only {
        return Err(ManagerError::new(StatusCode::BAD_GATEWAY, "Provenienza o invarianti di sicurezza CAL-0.2 non validi"));
    }
    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(mode: &str, confirmation: &str) -> InstallRequest {
        InstallRequest {
            module_id: "org.openrgd.calibration".into(), version: "0.2.0".into(),
            mode: mode.into(), confirmation: confirmation.into(),
        }
    }
    #[test]
    fn requires_exact_operator_confirmation() {
        assert!(request("build", "yes").validate().is_err());
        assert!(request("build", "INSTALL org.openrgd.calibration@0.2.0 build").validate().is_ok());
    }
    #[test]
    fn refuses_unrecognized_install_actions() {
        assert!(request("exec", "INSTALL org.openrgd.calibration@0.2.0 exec").validate().is_err());
    }
    #[test]
    fn rejects_unsafe_module_ids() {
        let mut candidate = request("build", "INSTALL ../../escape@0.2.0 build");
        candidate.module_id = "../../escape".into();
        assert!(candidate.validate().is_err());
    }
}
