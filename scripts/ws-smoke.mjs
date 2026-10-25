/** Run after both services + gateway have started: node scripts/ws-smoke.mjs */
import assert from 'node:assert/strict';

const base = process.env.CONSOLE_BASE_URL ?? 'http://127.0.0.1:8088';
const get = async route => {
  const res = await fetch(`${base}${route}`, { signal: AbortSignal.timeout(5000) });
  assert.equal(res.status, 200, `${route}: unexpected HTTP status ${res.status}`);
  return res.json();
};

const health = await get('/healthz');
assert.equal(health.actuation_enabled, false);
const robots = await get('/api/v1/robots');
assert.ok(robots.some(robot => robot.id === 'paky-01'));
const physical = await get('/api/v1/robots/paky-01/telemetry');
assert.equal(physical.power.voltage.value, null);
assert.equal(physical.power.voltage.measured_at, null);
assert.equal(physical.can.bus_state, 'unknown');
const simulated = await get('/api/v1/robots/sim-lab-01/telemetry');
assert.equal(simulated.source_kind, 'simulated');
assert.equal(simulated.power.voltage.quality, 'simulated');
const modules = await get('/api/v1/modules');
assert.ok(modules.find(module => module.id === 'org.openrgd.console.simulator'));

assert.equal(typeof WebSocket, 'function', 'Run using Node >=22, which provides global WebSocket');
const socket = new WebSocket(base.replace(/^http/, 'ws') + '/api/v1/stream?robot_id=sim-lab-01');
const received = [];
try {
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('WebSocket hello / telemetry timed out')), 7000);
    socket.onmessage = event => {
      const frame = JSON.parse(event.data);
      received.push(frame);
      if (received.some(row => row.type === 'hello') && received.some(row => row.type === 'telemetry')) {
        clearTimeout(deadline);
        resolve();
      }
    };
    socket.onerror = () => { clearTimeout(deadline); reject(new Error('WebSocket connection error')); };
  });
  assert.ok(received.every(row => row.schema_version === 'console.v1'));
  const sample = received.find(row => row.type === 'telemetry').data;
  assert.equal(sample.source_kind, 'simulated');
  console.log('PASS: HTTP + robot registry + null physical values + module manifests + WebSocket telemetry');
} finally {
  socket.close();
}
