"""OpenRGD Console Boot Manager v0.4D — non-actuating, fail-closed startup checks.

This is NOT a Linux bootloader, BIOS, e-stop or Somatic Runtime.
The only executable operations are pinned, canonical `rgd check` and `rgd boot`.
No shell=True, no host device mounts, no physical permission grants.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import subprocess
import tempfile
import threading
import uuid
import zipfile

CONTRACT = 'console.boot.v0.1'
MAX_ZIP_SIZE = 8 * 1024 * 1024
MAX_FILES = 256
MAX_EXTRACTED = 16 * 1024 * 1024
MAX_SINGLE = 2 * 1024 * 1024
MAX_OUTPUT = 1024 * 1024


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def valid_id(value: object, prefix: str) -> bool:
    return isinstance(value, str) and value.startswith(prefix) and len(value) <= 80 and all(
        c.isascii() and (c.islower() or c.isdigit() or c == '-') for c in value
    )


def atomic_json(target: Path, value: object) -> None:
    """Atomic single-process JSON commit on a persistent, private volume."""
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temp = target.with_name(target.name + '.tmp-' + uuid.uuid4().hex)
    try:
        with temp.open('x', encoding='utf-8') as stream:
            os.chmod(temp, 0o600)
            json.dump(value, stream, ensure_ascii=False, sort_keys=True, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, target)
    finally:
        temp.unlink(missing_ok=True)


def read_json(path: Path, limit: int) -> object:
    if path.is_symlink() or not path.is_file() or path.stat().st_size > limit:
        raise ValueError('File di stato mancante, simbolico o troppo grande')
    return json.loads(path.read_text(encoding='utf-8'))


def unpack_profile(archive_path: Path, destination: Path, expected_sha: str) -> Path:
    """Only extract bounded spec/ files. Never use ZipFile.extractall()."""
    if archive_path.is_symlink() or not archive_path.is_file() or archive_path.stat().st_size > MAX_ZIP_SIZE:
        raise ValueError('Archivio assente, simbolico o oltre il limite')
    bytes_ = archive_path.read_bytes()
    digest = 'sha256:' + hashlib.sha256(bytes_).hexdigest()
    if digest != expected_sha:
        raise ValueError('SHA-256 ZIP diverso dal registro della Console')
    total = 0
    files: list[tuple[zipfile.ZipInfo, str]] = []
    names: set[str] = set()
    source_roots: set[str] = set()
    with zipfile.ZipFile(archive_path) as handle:
        if len(handle.infolist()) > MAX_FILES:
            raise ValueError('Troppi elementi nell’archivio')
        for item in handle.infolist():
            name = item.filename
            if (not name or name.startswith('/') or '\\' in name or '\x00' in name
                or any(part in ('', '.', '..') for part in name.rstrip('/').split('/'))):
                raise ValueError('Percorso ZIP non sicuro')
            if name in names:
                raise ValueError('Nome duplicato nel ZIP')
            names.add(name)
            mode = item.external_attr >> 16
            kind = stat.S_IFMT(mode)
            if kind and kind not in (stat.S_IFDIR, stat.S_IFREG):
                raise ValueError('Symlink o file speciale vietato')
            if item.flag_bits & 1:
                raise ValueError('ZIP cifrato non supportato')
            if item.is_dir():
                continue
            total += item.file_size
            if item.file_size > MAX_SINGLE or total > MAX_EXTRACTED:
                raise ValueError('ZIP decompresso oltre limite')
            bits = name.split('/')
            if bits[0] == 'spec':
                relative = name
                source_roots.add('')
            elif len(bits) > 2 and bits[1] == 'spec':
                relative = '/'.join(bits[1:])
                source_roots.add(bits[0])
            else:
                continue
            if not (relative.endswith('.jsonc') or relative == 'spec/MANIFESTO.md'):
                # MANIFESTO.md is a documented optional static hash input.
                # No executable scripts, binary assets, or arbitrary plugins.
                continue
            files.append((item, relative))
        # Mixed prefixes / collisions must be rejected before any materialization.
        translated = [rel for _, rel in files]
        if len(source_roots) > 1:
            raise ValueError('L’archivio mescola radici di profilo differenti')
        if len(set(translated)) != len(translated):
            raise ValueError('Duplicato sotto spec/ da radici differenti')
        if 'spec/00_core/kernel.jsonc' not in translated:
            raise ValueError('Kernel canonico mancante: importazione parziale')
        for entry, relative in files:
            target = destination.joinpath(*PurePosixPath(relative).parts)
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with handle.open(entry) as stream:
                data = stream.read(MAX_SINGLE + 1)
            if len(data) != entry.file_size or len(data) > MAX_SINGLE:
                raise ValueError('Lettura ZIP incompleta o troppo grande')
            target.write_bytes(data)
            os.chmod(target, 0o600)
    return destination


def run_canonical(binary: str, command: str, directory: Path) -> dict:
    """Use only pinned rgd check/boot, bounded stdout/stderr and timeout."""
    if command not in ('check', 'boot'):
        raise ValueError('Comando canonico non consentito')
    if not binary.startswith('/') or not Path(binary).is_file():
        raise FileNotFoundError('Validatore canonico non installato')
    try:
        result = subprocess.run(
            [binary, '--quiet', command, '--output', 'json'], cwd=directory,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL,
            timeout=20, check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise ValueError('Timeout validatore canonico (20s)') from exc
    if len(result.stdout) > MAX_OUTPUT or len(result.stderr) > 16384:
        raise ValueError('Output del validatore oltre limite')
    if result.returncode != 0:
        # Report a short sanitized diagnostic only; no machine-local paths.
        raise ValueError('rgd ' + command + ' ha rifiutato il profilo (exit ' + str(result.returncode) + ')')
    try:
        return json.loads(result.stdout)
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError('Il validatore non ha restituito JSON') from exc


def check_canonical_payload(value: dict, command: str) -> dict:
    if not isinstance(value, dict):
        raise ValueError('Risposta canonica non strutturata')
    if command == 'check':
        integrity = value.get('integrity')
        if (value.get('artifact_type') != 'OPENRGD_PROFILE_VALIDATION' or value.get('status') != 'VALID'
            or value.get('physical_execution_assessed') is not False
            or not isinstance(value.get('robot_id'), str) or not value.get('robot_id')
            or not isinstance(integrity, dict)
            or not isinstance(value.get('modules_count'), int)
            or isinstance(value.get('modules_count'), bool)
            or value.get('modules_count', 0) < 1):
            raise ValueError('Contenuto rgd check non conforme al contratto noto')
        return {
            'robot_id': value['robot_id'], 'modules_count': value['modules_count'],
            'source_root': integrity.get('computed'), 'source_root_matches': integrity.get('matches'),
        }
    authority = value.get('physical_execution')
    if (value.get('artifact_type') != 'OPENRGD_NON_ACTUATING_GROUNDING_CONTEXT'
        or not isinstance(authority, dict) or authority.get('authorized') is not False
        or authority.get('assessed') is not False
        or authority.get('status') != 'NOT_AUTHORIZED_BY_BOOT'
        or not isinstance(value.get('robot_id'), str)):
        raise ValueError('Output rgd boot ha invarianti di sicurezza incompatibili')
    summary = value.get('summary')
    if not isinstance(summary, dict):
        raise ValueError('Contesto boot privo di summary strutturato')
    return {'robot_id': value['robot_id'], 'joint_count': summary.get('described_joints_count'),
            'module_count': summary.get('modules_count'), 'execution_authorized': False}


class BootManager:
    def __init__(self, console_data: Path, boot_data: Path, rgd_binary: str):
        self.console_data = console_data
        self.boot_data = boot_data
        self.rgd_binary = rgd_binary
        self.lock = threading.Lock()
        self.report: dict = self._report('checking', 'startup', 'Avvio verifica di sola lettura')

    def _report(self, status: str, reason: str, detail: str, *, selection=None, steps=None, validation=None, grounding=None) -> dict:
        return {
            'schema_version': CONTRACT,
            'status': status, 'reason': reason, 'message': detail,
            'checked_at': now_utc(),
            'selection': selection,
            'checks': steps or [],
            'validation': validation, 'grounding': grounding,
            'physical_execution': {'assessed': False, 'authorized': False, 'status': 'NOT_AUTHORIZED_BY_BOOT'},
            'hardware_scanned': False,
            'motor_commands_sent': False,
        }

    def _save_report(self, report: dict) -> None:
        atomic_json(self.boot_data / 'last-report.json', report)
        history_path = self.boot_data / 'history.json'
        try:
            history = read_json(history_path, 200_000) if history_path.is_file() else []
            if not isinstance(history, list):
                history = []
        except (ValueError, OSError, json.JSONDecodeError):
            history = []
        history.append(report)
        atomic_json(history_path, history[-20:])
        self.report = report

    def selection(self) -> dict | None:
        path = self.boot_data / 'selection.json'
        if not path.exists():
            return None
        value = read_json(path, 4096)
        if not isinstance(value, dict) or set(value) != {'instance_id', 'model_id'}:
            raise ValueError('Selezione boot non valida')
        if not valid_id(value['instance_id'], 'instance-') or not valid_id(value['model_id'], 'rgd-'):
            raise ValueError('Identificativi boot non validi')
        return value

    def _resolve_source(self, selected: dict) -> tuple[Path, str]:
        workspace = read_json(self.console_data / 'workspace.json', 4 * 1024 * 1024)
        if not isinstance(workspace, dict) or workspace.get('workspace_version') != 'console.workspace.v1':
            raise ValueError('Workspace Console non supportato')
        instances = [r for r in workspace.get('instances', []) if isinstance(r, dict) and r.get('id') == selected['instance_id']]
        models = [m for m in workspace.get('models', []) if isinstance(m, dict) and m.get('model_id') == selected['model_id']]
        if len(instances) != 1 or len(models) != 1 or instances[0].get('rgd_model_id') != selected['model_id']:
            raise ValueError('Associazione istanza/modello non valida o mancante')
        if instances[0].get('adapter_id') != 'console.unbound.v1' or instances[0].get('kind') != 'physical':
            raise ValueError('Istanza non compatibile con il boot non attuante')
        model = models[0]
        if model.get('source_format') != 'openrgd-source-profile-zip':
            raise ValueError('Formato sorgente non supportato')
        expected_sha = model.get('source_sha256')
        if not isinstance(expected_sha, str) or len(expected_sha) != 71 or not expected_sha.startswith('sha256:'):
            raise ValueError('Identità archivio non valida')
        path = self.console_data / 'imports' / (selected['model_id'] + '.zip')
        return path, expected_sha

    def run(self, reason: str = 'manual') -> dict:
        if not self.lock.acquire(blocking=False):
            raise RuntimeError('Verifica già in corso')
        try:
            self.report = self._report('checking', reason, 'Validazione RGD in corso')
            steps: list[dict] = []
            selected = None
            validation = None
            grounding = None
            try:
                selected = self.selection()
                if not selected:
                    result = self._report('setup_required', reason, 'Nessun profilo selezionato per questo host', steps=[
                        {'id': 'profile_selection', 'state': 'missing', 'detail': 'Seleziona un’istanza RGD nella pagina Boot'}])
                    self._save_report(result)
                    return result
                path, expected_sha = self._resolve_source(selected)
                steps.append({'id': 'workspace', 'state': 'passed', 'detail': 'Istanza e modello coerenti nel registro locale'})
                if not Path(self.rgd_binary).is_file():
                    result = self._report('validator_unavailable', reason, 'rgd check non installato, nessuna convalida dichiarata', selection=selected, steps=steps)
                    self._save_report(result)
                    return result
                with tempfile.TemporaryDirectory(prefix='rgd-boot-') as folder:
                    root = Path(folder)
                    unpack_profile(path, root, expected_sha)
                    steps.append({'id': 'source_zip', 'state': 'passed', 'detail': 'Archivio corrispondente al digest registrato; estrazione limitata a spec/*.jsonc'})
                    raw_check = run_canonical(self.rgd_binary, 'check', root)
                    validation = check_canonical_payload(raw_check, 'check')
                    if validation['source_root_matches'] is not True:
                        raise ValueError('L’integrità canonica non corrisponde')
                    steps.append({'id': 'rgd_check', 'state': 'passed', 'detail': 'Integrità e moduli RGD verificati dalla toolchain canonica'})
                    raw_boot = run_canonical(self.rgd_binary, 'boot', root)
                    grounding = check_canonical_payload(raw_boot, 'boot')
                    if grounding['robot_id'] != validation['robot_id']:
                        raise ValueError('Le identità di rgd check e rgd boot non corrispondono')
                    steps.append({'id': 'rgd_boot', 'state': 'passed', 'detail': 'Contesto iniziale non attuante generato'})
                result = self._report('ready_non_actuating', reason, 'Profilo verificato; runtime fisico non autorizzato',
                                      selection=selected, steps=steps, validation=validation, grounding=grounding)
            except (ValueError, OSError, zipfile.BadZipFile, RuntimeError, NotImplementedError, TypeError) as exc:
                steps.append({'id': 'boot_failure', 'state': 'blocked', 'detail': str(exc)[:220]})
                result = self._report('recovery_required', reason, 'Validazione fallita; Console e Recovery restano accessibili',
                                      selection=selected, steps=steps, validation=validation, grounding=grounding)
            self._save_report(result)
            return result
        finally:
            self.lock.release()

    def select(self, instance_id: str, model_id: str) -> dict:
        if not valid_id(instance_id, 'instance-') or not valid_id(model_id, 'rgd-'):
            raise ValueError('ID istanza/modello non valido')
        if self.lock.locked():
            raise RuntimeError('Verifica già in corso')
        requested = {'instance_id': instance_id, 'model_id': model_id}
        self._resolve_source(requested)  # Validate relationship before persisting selection.
        atomic_json(self.boot_data / 'selection.json', requested)
        return self.run('profile_selected')

    def history(self) -> list[dict]:
        path = self.boot_data / 'history.json'
        return read_json(path, 200_000) if path.exists() else []
