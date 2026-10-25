"""OpenRGD Console v0.4A module installation sidecar.

IMPORTANT: no device paths, host privileges, Docker socket or arbitrary command
execution. Delegates catalog/install/resolve to a pinned rgd-modules distribution.
Network-only read paths and explicitly approved, allowlisted installs.
This service MUST remain private to Docker's internal network.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock, Thread
import json
import os
import re
import sys
import uuid
from typing import Any
from urllib.parse import urlsplit

# The pinned registry source is embedded into the container image at build time.
from rgd_registry import core as registry
from calibration_passive import CalibrationInspector, InspectionError, MAX_ARCHIVE_BYTES

API_VERSION = 'console.module-agent.v1'
MANAGER_CONTRACT = 'console.module-manager.v0.4a'
MAX_REQUEST_BYTES = 4096
MAX_JOBS = 64
JOB_ID = re.compile(r'^[0-9a-f]{32}$')


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def error_message(error: Exception) -> str:
    """Avoid sending raw paths, credentials or stack traces to the browser."""
    summary = str(error).strip().splitlines()[-1] if str(error).strip() else type(error).__name__
    return summary[:420]


def safe_public_status(module: dict[str, Any], prefix: Path) -> dict[str, Any]:
    result = registry.status_of(module['id'], version=module['version'], prefix=prefix)
    # Do not expose the absolute binary path from status_of to the browser.
    return {'state': result['status'], 'binary_sha256': result.get('binary_sha256')}


@dataclass
class InstallRequest:
    module_id: str
    version: str
    mode: str
    confirmation: str


def normalize_install_request(payload: Any) -> InstallRequest:
    if not isinstance(payload, dict) or set(payload) != {'module_id', 'version', 'mode', 'confirmation'}:
        raise ValueError('Sono richiesti soltanto module_id, version, mode e confirmation')
    if any(not isinstance(x, str) for x in payload.values()):
        raise ValueError('I campi di installazione devono essere stringhe')
    job = InstallRequest(**payload)
    if job.mode not in ('build', 'source_only'):
        raise ValueError('Modalità non supportata')
    if not re.fullmatch(r'[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+', job.module_id):
        raise ValueError('Identificativo modulo non valido')
    if not re.fullmatch(r'\d+\.\d+\.\d+', job.version):
        raise ValueError('Versione modulo non valida')
    required = f'INSTALL {job.module_id}@{job.version} {job.mode}'
    if job.confirmation != required:
        raise ValueError('Conferma esplicita non corrispondente alla richiesta')
    return job


class ModuleManager:
    def __init__(self, prefix: Path):
        self.prefix = prefix
        self.lock = Lock()
        self.jobs: dict[str, dict[str, Any]] = {}
        self.busy_job: str | None = None
        self.calibration = CalibrationInspector(prefix)

    def catalog(self) -> dict[str, Any]:
        modules = []
        for entry in registry.catalog():
            modules.append({'descriptor': entry, 'installation': safe_public_status(entry, self.prefix)})
        return {
            'manager_contract': MANAGER_CONTRACT,
            'registry_contract': registry.CONTRACT_VERSION,
            'source': 'OpenRGD/rgd-modules (pinned local distribution)',
            'catalog': modules,
            'auto_install': False,
            'actuation_enabled': False,
        }

    def start_install(self, payload: Any) -> dict[str, Any]:
        request = normalize_install_request(payload)
        descriptor = registry.entry(request.module_id, request.version)
        # Enforce an explicit no-device/zero-motion v0.4A policy in addition
        # to the registry's more general own descriptor checks.
        if (descriptor.get('maturity') != 'candidate' or descriptor.get('permissions_required') != []
            or descriptor.get('safety') != {
                'non_actuating': True, 'automatic_motion_on_load': False,
                'active_calibration_supported': False
            }):
            raise ValueError('Permessi o requisiti safety incompatibili con la Console v0.4A')
        if request.mode == 'build' and registry._host() not in descriptor['distribution']['hosts']:
            raise ValueError('Architettura host non supportata dal modulo')
        with self.lock:
            if self.busy_job:
                raise RuntimeError('Un altro job di installazione è già in corso')
            state = registry.status_of(request.module_id, version=request.version, prefix=self.prefix)
            if state['status'] != 'not_installed':
                raise ValueError(f"Modulo già presente ({state['status']}): non sovrascrivo la versione installata")
            if len(self.jobs) >= MAX_JOBS:
                for old_id, old in list(self.jobs.items()):
                    if old['state'] not in ('queued', 'running'):
                        del self.jobs[old_id]
                        break
                if len(self.jobs) >= MAX_JOBS:
                    raise RuntimeError('Limite job raggiunto')
            job_id = uuid.uuid4().hex
            job = {
                'job_id': job_id, 'module_id': request.module_id, 'version': request.version,
                'mode': request.mode, 'state': 'queued', 'created_at': now_utc(),
                'finished_at': None, 'error': None, 'result': None,
                'hardware_access': False,
            }
            self.jobs[job_id] = job
            self.busy_job = job_id
        Thread(target=self._install_worker, args=(job_id, request), daemon=True).start()
        return dict(job)

    def _install_worker(self, job_id: str, request: InstallRequest) -> None:
        with self.lock:
            self.jobs[job_id]['state'] = 'running'
        try:
            # Reuse official implementation, not a custom Git/Cargo installer.
            installed = registry.install(
                request.module_id, version=request.version, prefix=self.prefix,
                build=request.mode == 'build'
            )
            expected = 'ready' if request.mode == 'build' else 'source_only'
            # registry.install internally verifies pinned Git and source manifest,
            # and status_of checks the resulting source/binary digest.
            if installed.get('status') != expected:
                raise RuntimeError(f"Stato inatteso dopo installazione: {installed.get('status')}")
            result = {'state': expected, 'source_commit': installed.get('source_commit'),
                      'binary_sha256': installed.get('binary_sha256')}
            final_state = 'succeeded'
            message = None
        except Exception as exc:  # isolated worker must record any failure
            result, final_state, message = None, 'failed', error_message(exc)
        with self.lock:
            self.jobs[job_id].update(state=final_state, result=result, error=message, finished_at=now_utc())
            self.busy_job = None

    def job(self, job_id: str) -> dict[str, Any] | None:
        if not JOB_ID.fullmatch(job_id):
            return None
        with self.lock:
            value = self.jobs.get(job_id)
            return dict(value) if value else None


def handler_factory(manager: ModuleManager):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'OpenRGD-Module-Agent/0.4B'
        sys_version = ''
        def _json(self, status: int, data: Any) -> None:
            content = json.dumps(data, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def do_GET(self) -> None:  # noqa: N802
            path = urlsplit(self.path).path
            try:
                if path == '/internal/v1/healthz':
                    self._json(200, {'ok': True, 'contract': API_VERSION, 'actuation_enabled': False})
                    return
                if path == '/internal/v1/catalog':
                    self._json(200, manager.catalog())
                    return
                if path.startswith('/internal/v1/jobs/'):
                    job_id = path.removeprefix('/internal/v1/jobs/')
                    value = manager.job(job_id)
                    self._json(200 if value else 404, value if value else {'error': 'job not found'})
                    return
                self._json(404, {'error': 'route not found'})
            except registry.RegistryError as exc:
                self._json(422, {'error': error_message(exc)})

        def do_POST(self) -> None:  # noqa: N802
            path = urlsplit(self.path).path
            if path == '/internal/v1/calibration/inspect':
                if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/zip':
                    self._json(415, {'error': 'ZIP source profile required'})
                    return
                raw_length = self.headers.get('Content-Length', '')
                if not raw_length.isdigit() or not 0 < int(raw_length) <= MAX_ARCHIVE_BYTES:
                    self._json(413, {'error': 'Archive missing or beyond 8 MiB'})
                    return
                try:
                    result = manager.calibration.inspect(self.rfile.read(int(raw_length)))
                    self._json(200, result)
                except InspectionError as exc:
                    self._json(422, {'error': error_message(exc)})
                except registry.RegistryError:
                    self._json(409, {'error': 'Calibration binary not ready or digest invalid'})
                return
            if path != '/internal/v1/install':
                self._json(404, {'error': 'route not found'})
                return
            raw_length = self.headers.get('Content-Length', '')
            if not raw_length.isdigit() or not 0 < int(raw_length) <= MAX_REQUEST_BYTES:
                self._json(413, {'error': 'payload missing or too large'})
                return
            if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/json':
                self._json(415, {'error': 'JSON required'})
                return
            try:
                payload = json.loads(self.rfile.read(int(raw_length)))
                created = manager.start_install(payload)
                self._json(202, created)
            except (json.JSONDecodeError, ValueError, registry.RegistryError) as exc:
                self._json(422, {'error': error_message(exc)})
            except RuntimeError as exc:
                self._json(409, {'error': error_message(exc)})

        def log_message(self, fmt: str, *args: object) -> None:
            print('module-agent:', fmt % args, file=sys.stderr, flush=True)
    return Handler


def serve(bind='0.0.0.0', port=8090, prefix: Path | None = None) -> None:
    root = prefix or Path(os.environ.get('OPENRGD_MODULE_DATA_DIR', '/app/data'))
    root.mkdir(parents=True, exist_ok=True)
    manager = ModuleManager(root)
    # Fail immediately if the vendored/pinned catalog is malformed.
    manager.catalog()
    print(f'OpenRGD Module Agent listening internally at {bind}:{port}. NO device privileges.', flush=True)
    server = ThreadingHTTPServer((bind, port), handler_factory(manager))
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        server.server_close()


if __name__ == '__main__':
    serve()
