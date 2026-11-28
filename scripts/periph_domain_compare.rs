//! CI-only comparison of inactive legacy Console domain and pinned owner.
#[path="legacy/console_peripherals.rs"]
#[allow(dead_code)]
mod legacy;
use rgd_periph_core as owner;
use serde_json::Value;
fn main(){
 let args:Vec<String>=std::env::args().collect();
 let d:Value=serde_json::from_str(&std::fs::read_to_string(&args[1]).unwrap()).unwrap();
 let s:Value=serde_json::from_str(&std::fs::read_to_string(&args[2]).unwrap()).unwrap();
 let od:owner::PeripheralDescriptor=serde_json::from_value(d.clone()).unwrap();
 let ld:legacy::PeripheralDescriptor=serde_json::from_value(d.clone()).unwrap();
 owner::validate_descriptor(&od).unwrap(); legacy::validate_descriptor(&ld).unwrap();
 owner::validate_status(&od,&serde_json::from_value(s.clone()).unwrap()).unwrap();
 legacy::validate_status(&ld,&serde_json::from_value(s.clone()).unwrap()).unwrap();
 let mut unsafe_rev=s.clone(); unsafe_rev["status_revision"]=serde_json::json!(1u64<<53);
 assert!(owner::validate_status(&od,&serde_json::from_value(unsafe_rev.clone()).unwrap()).is_err());
 assert!(legacy::validate_status(&ld,&serde_json::from_value(unsafe_rev).unwrap()).is_ok());
 let mut bad=d.clone();bad["robot_id"]=serde_json::json!("invalid scope");
 assert!(owner::validate_descriptor(&serde_json::from_value(bad.clone()).unwrap()).is_err());
 assert!(legacy::validate_descriptor(&serde_json::from_value(bad).unwrap()).is_ok());
 println!("PASS common descriptor/status; owner strictly rejects unsafe revision and invalid identity, unlike legacy");
}
