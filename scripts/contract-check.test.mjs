import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createGateway } from './dev-gateway.mjs';

const file = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const json = path => JSON.parse(file(path));
const robots = json('config/robots.json');
const modules = json('config/modules.json');

test('registry has unique robots and refuses unverified physical adapters', () => {
  assert.equal(robots.registry_version, 'console.robots.v1');
  assert.equal(new Set(robots.robots.map(r => r.id)).size, robots.robots.length);
  assert.ok(robots.robots.some(r => r.id === 'paky-01'));
  assert.ok(robots.robots.some(r => r.id === 'so-101'));
  for (const robot of robots.robots) {
    assert.equal(robot.rgt_model_ref, null);
    assert.equal(robot.adapter_id, robot.kind === 'simulated' ? 'console.simulated.v1' : 'console.unbound.v1');
  }
});

test('module manifests are versioned and cannot declare motion grants', () => {
  assert.equal(modules.registry_version, 'console.modules.v1');
  const ids = new Set(modules.modules.map(m => m.id));
  assert.equal(ids.size, modules.modules.length);
  for (const m of modules.modules) {
    assert.equal(m.manifest_version, 'console.module.v1');
    assert.equal(m.compatibility.console_api, 'console.v1');
    m.dependencies.forEach(dep => assert.ok(ids.has(dep), `missing dependency ${dep}`));
    m.permissions.forEach(p => assert.doesNotMatch(p, /actuat|motor\.command/i));
    if (m.status === 'planned_not_installed') { assert.deepEqual(m.permissions, []); assert.deepEqual(m.capabilities, []); }
  }
});

test('JSON schemas parse and required fields map to Rust structs', () => {
  const source = file('services/api/src/model.rs');
  for (const [name, struct] of [
    ['telemetry', 'TelemetrySnapshot'],
    ['event', 'ConsoleEvent'],
    ['module', 'ModuleManifest'],
    ['stream', 'StreamFrame'],
  ]) {
    const schema = json(`contracts/console/v1/${name}.schema.json`);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.ok(source.includes(`pub struct ${struct}`));
    for (const field of schema.required) {
      if (field === 'type') assert.ok(source.includes('pub event_type:'));
      else assert.ok(source.includes(`pub ${field}:`), `${struct}.${field} absent in model.rs`);
    }
  }
});

test('routing exposes limited profile and registry writes without motor endpoints', () => {
  const source = file('services/api/src/routes.rs');
  const registered = [...source.matchAll(/\.route\("([^"]+)",\s*get\(/g)].map(x => x[1]);
  assert.equal(registered.length, 26); // read-only HAL preview endpoint added
  assert.ok(registered.includes('/api/v1/stream'));
  assert.ok(registered.includes('/api/v1/robots/{id}/telemetry'));
  assert.ok(registered.includes('/api/v1/robots/{id}/hal-declarations'));
  // Profile and registry writes are allowed; no other command channels.
  for (const permitted of ['/api/v1/models/import', '/api/v1/instances', '/api/v1/robots/{id}/bindings']) {
    assert.ok(source.includes(`\"${permitted}\"`));
  }
  assert.match(source, /fn mutation_allowed\(/);
  assert.match(source, /x-openrgd-console/);
  assert.doesNotMatch(source, /\.route\([^\n]*\"\/api\/v1\/robots\/\{id\}\/command\"/);
  assert.doesNotMatch(source, /\.route\([^\n]+,\s*(put|delete|patch)\(/);
  assert.match(file('deploy/Caddyfile'), /reverse_proxy api:8080/);
  assert.match(file('docker-compose.yml'), /127\.0\.0\.1:8088:8080/);
});

test('simulator source tags and physical null measurements are deliberate', () => {
  const src = file('services/api/src/adapters.rs');
  assert.match(src, /pub struct UnboundAdapter/);
  assert.match(src, /Measurement::unavailable/);
  assert.match(src, /received_at: None/);
  assert.match(src, /pub struct SimulatorAdapter/);
  assert.match(src, /Measurement::simulated/);
  assert.match(file('services/api/src/model.rs'), /quality: "simulated"/);
});

test('all eight App Router sections exist', () => {
  const nav = file('apps/web/src/lib/navigation.ts');
  for (const id of ['overview', 'onboarding', 'body', 'electronics', 'mind', 'memory', 'modules', 'settings']) assert.ok(nav.includes(`id: '${id}'`));
  assert.ok(file('apps/web/src/components/console-shell.tsx').includes('RenderSection'));
});

test('local gateway separates REST path from Next app', async () => {
  const api = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(`api:${req.url}`); });
  const web = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(`web:${req.url}`); });
  const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
  const close = server => new Promise(resolve => server.close(resolve));
  let gateway;
  try {
    const apiPort = await listen(api);
    const webPort = await listen(web);
    gateway = createGateway({ apiPort, webPort });
    const proxyPort = await listen(gateway);
    assert.equal(await (await fetch(`http://127.0.0.1:${proxyPort}/api/v1/status`)).text(), 'api:/api/v1/status');
    assert.equal(await (await fetch(`http://127.0.0.1:${proxyPort}/overview`)).text(), 'web:/overview');
  } finally {
    if (gateway) await close(gateway);
    if (api.listening) await close(api);
    if (web.listening) await close(web);
  }
});

test('local gateway forwards WebSocket upgrade without changing origin', async () => {
  const { createHash } = await import('node:crypto');
  const api = createServer((_req, res) => res.end('ok'));
  const web = createServer((_req, res) => res.end('ok'));
  const upgradeSockets = new Set();
  api.on('upgrade', (req, socket) => {
    upgradeSockets.add(socket);
    socket.on('close', () => upgradeSockets.delete(socket));
    assert.equal(req.headers.host?.startsWith('127.0.0.1:'), true);
    const key = req.headers['sec-websocket-key'];
    const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    socket.write(Buffer.concat([Buffer.from([0x81, 0x05]), Buffer.from('hello')]));
    socket.on('error', () => {});
  });
  const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
  const close = server => new Promise(resolve => server.close(resolve));
  let gateway;
  let ws;
  try {
    const apiPort = await listen(api);
    const webPort = await listen(web);
    gateway = createGateway({ apiPort, webPort });
    const gatewayPort = await listen(gateway);
    ws = new WebSocket(`ws://127.0.0.1:${gatewayPort}/api/v1/stream?robot_id=sim-lab-01`);
    const value = await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('WS upgrade timeout')), 3000);
      ws.onmessage = event => { clearTimeout(deadline); resolve(event.data); };
      ws.onerror = error => { clearTimeout(deadline); reject(error); };
    });
    assert.equal(value, 'hello');
  } finally {
    if (ws) ws.close();
    // Upgrade sockets outlive HTTP lifetimes; explicitly tear down both directions.
    for (const socket of upgradeSockets) socket.destroy();
    if (gateway) { gateway.closeAllConnections(); await close(gateway); }
    api.closeAllConnections(); await close(api);
    web.closeAllConnections(); await close(web);
  }
});


test('v0.2 model, binding and readiness preview contracts are explicit and versioned', () => {
  const modelSource = file('services/api/src/model.rs');
  for (const [name, struct] of [['model', 'ImportedModel'], ['binding', 'BindingDraft']]) {
    const schema = json(`contracts/console/v1/${name}.schema.json`);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.ok(modelSource.includes(`pub struct ${struct}`));
    for (const field of schema.required) assert.ok(modelSource.includes(`pub ${field}:`), `${struct}.${field}`);
  }
  const readiness = json('contracts/console/v1/readiness.schema.json');
  assert.equal(readiness.properties.actuation_enabled.const, false);
  assert.equal(readiness.properties.status.const, 'not_ready_for_actuation');
  assert.equal(json('contracts/console/v1/model.schema.json').properties.integrity_state.const, 'canonical_not_verified');
});

test('import supports ZIP-packaged .rgd alias without accepting arbitrary single-file JSON', () => {
  const source = file('services/api/src/model_import.rs');
  assert.match(source, /pub const MAX_UPLOAD_BYTES: usize = 8/);
  assert.match(source, /fn safe_entry\(/);
  assert.match(source, /Percorso ZIP non sicuro/);
  assert.match(source, /is_rgd && !bytes\.starts_with\(b"PK/);
  assert.match(source, /rgd_json_is_not_misinterpreted_as_an_archive/);
  assert.match(source, /rgd_zip_alias_is_accepted_without_claiming_canonical_validity/);
  assert.match(source, /canonical_not_verified/);
  assert.match(source, /missing_modules/);
  assert.doesNotMatch(source, /std::process::Command|tokio::process|SocketCan|actuate\(/);
});

test('onboarding remains non-actuating and separates model from instance', () => {
  const source = file('apps/web/src/components/onboarding.tsx');
  for (const step of ['Installazione', 'Import RGD', 'Robot workspace', 'Discovery', 'Mapping', 'Readiness']) assert.ok(source.includes(step));
  assert.match(source, /apiWrite<ImportedModel>\('\/models\/import'/);
  assert.match(source, /apiWrite<RobotRecord>\('\/instances'/);
  assert.match(source, /proposed_unverified|NON VERIFICATO/);
  assert.match(source, /accept="\.zip,\.rgd,application\/zip"/);
  assert.match(file('services/api/src/state.rs'), /workspace\.json/);
  assert.match(file('docker-compose.yml'), /console_data:\/app\/data/);
  assert.match(file('services/api/src/routes.rs'), /"physical_discovery","state":"not_enabled"/);
});

test('v0.3 host snapshot is independently typed and remains unverified', () => {
  const hostSchema = json('contracts/console/v1/host-inventory-upload.schema.json');
  const storedSchema = json('contracts/console/v1/host-inventory.schema.json');
  const diagnosticSchema = json('contracts/console/v1/installation-diagnostics.schema.json');
  assert.equal(hostSchema.properties.schema_version.const, 'console.host-inventory.v1');
  assert.equal(hostSchema.properties.collection_method.const, 'passive_file_metadata_v1');
  assert.equal(hostSchema.properties.interfaces.maxItems, 128);
  assert.equal(storedSchema.properties.verification_state.const, 'operator_supplied_unverified');
  assert.equal(diagnosticSchema.properties.actuation_enabled.const, false);
  const api = file('services/api/src/model.rs');
  for (const name of ['HostPlatform', 'ObservedInterface', 'HostInventoryUpload', 'HostInventory'])
    assert.ok(api.includes(`pub struct ${name}`));
  assert.match(api, /#\[derive\(Clone, Debug, Serialize, Deserialize\)\]\s+pub struct Workspace/);
  assert.match(api, /#\[serde\(default\)\]\s+pub host_inventory:/);
  const validator = file('services/api/src/host_inventory.rs');
  assert.match(validator, /operator_supplied_unverified/);
  assert.match(validator, /"can_interface" \| "serial_endpoint" \| "video_endpoint"/);
  assert.match(file('services/api/src/routes.rs'), /"\/api\/v1\/host-reports\/import"/);
  assert.match(file('services/api/src/routes.rs'), /"\/api\/v1\/installation\/diagnostics"/);
});

test('v0.3 host-side discovery reads passive names only and onboarding never verifies bindings', () => {
  const py = file('scripts/host-snapshot.py');
  assert.match(py, /ARPHRD_CAN = 280/);
  assert.match(py, /present_not_probed/);
  assert.doesNotMatch(py, /import (socketcan|can|serial|subprocess)/);
  assert.doesNotMatch(py, /\.open\(|os\.open\(|write_bytes\(/);
  const onboard = file('apps/web/src/components/onboarding.tsx');
  assert.match(onboard, /operator_supplied_unverified|verification_state/);
  assert.match(onboard, /Salva bozza non verificata/);
  assert.doesNotMatch(onboard, /motor\.command|actuat(e|ion)\(/i);
  assert.match(file('services/api/src/routes.rs'), /"actuation_enabled":false/);
  assert.match(file('docs/README-v0.3-ARCHIVE.md'), /python3 scripts\/host-snapshot\.py/);
});


test('v0.4A routes have a bounded local Module Agent bridge, no generic exec', () => {
  const bridge = file('services/api/src/module_manager.rs');
  const routes = file('services/api/src/routes.rs');
  for (const path of ['/api/v1/modules/catalog', '/api/v1/modules/install', '/api/v1/modules/jobs/{job_id}', '/api/v1/modules/agent-health'])
    assert.ok(routes.includes(`"${path}"`), `missing ${path}`);
  assert.match(bridge, /AppState|CONSOLE_MODULE_AGENT_URL|module-agent:8090/);
  assert.match(bridge, /request\.validate\(\)\?/);
  assert.match(bridge, /INSTALL \{\} @|INSTALL \{\}@\{\}/);
  assert.doesNotMatch(bridge, /std::process::Command|tokio::process::Command/);
  assert.match(routes, /if !mutation_allowed\(&headers\) \{ return Err\(mutation_error\(\)\); \}/);
  assert.match(file('deploy/Dockerfile.module-agent'), /REGISTRY_COMMIT=0268b3748042d04fd3561553616388368881e04a/);
});

test('v0.4A module manager is isolated from host device paths and gateway', () => {
  const compose = file('docker-compose.yml');
  const dockerfile = file('deploy/Dockerfile.module-agent');
  assert.ok(compose.includes('module-agent:\n'));
  assert.match(compose, /- module_data:\/app\/data/);
  assert.match(compose, /127\.0\.0\.1:8088:8080/);
  assert.match(compose, /cap_add: \[NET_BIND_SERVICE\]/); // preserve Caddy startup correction
  assert.doesNotMatch(compose, /- \/dev:\/dev|- \/var\/run\/docker\.sock/);
  assert.match(dockerfile, /USER 10002:10002/);
  assert.match(dockerfile, /git -C rgd-modules rev-parse HEAD/);
  const agent = file('services/module-agent/server.py');
  assert.match(agent, /registry\.install\(/); // official registry, no duplicated installer
  assert.doesNotMatch(agent, /shell=True|os\.system\(|socketcan|import can\b/);
  assert.match(agent, /active_calibration_supported.*False/);
  assert.match(agent, /confirmation != required/);
});

test('v0.4A UI requires typed approval and displays verified software state', () => {
  const ui = file('apps/web/src/components/module-manager.tsx');
  assert.match(ui, /INSTALL \$\{selected\.descriptor\.id\}@\$\{selected\.descriptor\.version\} build/);
  assert.match(ui, /typed !== permissionPhrase/);
  assert.match(ui, /localStorage\.setItem\(JOB_KEY/);
  assert.match(ui, /non equivale a robot calibrato/i);
  assert.match(file('apps/web/src/components/sections.tsx'), /<ModuleManager bundledModules=\{modules\}/);
});


test('v0.4B calibration inspection is only an operator-triggered, no-motion bridge', () => {
  const agent = file('services/module-agent/calibration_passive.py');
  const routes = file('services/api/src/routes.rs');
  const relay = file('services/api/src/module_manager.rs');
  const source = file('services/module-agent/server.py');
  assert.match(source, /'\/internal\/v1\/calibration\/inspect'/);
  assert.match(agent, /registry\.resolve_binary\(/);
  assert.match(agent, /\[str\(binary\), 'inspect', '--bundle', str\(source\.root\)\]/);
  assert.match(agent, /MAX_ARCHIVE_BYTES = 8 \* 1024 \* 1024/);
  assert.match(agent, /MAX_ENTRIES = 256/);
  assert.match(agent, /source|archive/);
  assert.match(agent, /claims_physical_calibration_certified/);
  assert.doesNotMatch(agent, /shell=True|socketcan|import can/);
  assert.match(routes, /"\/api\/v1\/robots\/\{id\}\/calibration\/inspect"/);
  assert.match(routes, /"\/api\/v1\/robots\/\{id\}\/calibration\/last"/);
  assert.match(routes, /if !mutation_allowed\(&headers\) \{ return Err\(mutation_error\(\)\); \}/);
  assert.match(routes, /archive_integrity_mismatch/);
  assert.match(relay, /pub async fn inspect_calibration\(zip_bytes: Vec<u8>\)/);
  assert.match(file('services/api/src/state.rs'), /calibration_previews/);
});

test('v0.4B frontend separates nominal declarations from physical observations', () => {
  const ui = file('apps/web/src/components/calibration-inspector.tsx');
  const manager = file('apps/web/src/components/module-manager.tsx');
  assert.match(manager, /<CalibrationInspector ready \/>/);
  assert.match(ui, /current_robot_position_observed === false/);
  assert.match(ui, /physical_drift_evaluated === false/);
  assert.match(ui, /apiWrite<CalibrationInspection>/);
  assert.match(ui, /robot\.kind === 'physical' && !!robot\.rgd_model_id/);
  assert.match(ui, /Esporta JSON/);
  assert.match(file('apps/web/src/lib/contracts.ts'), /interface CalibrationInspection/);
});

test('v0.4B schemas are explicitly non-attuating and physical observation is proposal-only', () => {
  const schema = json('contracts/console/v1/calibration-inspection.v0.4b.schema.json');
  assert.equal(schema.properties.physical_calibration_certified.const, false);
  assert.equal(schema.properties.actuation_enabled.const, false);
  assert.equal(schema.properties.source_integrity.const, 'canonical_not_verified');
  const proposed = json('contracts/console/v1/physical-observation.v0.1-candidate.schema.json');
  assert.equal(proposed.properties.actuation_enabled.const, false);
  assert.equal(proposed.properties.schema_version.const, 'console.physical-observation.v0.1-candidate');
  assert.match(file('docs/PHYSICAL-OBSERVATION-CONTRACT.md'), /design-only candidate/);
  assert.match(file('deploy/Dockerfile.module-agent'), /COPY --chmod=0644 services\/module-agent\/calibration_passive\.py/);
});
