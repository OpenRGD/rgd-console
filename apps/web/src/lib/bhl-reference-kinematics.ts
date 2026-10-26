/** Exact upstream BHL V1 zero-angle joint-frame projection; display-only schematic. */
import { BHL_V1_URDF_JOINTS, BHL_V1_ACTUATED_IDS, type BhlJointReference } from './bhl-v1-reference';

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // XYZW
interface LinkFrame { position: Vec3; quaternion: Quat }
export interface BhlReferenceBone {
  jointId: string;
  parentLink: string;
  childLink: string;
  start: Vec3;
  end: Vec3;
  /** The point is a URDF joint pivot, never a measured encoder position. */
  jointPivot: Vec3;
}
export interface BhlReferenceSkeleton {
  bones: BhlReferenceBone[];
  pivots: Array<{ id: string; position: Vec3 }>;
  /** Last link points: hands and ankles. No as-built feet/head geometry implied. */
  terminals: Array<{ link: string; position: Vec3 }>;
  jointCount: number;
  source: 'BHL_V1_NEUTRAL_URDF_REFERENCE_UNVERIFIED';
}

/**
 * The pinned URDF Z is vertical. The Three.js viewport uses X=operator right,
 * Y=up, and Z=viewer depth; converting [-urdf_y,+urdf_z,-urdf_x] is a
 * right-handed axis permutation, NOT a verified Paky-01 sensor extrinsic.
 */
export const URDF_BASE_INERTIAL_Z_M = 0.675059; // original URDF base inertial origin
export function toViewer(reference: Vec3): Vec3 {
  return [-reference[1], reference[2] - URDF_BASE_INERTIAL_Z_M, -reference[0]];
}

function sum(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function mul(a: Quat, b: Quat): Quat {
  const [x,y,z,w]=a, [u,v,t,s]=b;
  return [w*u+x*s+y*t-z*v, w*v-x*t+y*s+z*u,
    w*t+x*v-y*u+z*s, w*s-x*u-y*v-z*t];
}
function axisAngle(axis: Vec3, a: number): Quat {
  const m=Math.hypot(...axis);
  if (m < 1e-8 || !Number.isFinite(m)) throw new Error('Invalid URDF joint axis');
  const s=Math.sin(a/2)/m;
  return [axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(a/2)];
}
function rpyQuaternion(rpy: Vec3): Quat {
  // URDF fixed X roll, Y pitch, Z yaw = qz * qy * qx
  const [r,p,y]=rpy;
  return mul(mul(axisAngle([0,0,1],y),axisAngle([0,1,0],p)),axisAngle([1,0,0],r));
}
function rotate(q: Quat, v: Vec3): Vec3 {
  // Faster and stable: q*[v,0]*conjugate(q).
  const z=mul(mul(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]);
  return [z[0],z[1],z[2]];
}

/**
 * Produce *neutral reference geometry only*, with all 22 joint angles at their
 * URDF mathematical zero. No values are accepted from MotorTelemetry here:
 * physical joint mapping, absolute-output encoder calibration and offsets
 * must be verified independently BEFORE a later FK adapter is authorized.
 */
export function bhlReferenceNeutralSkeleton(): BhlReferenceSkeleton {
  const frames = new Map<string, LinkFrame>();
  const parentJointByChild = new Map<string, BhlJointReference>();
  const joints = new Map<string, Vec3>();
  frames.set('base', { position:[0,0,0], quaternion:[0,0,0,1] });
  const unvisited=[...BHL_V1_URDF_JOINTS];
  while (unvisited.length) {
    const count=unvisited.length;
    for(let i=unvisited.length-1;i>=0;i--){
      const joint=unvisited[i];
      const frame=frames.get(joint.parent);
      if (!frame) continue;
      if (frames.has(joint.child)) throw new Error('BHL URDF has multiple incoming joints for '+joint.child);
      const position=sum(frame.position,rotate(frame.quaternion,joint.xyz));
      const rotation=mul(frame.quaternion,rpyQuaternion(joint.rpy));
      frames.set(joint.child,{position,quaternion:rotation});
      joints.set(joint.id,position);
      parentJointByChild.set(joint.child,joint);
      unvisited.splice(i,1);
    }
    if (unvisited.length===count) throw new Error('BHL URDF missing parent or cyclic joint graph');
  }
  const bones: BhlReferenceBone[]=[];
  const pivots: BhlReferenceSkeleton['pivots']=[];
  for(const joint of BHL_V1_URDF_JOINTS) {
    if(joint.type!=='revolute')continue;
    const pos=joints.get(joint.id);
    if(!pos)throw new Error('Missing joint pose '+joint.id);
    const parentJoint=parentJointByChild.get(joint.parent);
    const start=parentJoint ? joints.get(parentJoint.id) :
      [0,0,URDF_BASE_INERTIAL_Z_M] satisfies Vec3;
    if(!start)throw new Error('Unresolved parent pivot for '+joint.id);
    bones.push({
      jointId:joint.id,parentLink:joint.parent,childLink:joint.child,
      start:toViewer(start),end:toViewer(pos),jointPivot:toViewer(pos)
    });
    pivots.push({id:joint.id,position:toViewer(pos)});
  }
  const terminals=['arm_left_hand_link','arm_right_hand_link','leg_left_ankle_roll','leg_right_ankle_roll']
    .map(link=>{
      const frame=frames.get(link);
      if(!frame)throw new Error('Missing BHL terminal '+link);
      return {link,position:toViewer(frame.position)};
    });
  if (bones.length!==22 || pivots.length!==22 || frames.size!==27 ||
      BHL_V1_ACTUATED_IDS.length!==22)throw new Error('Pinned BHL V1 joint count mismatched');
  return {bones,pivots,terminals,jointCount:bones.length,
    source:'BHL_V1_NEUTRAL_URDF_REFERENCE_UNVERIFIED'};
}
