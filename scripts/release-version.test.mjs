import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Console v0.4.3 release metadata stays coherent across Rust, Web and Doctor', () => {
  const webPackage = JSON.parse(file('apps/web/package.json'));
  const cargoPackage = file('services/api/Cargo.toml');
  const cargoVersion = cargoPackage.match(/^version = "([^"]+)"$/m)?.[1];
  assert.ok(cargoVersion, 'Cargo package version is missing');
  assert.equal(webPackage.version, cargoVersion, 'Rust and Web package versions diverged');

  const routes = file('services/api/src/routes.rs');
  const versionFields = routes.match(/"console_version"\s*:\s*env!\("CARGO_PKG_VERSION"\)/g) ?? [];
  assert.equal(versionFields.length, 2, 'status and installation diagnostics must share Cargo version');

  const doctor = file('scripts/doctor.py');
  assert.ok(doctor.includes("assert diag['console_version'] == status['console_version']"));

  const live = file('apps/web/src/components/robot-live.tsx');
  assert.ok(live.includes(`LIVE / v${webPackage.version}`), 'Live badge is not the release version');
});
