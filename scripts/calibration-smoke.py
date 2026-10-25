#!/usr/bin/env python3
"""Operator-invoked CAL-0.2 passive inspection smoke test (no hardware writes)."""
import argparse
import http.client
import json
from urllib.parse import urlsplit
from urllib.request import urlopen
from urllib.error import HTTPError, URLError


def main() -> int:
    parser = argparse.ArgumentParser(description='Inspect a model-linked robot instance, no physical calibration')
    parser.add_argument('--robot', help='ID of an imported RGD robot instance (not the static paky-01 placeholder)')
    parser.add_argument('--url', default='http://127.0.0.1:8088')
    args = parser.parse_args()
    base = args.url.rstrip('/')
    try:
        with urlopen(base + '/api/v1/robots', timeout=8) as response:
            robots = json.load(response)
        eligible = [r for r in robots if r['kind'] == 'physical' and r.get('rgd_model_id')]
        if not eligible:
            print('No model-linked physical robot instance yet. Open /onboarding, import an RGD ZIP and register an instance.')
            print('No calibration command was sent.')
            return 2
        robot_id = args.robot or eligible[0]['id']
        if robot_id not in {r['id'] for r in eligible}:
            print('Selected robot is not an imported model-linked instance. No inspection sent.')
            return 2
        parts = urlsplit(base)
        if parts.scheme != 'http' or parts.hostname not in ('127.0.0.1', 'localhost'):
            print('Local loopback URL required; do not send profile data to arbitrary hosts.')
            return 2
        port = parts.port or 80
        path = f'/api/v1/robots/{robot_id}/calibration/inspect'
        connection = http.client.HTTPConnection(parts.hostname, port, timeout=55)
        try:
            connection.request('POST', path, body='{}', headers={
                'Content-Type': 'application/json',
                'X-OpenRGD-Console': 'onboarding.v1',
            })
            response = connection.getresponse()
            payload = json.loads(response.read(4 * 1024 * 1024 + 16 * 1024))
        finally:
            connection.close()
        if response.status != 200:
            print(f'FAIL: HTTP {response.status}: {payload.get("message", payload.get("error", "unknown"))}')
            return 1
        report = payload['inspection']['report']
        assert payload['actuation_enabled'] is False
        assert payload['physical_calibration_certified'] is False
        assert report['current_robot_position_observed'] is False
        assert report['physical_drift_evaluated'] is False
        assert report['claims_physical_calibration_certified'] is False
        print(f'PASS passive CAL-0.2 for {robot_id} (model: {report["model_id"]})')
        print('Profile parameters:', report['coverage']['candidate_fields'], '| findings:', len(report['findings']))
        print('NOT a physical calibration. No real motors were queried or commanded.')
        return 0
    except (URLError, HTTPError, OSError, ValueError, AssertionError, KeyError) as exc:
        print('FAIL passive calibration smoke:', exc)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
