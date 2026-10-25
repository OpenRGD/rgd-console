#!/usr/bin/env python3
"""Synthetic *partial* Foundation-only ZIP for import UI smoke tests.

Not a real robot. NOT a canonical verified OpenRGD profile; it deliberately
omits manifest, kernel, calibration, HAL and any runtime execution authority.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

HERE = Path(__file__).resolve().parent
OUT = HERE / 'synthetic-foundation-partial.zip'
BODY = '''// SYNTHETIC TRAINING FIXTURE. NO REAL ROBOT IS DESCRIBED.
{
  "meta_group": {
    "model_id_str": "console_synthetic_fixture_v0_2",
    "species_name_str": "Synthetic Reference Arm (not physical)",
    "manufacturer_str": "OpenRGD Console Test Fixture"
  },
  "kinematic_chain_list": [
    {"link_id_str": "demo_base"},
    {"link_id_str": "demo_tip"}
  ],
  "joint_topology_map": {
    "demo_joint": {
      "type_enum": "REVOLUTE",
      "connectivity": {
        "parent_link_ref_str": "demo_base",
        "child_link_ref_str": "demo_tip"
      },
      "geometry_ideal": {
        "origin_xyz_m_vec3_float": [0.0, 0.0, 0.12],
        "axis_xyz_vec3_float": [0.0, 1.0, 0.0]
      },
      "limits_ideal": {
        "position_lower_rad_float": -1.0,
        "position_upper_rad_float": 1.0
      }
    }
  },
  "sensors_mounting_map": {
    "demo_sensor": {
      "device_type_enum": "SYNTHETIC_SENSOR",
      "parent_frame_ref_str": "demo_tip"
    }
  }
}
'''
with ZipFile(OUT, 'w', compression=ZIP_DEFLATED) as z:
    z.writestr('spec/01_foundation/description.jsonc', BODY)
print(OUT)
