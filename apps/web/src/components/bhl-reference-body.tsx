'use client';

/**
 * All 22 articulated BHL V1 references in the URDF ZERO pose.
 * This scene deliberately ignores MotorTelemetry for physical joint rotations:
 * original CAN-ID→joint, gear ratio, sign and encoder-zero map is NOT VERIFIED.
 * Render a reference skeleton, not Paky-01's current posture.
 */
import { useMemo } from 'react';
import { Quaternion, Vector3 } from 'three';
import { bhlReferenceNeutralSkeleton, type Vec3 } from '@/lib/bhl-reference-kinematics';

function Bone({ from, to, kind }: { from: Vec3; to: Vec3; kind: 'leg' | 'arm' }) {
  const start=new Vector3(...from), end=new Vector3(...to);
  const delta=new Vector3().subVectors(end,start);
  const length=delta.length();
  if (length < 0.001) return null;
  const quaternion=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.normalize());
  const middle=start.add(end).multiplyScalar(0.5);
  const radius=kind==='leg' ? 0.010 : 0.008;
  return <mesh position={[middle.x,middle.y,middle.z]} quaternion={quaternion}>
    <cylinderGeometry args={[radius,radius,length,10]} />
    <meshStandardMaterial
      color={kind==='leg' ? '#97adc0' : '#8bd8e4'}
      roughness={0.6} transparent opacity={0.66}
    />
  </mesh>;
}

export default function BhlReferenceBody() {
  const skeleton=useMemo(()=>bhlReferenceNeutralSkeleton(),[]);
  return <group>
    {/* Original URDF link base inertial reference, NOT the physical center of mass. */}
    <mesh position={[0,0,0]}>
      <sphereGeometry args={[0.022,14,10]} />
      <meshStandardMaterial color="#586b78" transparent opacity={0.45} />
    </mesh>
    {skeleton.bones.map(b=><Bone key={b.jointId} from={b.start} to={b.end}
      kind={b.jointId.startsWith('leg_')?'leg':'arm'}/>)}
    {skeleton.pivots.map(p=>
      <mesh key={p.id} position={p.position}>
        <sphereGeometry args={[0.011,12,9]} />
        <meshStandardMaterial color="#ffbe72" metalness={0.12} roughness={0.5} />
      </mesh>
    )}
    {/* Terminal points are links from URDF, not fabricated as-built hands/feet. */}
    {skeleton.terminals.map(t=>
      <mesh key={t.link} position={t.position}>
        <sphereGeometry args={[0.015,12,9]} />
        <meshStandardMaterial color="#a0b6c2" roughness={0.55} />
      </mesh>
    )}
  </group>;
}
