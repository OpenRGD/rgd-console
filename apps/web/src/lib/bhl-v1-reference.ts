/**
 * GENERATED REFERENCE SNAPSHOT from the pinned Berkeley Humanoid Lite V1 URDF.
 * Not as-built geometry of Paky-01. No physical motor identity or calibration
 * is implied. The source URL, Git revision and exact Git blob SHA are pinned.
 *
 * Attribution/licensing: source URDF is from HybridRobotics/berkeley-humanoid-lite-assets,
 * whose assets are under Creative Commons Attribution-ShareAlike 4.0 International
 * (CC BY-SA 4.0), NOT the OpenRGD MIT code license. This generated extract
 * retains upstream terms where copyrighted upstream material is incorporated.
 * Changes: extracted names, hierarchy, origins and orientations into TypeScript.
 * See https://github.com/HybridRobotics/berkeley-humanoid-lite-assets/blob/main/LICENCE
 *
 * HybridRobotics/berkeley-humanoid-lite-assets/data/robots/berkeley_humanoid/berkeley_humanoid_lite/urdf/berkeley_humanoid_lite.urdf
 * commit fc90fedd008b1e56a22e3c5221548d6b24f49707
 * blob 13261c106eff81726e1d788d3ccf671a246a6fb3
 * There is NO motor->joint mapping or sensor extrinsic transform here.
 */
export const BHL_REFERENCE_SOURCE = {
  repository: 'HybridRobotics/berkeley-humanoid-lite-assets',
  path: 'data/robots/berkeley_humanoid/berkeley_humanoid_lite/urdf/berkeley_humanoid_lite.urdf',
  commit: 'fc90fedd008b1e56a22e3c5221548d6b24f49707',
  urdfBlobSha: '13261c106eff81726e1d788d3ccf671a246a6fb3',
  provenance: 'UPSTREAM_URDF_TEMPLATE_NOT_PAKY01_AS_BUILT',
  actuatedDof: 22,
  jointCount: 26,
  headAndNeckGeometryVerified: false,
} as const;

export interface BhlJointReference {
  id: string;
  type: 'fixed' | 'revolute';
  parent: string;
  child: string;
  /** Millimetre-scale URDF XYZ origin in metres, relative to parent link. */
  xyz: [number, number, number];
  /** URDF intrinsic RPY (fixed axis x/y/z) radians. */
  rpy: [number, number, number];
  axis: [number, number, number];
  lower?: number;
  upper?: number;
}

export const BHL_V1_URDF_JOINTS: readonly BhlJointReference[] = [
  {
    "id": "imu_frame",
    "type": "fixed",
    "parent": "imu_2",
    "child": "imu",
    "xyz": [
      0,
      -6.33816e-19,
      0.005
    ],
    "rpy": [
      0,
      0,
      -9.54491e-32
    ],
    "axis": [
      0,
      0,
      0
    ]
  },
  {
    "id": "imu",
    "type": "fixed",
    "parent": "base",
    "child": "imu_2",
    "xyz": [
      0.061722,
      -5.97549e-17,
      0.68
    ],
    "rpy": [
      -6.12323e-17,
      1.13243e-14,
      -1.20616e-15
    ],
    "axis": [
      0,
      0,
      1
    ]
  },
  {
    "id": "arm_left_hand_l",
    "type": "fixed",
    "parent": "arm_left_elbow_roll",
    "child": "arm_left_hand_link",
    "xyz": [
      -2.68213e-29,
      0,
      -5.55112e-17
    ],
    "rpy": [
      3.14159,
      6.62192e-15,
      -1.5708
    ],
    "axis": [
      0,
      0,
      1
    ]
  },
  {
    "id": "arm_left_elbow_roll_joint",
    "type": "revolute",
    "parent": "arm_left_elbow_pitch",
    "child": "arm_left_elbow_roll",
    "xyz": [
      -2.78536e-14,
      0.123,
      -0.0255
    ],
    "rpy": [
      -1.5708,
      3.11621e-13,
      1.97728e-13
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -0.785398,
    "upper": 0.785398
  },
  {
    "id": "arm_left_elbow_pitch_joint",
    "type": "revolute",
    "parent": "arm_left_shoulder_yaw",
    "child": "arm_left_elbow_pitch",
    "xyz": [
      0.0245,
      1.98644e-15,
      0.043
    ],
    "rpy": [
      1.5708,
      -9.41704e-14,
      1.5708
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -4.49418e-13,
    "upper": 1.5708
  },
  {
    "id": "arm_left_shoulder_yaw_joint",
    "type": "revolute",
    "parent": "arm_left_shoulder_roll",
    "child": "arm_left_shoulder_yaw",
    "xyz": [
      2.55351e-14,
      0.123,
      -0.0255
    ],
    "rpy": [
      -1.5708,
      5.94607e-13,
      1.21877e-14
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -0.785398,
    "upper": 0.785398
  },
  {
    "id": "arm_left_shoulder_roll_joint",
    "type": "revolute",
    "parent": "arm_left_shoulder_pitch",
    "child": "arm_left_shoulder_roll",
    "xyz": [
      0.0255,
      -8.88178e-16,
      0.043
    ],
    "rpy": [
      1.5708,
      1.309,
      1.5708
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -0.261799,
    "upper": 1.309
  },
  {
    "id": "arm_left_shoulder_pitch_joint",
    "type": "revolute",
    "parent": "base",
    "child": "arm_left_shoulder_pitch",
    "xyz": [
      5.0759e-15,
      0.133,
      0.764028
    ],
    "rpy": [
      -1.5708,
      1.30469e-14,
      8.11483e-16
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -1.5708,
    "upper": 0.785398
  },
  {
    "id": "arm_hand_r",
    "type": "fixed",
    "parent": "arm_right_elbow_roll",
    "child": "arm_right_hand_link",
    "xyz": [
      -6.74047e-19,
      5.55112e-17,
      0
    ],
    "rpy": [
      3.14159,
      4.08775e-14,
      -1.5708
    ],
    "axis": [
      0,
      0,
      1
    ]
  },
  {
    "id": "arm_right_elbow_roll_joint",
    "type": "revolute",
    "parent": "arm_right_elbow_pitch",
    "child": "arm_right_elbow_roll",
    "xyz": [
      2.87116e-14,
      0.123,
      -0.0255
    ],
    "rpy": [
      1.5708,
      1.11967e-14,
      -3.14159
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -0.785398,
    "upper": 0.785398
  },
  {
    "id": "arm_right_elbow_pitch_joint",
    "type": "revolute",
    "parent": "arm_right_shoulder_yaw",
    "child": "arm_right_elbow_pitch",
    "xyz": [
      0.0245,
      6.93211e-15,
      0.043
    ],
    "rpy": [
      1.5708,
      -8.11942e-14,
      1.5708
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -1.5708,
    "upper": 0
  },
  {
    "id": "arm_right_shoulder_yaw_joint",
    "type": "revolute",
    "parent": "arm_right_shoulder_roll",
    "child": "arm_right_shoulder_yaw",
    "xyz": [
      9.4369e-15,
      0.123,
      -0.0255
    ],
    "rpy": [
      1.5708,
      -1.70198e-13,
      3.14159
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -0.785398,
    "upper": 0.785398
  },
  {
    "id": "arm_right_shoulder_roll_joint",
    "type": "revolute",
    "parent": "arm_right_shoulder_pitch",
    "child": "arm_right_shoulder_roll",
    "xyz": [
      -0.0255,
      3.10862e-15,
      0.043
    ],
    "rpy": [
      1.5708,
      -1.309,
      -1.5708
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -1.309,
    "upper": 0.261799
  },
  {
    "id": "arm_right_shoulder_pitch_joint",
    "type": "revolute",
    "parent": "base",
    "child": "arm_right_shoulder_pitch",
    "xyz": [
      1.19187e-16,
      -0.133,
      0.764028
    ],
    "rpy": [
      -1.5708,
      -1.27121e-14,
      -3.14159
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -0.785398,
    "upper": 1.5708
  },
  {
    "id": "leg_left_ankle_roll_joint",
    "type": "revolute",
    "parent": "leg_left_ankle_pitch",
    "child": "leg_left_ankle_roll",
    "xyz": [
      0.03,
      0.05,
      0.025
    ],
    "rpy": [
      -6.80837e-17,
      1.5708,
      0
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -0.261799,
    "upper": 0.261799
  },
  {
    "id": "leg_left_ankle_pitch_joint",
    "type": "revolute",
    "parent": "leg_left_knee_pitch",
    "child": "leg_left_ankle_pitch",
    "xyz": [
      -2.42341e-15,
      -0.16,
      -0.003
    ],
    "rpy": [
      -1.42161e-14,
      1.87431e-14,
      -3.14159
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -0.785398,
    "upper": 0.785398
  },
  {
    "id": "leg_left_knee_pitch_joint",
    "type": "revolute",
    "parent": "leg_left_hip_pitch",
    "child": "leg_left_knee_pitch",
    "xyz": [
      4.09395e-16,
      0.15,
      -0.018
    ],
    "rpy": [
      -2.06358e-14,
      2.26246e-14,
      -3.14159
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -2.63789e-13,
    "upper": 2.44346
  },
  {
    "id": "leg_left_hip_pitch_joint",
    "type": "revolute",
    "parent": "leg_left_hip_yaw",
    "child": "leg_left_hip_pitch",
    "xyz": [
      0.027,
      -5.55112e-17,
      0.052
    ],
    "rpy": [
      1.5708,
      -0.785398,
      -1.5708
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -1.89805,
    "upper": 0.981748
  },
  {
    "id": "leg_left_hip_yaw_joint",
    "type": "revolute",
    "parent": "leg_left_hip_roll",
    "child": "leg_left_hip_yaw",
    "xyz": [
      0.027,
      1.11022e-16,
      -0.052
    ],
    "rpy": [
      -1.5708,
      1.18214e-15,
      -1.5708
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -0.981748,
    "upper": 0.589049
  },
  {
    "id": "leg_left_hip_roll_joint",
    "type": "revolute",
    "parent": "base",
    "child": "leg_left_hip_roll",
    "xyz": [
      -0.0290919,
      0.08,
      0.542631
    ],
    "rpy": [
      5.54477e-16,
      0.785398,
      -1.02056e-14
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -0.174533,
    "upper": 1.5708
  },
  {
    "id": "leg_right_ankle_roll_joint",
    "type": "revolute",
    "parent": "leg_right_ankle_pitch",
    "child": "leg_right_ankle_roll",
    "xyz": [
      0.03,
      0.05,
      -0.025
    ],
    "rpy": [
      -6.80837e-17,
      1.5708,
      0
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -0.261799,
    "upper": 0.261799
  },
  {
    "id": "leg_right_ankle_pitch_joint",
    "type": "revolute",
    "parent": "leg_right_knee_pitch",
    "child": "leg_right_ankle_pitch",
    "xyz": [
      1.37911e-15,
      0.16,
      0.003
    ],
    "rpy": [
      1.12133e-14,
      1.06998e-14,
      -9.3342e-14
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -0.785398,
    "upper": 0.785398
  },
  {
    "id": "leg_right_knee_pitch_joint",
    "type": "revolute",
    "parent": "leg_right_hip_pitch",
    "child": "leg_right_knee_pitch",
    "xyz": [
      -2.77556e-17,
      0.15,
      0.018
    ],
    "rpy": [
      3.28904e-15,
      3.34869e-15,
      -1.30451e-15
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -1.1191e-13,
    "upper": 2.44346
  },
  {
    "id": "leg_right_hip_pitch_joint",
    "type": "revolute",
    "parent": "leg_right_hip_yaw",
    "child": "leg_right_hip_pitch",
    "xyz": [
      -0.027,
      -3.33067e-16,
      0.052
    ],
    "rpy": [
      1.5708,
      -0.785398,
      -1.5708
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -1.89805,
    "upper": 0.981748
  },
  {
    "id": "leg_right_hip_yaw_joint",
    "type": "revolute",
    "parent": "leg_right_hip_roll",
    "child": "leg_right_hip_yaw",
    "xyz": [
      -0.027,
      3.46945e-16,
      -0.052
    ],
    "rpy": [
      -1.5708,
      3.44349e-15,
      1.5708
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -0.589049,
    "upper": 0.981748
  },
  {
    "id": "leg_right_hip_roll_joint",
    "type": "revolute",
    "parent": "base",
    "child": "leg_right_hip_roll",
    "xyz": [
      -0.0290919,
      -0.08,
      0.542631
    ],
    "rpy": [
      7.85621e-15,
      -0.785398,
      3.14159
    ],
    "axis": [
      0,
      0,
      1
    ],
    "lower": -1.5708,
    "upper": 0.174533
  }
];

export const BHL_V1_ACTUATED_IDS: readonly string[] = BHL_V1_URDF_JOINTS.filter(j => j.type === 'revolute').map(j => j.id);
