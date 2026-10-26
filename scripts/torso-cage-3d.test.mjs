import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const src = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('3D cage dimensions match operator-reported measurements and IMU datum', () => {
  const moduleUrl = new URL('../apps/web/src/lib/torso-cage-geometry.ts', import.meta.url).href;
  // Run the actual TypeScript helper with the same Node 22 strip-types approach
  // used by the existing Live display preset regression suite.
  const child = [
    "import assert from 'node:assert/strict';",
    "const { PAKY01_CAGE:g, isCurrentPakyImu, isPakyImuSource, imuSourceKey, relativeCagePose } = await import(process.argv[1]);",
    "assert.equal(g.coreWidthM, 0.15);",
    "assert.equal(g.totalHeightM, 0.24);",
    "assert.equal(g.totalDepthM, 0.14);",
    "assert.ok(Math.abs(g.uprightLengthM + 2*g.profileThicknessM - g.totalHeightM) < 1e-9);",
    "assert.equal(g.coreWidthM + 2*g.upperBarOverhangEachSideM, g.upperBarLengthM);",
    "assert.equal(g.imuHeightFromOuterLowerEdgeM, 0.11);",
    "assert.ok(Math.abs(g.totalHeightM/2 - g.imuHeightFromOuterLowerEdgeM - 0.01) < 1e-9);",
    "assert.equal(g.imuExactX, null); assert.equal(g.imuExactZ, null);",
    "assert.equal(g.imuExtrinsicQuaternion, null);",
    "const time = Date.parse('2026-10-24T14:41:50.464+00:00');",
    "const a={schema_version:'console.imu.v0.1-candidate',robot_id:'paky-01',sensor_id:'torso-imu-01',source_id:'paky01-wit-serial',sensor_frame_id:'paky01_imu_sensor_unverified',session_id:'a'.repeat(32),sequence:106,source_kind:'physical',console_received_at:'2026-10-24T14:41:50.464+00:00',orientation_euler_deg:[-4.8,-7.3,-148],angular_velocity_rad_s:[0,0,0],acceleration_m_s2:[1,0,9.7],calibration_revision:null,reference_frame:'imu_sensor_axes_unverified',time_quality:'host_receive_only_not_chronograph',heading_calibrated:false,decision_eligible:false,observation_only:true};",
    "assert.equal(isCurrentPakyImu(a,'paky-01',true,time),true);",
    "assert.equal(isCurrentPakyImu(a,'paky-01',true,time+3000),true);",
    "assert.equal(isCurrentPakyImu(a,'paky-01',true,time+3001),false);",
    "assert.equal(isCurrentPakyImu(a,'paky-01',false,time),false);",
    "assert.equal(isCurrentPakyImu(a,'sim-lab-01',true,time),false);",
    "assert.equal(isPakyImuSource({...a,source_kind:'simulated'},'paky-01'),false);",
    "assert.equal(isPakyImuSource({...a,calibration_revision:'fabricated'},'paky-01'),false);",
    "assert.equal(isPakyImuSource({...a,decision_eligible:true},'paky-01'),false);",
    "assert.equal(isPakyImuSource({...a,reference_frame:'torso'},'paky-01'),false);",
    "assert.equal(isPakyImuSource({...a,session_id:'not-a-real-session'},'paky-01'),false);",
    "const zero={sourceKey:imuSourceKey(a),rollDeg:-4.8,pitchDeg:-7.3};",
    "const b={...a,orientation_euler_deg:[2.2,-2.3,95]};",
    "const pose=relativeCagePose(b,zero);",
    "assert.ok(Math.abs(pose.rollDeg-7)<1e-9);",
    "assert.ok(Math.abs(pose.pitchDeg-5)<1e-9);",
    "assert.ok(pose.rotationZRad<0);",
    "assert.ok(pose.rotationXRad>0);",
    "assert.ok(!Object.hasOwn(pose,'yawDeg'));",
    "assert.equal(relativeCagePose({...b,orientation_euler_deg:[60,-2.3,-150]},zero).limited,true);",
    "assert.throws(()=>relativeCagePose({...b,session_id:'b'.repeat(32)},zero));",
    "console.log('verified candidate visual-only pose and freshness');",
  ].join('\n');
  const result=spawnSync(process.execPath,
    ['--experimental-strip-types', '--input-type=module', '-e', child, moduleUrl],
    {encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);
});

test('3D panel is isolated from HAL/runtime, motor writes and unverified robot geometry', () => {
  const scene = src('apps/web/src/components/torso-cage-preview.tsx');
  const geom = src('apps/web/src/lib/torso-cage-geometry.ts');
  const live = src('apps/web/src/components/robot-live.tsx');
  const css = src('apps/web/src/components/torso-cage-preview.css');
  assert.match(scene,/PAKY01_CAGE/);
  assert.match(scene,/imuHeightFromOuterLowerEdgeM/);
  assert.match(scene,/Canvas/);
  assert.match(scene,/rotation=\{rotation\}/);
  assert.match(scene,/sourceValid \&\& zero/);
  assert.match(scene,/Imposta zero grafico/);
  assert.match(scene,/ROBOT COMPLETO · NON VERIFICATO/);
  assert.match(scene,/YAW\* NON CALIBRATO/);
  assert.match(scene,/NON ATTUALE|STALE/);
  assert.match(geom,/calibration_revision !== null/);
  assert.match(geom,/decision_eligible !== false/);
  assert.match(geom,/heading_calibrated !== false/);
  assert.match(geom,/source_kind !== 'physical'/);
  assert.match(geom,/rotationXRad: pitch \* radians/);
  assert.match(geom,/rotationZRad: -roll \* radians/);
  assert.match(live,/type LiveView = 'overview' \| 'cage' \| 'signals' \| 'activity'/);
  assert.match(live,/setView\('cage'\)/);
  assert.match(live,/dynamic\(\(\) => import\('@\/components\/torso-cage-preview'\)/);
  assert.match(live,/selectedRobot\?\.id/);
  assert.match(css,/@container live-viewport/);
  for(const file of [scene,geom]) {
    assert.doesNotMatch(file,/\bfetch\(|\bWebSocket\(|serialport|\/dev\/tty|motor\.write|safety\.override|apiWrite\(/);
  }
  assert.doesNotMatch(live,/setView\('cage'\).*apiWrite/s);
});

test('existing IMU contract and WIT fan-out paths are reused without changes', () => {
  const hooks=src('apps/web/src/hooks/use-console.ts');
  const imu=src('apps/web/src/components/imu-panel.tsx');
  assert.match(hooks,/frame\.type === 'imu'/);
  assert.match(hooks,/isImuObservation/);
  assert.match(imu,/imu\.console_received_at/);
  const routes=src('services/api/src/routes.rs');
  assert.match(routes,/\/api\/v1\/imu\/observations/);
  assert.match(routes,/imu_replay/);
  assert.match(routes,/input\.host_monotonic_ns < previous\.host_monotonic_ns/);
});


test('optional canary script is Bash-valid and never recreates active Compose or exposes LAN port', () => {
  const sh=src('scripts/torso-cage-canary.sh');
  const parsed=spawnSync('bash',['-n'],{input:sh,encoding:'utf8',timeout:10000});
  assert.equal(parsed.status,0,parsed.stderr);
  assert.match(sh,/rgd-console-torso-preview:v0\.1/);
  assert.match(sh,/--publish "127\.0\.0\.1:/);
  assert.match(sh,/reverse_proxy api:8080/);
  assert.match(sh,/reverse_proxy rgd-torso-v01-web:3000/);
  assert.match(sh,/docker run --rm -d --pull=never/);
  assert.match(sh,/--network "\$NETWORK"/);
  assert.match(sh,/--cap-drop ALL --security-opt no-new-privileges/);
  assert.doesNotMatch(sh,/docker compose (?:up|down|build)|docker volume (?:prune|rm)|--privileged|--device|docker\.sock|systemctl|motor\.command/);
});
