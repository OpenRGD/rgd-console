"""One allowlisted, read-only OpenRGD Calibration CAL-0.2 execution boundary.

This module never executes untrusted ZIP contents or uses robot drivers. It
reads selected Foundation JSONC files into a temporary private directory and
invokes ONLY the resolved, integrity-checked `rgd-calibration inspect` binary.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import io
import json
from pathlib import Path
import stat
import subprocess
import tempfile
from threading import Lock
from typing import Any
import zipfile

from rgd_registry import core as registry

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
        for filename in sorted(READABLE_FILES):
            location = base + filename
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
            output = source_dir / filename
            # Chosen basename only; no arbitrary archive paths are ever written.
            with output.open('xb') as dest:
                dest.write(content)
            extracted.append(filename)
        if 'description.jsonc' not in extracted:
            raise InspectionError('Descrizione Foundation mancante')
        return SourceTree(root=folder, extracted=tuple(extracted))


def validate_cal02_report(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict) or data.get('report_version') != '0.2.0':
        raise InspectionError('Formato report Calibration non supportato')
    if not isinstance(data.get('model_id'), str) or not data['model_id']:
        raise InspectionError('Identità modello assente nel report')
    for field in ('current_robot_position_observed', 'physical_drift_evaluated',
                  'claims_physical_calibration_certified'):
        if data.get(field) is not False:
            raise InspectionError('Il report attribuisce indebitamente misurazioni fisiche')
    if data.get('export_preview') is not None:
        raise InspectionError('Delta preview non previsto per ispezione senza profile')
    coverage = data.get('coverage')
    expected = ('candidate_fields', 'declared_fields', 'saved_evidence_fields',
                'without_saved_measurements', 'without_declared_values')
    if not isinstance(coverage, dict) or any(type(coverage.get(k)) is not int or coverage[k] < 0 for k in expected):
        raise InspectionError('Copertura CAL-0.2 malformata')
    for key in ('parameters', 'findings', 'source_digests'):
        if not isinstance(data.get(key), list):
            raise InspectionError('Report CAL-0.2 incompleto')
    if not data['source_digests']:
        raise InspectionError('Report privo di provenienza dei file sorgente')
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
                    raise InspectionError('Calibration inspect ha restituito un errore (vedere i log del Module Agent)')
                if not (0 < len(result.stdout) <= MAX_OUTPUT_BYTES):
                    raise InspectionError('Report Calibration vuoto o troppo grande')
                try:
                    report = validate_cal02_report(json.loads(result.stdout))
                except (ValueError, UnicodeDecodeError) as exc:
                    raise InspectionError('Risposta JSON Calibration non valida') from exc
                return {
                    'inspection_contract': INSPECT_CONTRACT,
                    'module_id': MODULE_ID,
                    'module_version': MODULE_VERSION,
                    'binary_sha256': resolved.get('binary_sha256'),
                    'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                    'extracted_sources': list(source.extracted),
                    'evidence_class': 'declared_profile_only_not_physical_observation',
                    'actuation_enabled': False,
                    'physical_calibration_certified': False,
                    'report': report,
                }
        finally:
            self.lock.release()
