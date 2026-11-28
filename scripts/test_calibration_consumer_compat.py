"""Cross-repository synthetic test of real CAL CLI through actual Agent.
Registry resolution is explicitly injected. No installation, devices or live API.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DESCRIPTION = 'spec/01_foundation/description.jsonc'


def archive(entries):
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
        for path, raw in entries:
            zf.writestr(path, raw)
    return out.getvalue()


def require(condition, label):
    if not condition:
        raise AssertionError(label)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cal', type=Path, required=True)
    parser.add_argument('--registry', type=Path, required=True)
    parser.add_argument('--legacy-binary', type=Path, required=True)
    parser.add_argument('--candidate-binary', type=Path, required=True)
    args = parser.parse_args()
    sys.path.insert(0, str(args.registry.resolve(strict=True)))
    sys.path.insert(0, str(ROOT / 'services/module-agent'))
    import calibration_passive as agent
    from calibration_contract import validate_cal_source, validator_for
    corpus = json.loads((args.cal / 'tests/fixtures/cal-021-a/bundle-syntax-corpus.v1.json').read_text())['cases']
    count = 0
    for case in corpus:
        try:
            validate_cal_source(case['raw'].encode('utf-8'), jsonc=case['syntax']=='jsonc', legacy=False)
            accepted = True
        except (ValueError, UnicodeError, RecursionError):
            accepted = False
        require(accepted == case['accepted'], 'syntax corpus: ' + str(case.get('id',case.get('name'))))
        count += 1
    require(count == 22, 'expected exact CAL corpus')
    wrapper_schema = json.loads((ROOT / 'contracts/console/v1/calibration-inspection.v0.4b.schema.json').read_text())
    for binary in (args.legacy_binary, args.candidate_binary):
        binary = binary.resolve(strict=True)
        digest = 'sha256:' + hashlib.sha256(binary.read_bytes()).hexdigest()
        descriptor = {'permissions_required': [], 'safety': {
            'non_actuating':True, 'automatic_motion_on_load':False, 'active_calibration_supported':False}}
        with tempfile.TemporaryDirectory(prefix='cal-console-ci-') as temp:
            inspector = agent.CalibrationInspector(Path(temp))
            with patch.object(agent.registry,'entry',return_value=descriptor), \
                 patch.object(agent.registry,'status_of',return_value={'status':'ready'}), \
                 patch.object(agent.registry,'resolve_binary',return_value={'binary':str(binary),'binary_sha256':digest}):
                passed = rejected = 0
                for case in corpus:
                    if case['syntax'] != 'jsonc':
                        continue
                    name = case.get('id',case.get('name'))
                    # The existing released binary handles CR-only comments
                    # differently. This one route keeps the intersection until D.
                    expected = case['accepted'] and name != 'cr-comment'
                    raw = case['raw'].encode('utf-8')
                    blob = archive([('robot/'+DESCRIPTION,raw)])
                    try:
                        result = inspector.inspect(blob)
                    except agent.InspectionError as exc:
                        require(not expected and 'CAL_BUNDLE_SYNTAX' in str(exc), 'unexpected refusal: '+str(name))
                        rejected += 1
                        continue
                    require(expected, 'unexpected acceptance: '+str(name))
                    require(result['report']['source_digests'][0]['raw_file_sha256'] ==
                            'sha256:'+hashlib.sha256(raw).hexdigest(),'exact source bytes')
                    envelope = {'schema_version':'console.calibration-inspection.v0.4b',
                        'robot_id':'synthetic-robot','source_model_id':'synthetic-model',
                        'source_profile_sha256':'sha256:'+hashlib.sha256(blob).hexdigest(),
                        'source_integrity':'canonical_not_verified','generated_at':'2026-11-27T10:00:00Z',
                        'evidence_class':'declared_profile_only_not_physical_observation',
                        'actuation_enabled':False,'physical_calibration_certified':False,'inspection':result}
                    validator_for(wrapper_schema).validate(envelope)
                    passed += 1
                full = [(DESCRIPTION,b'{"meta_group":{"model_id_str":"synthetic"},"joint_topology_map":{},"sensors_mounting_map":{}}')]
                full.extend(('spec/01_foundation/'+role+'.jsonc',b'{}') for role in
                            ('calibration','actuation_topology','hal_mapping','sensor_fidelity'))
                full.append(('standard/01_foundation/description.json',b'{}'))
                result = inspector.inspect(archive(full))
                require(len(result['report']['source_digests'])==5,'five original source files')
                for item in result['report']['source_digests']:
                    require(item['raw_file_sha256']=='sha256:'+hashlib.sha256(dict(full)[item['path']]).hexdigest(),'full digest')
                print(f'PASS {binary.parent.parent.name}: {passed} accepted, {rejected} refused JSONC cases, five-source exact digest check')
    print('PASS 22 syntax fixtures; two real CLI binaries with injected Registry, no device or installation')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
