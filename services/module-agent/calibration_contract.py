"""Local-only CAL consumer checks. The owner schemas are immutable inputs.

No canonical hash calculation or source mutation. The syntax gate is a
conservative compatibility check for the existing CAL-0.2.0 binary, not a
replacement for the CAL parser or Core importer.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, RefResolver
from jsonschema.exceptions import ValidationError

REPORT_ID = 'https://openrgd.org/schemas/rgd-calibration/0.2.0/passive-report'
PROFILE_ID = 'https://openrgd.org/schemas/rgd-calibration/0.1.0/profile'
DIRECTORY = Path(__file__).resolve().parent / 'calibration-contracts'
REPORT = json.loads((DIRECTORY / 'passive-report.v0.2.schema.json').read_text(encoding='utf-8'))
PROFILE = json.loads((DIRECTORY / 'calibration-profile.v0.1.schema.json').read_text(encoding='utf-8'))
if REPORT['$id'] != REPORT_ID or PROFILE['$id'] != PROFILE_ID:
    raise RuntimeError('CAL local schema IDs do not match the pinned contract')
for schema in (REPORT, PROFILE):
    Draft202012Validator.check_schema(schema)


class OfflineResolver(RefResolver):
    """Works with the Debian runtime jsonschema and the CI version; no fetch."""
    def resolve_remote(self, uri):
        raise ValueError('External schema retrieval disabled')


def validator_for(schema):
    return Draft202012Validator(
        schema,
        resolver=OfflineResolver.from_schema(schema, store={REPORT_ID: REPORT, PROFILE_ID: PROFILE}),
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate JSON key')
        result[key] = value
    return result


def reject_constant(_value):
    raise ValueError('Non-finite JSON constant')


def finite_float(value):
    number = float(value)
    if not math.isfinite(number):
        raise ValueError('Non-finite JSON number')
    return number


def strict_json(raw: bytes | str) -> Any:
    if isinstance(raw, bytes):
        raw = raw.decode('utf-8', errors='strict')
    data = json.loads(raw, object_pairs_hook=unique_object,
                      parse_constant=reject_constant, parse_float=finite_float)
    # Also reject escaped lone UTF-16 surrogates and non-finite nested numbers.
    json.dumps(data, ensure_ascii=False, allow_nan=False).encode('utf-8', errors='strict')
    return data


def validate_report_schema(report: Any) -> None:
    try:
        validator_for(REPORT).validate(report)
    except (ValidationError, ValueError, RecursionError) as exc:
        raise ValueError('CAL_REPORT_SCHEMA_INVALID: report non conforme al contratto locale') from exc


def validate_cal_source(raw: bytes, *, jsonc: bool = True, legacy: bool = True) -> None:
    """Validate a scratch representation; never write normalized source bytes.

    JSONC allows comments and a trailing comma after a real value. The old
    pinned CAL parser treats CR-only line comments differently from CAL-021-A.
    The legacy-compatible route deliberately refuses that form until migration.
    """
    text = raw.decode('utf-8', errors='strict')
    if jsonc:
        out = list(text)
        i = 0
        in_string = False
        escaped = False
        while i < len(out):
            ch = out[i]
            if in_string:
                if escaped:
                    escaped = False
                elif ch == '\\':
                    escaped = True
                elif ch == '"':
                    in_string = False
            elif ch == '"':
                in_string = True
            elif ch == '/' and i + 1 < len(out):
                nxt = out[i + 1]
                if nxt == '/':
                    end = i + 2
                    while end < len(out) and out[end] not in '\r\n':
                        end += 1
                    if legacy and end < len(out) and out[end] == '\r' and (
                        end + 1 == len(out) or out[end + 1] != '\n'
                    ):
                        raise ValueError('CR-only comment incompatible with registered CAL')
                    out[i:end] = [' '] * (end - i)
                    i = end
                    continue
                if nxt == '*':
                    end = text.find('*/', i + 2)
                    if end < 0:
                        raise ValueError('Unterminated JSONC comment')
                    end += 2
                    out[i:end] = [' '] * (end - i)
                    i = end
                    continue
            i += 1
        if in_string:
            raise ValueError('Unterminated JSONC string')
        previous = None
        in_string = False
        escaped = False
        for i, ch in enumerate(out):
            if in_string:
                if escaped:
                    escaped = False
                elif ch == '\\':
                    escaped = True
                elif ch == '"':
                    in_string = False
                    previous = ch
                continue
            if ch == '"':
                in_string = True
                continue
            if ch in ' \t\r\n':
                continue
            if ch == ',' and previous not in (None, '{', '[', ',', ':'):
                nxt = i + 1
                while nxt < len(out) and out[nxt] in ' \t\r\n':
                    nxt += 1
                if nxt < len(out) and out[nxt] in '}]':
                    out[i] = ' '
            previous = ch
        text = ''.join(out)
    if not isinstance(strict_json(text), dict):
        raise ValueError('CAL source must be a JSON object')
