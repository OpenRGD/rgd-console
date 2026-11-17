//! Safe, non-actuating preview importer for a ZIP-packaged OpenRGD source profile.
//! Accepts .zip, or .rgd only when the payload is genuinely a ZIP archive.
//! This .rgd compatibility alias does NOT standardize a new single-file format.
//! IMPORTANT: this is NOT the canonical OpenRGD integrity validator. The
//! exported source SHA identifies upload bytes only; it does not prove that
//! the source tree's `OPENRGD_SOURCE_TREE_SHA256_V1` root matches.
use std::{collections::{BTreeMap, HashSet}, io::{Cursor, Read}};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use zip::ZipArchive;
use crate::model::{ImportedModel, RgdJoint, RgdLink, RgdSensor};

pub const MAX_UPLOAD_BYTES: usize = 8 * 1024 * 1024;
const MAX_UNCOMPRESSED: u64 = 16 * 1024 * 1024;
const MAX_ENTRIES: usize = 256;
const MAX_JSONC_BYTES: u64 = 2 * 1024 * 1024;

fn sha256(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
fn string<'a>(obj: &'a Value, field: &str) -> Option<&'a str> {
    obj.get(field).and_then(Value::as_str).filter(|s| !s.trim().is_empty())
}
fn finite(obj: &Value, field: &str) -> Option<f64> {
    obj.get(field).and_then(Value::as_f64).filter(|v| v.is_finite())
}
fn vector(obj: &Value, field: &str) -> Option<Vec<f64>> {
    let values = obj.get(field)?.as_array()?;
    if values.len() != 3 { return None; }
    values.iter().map(|x| x.as_f64().filter(|n| n.is_finite())).collect::<Option<Vec<_>>>()
}
fn safe_entry(path: &str) -> bool {
    !path.is_empty() && !path.starts_with('/') && !path.contains('\\') && !path.contains('\0')
      && !path.split('/').any(|part| part == "." || part == ".." || part == "")
}
fn parse_object(bytes: &[u8], path: &str) -> Result<Value, String> {
    let source = std::str::from_utf8(bytes).map_err(|_| format!("{path}: il file non è UTF-8"))?;
    let object: Value = json5::from_str(source).map_err(|e| format!("{path}: JSONC non valido: {e}"))?;
    if !object.is_object() { return Err(format!("{path}: è richiesto un oggetto JSONC")); }
    Ok(object)
}

pub fn inspect_bundle(bytes: &[u8], original_name: &str) -> Result<ImportedModel, String> {
    if bytes.is_empty() || bytes.len() > MAX_UPLOAD_BYTES { return Err("Archivio vuoto o oltre 8 MiB".into()); }
    let filename = original_name.to_ascii_lowercase();
    let is_zip = filename.ends_with(".zip");
    let is_rgd = filename.ends_with(".rgd");
    if !is_zip && !is_rgd {
        return Err("Caricare un pacchetto RGD .zip oppure .rgd contenente un archivio ZIP valido".into());
    }
    // Existing RGD models are multi-file source trees. The optional .rgd
    // extension is recognized only as an explicitly ZIP-packaged directory,
    // never as an ad-hoc JSON / unverified compiled-spec representation.
    if is_rgd && !bytes.starts_with(b"PK\x03\x04") {
        return Err("Il file .rgd non contiene un archivio ZIP RGD. I profili esistenti con spec/ vanno compressi in ZIP; un singolo JSON .rgd non è un bundle canonico".into());
    }
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|_| "Il file non è un archivio ZIP RGD valido".to_string())?;
    if archive.len() > MAX_ENTRIES { return Err("Troppe voci ZIP (massimo 256)".into()); }
    let mut total = 0u64;
    let mut items: BTreeMap<String, Vec<u8>> = BTreeMap::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|_| "Voce ZIP illeggibile".to_string())?;
        if entry.is_dir() { continue; }
        let name = entry.name().to_owned();
        if !safe_entry(&name) { return Err(format!("Percorso ZIP non sicuro: {name}")); }
        if matches!(entry.unix_mode(), Some(mode) if mode & 0o170000 == 0o120000) {
            return Err(format!("Link simbolico non consentito: {name}"));
        }
        total = total.checked_add(entry.size()).ok_or("Dimensione archivio fuori limite")?;
        if total > MAX_UNCOMPRESSED { return Err("Archivio decompresso oltre 16 MiB".into()); }
        if name.ends_with(".jsonc") {
            if entry.size() > MAX_JSONC_BYTES { return Err(format!("File JSONC troppo grande: {name}")); }
            let mut buf = Vec::with_capacity(entry.size() as usize);
            entry.take(MAX_JSONC_BYTES + 1).read_to_end(&mut buf)
                .map_err(|_| format!("Impossibile leggere {name}"))?;
            if buf.len() as u64 > MAX_JSONC_BYTES { return Err(format!("File JSONC decompressato troppo grande: {name}")); }
            if items.insert(name.clone(), buf).is_some() { return Err(format!("Percorso duplicato: {name}")); }
        }
    }
    // A profile may be at the root or inside one top-level robot directory.
    let candidates: Vec<_> = items.keys().filter_map(|name| {
        name.strip_suffix("spec/01_foundation/description.jsonc").map(str::to_owned)
    }).collect();
    if candidates.len() != 1 { return Err("Occorre esattamente un profilo spec/01_foundation/description.jsonc".into()); }
    let root = &candidates[0];
    if !root.is_empty() && (!root.ends_with('/') || root.trim_end_matches('/').contains('/')) {
        return Err("Bundle con percorso radice ambiguo".into());
    }
    let path = |relative: &str| format!("{root}spec/{relative}");
    let description_path = path("01_foundation/description.jsonc");
    let description = parse_object(items.get(&description_path).expect("candidate path exists"), &description_path)?;
    let meta = &description["meta_group"];
    let name = string(meta, "species_name_str")
        .or_else(|| string(meta, "model_id_str"))
        .unwrap_or("Unnamed RGD model").to_owned();
    let manufacturer = string(meta, "manufacturer_str").map(str::to_owned);
    let manifest_path = path("manifest.jsonc");
    let manifest = items.get(&manifest_path).map(|bytes| parse_object(bytes, &manifest_path)).transpose()?;
    let kernel_path = path("00_core/kernel.jsonc");
    let kernel = items.get(&kernel_path).map(|bytes| parse_object(bytes, &kernel_path)).transpose()?;
    let mut warnings = Vec::<String>::new();
    let mut missing_modules = Vec::<String>::new();
    let mut module_refs = Vec::<String>::new();
    if manifest.is_none() { warnings.push("Manifesto del profilo assente: import Foundation parziale".into()); }
    if kernel.is_none() { warnings.push("Kernel assente: impossibile verificare la lista moduli".into()); }
    if let Some(kernel) = &kernel {
        let raw = kernel.get("module_loading_order_list").and_then(Value::as_array)
            .ok_or("Kernel privo della lista dei moduli")?;
        if raw.is_empty() { return Err("Kernel con lista moduli vuota".into()); }
        let mut seen = HashSet::new();
        for entry in raw {
            let module_ref = entry.as_str().ok_or("Riferimento modulo non testuale")?;
            if !safe_entry(module_ref) || !module_ref.ends_with(".jsonc") || module_ref.starts_with("spec/") {
                return Err(format!("Riferimento modulo non sicuro: {module_ref}"));
            }
            if !seen.insert(module_ref) { return Err(format!("Modulo duplicato nel kernel: {module_ref}")); }
            let module_path = path(module_ref);
            match items.get(&module_path) {
                Some(content) => { parse_object(content, &module_path)?; }
                None => { missing_modules.push(module_ref.into()); }
            }
            module_refs.push(module_ref.into());
        }
        if !missing_modules.is_empty() {
            warnings.push(format!("{} moduli del kernel mancanti", missing_modules.len()));
        }
    }
    let mut links = Vec::new();
    if let Some(map) = description.get("kinematic_chain_list").and_then(Value::as_array) {
        for item in map {
            let Some(id) = string(item, "link_id_str") else { continue; };
            let mass = finite(&item["inertial_properties"], "mass_kg_float");
            links.push(RgdLink { id: id.into(), mass_kg: mass });
        }
    }
    let mut joints = Vec::new();
    if let Some(map) = description.get("joint_topology_map").and_then(Value::as_object) {
        for (id, item) in map {
            joints.push(RgdJoint {
                id: id.clone(),
                joint_type: string(item, "type_enum").map(str::to_owned),
                parent_link: string(&item["connectivity"], "parent_link_ref_str").map(str::to_owned),
                child_link: string(&item["connectivity"], "child_link_ref_str").map(str::to_owned),
                origin_xyz_m: vector(&item["geometry_ideal"], "origin_xyz_m_vec3_float"),
                // Preserve ideal local joint frame orientation for future
                // visual link FK, without claiming installed encoder/IMU frame calibration.
                origin_rpy_rad: vector(&item["geometry_ideal"], "origin_rpy_rad_vec3_float"),
                axis_xyz: vector(&item["geometry_ideal"], "axis_xyz_vec3_float"),
                lower_limit: finite(&item["limits_ideal"], "position_lower_rad_float"),
                upper_limit: finite(&item["limits_ideal"], "position_upper_rad_float"),
            });
        }
    }
    let mut sensors = Vec::new();
    if let Some(map) = description.get("sensors_mounting_map").and_then(Value::as_object) {
        for (id, item) in map {
            sensors.push(RgdSensor {
                id: id.clone(),
                sensor_type: string(item, "device_type_enum").map(str::to_owned),
                parent_frame: string(item, "parent_frame_ref_str").map(str::to_owned),
            });
        }
    }
    // Missing or dangling geometry is *reported*, never filled with guessed parts.
    let link_ids: HashSet<&str> = links.iter().map(|l| l.id.as_str()).collect();
    for joint in &joints {
        for id in [&joint.parent_link, &joint.child_link].into_iter().flatten() {
            if !link_ids.contains(id.as_str()) {
                warnings.push(format!("Articolazione {}: link {id} non presente nella descrizione", joint.id));
            }
        }
    }
    if joints.is_empty() { warnings.push("Nessuna articolazione descritta".into()); }
    warnings.push("Integrità canonica NON verificata: eseguire rgd check sulla sorgente".into());
    let hash = sha256(bytes);
    Ok(ImportedModel {
        model_id: format!("rgd-{}", &hash[..20]),
        source_file: original_name.chars().filter(|c| c.is_ascii_alphanumeric() || "-_.".contains(*c)).take(100).collect(),
        source_sha256: format!("sha256:{hash}"),
        source_format: "openrgd-source-profile-zip".into(),
        imported_at: chrono::Utc::now().to_rfc3339(),
        name,
        manufacturer,
        standard_version: manifest.as_ref().and_then(|m| string(&m["meta_group"], "rgd_standard_version_semver_str")).map(str::to_owned),
        kernel_identity: kernel.as_ref().and_then(|k| string(&k["meta_group"], "id")).map(str::to_owned),
        profile_state: if manifest.is_some() && kernel.is_some() && missing_modules.is_empty() { "structurally_inspected" } else { "partial_foundation" }.into(),
        integrity_state: "canonical_not_verified".into(),
        geometry_state: if joints.is_empty() { "no_joint_topology" } else { "declared_joint_topology_only" }.into(),
        module_refs,
        missing_modules,
        warnings,
        links, joints, sensors,
    })
}


/// Read-only, source-only snapshot of HAL actuator address declarations.
/// This does not perform device discovery, apply a binding, or authorize actuation.
#[derive(Clone, Debug, Serialize)]
pub struct HalDeclaration {
    pub source_key: String,
    pub logical_actuator_ref: Option<String>,
    pub communication_protocol: Option<String>,
    pub bus_interface: Option<String>,
    pub device_node_id: Option<i64>,
    pub joint_id: Option<String>,
    pub joint_resolution: &'static str,
}

#[derive(Clone, Debug, Serialize)]
pub struct HalInspection {
    pub schema_version: &'static str,
    pub model_id: String,
    pub source_profile_sha256: String,
    pub source_path: String,
    pub hal_mapping_id: Option<String>,
    pub hal_present: bool,
    pub declared_actuator_count: usize,
    pub linked_joint_count: usize,
    pub declarations: Vec<HalDeclaration>,
    pub evidence_class: &'static str,
    pub physical_mapping_verified: bool,
    pub device_discovery_performed: bool,
    pub actuation_enabled: bool,
}

/// Examine the stored immutable upload again, rather than trusting stale
/// preview fields. Older imports automatically work without workspace migration.
pub fn inspect_hal_declarations(bytes: &[u8], stored_model: &ImportedModel) -> Result<HalInspection, String> {
    let parsed_model = inspect_bundle(bytes, &stored_model.source_file)?;
    if parsed_model.source_sha256 != stored_model.source_sha256 || parsed_model.model_id != stored_model.model_id {
        return Err("Il contenuto originale del profilo RGD non corrisponde al registro locale".into());
    }
    let mut zip = ZipArchive::new(Cursor::new(bytes)).map_err(|_| "Archivio RGD non leggibile".to_string())?;
    let source_roots: Vec<String> = zip.file_names()
        .filter_map(|name| name.strip_suffix("spec/01_foundation/description.jsonc").map(str::to_owned))
        .collect();
    if source_roots.len() != 1 { return Err("Radice RGD ambigua per ispezione HAL".into()); }
    let source_path = format!("{}spec/01_foundation/hal_mapping.jsonc", source_roots[0]);
    let mut report = HalInspection {
        schema_version: "console.rgd.hal-inspection.v0.1",
        model_id: stored_model.model_id.clone(),
        source_profile_sha256: stored_model.source_sha256.clone(),
        source_path: source_path.clone(),
        hal_mapping_id: None,
        hal_present: false,
        declared_actuator_count: 0,
        linked_joint_count: 0,
        declarations: Vec::new(),
        evidence_class: "rgd_source_declaration_unverified_not_physical_evidence",
        physical_mapping_verified: false,
        device_discovery_performed: false,
        actuation_enabled: false,
    };
    let hal_bytes = match zip.by_name(&source_path) {
        Ok(mut item) => {
            if item.size() > MAX_JSONC_BYTES { return Err("HAL JSONC supera il limite di lettura".into()); }
            let mut buffer = Vec::with_capacity(item.size() as usize);
            item.read_to_end(&mut buffer).map_err(|_| "Lettura HAL JSONC fallita".to_string())?;
            buffer
        }
        Err(zip::result::ZipError::FileNotFound) => return Ok(report),
        Err(_) => return Err("Errore apertura HAL JSONC".into()),
    };
    let hal = parse_object(&hal_bytes, &source_path)?;
    report.hal_present = true;
    report.hal_mapping_id = string(&hal["meta_group"], "mapping_id_str").map(str::to_owned);
    let drivers = hal.get("actuator_drivers_map").and_then(Value::as_object);
    let Some(drivers) = drivers else { return Ok(report); };
    if drivers.len() > 256 { return Err("Troppe dichiarazioni di attuatori nel modulo HAL".into()); }

    // This relation MUST be explicit in the RGD source. Names which merely
    // look alike (e.g. knee_right_actuator vs leg_right_knee_pitch_joint)
    // cannot be promoted into a physical joint binding.
    let desc_path = format!("{}spec/01_foundation/description.jsonc", source_roots[0]);
    let description_bytes = {
        let mut item = zip.by_name(&desc_path).map_err(|_| "Descrizione RGD mancante".to_string())?;
        let mut buffer = Vec::new();
        item.read_to_end(&mut buffer).map_err(|_| "Lettura descrizione RGD fallita".to_string())?;
        buffer
    };
    let description = parse_object(&description_bytes, &desc_path)?;
    let joint_names: HashSet<&str> = stored_model.joints.iter().map(|joint| joint.id.as_str()).collect();
    let explicit_actuator_links = description.get("actuators_topology_map").and_then(Value::as_object);
    for (key, driver) in drivers {
        let logical_ref = string(driver, "logical_actuator_ref_str");
        let explicit_joint = string(driver, "target_joint_ref_str")
            .or_else(|| logical_ref.filter(|reference| joint_names.contains(reference)))
            .or_else(|| logical_ref.and_then(|reference| {
                explicit_actuator_links
                    .and_then(|map| map.get(reference))
                    .and_then(|actuator| string(actuator, "drives_joint_ref_str"))
            }));
        let joint_id = explicit_joint.filter(|joint| joint_names.contains(joint)).map(str::to_owned);
        if joint_id.is_some() { report.linked_joint_count += 1; }
        report.declarations.push(HalDeclaration {
            source_key: key.clone(),
            logical_actuator_ref: logical_ref.map(str::to_owned),
            communication_protocol: string(driver, "communication_protocol_enum").map(str::to_owned),
            bus_interface: string(driver, "bus_interface_str").map(str::to_owned),
            device_node_id: driver.get("device_node_id_int").and_then(Value::as_i64).filter(|n| *n >= 0),
            joint_resolution: if joint_id.is_some() { "explicit_joint_in_profile" } else { "unresolved_joint_reference" },
            joint_id,
        });
    }
    report.declared_actuator_count = report.declarations.len();
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::{write::SimpleFileOptions, ZipWriter};

    fn archive(path: &str) -> Vec<u8> {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        writer.start_file(path, SimpleFileOptions::default()).unwrap();
        writer.write_all(br#"{"meta_group":{"species_name_str":"Demo"},"joint_topology_map":{"j1":{"type_enum":"REVOLUTE","connectivity":{"parent_link_ref_str":"a","child_link_ref_str":"b"}}}}"#).unwrap();
        writer.finish().unwrap().into_inner()
    }
    #[test]
    fn accepts_explicit_partial_profile_without_claiming_safety() {
        let bytes = archive("robot/spec/01_foundation/description.jsonc");
        let model = inspect_bundle(&bytes, "robot.zip").unwrap();
        assert_eq!(model.profile_state, "partial_foundation");
        assert_eq!(model.integrity_state, "canonical_not_verified");
        assert_eq!(model.joints.len(), 1);
    }
    #[test]
    fn parses_jsonc_comments_without_treating_it_as_normative_validation() {
        let parsed = parse_object(b"{ // demo\n \"name\": \"synthetic\", }", "fixture.jsonc").unwrap();
        assert_eq!(parsed["name"], "synthetic");
    }
    #[test]
    fn prevents_zip_path_traversal() {
        let bytes = archive("../spec/01_foundation/description.jsonc");
        assert!(inspect_bundle(&bytes, "evil.zip").is_err());
    }
    #[test]
    fn rgd_zip_alias_is_accepted_without_claiming_canonical_validity() {
        let bytes = archive("spec/01_foundation/description.jsonc");
        let imported = inspect_bundle(&bytes, "so101.rgd").unwrap();
        assert_eq!(imported.source_format, "openrgd-source-profile-zip");
        assert_eq!(imported.source_file, "so101.rgd");
        assert_eq!(imported.integrity_state, "canonical_not_verified");
    }
    #[test]
    fn rgd_json_is_not_misinterpreted_as_an_archive() {
        let message = inspect_bundle(br#"{"spec":{}}"#, "unified.rgd").unwrap_err();
        assert!(message.contains("non contiene un archivio ZIP"));
    }

    #[test]
    fn source_joint_rpy_is_preserved_as_nominal_geometry_and_missing_rpy_stays_unknown() {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        writer.start_file("spec/01_foundation/description.jsonc", SimpleFileOptions::default()).unwrap();
        writer.write_all(br#"{
          "meta_group": {"species_name_str":"SyntheticGeometryOnly"},
          "kinematic_chain_list": [
            {"link_id_str":"base"}, {"link_id_str":"arm_a"}, {"link_id_str":"arm_b"}
          ],
          "joint_topology_map": {
            "arm_a_joint": {
              "type_enum": "REVOLUTE",
              "connectivity": {"parent_link_ref_str":"base", "child_link_ref_str":"arm_a"},
              "geometry_ideal": {
                "origin_xyz_m_vec3_float":[0.10,0.15,0.20],
                "origin_rpy_rad_vec3_float":[0.25,-1.57,0.50],
                "axis_xyz_vec3_float":[0,0,1]
              }
            },
            "arm_b_joint": {
              "type_enum": "REVOLUTE",
              "connectivity": {"parent_link_ref_str":"arm_a", "child_link_ref_str":"arm_b"},
              "geometry_ideal": {"origin_xyz_m_vec3_float":[0.1,0.0,0.0]}
            }
          }
        }"#).unwrap();
        let bytes = writer.finish().unwrap().into_inner();
        let model = inspect_bundle(&bytes, "synthetic.zip").unwrap();
        let a = model.joints.iter().find(|j| j.id == "arm_a_joint").unwrap();
        assert_eq!(a.origin_xyz_m.as_deref(), Some(&[0.10, 0.15, 0.20][..]));
        assert_eq!(a.origin_rpy_rad.as_deref(), Some(&[0.25, -1.57, 0.50][..]));
        assert_eq!(a.axis_xyz.as_deref(), Some(&[0.0, 0.0, 1.0][..]));
        let b = model.joints.iter().find(|j| j.id == "arm_b_joint").unwrap();
        assert_eq!(b.origin_rpy_rad, None); // missing source != certified [0,0,0]
        assert_eq!(model.integrity_state, "canonical_not_verified");
        assert_eq!(model.source_sha256, format!("sha256:{}", sha256(&bytes)));
    }

    #[test]
    fn legacy_persisted_joint_without_origin_rpy_still_deserializes() {
        let old = serde_json::json!({
            "id":"legacy_arm_joint", "joint_type":"REVOLUTE",
            "parent_link":"base", "child_link":"arm",
            "origin_xyz_m":[0.1,0.2,0.3], "axis_xyz":[0.0,0.0,1.0],
            "lower_limit":null, "upper_limit":null
        });
        let joint: RgdJoint = serde_json::from_value(old).unwrap();
        assert_eq!(joint.origin_rpy_rad, None);
        assert_eq!(joint.origin_xyz_m.unwrap(), vec![0.1,0.2,0.3]);
    }

    fn hal_test_archive(link: bool) -> Vec<u8> {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        let description = if link {
            r#"{"meta_group":{},"joint_topology_map":{"leg_knee_joint":{}},"actuators_topology_map":{"motor_knee":{"drives_joint_ref_str":"leg_knee_joint"}}}"#
        } else {
            r#"{"meta_group":{},"joint_topology_map":{"leg_knee_joint":{}}}"#
        };
        writer.start_file("spec/01_foundation/description.jsonc", SimpleFileOptions::default()).unwrap();
        writer.write_all(description.as_bytes()).unwrap();
        writer.start_file("spec/01_foundation/hal_mapping.jsonc", SimpleFileOptions::default()).unwrap();
        writer.write_all(br#"{"meta_group":{"mapping_id_str":"seed-example"},"actuator_drivers_map":{"knee_motor":{"logical_actuator_ref_str":"motor_knee","communication_protocol_enum":"CAN_BUS_FD","bus_interface_str":"can0","device_node_id_int":12},"other":{"logical_actuator_ref_str":"nonexistent_motor","communication_protocol_enum":"RS485_DYNAMIXEL","bus_interface_str":"/dev/ttyUSB0","device_node_id_int":5}}}"#).unwrap();
        writer.finish().unwrap().into_inner()
    }

    #[test]
    fn hal_declarations_require_explicit_joint_reference() {
        let bytes = hal_test_archive(true);
        let model = inspect_bundle(&bytes, "test.zip").unwrap();
        let inspection = inspect_hal_declarations(&bytes, &model).unwrap();
        assert_eq!(inspection.declared_actuator_count, 2);
        assert_eq!(inspection.linked_joint_count, 1);
        assert!(!inspection.physical_mapping_verified);
        assert!(!inspection.actuation_enabled);
        let knee = inspection.declarations.iter().find(|x| x.source_key == "knee_motor").unwrap();
        assert_eq!(knee.joint_id.as_deref(), Some("leg_knee_joint"));
        assert_eq!(knee.device_node_id, Some(12));
        let other = inspection.declarations.iter().find(|x| x.source_key == "other").unwrap();
        assert!(other.joint_id.is_none());
    }

    #[test]
    fn hal_seed_name_similarity_never_creates_joint_link() {
        let bytes = hal_test_archive(false);
        let model = inspect_bundle(&bytes, "test.rgd").unwrap();
        let inspection = inspect_hal_declarations(&bytes, &model).unwrap();
        assert_eq!(inspection.linked_joint_count, 0);
        assert!(inspection.declarations.iter().all(|item| item.joint_id.is_none()));
    }

    #[test]
    fn hal_rejects_tampered_archive_and_handles_missing_module() {
        let bytes = hal_test_archive(true);
        let wrong_model = inspect_bundle(&archive("spec/01_foundation/description.jsonc"), "test.zip").unwrap();
        assert!(inspect_hal_declarations(&bytes, &wrong_model).is_err());
        let partial = archive("spec/01_foundation/description.jsonc");
        let model = inspect_bundle(&partial, "test.zip").unwrap();
        let inspection = inspect_hal_declarations(&partial, &model).unwrap();
        assert!(!inspection.hal_present);
    }

    #[test]
    fn other_extensions_remain_unsupported_even_if_zip() {
        let bytes = archive("spec/01_foundation/description.jsonc");
        assert!(inspect_bundle(&bytes, "arbitrary.txt").is_err());
    }
}
