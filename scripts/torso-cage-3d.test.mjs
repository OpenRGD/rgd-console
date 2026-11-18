import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const src = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('3D cage dimensions match operator-reported measurements and IMU datum', () => {
  const moduleUrl = new URL('../apps/web/src/lib/torso-cage-geometry.ts', import.meta.url).href;
  // Run the actual TypeScript helper with the same Node 22 strip-types approach
  // used by the existing Live display preset regression suite.
  const child = [
    "import assert from 'node:assert/strict';",
    "const { PAKY01_CAGE:g, isCurrentPakyImu, isPakyImuSource, imuSourceKey, relativeCagePose, relativeYawPreview } = await import(process.argv[1]);",
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
    "const zero={sourceKey:imuSourceKey(a),rollDeg:-4.8,pitchDeg:-7.3,yawDeg:-148};",
    "const b={...a,orientation_euler_deg:[2.2,-2.3,95]};",
    "const pose=relativeCagePose(b,zero);",
    "assert.ok(Math.abs(pose.rollDeg-7)<1e-9);",
    "assert.ok(Math.abs(pose.pitchDeg-5)<1e-9);",
    "assert.ok(pose.rotationZRad>0);", // Inverted from old preview after operator's right/left physical feedback.
    "assert.ok(pose.rotationXRad>0);",
    "assert.ok(!Object.hasOwn(pose,'yawDeg'));",
    "assert.ok(!Object.hasOwn(pose,'rotationYRad'));",
    "const relativeYaw=relativeYawPreview({...b,orientation_euler_deg:[2.2,-2.3,-142.5]},zero);",
    "assert.ok(Math.abs(relativeYaw.yawRelativeDeg-5.5)<1e-9);",
    "assert.ok(relativeYaw.rotationYRad>0);",
    "assert.equal(relativeYaw.limited,false);",
    "const wrappedYaw=relativeYawPreview({...b,orientation_euler_deg:[2.2,-2.3,-179]}, {...zero,yawDeg:179});",
    "assert.ok(Math.abs(wrappedYaw.yawRelativeDeg-2)<1e-9);",
    "const clippedYaw=relativeYawPreview(b,zero);",
    "assert.equal(clippedYaw.yawRelativeDeg,-90);",
    "assert.equal(clippedYaw.limited,true);",
    "assert.throws(()=>relativeYawPreview({...b,session_id:'b'.repeat(32)},zero));",
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
  assert.match(geom,/rotationZRad: roll \* radians/);
  assert.match(geom,/CAGE_PREVIEW_YAW_LIMIT_DEG = 90/);
  assert.match(geom,/relativeYawPreview/);
  assert.match(scene,/useState\(false\)/);
  assert.match(scene,/yawPose\?\.rotationYRad \?\? 0/);
  assert.match(scene,/yawPreviewEnabled \? 'Disattiva yaw sperimentale'/);
  assert.match(scene,/setYawPreviewEnabled\(false\)/);
  assert.match(scene,/YAW Δ visivo\*/);
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
  // Bash -n accepts two trailing backslashes, but docker then receives a literal
  // backslash as IMAGE and fails with `docker: invalid reference format`.
  assert.equal(sh.includes(String.fromCharCode(92,92,10)),false,
    'Double backslash before newline breaks docker run image argument');
  assert.match(sh,/rgd-console-torso-preview:v0\.3/);
  assert.match(sh,/--publish "127\.0\.0\.1:/);
  assert.match(sh,/method GET HEAD/);
  assert.match(sh,/reverse_proxy @api_read api:8080/);
  assert.match(sh,/respond @api_block "Preview API is read-only" 405/);
  assert.match(sh,/--entrypoint caddy "\$CADDY_IMAGE" validate --config \/etc\/caddy\/Caddyfile --adapter caddyfile/);
  assert.match(sh,/reverse_proxy rgd-torso-v01-web:3000/);
  assert.match(sh,/docker run -d --pull=never --name/);
  assert.match(sh,/--cap-drop ALL --cap-add NET_BIND_SERVICE --security-opt no-new-privileges/);
  assert.match(sh,/docker logs --tail 35/);
  assert.match(sh,/docker inspect --format/);
  assert.match(sh,/--network "\$NETWORK"/);
  assert.match(sh,/--cap-drop ALL --security-opt no-new-privileges/);
  assert.doesNotMatch(sh,/docker compose (?:up|down|build)|docker volume (?:prune|rm)|--privileged|--device|docker\.sock|systemctl|motor\.command/);
});


test('canary up passes explicit Caddy executable in real shell argv, with Docker/curl mocked', () => {
  // Static Bash parsing alone missed two launch failures: a duplicated \ at EOL
  // and passing "validate" instead of "caddy validate" as container command.
  const tmp = mkdtempSync(join(tmpdir(), 'rgd-torso-canary-'));
  try {
    const bin = join(tmp, 'bin');
    mkdirSync(bin);
    const log = join(tmp, 'docker-argv.log');
    writeFileSync(join(bin, 'sudo'), '#!/bin/sh\nexec "$@"\n', { mode: 0o755 });
    writeFileSync(join(bin, 'docker'),
      '#!/bin/sh\nprintf "%s|" "$@" >> "$DOCKER_ARGS_LOG"\nprintf "\\n" >> "$DOCKER_ARGS_LOG"\n' +
      'if [ "$1" = container ] && [ "$2" = inspect ]; then exit 1; fi\nexit 0\n',
      { mode: 0o755 });
    writeFileSync(join(bin, 'curl'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const run = spawnSync('bash', ['scripts/torso-cage-canary.sh', 'up'], {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, HOME: tmp, PATH: bin + ':' + process.env.PATH, DOCKER_ARGS_LOG: log },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /PREVIEW LIVE: http:\/\/127\.0\.0\.1:8099\/live/);
    const lines = readFileSync(log, 'utf8').trim().split('\n');
    const validate = lines.find(line => line.includes('|caddy:2.10-alpine|validate|'));
    assert.ok(validate, 'Expected Caddy validation docker run command in argv log');
    assert.match(validate, /^run\|--rm\|--pull=never\|--network\|none\|--mount\|/);
    assert.match(validate, /\|--entrypoint\|caddy\|caddy:2\.10-alpine\|validate\|--config\|\/etc\/caddy\/Caddyfile\|--adapter\|caddyfile\|$/);
    assert.ok(lines.some(line => line.includes('|rgd-console-torso-preview:v0.3|')),
      'Expected separate candidate web image launch');
    const gatewayRun = lines.find(line => line.includes('|--name|rgd-torso-v01-gateway|'));
    assert.ok(gatewayRun, 'Expected temporary preview Caddy gateway');
    assert.match(gatewayRun,/^run\|-d\|--pull=never\|--name\|rgd-torso-v01-gateway\|/);
    assert.match(gatewayRun,/\|--cap-drop\|ALL\|--cap-add\|NET_BIND_SERVICE\|--security-opt\|no-new-privileges\|/);
    assert.match(validate,/\|--cap-drop\|ALL\|--cap-add\|NET_BIND_SERVICE\|--security-opt\|no-new-privileges\|/);
    const caddyfile = readFileSync(join(tmp, 'openrgd', 'preview', 'torso-cage-v01', 'Caddyfile'), 'utf8');
    assert.match(caddyfile, /method GET HEAD/);
    assert.match(caddyfile, /respond @api_block "Preview API is read-only" 405/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});


test('canary startup failure captures exit code and logs before removing temporary containers', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'rgd-torso-failed-canary-'));
  try {
    const bin = join(tmp, 'bin');
    mkdirSync(bin);
    const log = join(tmp, 'docker-argv.log');
    const started = join(tmp, 'preview-started');
    writeFileSync(join(bin, 'sudo'), '#!/bin/sh\nexec "$@"\n', {mode:0o755});
    const mockDocker = [
      '#!/bin/sh',
      'printf "%s|" "$@" >> "$DOCKER_ARGS_LOG"',
      'printf "\\n" >> "$DOCKER_ARGS_LOG"',
      'if [ "$1" = container ] && [ "$2" = inspect ]; then',
      '  [ -f "$DOCKER_PREVIEW_STARTED" ]',
      '  exit $?',
      'fi',
      'if [ "$1" = run ]; then',
      '  case "$*" in *--name*) touch "$DOCKER_PREVIEW_STARTED" ;; esac',
      'fi',
      'if [ "$1" = inspect ] && [ "$2" = --format ]; then',
      '  echo "exited exit=126 error=operation not permitted"',
      'fi',
      'if [ "$1" = logs ]; then',
      '  echo "Caddy startup failed: operation not permitted"',
      'fi',
      'exit 0',
    ].join('\n') + '\n';
    writeFileSync(join(bin, 'docker'), mockDocker, {mode:0o755});
    writeFileSync(join(bin, 'curl'), '#!/bin/sh\ncase "$*" in *127.0.0.1:8099*) exit 7 ;; esac\nexit 0\n', {mode:0o755});
    writeFileSync(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n', {mode:0o755});
    const run = spawnSync('bash', ['scripts/torso-cage-canary.sh', 'up'], {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, HOME: tmp, PATH: bin + ':' + process.env.PATH,
        DOCKER_ARGS_LOG: log, DOCKER_PREVIEW_STARTED: started },
    });
    assert.notEqual(run.status, 0, 'Canary must fail if preview port 8099 never becomes healthy');
    assert.match(run.stderr, /PREVIEW STARTUP DIAGNOSTICS/);
    assert.match(run.stderr, /exited exit=126 error=operation not permitted/);
    assert.match(run.stderr, /Caddy startup failed: operation not permitted/);
    assert.match(run.stderr, /Active Console unchanged/);
    const entries = readFileSync(log, 'utf8').trim().split('\n');
    const reportIndex = entries.findIndex(line => line.startsWith('inspect|--format|'));
    const logIndex = entries.findIndex(line => line.startsWith('logs|--tail|35|'));
    const removeIndex = entries.findIndex(line => line.startsWith('rm|-f|'));
    assert.ok(reportIndex >= 0 && logIndex > reportIndex && removeIndex > logIndex,
      'State and logs must be collected before preview cleanup');
    const removed = entries.filter(line => line.startsWith('rm|-f|'));
    assert.equal(removed.length, 2);
    assert.ok(removed.every(line => line.includes('rgd-torso-v01-')));
    assert.ok(!entries.some(line => /compose|volume|image\|rm\|/.test(line)),
      'Production services, volumes and images must be untouched');
  } finally {
    rmSync(tmp, {recursive:true,force:true});
  }
});
