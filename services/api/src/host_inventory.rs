//! Import an operator-supplied snapshot of local filesystem metadata.
//! It is **untrusted**, passive evidence; not a live probe or binding authority.
use std::collections::HashSet;
use chrono::DateTime;
use crate::model::{HostInventory, HostInventoryUpload};

fn bounded(label: &str, value: &str, max: usize, optional: bool) -> Result<(), String> {
    if value.chars().count() > max || (!optional && value.trim().is_empty())
        || value.chars().any(char::is_control) {
        return Err(format!("{label}: lunghezza o caratteri non validi"));
    }
    Ok(())
}

pub fn inspect_host_inventory(report: HostInventoryUpload) -> Result<HostInventory, String> {
    if report.schema_version != "console.host-inventory.v1" {
        return Err("Versione inventario host non supportata".into());
    }
    if report.collection_method != "passive_file_metadata_v1" {
        return Err("Metodo di raccolta non supportato: nessuna scansione attiva".into());
    }
    DateTime::parse_from_rfc3339(&report.collected_at)
        .map_err(|_| "Timestamp di raccolta non valido (RFC3339 richiesto)")?;
    bounded("os_id", &report.platform.os_id, 80, false)?;
    bounded("pretty_name", &report.platform.pretty_name, 160, false)?;
    bounded("architecture", &report.platform.architecture, 40, false)?;
    bounded("kernel_release", &report.platform.kernel_release, 120, false)?;
    if report.interfaces.len() > 128 {
        return Err("Inventario troppo grande (massimo 128 interfacce)".into());
    }
    let mut seen = HashSet::new();
    for device in &report.interfaces {
        bounded("id", &device.id, 140, false)?;
        bounded("endpoint", &device.endpoint, 180, false)?;
        bounded("state", &device.state, 48, false)?;
        bounded("evidence_source", &device.evidence_source, 80, false)?;
        if !matches!(device.category.as_str(), "can_interface" | "serial_endpoint" | "video_endpoint") {
            return Err(format!("Categoria di interfaccia non prevista: {}", device.category));
        }
        if !(device.endpoint.starts_with("/dev/") || (device.category == "can_interface" &&
            device.endpoint.chars().all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c)))) {
            return Err("Endpoint non valido: usare una interfaccia CAN o un percorso /dev/".into());
        }
        if device.endpoint.split('/').any(|part| part == "..") {
            return Err("Endpoint non canonico".into());
        }
        if !seen.insert((device.category.as_str(), device.endpoint.as_str())) {
            return Err("Interfaccia duplicata nell'inventario".into());
        }
    }
    Ok(HostInventory {
        report,
        imported_at: chrono::Utc::now().to_rfc3339(),
        verification_state: "operator_supplied_unverified".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{HostPlatform, ObservedInterface};
    fn demo() -> HostInventoryUpload {
        HostInventoryUpload {
            schema_version: "console.host-inventory.v1".into(),
            collection_method: "passive_file_metadata_v1".into(),
            collected_at: "2026-10-21T08:00:00+02:00".into(),
            platform: HostPlatform { os_id: "ubuntu".into(), pretty_name: "Ubuntu 22.04".into(),
                architecture: "x86_64".into(), kernel_release: "6.1".into() },
            interfaces: vec![ObservedInterface { id: "net-can0".into(), category: "can_interface".into(),
                endpoint: "can0".into(), state: "down".into(), evidence_source: "linux_sysfs".into() }],
        }
    }
    #[test]
    fn valid_snapshot_remains_unverified() {
        let record = inspect_host_inventory(demo()).unwrap();
        assert_eq!(record.verification_state, "operator_supplied_unverified");
        assert_eq!(record.report.interfaces[0].endpoint, "can0");
    }
    #[test]
    fn rejects_unsupported_collection_methods() {
        let mut bad = demo();
        bad.collection_method = "active_command_probe".into();
        assert!(inspect_host_inventory(bad).is_err());
    }
    #[test]
    fn rejects_duplicate_endpoints_and_unsafe_paths() {
        let mut bad = demo();
        bad.interfaces.push(bad.interfaces[0].clone());
        assert!(inspect_host_inventory(bad).is_err());
        let mut bad = demo();
        bad.interfaces[0].category = "serial_endpoint".into();
        bad.interfaces[0].endpoint = "/dev/../ttyUSB0".into();
        assert!(inspect_host_inventory(bad).is_err());
    }
}
