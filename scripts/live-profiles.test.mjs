import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const paths = {
  live: 'apps/web/src/components/robot-live.tsx',
  configurator: 'apps/web/src/components/live-configurator.tsx',
  source: 'apps/web/src/lib/display-profiles.ts',
  hook: 'apps/web/src/hooks/use-live-display.ts',
};
const load = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('browser-independent display presets validate unsafe storage values and custom bounds', () => {
  // Node 22's built-in type-stripping runs the ACTUAL TypeScript helper module.
  const path = new URL('../apps/web/src/lib/display-profiles.ts', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import {DISPLAY_PRESETS, DEFAULT_LIVE_DISPLAY, normalizeLiveDisplay, liveViewport,loadLiveDisplay} from ${JSON.stringify(path)};
    assert.equal(DISPLAY_PRESETS.length, 5);
    assert.deepEqual(liveViewport(normalizeLiveDisplay(null)), {width:800,height:480});
    assert.deepEqual(liveViewport(normalizeLiveDisplay({settings_version:1,preset:'portrait-5'})), {width:480,height:800});
    assert.deepEqual(liveViewport(normalizeLiveDisplay({settings_version:1,preset:'wide-7'})), {width:1024,height:600});
    const invalid=normalizeLiveDisplay({settings_version:1,preset:'hack', custom_width:Infinity, text_scale:500,visible_panels:{body:false,signals:false,activity:false}});
    assert.equal(invalid.preset,'compact-5');
    assert.equal(invalid.custom_width,800);
    assert.equal(invalid.text_scale,1.5);
    assert.equal(invalid.visible_panels.body,true);
    const custom=normalizeLiveDisplay({settings_version:1,preset:'custom',custom_width:38400,custom_height:20,text_scale:0.1});
    assert.deepEqual(liveViewport(custom), {width:3840,height:240});
    assert.equal(custom.text_scale,0.8);
    const unknown=normalizeLiveDisplay({settings_version:99,preset:'operator-10'});
    assert.equal(unknown.preset,'compact-5');
    assert.equal(loadLiveDisplay().preset,DEFAULT_LIVE_DISPLAY.preset);
  `;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
});

test('Live v0.4C is a read-only UI, not a host session or motor-control API', () => {
  const source = load(paths.live);
  const css = load('apps/web/src/components/robot-live.css');
  const settings = load(paths.configurator);
  assert.match(source, /status\?\.physical_runtime_connected/);
  assert.match(source, /hasFreshReading/);
  assert.match(source, /ROBOT FISICO/);
  assert.match(source, /SIMULATORE/);
  assert.match(source, /CONSOLE|Torna alla Console/);
  assert.match(source, /requestFullscreen\(\)/);
  assert.match(settings, /liveViewport\(settings\)/);
  assert.match(settings, /RobotLive embedded/);
  assert.match(css, /container-name: live-viewport/);
  assert.match(css, /@container live-viewport \(max-width:540px\)/);
  for (const value of ['/api/v1/robots/{id}/command','safety.override','sudo','systemctl reboot','ethtool -s'])
    assert.ok(!source.includes(value), 'forbidden Live control path ' + value);
  assert.doesNotMatch(source, /apiWrite\(|fetch\([^)]*,\s*\{\s*method:\s*'POST'/);
  assert.doesNotMatch(settings, /exec\(|child_process|sudo|setxrandr|xrandr --output|loginctl/);
});

test('Live route is independent of dynamic Console sections, and Docker startup stays unchanged', () => {
  const live = load('apps/web/app/live/page.tsx');
  const configure = load('apps/web/app/live/configure/page.tsx');
  const shell = load('apps/web/src/components/console-shell.tsx');
  const compose = load('docker-compose.yml');
  const upgrade = load('scripts/upgrade-v04c.sh');
  assert.match(live, /RobotLive/);
  assert.match(configure, /LiveConfigurator/);
  assert.match(shell, /href="\/live"/);
  assert.match(shell, /href="\/overview"|section/);
  assert.match(compose, /127\.0\.0\.1:8088:8080/);
  assert.equal((compose.match(/restart: unless-stopped/g)||[]).length,5);
  assert.match(upgrade, /--exclude='\.\/config'/);
  assert.match(upgrade, /--exclude='\.\/data'/);
  assert.match(upgrade, /--build --no-deps web/);
  assert.doesNotMatch(upgrade, /compose down -v|rm -rf .*module_data|systemctl|loginctl|gdm|set-default|grub/);
  assert.match(load('scripts/doctor.py'), /for page in \('\/onboarding',\s*'\/live',\s*'\/live\/configure',\s*'\/boot'\)/);
});
