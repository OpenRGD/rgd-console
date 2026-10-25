'use client';

import { Canvas } from '@react-three/fiber';

/** Explicitly an empty reference frame, NOT a representation of Paky-01/SO-101. */
export default function BodyViewport() {
  return <div className="relative h-[370px] w-full overflow-hidden rounded-xl bg-[#0a121b] sm:h-[450px]">
    <Canvas camera={{ position: [3.2, 2.8, 4.3], fov: 47 }} dpr={[1, 1.5]}>
      <color attach="background" args={['#0a121b']} />
      <ambientLight intensity={0.7} />
      <gridHelper args={[7, 14, '#305a65', '#22333d']} position={[0, -0.6, 0]} />
      <axesHelper args={[1.4]} />
      <mesh position={[0, 0, 0]}><sphereGeometry args={[0.09, 24, 24]} /><meshStandardMaterial color="#63e5c0" roughness={0.3} /></mesh>
    </Canvas>
    <div className="pointer-events-none absolute left-5 top-5 rounded-lg border border-line bg-[#0b141de9] px-3 py-2 text-xs text-slate-200">Coordinate frame <span className="font-mono text-mint">XYZ</span></div>
    <div className="pointer-events-none absolute bottom-5 left-5 right-5 rounded-xl border border-amber/20 bg-[#131b25eb] px-4 py-3 text-xs text-amber">Solo riferimento tridimensionale. Nessuna geometria RGD/URDF completa caricata o verificata.</div>
  </div>;
}
