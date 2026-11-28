import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('integrated navigation and CI preserve both studios and CAL',()=>{
 const shell=read('apps/web/src/components/console-shell.tsx'),ci=read('.github/workflows/verify.yml');
 assert.match(shell,/VoiceReadinessPanel key=\{data.robot.id\}/);
 assert.match(shell,/href="\/visual-effects"/);
 assert.match(ci,/test_voice_status.py/);
 assert.match(ci,/jsonschema==4.23.0/);
 assert.match(ci,/calibration_contract import validator_for/);
 assert.match(read('apps/web/src/components/robot-live.tsx'),/<BodyViewport model=\{importedModel\}/);
 assert.match(read('apps/web/src/components/onboarding.tsx'),/RPY nominale disponibile/);
});
test('lab project is separate and no production configuration or device grants',()=>{
 const lab=read('compose.rc-lab.yml'),gate=read('deploy/rc-lab/Caddyfile'),script=read('scripts/rc-lab.sh');
 assert.match(lab,/name: openrgd-console-rc-lab\n/);
 assert.match(lab,/"127\.0\.0\.1:8188:8080"/);
 assert.match(lab,/CONSOLE_IMU_INGEST_TOKEN: ""/);
 assert.match(lab,/CONSOLE_IMU_ALLOWED_ROBOT_IDS: ""/);
 assert.match(lab,/target: \/app\/console-data\n        read_only: true\n        volume:\n          nocopy: true/);
 assert.match(lab,/depends_on:\n      - api\n    expose: \["8091"\]/);
 assert.doesNotMatch(lab,/127\.0\.0\.1:8088|\.\/config:|devices:|privileged: true|docker\.sock|network_mode: host|\/dev\/|restart: unless-stopped/);
 assert.match(gate,/X-OpenRGD-Lab "console-025a"/);
 assert.match(gate,/\/api\/v1\/imu\/observations \/api\/v1\/modules\/install \/api\/v1\/host-reports\/import/);
 assert.match(script,/--env-file \/dev\/null -f/);
 assert.doesNotMatch(script,/down -v|docker system prune|docker volume rm/);
 const robots=JSON.parse(read('deploy/rc-lab/robots.json')).robots;
 assert.equal(robots.length,2);
 assert.ok(robots.every(r=>r.id.startsWith('rc-lab-')&&r.rgt_model_ref===null));
});
test('component lock is source-only; stable package version stays unchanged',()=>{
 const m=JSON.parse(read('release/console-025a.json'));
 assert.deepEqual(m.components.map(x=>x.pr),[20,23,15,10,18]);
 assert.ok(m.components.every(x=>/^[a-f0-9]{40}$/.test(x.head)));
 assert.equal(m.production_release,false);assert.equal(m.actuation_enabled,false);assert.equal(m.hardware_acceptance,false);
 assert.equal(JSON.parse(read('apps/web/package.json')).version,'0.4.3');
});
