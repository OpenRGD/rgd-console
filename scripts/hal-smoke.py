#!/usr/bin/env python3
"""Non-actuating API smoke for RGD HAL declarations, no physical device calls."""
import argparse
import json
import urllib.request
import urllib.parse


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8088')
    parser.add_argument('--robot-id', default=None)
    args = parser.parse_args()
    base = args.url.rstrip('/')

    def read(path):
        with urllib.request.urlopen(base + '/api/v1' + path, timeout=10) as response:
            return json.load(response)

    robots = read('/robots')
    models = {m['model_id']: m for m in read('/models')}
    linked = [r for r in robots if r.get('rgd_model_id') in models]
    if not linked:
        print('No model-linked RGD robot instance; no HAL preview to check.')
        return 1
    if args.robot_id:
        robot = next((r for r in linked if r['id'] == args.robot_id), None)
        if robot is None:
            print('Robot ID not found among imported instances:', args.robot_id)
            return 1
    else:
        robot = next((r for r in linked if 'berkeley' in models[r['rgd_model_id']]['name'].lower()
                      or 'bhl' in models[r['rgd_model_id']]['name'].lower()), linked[0])

    report = read('/robots/' + urllib.parse.quote(robot['id'], safe='') + '/hal-declarations')
    assert report['model_id'] == robot['rgd_model_id']
    assert report['actuation_enabled'] is False
    assert report['physical_mapping_verified'] is False
    assert report['device_discovery_performed'] is False
    assert report['linked_joint_count'] <= report['declared_actuator_count']
    print('PASS: HAL declaration inspection — read-only / non-actuating')
    print('Instance:', robot['id'], '—', robot['name'])
    print('Source HAL:', report['source_path'])
    print('HAL module present:', report['hal_present'])
    print('Driver declarations:', report['declared_actuator_count'])
    print('Explicitly linked joints:', report['linked_joint_count'])
    for item in report['declarations']:
        print(f" - {item['source_key']}: {item['communication_protocol']} / "
              f"{item['bus_interface']} / ID {item['device_node_id']} -> "
              f"{item['joint_id'] or 'UNRESOLVED'} (UNVERIFIED)")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
