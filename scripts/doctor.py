#!/usr/bin/env python3
"""Smoke test a running Console through the *public loopback gateway* (stdlib)."""
import argparse
import json
from urllib.request import urlopen
import time


def main():
    parser = argparse.ArgumentParser(description='Check Console health and safe model-first API after startup')
    parser.add_argument('--url', default='http://127.0.0.1:8088')
    args = parser.parse_args()
    base = args.url.rstrip('/')

    def fetch_json(route):
        with urlopen(base + route, timeout=7) as response:
            if response.status != 200:
                raise RuntimeError(f'{route}: HTTP {response.status}')
            return json.load(response)

    # Docker `up -d` does not wait for API, agents OR the Next.js listener.
    # Retry bounded transient 502/connection resets for both API and UI routes.
    # Do not invent PASS if any component stays unavailable.
    for attempt in range(15):
        try:
            fetch_json('/healthz')
            fetch_json('/api/v1/boot/health')
            fetch_json('/api/v1/modules/agent-health')
            for page in ('/onboarding', '/live', '/live/configure', '/boot'):
                with urlopen(base + page, timeout=7) as response:
                    html = response.read(1000)
                    if response.status != 200 or not html:
                        raise RuntimeError(f'Console UI not available: {page}')
            break
        except (OSError, RuntimeError, ValueError):
            # Docker can reset an early HTTP connection while the gateway is
            # starting. URLError/HTTPError subclass OSError; retry these and
            # raw ConnectionResetError, but still fail after 15 attempts.
            if attempt == 14:
                print('FAIL Console startup readiness: API/agents did not become available')
                return 1
            time.sleep(2)

    try:
        health = fetch_json('/healthz')
        status = fetch_json('/api/v1/status')
        diag = fetch_json('/api/v1/installation/diagnostics')
        robots = fetch_json('/api/v1/robots')
        models = fetch_json('/api/v1/models')
        module_health = fetch_json('/api/v1/modules/agent-health')
        boot_health = fetch_json('/api/v1/boot/health')
        boot_status = fetch_json('/api/v1/boot/status')
        module_catalog = fetch_json('/api/v1/modules/catalog')
        host = fetch_json('/api/v1/host-reports/latest')
        physical = fetch_json('/api/v1/robots/paky-01/telemetry')
        last_calibration = fetch_json('/api/v1/robots/paky-01/calibration/last')
        # All Web routes were checked in the bounded startup readiness loop.
        assert health['ok'] and health['actuation_enabled'] is False
        assert status['console_version'] == '0.4.3'
        assert diag['console_version'] == status['console_version']
        assert diag['data_directory_present'] and not diag['actuation_enabled']
        assert module_health['ok'] and module_health['actuation_enabled'] is False
        assert boot_health['ok'] and boot_health['actuation_enabled'] is False
        assert boot_status['schema_version'] == 'console.boot.v0.1'
        assert boot_status['physical_execution']['authorized'] is False
        assert boot_status['motor_commands_sent'] is False
        assert module_catalog['manager_contract'] == 'console.module-manager.v0.4a'
        assert module_catalog['auto_install'] is False and module_catalog['actuation_enabled'] is False
        assert any(row['id'] == 'paky-01' for row in robots)
        assert physical['power']['voltage']['value'] is None
        assert last_calibration is None or (last_calibration.get('actuation_enabled') is False and last_calibration.get('physical_calibration_certified') is False)
        assert diag['hardware_scanned_by_backend'] is False
        assert host is None or host['verification_state'] == 'operator_supplied_unverified'
        print(f'PASS OpenRGD Console v{status["console_version"]} @ {base} (backend API v{status["console_version"]})')
        print(f'  API: healthy | {len(robots)} robots | {len(models)} model previews')
        print(f'  Host report imported: {host is not None} | motor control: DISABLED')
        print(f"  Registry: {len(module_catalog['catalog'])} module releases | agent: OK | no auto-installs")
        print(f"  Boot Manager: {boot_status['status']} | physical execution: BLOCKED")
        return 0
    except (OSError, RuntimeError, AssertionError, ValueError, KeyError) as exc:
        print(f'FAIL Console preflight smoke: {exc}')
        print('Inspect: docker compose ps && docker compose logs --tail=80 api web gateway boot-manager')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
