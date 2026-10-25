import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = (name) => readFileSync(join(root, name),'utf8');
const schema = JSON.parse(file('contracts/console/v1/boot-report.v0.1.schema.json'));

test('boot report contract forbids claims of physical execution authority', () => {
  assert.equal(schema.properties.schema_version.const,'console.boot.v0.1');
  assert.equal(schema.properties.physical_execution.properties.authorized.const,false);
  assert.equal(schema.properties.hardware_scanned.const,false);
  assert.equal(schema.properties.motor_commands_sent.const,false);
  assert.deepEqual(schema.properties.status.enum, ['checking','setup_required','ready_non_actuating','recovery_required','validator_unavailable']);
});

test('Boot Manager is isolated from devices and Docker socket, and Console volumes persist', () => {
  const compose = file('docker-compose.yml');
  assert.match(compose, /boot-manager:/);
  assert.match(compose, /boot_data:\/app\/boot-data/);
  assert.match(compose, /console_data:\/app\/console-data:ro/);
  assert.match(compose, /boot-internal:[\s\S]*internal: true/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /cap_drop: \[ALL\]/);
  assert.match(compose, /127\.0\.0\.1:8088:8080/);
  assert.doesNotMatch(compose, /\/var\/run\/docker\.sock|\- \/dev\/|privileged: true/);
  assert.match(file('deploy/Dockerfile.boot-manager'), /OPENRGD_CANONICAL_COMMIT=afe1a831b950a4e6560f0285a0103fc4eaa343b7/);
  assert.match(file('deploy/Dockerfile.boot-manager'), /USER 10003:10003/);
});

test('canonical check and boot are the ONLY supported subprocess operations', () => {
  const source=file('services/boot-manager/boot_core.py');
  assert.match(source, /\[binary, '--quiet', command, '--output', 'json'\]/);
  assert.match(source, /'check', 'boot'/);
  assert.match(source, /NOT_AUTHORIZED_BY_BOOT/);
  assert.match(source, /MAX_EXTRACTED = 16 \* 1024 \* 1024/);
  assert.match(source, /ZIP decompresso oltre limite/);
  assert.doesNotMatch(source, /docker compose|\/dev\/tty|socketcan|systemctl reboot|motor\.command/);
  assert.doesNotMatch(source, /\bhandle\.extractall\(/);
});

test('API exposes only bounded local Boot Manager bridge with protected writes', () => {
  const routes=file('services/api/src/routes.rs');
  const relay=file('services/api/src/boot_manager.rs');
  for(const path of ['/api/v1/boot/health','/api/v1/boot/status','/api/v1/boot/history','/api/v1/boot/recheck','/api/v1/boot/select']) {
    assert.ok(routes.includes('"'+path+'"'),path);
  }
  assert.match(routes, /boot_recheck\(headers: HeaderMap\)/);
  assert.match(routes, /if !mutation_allowed\(&headers\)/);
  assert.match(relay, /http:\/\/boot-manager:8091/);
  assert.doesNotMatch(relay, /\/command|\/actuate|\/motor|\/power-on/);
});

test('Boot/Recovery UI remains independently accessible without kiosk/autologin modifications', () => {
  const ui=file('apps/web/src/components/boot-dashboard.tsx');
  const upgrade=file('scripts/upgrade-v04d.sh');
  assert.match(file('apps/web/app/boot/page.tsx'), /BootDashboard/);
  assert.match(ui, /RECOVERY MODE/);
  assert.match(ui, /ACTUATION: BLOCKED/);
  assert.match(ui, /apiWrite<BootReport>\('\/boot\/select'/);
  assert.match(ui, /apiWrite<BootReport>\('\/boot\/recheck'/);
  assert.match(file('apps/web/src/components/robot-live.tsx'), /href="\/boot"/);
  assert.match(upgrade, /--exclude='\.\/config'/);
  assert.match(upgrade, /--exclude='\.\/data'/);
  assert.doesNotMatch(upgrade,/compose down -v|rm -rf.*module_data|grub-install|systemctl|loginctl|gdm/);
});
