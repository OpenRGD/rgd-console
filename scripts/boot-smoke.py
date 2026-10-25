#!/usr/bin/env python3
"""Read-only boot manager smoke. Needs the stack running on loopback."""
import json
from urllib.request import urlopen

BASE='http://127.0.0.1:8088'
for route in ('/api/v1/boot/health', '/api/v1/boot/status', '/api/v1/boot/history'):
    with urlopen(BASE+route, timeout=7) as response:
        data=json.load(response)
        print(route, 'HTTP', response.status)
        if route.endswith('status'):
            print('Boot:',data.get('status'), 'authorized:',data.get('physical_execution',{}).get('authorized'))
            assert data['physical_execution']['authorized'] is False
            assert data['hardware_scanned'] is False
            assert data['motor_commands_sent'] is False
print('PASS: Boot Manager reachable and never declares motor authorization')
