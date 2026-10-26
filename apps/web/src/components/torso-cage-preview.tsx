'use client';

/**
 * Physical Paky-01 IMU -> operator-reported cage preview ONLY.
 * Never represents validated BHL/URDF pose, magnetometer heading, or motor readiness.
 */
import { Canvas } from '@react-three/fiber';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { ImuObservation, TelemetrySnapshot } from '@/lib/contracts';
import { describeBhlEncoderDiagnostics } from '@/lib/bhl-encoder-diagnostics';

const BhlReferenceBody = dynamic(() => import('@/components/bhl-reference-body'), {ssr:false});
import {
  CAGE_PREVIEW_ROBOT_ID, PAKY01_CAGE, imuSourceKey,
  isCurrentPakyImu, isPakyImuSource, relativeCagePose, relativeYawPreview,
  type VisualZero,
} from '@/lib/torso-cage-geometry';
import './torso-cage-preview.css';

type Props = {
  robotId: string | null;
  imu: ImuObservation | null;
  connected: boolean;
  now: number;
  snapshot: TelemetrySnapshot | null;
};

type Rotation = [number, number, number];
type BodyMode = 'cage' | 'bhl_reference';
const encoderStates: Record<string,string> = {
  NO_SOURCE: 'NESSUNA LETTURA',
  STALE: 'SCADUTO',
  INVALID: 'NON VALIDO',
  OBSERVED_UNVERIFIED_MAPPING: 'OSSERVATO*',
  AMBIGUOUS: 'ASSOCIAZIONE AMBIGUA',
};

function Bar({ position, size, highlight = false }:
  { position: [number, number, number]; size: [number, number, number]; highlight?: boolean }) {
  return <mesh position={position}>
    <boxGeometry args={size} />
    <meshStandardMaterial color={highlight ? '#63e5c0' : '#7097a9'} metalness={0.4} roughness={0.38} />
  </mesh>;
}

function CageBody({ rotation }: { rotation: Rotation }) {
  const cage = PAKY01_CAGE;
  const thick = cage.profileThicknessM;
  const x = cage.coreWidthM / 2 - thick / 2;
  const z = cage.totalDepthM / 2 - thick / 2;
  const bottom = -cage.totalHeightM / 2 + thick / 2;
  const top = cage.totalHeightM / 2 - thick / 2;
  const markerY = cage.imuHeightFromOuterLowerEdgeM - cage.totalHeightM / 2;

  return <group rotation={rotation}>
    {/* The frame is a proportional SCHEMATIC. Joint/fixing details are not verified. */}
    {([-x, x] as number[]).flatMap((px, ix) =>
      ([-z, z] as number[]).map((pz, iz) =>
        <Bar key={'upright-' + ix + '-' + iz}
          position={[px, 0, pz]} size={[thick, cage.uprightLengthM, thick]} />))}
    {([-z, z] as number[]).map((pz, index) =>
      <Bar key={'base-' + index} position={[0, bottom, pz]}
        size={[cage.coreWidthM, thick, thick]} />)}
    {([-x, x] as number[]).flatMap((px, ix) =>
      ([bottom, top] as number[]).map((py, iy) =>
        <Bar key={'depth-' + ix + '-' + iy}
          position={[px, py, 0]} size={[thick, thick, cage.totalDepthM]} />))}
    {/* Exactly one upper beam overhangs the 15cm core by 5cm on each side. */}
    <Bar position={[0, top, -z]} size={[cage.coreWidthM, thick, thick]} />
    <Bar position={[0, top, z]} size={[cage.upperBarLengthM, thick, thick]} highlight />

    {/* Only the Y=11cm PLANE is known; do NOT invent sensor X/Z coordinates. */}
    <mesh position={[0, markerY, 0]}>
      <boxGeometry args={[cage.coreWidthM - thick, 0.002, cage.totalDepthM - thick]} />
      <meshBasicMaterial color="#f3bf72" transparent opacity={0.23} depthWrite={false} />
    </mesh>
    <Bar position={[0, markerY, 0]}
      size={[cage.coreWidthM - thick, 0.002, 0.003]} highlight />
  </group>;
}

function CageScene({ rotation, bodyMode }: { rotation: Rotation; bodyMode: BodyMode }) {
  const fullReference = bodyMode === 'bhl_reference';
  return <Canvas
    frameloop="demand"
    dpr={[1, 1.5]}
    gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
    camera={fullReference
      ? {position: [0.75,0.40,-1.30], fov: 48, near: 0.01, far: 10}
      : {position: [0.39, 0.29, 0.43], fov: 43, near: 0.01, far: 10}}
    onCreated={state => { if (fullReference) state.camera.lookAt(0,-0.20,0); }}
    fallback={<div className="cage-webgl-unavailable">Anteprima 3D non disponibile su questo browser.</div>}
    aria-label="Gabbia schematica 3D di Paky-01, non calibrata">
    <ambientLight intensity={1.2} />
    <directionalLight position={[0.3, 0.7, 0.4]} intensity={1.6} />
    <directionalLight position={[-0.3, 0.2, -0.4]} intensity={0.6} />
    {/* Neutral skeletal URDF guide is static; ONLY the IMU cage rotates.
        No encoder-to-joint transform is verified, thus no whole-body pose. */}
    {fullReference && <BhlReferenceBody />}
    <CageBody rotation={rotation} />
  </Canvas>;
}

function numberOrDash(value: number | null, digits = 2): string {
  return value !== null && Number.isFinite(value) ? value.toFixed(digits) : '—';
}

export default function TorsoCagePreview({ robotId, imu, connected, now, snapshot }: Props) {
  const correctRobot = robotId === CAGE_PREVIEW_ROBOT_ID;
  const sourceValid = isPakyImuSource(imu, robotId);
  const fresh = isCurrentPakyImu(imu, robotId, connected, now);
  const sourceKey = sourceValid ? imuSourceKey(imu) : null;
  const [zero, setZero] = useState<VisualZero | null>(null);
  const [bodyMode, setBodyMode] = useState<BodyMode>('cage');
  const encoderDiagnostics = describeBhlEncoderDiagnostics(snapshot,robotId,connected,now);
  // The current source has NO calibrated yaw transform. Experiment only on
  // explicit operator activation; disabled by default and per source change.
  const [yawPreviewEnabled, setYawPreviewEnabled] = useState(false);

  // A visual reference or experimental mode cannot survive a robot change.
  useEffect(() => { setZero(null); setYawPreviewEnabled(false); }, [robotId]);
  useEffect(() => { setYawPreviewEnabled(false); }, [sourceKey]);

  // Establish baseline at the FIRST trusted-shape FRESH frame per source session.
  useEffect(() => {
    if (!fresh || !sourceKey || !imu) return;
    const [roll, pitch, yaw] = imu.orientation_euler_deg;
    setZero(previous => previous?.sourceKey === sourceKey ? previous :
      { sourceKey, rollDeg: roll, pitchDeg: pitch, yawDeg: yaw });
  }, [fresh, sourceKey, imu?.orientation_euler_deg[0], imu?.orientation_euler_deg[1], imu?.orientation_euler_deg[2]]);

  // When stale, the geometry stays in the LAST OBSERVED orientation and is visibly marked STALE;
  // there is no synthetic animation or extrapolated sensor motion.
  const pose = sourceValid && zero && zero.sourceKey === sourceKey
    ? relativeCagePose(imu, zero) : null;
  // Ordinary cage rotation remains yaw-free. Only an explicit visual-only
  // toggle applies the vendor's UNCALIBRATED relative yaw about scene Y.
  const yawPose = sourceValid && zero && zero.sourceKey === sourceKey && yawPreviewEnabled
    ? relativeYawPreview(imu, zero) : null;
  const rotation: Rotation = pose
    ? [pose.rotationXRad, yawPose?.rotationYRad ?? 0, pose.rotationZRad]
    : [0, 0, 0];

  const resetVisualZero = () => {
    if (!fresh || !imu || !sourceKey) return;
    setZero({ sourceKey, rollDeg: imu.orientation_euler_deg[0],
      pitchDeg: imu.orientation_euler_deg[1], yawDeg: imu.orientation_euler_deg[2] });
  };

  const state = !correctRobot ? 'NON DISPONIBILE' :
    fresh && pose ? 'IMU LIVE · ASSI SENSORE' :
    sourceValid && pose ? 'STALE · ULTIMA POSA CONGELATA' :
    'NESSUNA OSSERVAZIONE FISICA';

  return <section className="cage-preview" aria-label="Corpo 3D — gabbia schematica di Paky-01">
    <header className="cage-preview-header">
      <div>
        <h2>GABBIA DEL TORSO <span>· ANTEPRIMA 3D</span></h2>
        <p>Geometria riferita dall’operatore, non modello RGD verificato.</p>
      </div>
      <span className={fresh && pose ? 'cage-source-live' : 'cage-source-stale'} role="status">{state}</span>
    </header>

    <div className="cage-preview-mode" aria-label="Modello disponibile">
      <button type="button" className={bodyMode==='cage' ? 'cage-mode-selected' : ''}
        aria-pressed={bodyMode==='cage'} onClick={()=>setBodyMode('cage')}>GABBIA</button>
      <button type="button" className={bodyMode==='bhl_reference' ? 'cage-mode-selected' : ''}
        aria-pressed={bodyMode==='bhl_reference'} onClick={()=>setBodyMode('bhl_reference')}>
        STRUTTURA BHL V1 · 22 GIUNTI
      </button>
      <button type="button" disabled title="Servono geometria as-built, giunti mappati ed encoder calibrati">
        ROBOT COMPLETO · NON VERIFICATO
      </button>
    </div>

    <div className="cage-preview-layout">
      <div className={'cage-scene ' + (!fresh ? 'cage-scene-stale' : '')}>
        {correctRobot ?
          <CageScene key={bodyMode} rotation={rotation} bodyMode={bodyMode} /> :
          <div className="cage-placeholder">Vista gabbia disponibile soltanto per Paky-01.</div>}
        <div className="cage-scene-legend">
          {bodyMode==='bhl_reference' && <span className="cage-legend-reference">BHL V1 · URDF ORIGINALE · POSA ZERO</span>}
          <span>STRUTTURA 15 × 24 × 14 cm</span>
          <span>TRAVERSA SUPERIORE 25 cm</span>
          <span className="cage-legend-imu">PIANO IMU · 11 cm</span>
          {bodyMode==='bhl_reference' && <span>ARTI STATICI · ENCODER NON MAPPATI</span>}
        </div>
        {correctRobot && !fresh && <div className="cage-scene-overlay" aria-live="polite">
          {pose ? 'ULTIMA POSA · NON ATTUALE' : 'SORGENTE IMU NON DISPONIBILE'}
        </div>}
      </div>

      <div className="cage-preview-metrics">
        <div className="cage-preview-metric-heading">
          <strong>ASSETTO RELATIVO</strong>
          <span>Zero soltanto visivo</span>
        </div>
        <div className="cage-preview-values">
          <div><span>ROLL Δ</span><strong>{fresh && pose ? numberOrDash(pose.rollDeg) + '°' : '—'}</strong></div>
          <div><span>PITCH Δ</span><strong>{fresh && pose ? numberOrDash(pose.pitchDeg) + '°' : '—'}</strong></div>
          <div><span>YAW* SENSORE</span><strong>{fresh && imu ? numberOrDash(imu.orientation_euler_deg[2]) + '°' : '—'}</strong></div>
        </div>
        <div className="cage-preview-controls">
          <button className="cage-preview-zero" type="button"
            disabled={!fresh || !pose}
            onClick={resetVisualZero}>
            Imposta zero grafico
          </button>
          <button className="cage-preview-yaw-toggle" type="button"
            aria-pressed={yawPreviewEnabled}
            disabled={!fresh || !pose}
            onClick={() => { if (fresh && pose) setYawPreviewEnabled(value => !value); }}
            title="Solo yaw relativo da fusione sensore NON calibrata. Non è una direzione assoluta.">
            {yawPreviewEnabled ? 'Disattiva yaw sperimentale' : 'Prova rotazione yaw relativa*'}
          </button>
        </div>
        <div className="cage-preview-status">
          <div><span>Accelerazione ‖a‖</span><strong>{fresh && imu
            ? numberOrDash(Math.hypot(...imu.acceleration_m_s2) / 9.80665, 3) + ' g' : '—'}</strong></div>
          <div><span>Velocità angolare ‖ω‖</span><strong>{fresh && imu
            ? numberOrDash(Math.hypot(...imu.angular_velocity_rad_s), 3) + ' rad/s' : '—'}</strong></div>
          <div><span>Campione</span><strong>{fresh && imu ? String(imu.sequence) : '—'}</strong></div>
          <div><span>YAW Δ visivo*</span><strong>{fresh && yawPose
            ? numberOrDash(yawPose.yawRelativeDeg) + '°' : 'DISATTIVATO'}</strong></div>
        </div>
        {pose?.limited && <p className="cage-preview-warning">Roll/pitch limitati visivamente a ±35°: non è una misura fisica completa.</p>}
        {bodyMode==='bhl_reference' && <div className="cage-encoder-panel">
          <div className="cage-encoder-heading"><strong>ENCODER · 22 GIUNTI RIFERIMENTO</strong>
            <span>{encoderDiagnostics.observedReadOnly}/{encoderDiagnostics.expected} letture osservate</span></div>
          <p className="cage-encoder-note">Il modello mostra la posa ZERO della URDF BHL V1, non quella fisica. Le eventuali letture encoder sono solo diagnostiche: mapping CAN→giunto, segno, rapporto e zero non verificati.</p>
          <div className="cage-encoder-rows" role="list" aria-label="Stato letture encoder dei 22 giunti BHL">
            {encoderDiagnostics.rows.map(row=><div role="listitem" key={row.jointId}
              className={'cage-encoder-row ' + (row.status==='OBSERVED_UNVERIFIED_MAPPING'?'cage-encoder-row-observed':'')}>
              <span title={row.jointId}>{row.jointId}</span>
              <strong>{row.angleRad!==null ? row.angleRad.toFixed(3)+' rad' : '—'}</strong>
              <small>{encoderStates[row.status]}</small>
            </div>)}
          </div>
          <p className="cage-encoder-note">
            {encoderDiagnostics.telemetryConnected ? 'Telemetria fisica connessa: posizione espressa nel frame dichiarato dal provider, non ancora certificato.'
              : 'Nessun provider di encoder fisici connesso alla Console; non verranno creati dati simulati.'}
            {' '}GIUNTI ANIMATI DA ENCODER: 0/22 (mappatura non verificata).
          </p>
        </div>}
        {yawPose?.limited && <p className="cage-preview-warning">Yaw relativo limitato visivamente a ±90°.</p>
        <p className="cage-preview-disclaimer">* Prova yaw disattivata inizialmente: usa solo la variazione dell’angolo prodotto dal sensore, non una direzione assoluta. Il segno fisico dell’asse Z non è ancora verificato.</p>
        <p className="cage-preview-disclaimer">Assi visivi: X larghezza, Y altezza, Z profondità. I segni e la geometria canonici BHL/OpenRGD non sono validati.</p>
      </div>
    </div>

    <footer className="cage-preview-footer">
      <p>La fascia ambrata indica <strong>soltanto la quota verticale Y=11 cm</strong>. La posizione X/Z del chip IMU è sconosciuta.</p>
      {bodyMode==='bhl_reference' && <p><strong>SCHEMA BHL V1</strong> · 22 giunti URDF in posa matematica zero, non encoder live · nessuna testa/collo as-built certificati.</p>}
      <p><strong>YAW* NON CALIBRATO</strong> · {yawPreviewEnabled ? 'rotazione relativa SPERIMENTALE, non orientamento assoluto' : 'rotazione yaw disattivata per impostazione predefinita'} · nessuna calibrazione o comando ai motori · decision_eligible=false.</p>
    </footer>
  </section>;
}
