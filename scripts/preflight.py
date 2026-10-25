#!/usr/bin/env python3
"""Passive operator-side checks for Ubuntu/Fedora first install; never installs anything."""
import argparse
import json
from pathlib import Path
import platform
import shutil
import socket
import subprocess
import sys


def os_info():
    try:
        data = {}
        for line in Path('/etc/os-release').read_text().splitlines():
            if '=' in line and not line.startswith('#'):
                key, val = line.split('=', 1)
                data[key] = val.strip().strip('"')
        return data.get('ID', 'unknown'), data.get('VERSION_ID', '?'), data.get('PRETTY_NAME', 'unknown')
    except OSError:
        return 'unknown', '?', 'unknown'


def command_succeeds(args):
    try:
        result = subprocess.run(args, timeout=12, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, check=False)
        return result.returncode == 0, (result.stdout or result.stderr).strip()[:220]
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, str(exc)[:220]


def check_port(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(('127.0.0.1', port))
            return True, 'available for loopback gateway'
        except OSError as exc:
            return False, str(exc)


def main():
    parser = argparse.ArgumentParser(description='Check requirements; performs no installs')
    parser.add_argument('--json', action='store_true', help='Machine-readable report')
    args = parser.parse_args()
    distro, version, pretty = os_info()
    machine = platform.machine()
    checks = []

    def add(name, status, detail, required=False):
        checks.append(dict(name=name, status=status, detail=detail, required=required))

    add('Operating system', 'ok' if distro in ('ubuntu','fedora') else 'warning',
        f'{pretty} ({distro} {version}); baseline tested target: Ubuntu 22.04 / Fedora')
    add('CPU architecture', 'ok' if machine in ('x86_64', 'aarch64') else 'warning', machine)
    for name in ('python3', 'docker'):
        present = shutil.which(name) is not None
        add(f'{name} executable', 'ok' if present else 'blocker', shutil.which(name) or 'not found', True)
    if shutil.which('docker'):
        ok, message = command_succeeds(['docker','compose','version'])
        add('Docker Compose plugin', 'ok' if ok else 'blocker', message or 'not detected', True)
        ok, message = command_succeeds(['docker','info','--format','{{.ServerVersion}}'])
        add('Docker daemon and user access', 'ok' if ok else 'blocker', message or 'daemon inaccessible', True)
        if Path('docker-compose.yml').is_file():
            ok, message = command_succeeds(['docker','compose','config','--quiet'])
            add('Compose config syntax', 'ok' if ok else 'blocker', message or 'valid', True)
    port_free, message = check_port(8088)
    add('Local port 8088', 'ok' if port_free else 'warning', message,
        False) # a running console can legitimately own this port
    add('Network access', 'unassessed', 'Needed only for initial image/dependency download; no request attempted')
    add('Robot safety', 'ok', 'No device access or motor commands performed')
    if args.json:
        print(json.dumps({'checks':checks, 'platform':pretty, 'architecture':machine}, indent=2))
    else:
        print('OpenRGD Console preflight — READ ONLY')
        for row in checks:
            print(f"[{row['status'].upper():9}] {row['name']}: {row['detail']}")
        print('\nNo packages were installed and no hardware was interrogated.')
    return 1 if any(x['status'] == 'blocker' for x in checks) else 0


if __name__ == '__main__':
    sys.exit(main())
