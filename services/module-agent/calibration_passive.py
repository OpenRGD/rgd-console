"""One allowlisted, read-only OpenRGD Calibration CAL-0.2 execution boundary.

This module never executes untrusted ZIP contents or uses robot drivers. It
reads selected Foundation JSONC files into a temporary private directory and
invokes ONLY the resolved, integrity-checked `rgd-calibration inspect` binary.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import hmac
import io
import re
from pathlib import Path
import stat
import subprocess
import tempfile
from threading import Lock
from typing import Any
import zipfile

from rgd_registry import core as registry
from calibration_contract import strict_json, validate_cal_source, validate_report_schema

MODULE_ID = 'org.openrgd.calibration'
MODULE_VERSION = '0.2.0'
INSPECT_CONTRACT = 'console.passive-calibration.v0.4b'
MAX_ARCHIVE_BYTES = 8 * 1024 * 1024
MAX_TOTAL_UNCOMPRESSED = 16 * 1024 * 1024
MAX_ENTRIES = 256
MAX_SOURCE_BYTES = 2 * 1024 * 1024
MAX_OUTPUT_BYTES = 4 * 1024 * 1024
READABLE_FILES = frozenset({
    'description.jsonc', 'calibration.jsonc', 'actuation_topology.jsonc',
    'hal_mapping.jsonc', 'sensor_fidelity.jsonc',
})


class InspectionError(Exception):
    """A safe, expected inspection failure (not permission to try a motor)."""


@dataclass(frozen=True)
class SourceTree:
    root: Path
    extracted: tuple[str, ...]
    digests: tuple[tuple[str, str, str], ...]


def extract_foundation_zip(blob: bytes, folder: Path) -> SourceTree:
    """Inspect all ZIP entry metadata, extract only bounded allowlisted JSONC files."""
    if not blob or len(blob) > MAX_ARCHIVE_BYTES:
        raise InspectionError('Archivio ZIP assente o oltre 8 MiB')
    try:
        zip_data = zipfile.ZipFile(io.BytesIO(blob))
    except (OSError, zipfile.BadZipFile) as exc:
        raise InspectionError('Archivio ZIP non valido') from exc
    with zip_data as bundle:
        entries = bundle.infolist()
        if len(entries) > MAX_ENTRIES:
            raise InspectionError('Troppe voci nell’archivio (limite 256)')
        names: set[str] = set()
        sum_size = 0
        for entry in entries:
            name = entry.filename
            stripped = name.rstrip('/')
            parts = stripped.split('/')
            if (not stripped or name.startswith('/') or '\\' in name or '\x00' in name
                or any(part in ('', '.', '..') for part in parts)):
                raise InspectionError('Percorso ZIP non consentito')
            unix_type = (entry.external_attr >> 16) & 0o170000
            if unix_type not in (0, stat.S_IFDIR if entry.is_dir() else stat.S_IFREG):
                raise InspectionError('Tipo file ZIP non consentito')
            if not entry.is_dir():
                if name in names:
                    raise InspectionError('Percorso duplicato nell’archivio')
                names.add(name)
                sum_size += entry.file_size
                if sum_size > MAX_TOTAL_UNCOMPRESSED:
                    raise InspectionError('Archivio decompresso troppo grande')
        found_roots: list[str] = []
        suffix = 'spec/01_foundation/description.jsonc'
        for name in names:
            if name == suffix:
                found_roots.append('')
            elif name.endswith('/' + suffix) and name.count('/') == 3:
                found_roots.append(name[: -(len(suffix))])
        if len(found_roots) != 1:
            raise InspectionError('Attesa una sola descrizione RGD spec/01_foundation/description.jsonc')
        prefix = found_roots[0]
        base = prefix + 'spec/01_foundation/'
        source_dir = folder / 'spec' / '01_foundation'
        source_dir.mkdir(parents=True, exist_ok=True)
        extracted = []
        digests = []
        for filename in sorted(READABLE_FILES):
            location = base + filename
            # This route is historically .jsonc-only. Do not hide a same-root
            # .json sibling (or optional .json-only source) from the CAL parser.
            if base + filename.removesuffix('.jsonc') + '.json' in names:
                raise InspectionError('CAL_BUNDLE_LAYOUT: sorgente Foundation .json non supportata o ambigua')
            if location not in names:
                continue
            entry = bundle.getinfo(location)
            if entry.file_size > MAX_SOURCE_BYTES:
                raise InspectionError('JSONC oltre il limite massimo di 2 MiB')
            try:
                with bundle.open(entry, 'r') as stream:
                    content = stream.read(MAX_SOURCE_BYTES + 1)
            except (zipfile.BadZipFile, RuntimeError, OSError) as exc:
                raise InspectionError('Impossibile leggere un file JSONC') from exc
            if len(content) > MAX_SOURCE_BYTES:
                raise InspectionError('File JSONC decompresso oltre il limite')
            try:
                validate_cal_source(content, legacy=True)
            except (ValueError, UnicodeError, RecursionError) as exc:
                raise InspectionError('CAL_BUNDLE_SYNTAX: sorgente non compatibile con CAL-0.2; lo ZIP originale non è stato modificato') from exc
            output = source_dir / filename
            # Chosen basename only; no arbitrary archive paths are ever written.
            with output.open('xb') as dest:
                dest.write(content)
            extracted.append(filename)
            digests.append((filename.removesuffix('.jsonc'), 'spec/01_foundation/' + filename,
                            'sha256:' + hashlib.sha256(content).hexdigest()))
        if 'description.jsonc' not in extracted:
            raise InspectionError('Descrizione Foundation mancante')
        return SourceTree(root=folder, extracted=tuple(extracted), digests=tuple(digests))


def validate_cal02_report(data: Any, source: SourceTree | None = None) -> dict[str, Any]:
    """Full owner schema, then the narrower Console no-profile route policy.

    Calling without source is structural-only (used by offline consumers);
    production inspect always supplies its actual extraction snapshot.
    """
    try:
        validate_report_schema(data)
    except ValueError as exc:
        raise InspectionError('CAL_REPORT_SCHEMA_INVALID: report CAL-0.2 non conforme') from exc
    # Defense in depth: keep the physical-authority invariants explicit at the route.
    if any(data[field] is not False for field in (
            'current_robot_position_observed', 'physical_drift_evaluated',
            'claims_physical_calibration_certified')):
        raise InspectionError('CAL_REPORT_AUTHORITY_INVALID: dichiarazioni fisiche non ammesse')
    if (data['profile_id'] is not None or data['profile_state'] is not None
            or data['profile_binding'] != 'no_profile' or data['export_preview'] is not None):
        raise InspectionError('CAL_REPORT_PROFILE_CONTEXT: profilo o delta non ammesso nella route passiva')
    coverage = data['coverage']
    params = data['parameters']
    if (coverage['saved_evidence_fields'] != 0
            or coverage['candidate_fields'] != len(params)
            or coverage['without_saved_measurements'] != len(params)
            or coverage['declared_fields'] + coverage['without_declared_values'] != len(params)
            or any(p['stored_measurements'] or p['coverage'] == 'saved_evidence' for p in params)):
        raise InspectionError('CAL_REPORT_PROFILE_CONTEXT: misure storiche o copertura incoerente senza profilo')
    expected = {filename.removesuffix('.jsonc'): 'spec/01_foundation/' + filename
                for filename in READABLE_FILES}
    observed = {}
    for item in data['source_digests']:
        role, path, digest = item['role'], item['path'], item['raw_file_sha256']
        if (role in observed or expected.get(role) != path
                or re.fullmatch(r'sha256:[a-f0-9]{64}', digest) is None):
            raise InspectionError('CAL_REPORT_SOURCE_MISMATCH: ruolo, percorso o digest sorgente non valido')
        observed[role] = (path, digest)
    if 'description' not in observed:
        raise InspectionError('CAL_REPORT_SOURCE_MISMATCH: descrizione sorgente mancante')
    if source is not None:
        expected_digests = {role: (path, digest) for role, path, digest in source.digests}
        if observed.keys() != expected_digests.keys():
            raise InspectionError('CAL_REPORT_SOURCE_MISMATCH: insieme sorgenti diverso dai file estratti')
        for role, (path, digest) in expected_digests.items():
            observed_path, observed_digest = observed[role]
            if observed_path != path or not hmac.compare_digest(digest, observed_digest):
                raise InspectionError('CAL_REPORT_SOURCE_MISMATCH: digest diverso dai byte originali estratti')
            # Only our allowlisted, private extraction paths are used for IO.
            try:
                file = source.root / path
                if not stat.S_ISREG(file.lstat().st_mode) or file.stat().st_size > MAX_SOURCE_BYTES:
                    raise OSError('Invalid private extraction')
                if not hmac.compare_digest(digest, 'sha256:' + hashlib.sha256(file.read_bytes()).hexdigest()):
                    raise OSError('Private extraction modified')
            except OSError as exc:
                raise InspectionError('CAL_REPORT_SOURCE_MISMATCH: snapshot privato non più corrispondente') from exc
    return data


class CalibrationInspector:
    def __init__(self, prefix: Path):
        self.prefix = prefix
        self.lock = Lock()  # serialized inspections keep CPU and /tmp bounded

    def inspect(self, blob: bytes) -> dict[str, Any]:
        # The digest was already verified at installation and is checked again
        # on every invocation. Source-only/tampered installations fail closed.
        descriptor = registry.entry(MODULE_ID, MODULE_VERSION)
        if descriptor.get('permissions_required') != [] or descriptor.get('safety') != {
            'non_actuating': True,
            'automatic_motion_on_load': False,
            'active_calibration_supported': False,
        }:
            raise InspectionError('Il manifesto del modulo non soddisfa la policy non attuante')
        status = registry.status_of(MODULE_ID, version=MODULE_VERSION, prefix=self.prefix)
        if status.get('status') != 'ready':
            raise InspectionError('Calibration non installato o integrità non valida: serve stato ready')
        if not self.lock.acquire(blocking=False):
            raise InspectionError('Una ispezione Calibration è già in corso')
        try:
            resolved = registry.resolve_binary(MODULE_ID, version=MODULE_VERSION, prefix=self.prefix)
            binary = Path(resolved['binary'])
            binary_digest = resolved.get('binary_sha256')
            if not isinstance(binary_digest, str) or re.fullmatch(r'sha256:[a-f0-9]{64}', binary_digest) is None:
                raise InspectionError('CAL_BINARY_DIGEST_INVALID: digest binario non valido')
            # Inspection executes an allowlisted binary only; no --profile,
            # --out, --model-hash or arbitrary CLI arguments are accepted.
            with tempfile.TemporaryDirectory(prefix='rgd-cal-passive-', dir='/tmp') as tmp:
                source = extract_foundation_zip(blob, Path(tmp))
                try:
                    result = subprocess.run(
                        [str(binary), 'inspect', '--bundle', str(source.root)],
                        cwd=source.root, check=False, timeout=35,
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                        env={'PATH': '/usr/local/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8'},
                    )
                except subprocess.TimeoutExpired as exc:
                    raise InspectionError('Timeout ispezione passiva') from exc
                except OSError as exc:
                    raise InspectionError('Eseguibile Calibration non avviabile') from exc
                if result.returncode != 0:
                    # Never relay arbitrary subprocess stderr or paths.
                    raise InspectionError('CAL_INSPECT_FAILED: ispezione sorgente rifiutata da Calibration')
                if not (0 < len(result.stdout) <= MAX_OUTPUT_BYTES):
                    raise InspectionError('Report Calibration vuoto o troppo grande')
                try:
                    report = validate_cal02_report(strict_json(result.stdout), source)
                except (ValueError, UnicodeError, RecursionError) as exc:
                    raise InspectionError('CAL_REPORT_JSON_INVALID: risposta JSON Calibration non valida') from exc
                return {
                    'inspection_contract': INSPECT_CONTRACT,
                    'module_id': MODULE_ID,
                    'module_version': MODULE_VERSION,
                    'binary_sha256': binary_digest,
                    'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                    'extracted_sources': list(source.extracted),
                    'evidence_class': 'declared_profile_only_not_physical_observation',
                    'actuation_enabled': False,
                    'physical_calibration_certified': False,
                    'report': report,
                }
        finally:
            self.lock.release()
