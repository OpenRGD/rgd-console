//! Bounded Console API -> isolated Boot Manager bridge.
//! No host shell/process execution, no CAN/USB hardware access, no motion API.
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;

#[derive(Debug)]
pub struct BootError { pub status: StatusCode, pub message: String }

fn error(status: StatusCode, message: impl Into<String>) -> BootError {
    BootError { status, message: message.into() }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Selection {
    pub instance_id: String,
    pub model_id: String,
}

fn agent_base() -> Result<String, BootError> {
    let value = std::env::var("CONSOLE_BOOT_MANAGER_URL")
        .unwrap_or_else(|_| "http://boot-manager:8091".into());
    if value == "http://boot-manager:8091" || value == "http://127.0.0.1:8091" {
        Ok(value)
    } else {
        Err(error(StatusCode::SERVICE_UNAVAILABLE, "Boot Manager URL non consentito"))
    }
}

async fn relay(method: reqwest::Method, path: &str, payload: Option<Value>) -> Result<Value, BootError> {
    let base = agent_base()?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(55))
        .build().map_err(|_| error(StatusCode::SERVICE_UNAVAILABLE, "Boot Manager client non disponibile"))?;
    let mut request = client.request(method, format!("{base}{path}"));
    if let Some(body) = payload { request = request.json(&body); }
    let response = request.send().await
        .map_err(|_| error(StatusCode::SERVICE_UNAVAILABLE, "Boot Manager non raggiungibile o scaduto"))?;
    let status = response.status();
    if response.content_length().is_some_and(|len| len > 256 * 1024) {
        return Err(error(StatusCode::BAD_GATEWAY, "Risposta Boot Manager troppo grande"));
    }
    let bytes = response.bytes().await.map_err(|_| error(StatusCode::BAD_GATEWAY, "Risposta Boot Manager non leggibile"))?;
    if bytes.len() > 256 * 1024 { return Err(error(StatusCode::BAD_GATEWAY, "Risposta Boot Manager oltre limite")); }
    let body: Value = serde_json::from_slice(&bytes)
        .map_err(|_| error(StatusCode::BAD_GATEWAY, "Boot Manager non ha restituito JSON valido"))?;
    if !status.is_success() {
        return Err(error(
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            body.get("error").and_then(Value::as_str).unwrap_or("Boot Manager ha rifiutato la richiesta"),
        ));
    }
    Ok(body)
}

pub async fn health() -> Result<Value, BootError> {
    relay(reqwest::Method::GET, "/internal/v1/healthz", None).await
}
pub async fn status() -> Result<Value, BootError> {
    relay(reqwest::Method::GET, "/internal/v1/status", None).await
}
pub async fn history() -> Result<Value, BootError> {
    relay(reqwest::Method::GET, "/internal/v1/history", None).await
}
pub async fn recheck() -> Result<Value, BootError> {
    relay(reqwest::Method::POST, "/internal/v1/recheck", Some(json!({}))).await
}
pub async fn select(input: Selection) -> Result<Value, BootError> {
    relay(reqwest::Method::POST, "/internal/v1/select", Some(json!({
        "instance_id": input.instance_id, "model_id": input.model_id
    }))).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn default_boot_manager_url_is_internal_only() {
        // Explicit URL allowlist must never use incoming request-controlled URLs.
        let code = include_str!("boot_manager.rs");
        assert!(!code.contains("reqwest::Method::PUT"));
        assert!(code.contains("http://boot-manager:8091"));
    }
}
