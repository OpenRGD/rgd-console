import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const schema = name => JSON.parse(read(`contracts/console/v1/peripheral-host-${name}.v0.1-candidate.schema.json`));

test('host broker protocol is private, versioned and acquisition-only', () => {
  const request = schema('request');
  const response = schema('response');
  const allowlist = schema('allowlist');
  assert.equal(request.properties.schema_version.const,
               'openrgd.peripheral-host-request.v0.1-candidate');
  assert.equal(response.properties.schema_version.const,
               'openrgd.peripheral-host-response.v0.1-candidate');
  assert.equal(allowlist.properties.schema_version.const,
               'openrgd.peripheral-host-allowlist.v0.1-candidate');
  for (const contract of [request, response, allowlist]) {
    assert.equal(contract.additionalProperties, false);
    assert.equal(contract.type, 'object');
  }
  assert.deepEqual(request.properties.action.enum, [
    'status', 'acquisition.start', 'acquisition.stop'
  ]);
  assert.deepEqual(response.properties.actuation_enabled, {const: false});
  assert.equal(allowlist.properties.services.items.additionalProperties, false);
  assert.equal(allowlist.properties.services.minItems, 1);
  assert.ok(!Object.hasOwn(request.properties, 'command'));
  assert.ok(!Object.hasOwn(request.properties, 'device_path'));
  assert.ok(!Object.hasOwn(request.properties, 'unit'));
});

test('implementation has narrow trusted-host ownership and no Docker device/privilege injection', () => {
  const broker = read('services/peripheral-manager/host_broker.py');
  const installer = read('services/peripheral-manager/install_paky01_imu.py');
  const client = read('services/peripheral-manager/control_cli.py');
  const compose = read('docker-compose.yml');
  assert.match(broker, /SO_PEERCRED/);
  assert.match(broker, /--user/);
  assert.match(broker, /MAX_MESSAGE = 2048/);
  assert.match(broker, /VALID_ACTIONS/);
  assert.match(broker, /"acquisition.start"/);
  assert.match(broker, /"acquisition.stop"/);
  assert.doesNotMatch(broker, /shell=True|os\.system\(|os\.kill\(|killall|pkill|SocketCAN|python-can/);
  assert.match(installer, /--install/);
  assert.match(installer, /--confirm/);
  assert.match(installer, /--continuous/);
  assert.match(installer, /pyserial_missing_for_selected_interpreter/);
  assert.match(client, /expected_status_revision/);
  assert.match(client, /--confirm/);
  assert.doesNotMatch(compose, /\/var\/run\/docker\.sock|\/dev\/ttyUSB|\/dev\/bus\/usb/);
  assert.match(compose, /127\.0\.0\.1:8088:8080/);
});
