"""Private HTTP agent. Not exposed to a host port or unauthenticated LAN."""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os
import threading

from boot_core import BootManager

manager = BootManager(
    Path(os.environ.get('OPENRGD_CONSOLE_DATA_DIR', '/app/console-data')),
    Path(os.environ.get('OPENRGD_BOOT_DATA_DIR', '/app/boot-data')),
    os.environ.get('OPENRGD_RGD_BIN', '/usr/local/bin/rgd'),
)


class Handler(BaseHTTPRequestHandler):
    def respond(self, status: int, data: dict | list) -> None:
        encoded = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:
        if self.path == '/internal/v1/healthz':
            return self.respond(200, {'ok': True, 'contract': 'console.boot-manager.v0.1', 'actuation_enabled': False})
        if self.path == '/internal/v1/status':
            return self.respond(200, manager.report)
        if self.path == '/internal/v1/history':
            return self.respond(200, manager.history())
        self.respond(404, {'error': 'Not found'})

    def do_POST(self) -> None:
        if self.path not in ('/internal/v1/select', '/internal/v1/recheck'):
            return self.respond(404, {'error': 'Unknown operation'})
        try:
            n = int(self.headers.get('Content-Length', '-1'))
            if n < 0 or n > 2048:
                return self.respond(413, {'error': 'Invalid payload length'})
            data = json.loads(self.rfile.read(n))
            if not isinstance(data, dict):
                raise ValueError('Expected JSON object')
            if self.path.endswith('/select'):
                if set(data) != {'instance_id', 'model_id'}:
                    raise ValueError('Fields instance_id and model_id required')
                result = manager.select(data['instance_id'], data['model_id'])
            else:
                if data != {}:
                    raise ValueError('Recheck takes no arguments')
                result = manager.run('manual_recheck')
            self.respond(200, result)
        except RuntimeError as exc:
            self.respond(409, {'error': str(exc)})
        except (ValueError, KeyError, TypeError, OSError, json.JSONDecodeError) as exc:
            self.respond(422, {'error': str(exc)[:200]})

    def log_message(self, fmt: str, *args) -> None:
        pass


def main() -> None:
    threading.Thread(target=manager.run, args=('service_start',), daemon=True).start()
    server = ThreadingHTTPServer(('0.0.0.0', 8091), Handler)
    print('OpenRGD Boot Manager listening internally on :8091 (non-actuating)', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
