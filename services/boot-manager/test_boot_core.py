"""Hermetic tests. Uses fake canonical command contract, NEVER physical devices."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from boot_core import BootManager, unpack_profile, check_canonical_payload


def make_fixture(base: Path, *, kernel=True, wrong_digest=False, wrapped=False):
    console = base/'console'
    boot = base/'boot'
    (console/'imports').mkdir(parents=True)
    boot.mkdir()
    files = {'spec/01_foundation/description.jsonc': '{"meta_group":{"model_id_str":"synthetic"}}'}
    if kernel:
        files['spec/00_core/kernel.jsonc'] = '{"meta_group":{"id":"synthetic"}}'
        files['spec/manifest.jsonc'] = '{}'
        files['spec/MANIFESTO.md'] = '# synthetic hash input\n'
    zip_path = console/'imports'/'rgd-abc123.zip'
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, content in files.items():
            z.writestr(('robot/' if wrapped else '')+name, content)
    digest = 'sha256:'+hashlib.sha256(zip_path.read_bytes()).hexdigest()
    workspace = {
        'workspace_version': 'console.workspace.v1',
        'models': [{'model_id': 'rgd-abc123', 'source_sha256': ('sha256:'+'0'*64) if wrong_digest else digest,
                    'source_format':'openrgd-source-profile-zip'}],
        'instances': [{'id': 'instance-0001', 'kind': 'physical', 'adapter_id':'console.unbound.v1',
                      'rgd_model_id':'rgd-abc123'}],
        'bindings': [],
    }
    (console/'workspace.json').write_text(json.dumps(workspace))
    return console, boot, zip_path, digest


class BootFoundationTests(unittest.TestCase):
    def test_no_selection_is_setup_not_ready(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); (root/'console').mkdir(); (root/'boot').mkdir()
            obj=BootManager(root/'console', root/'boot', '/fake/rgd')
            report=obj.run('service_start')
            self.assertEqual(report['status'], 'setup_required')
            self.assertFalse(report['physical_execution']['authorized'])
            self.assertFalse(report['hardware_scanned'])
            self.assertTrue((root/'boot'/'last-report.json').exists())

    def test_select_then_missing_cli_is_unavailable(self):
        with tempfile.TemporaryDirectory() as folder:
            console,boot,*_=make_fixture(Path(folder))
            manager=BootManager(console,boot,'/missing/rgd')
            report=manager.select('instance-0001','rgd-abc123')
            self.assertEqual(report['status'],'validator_unavailable')
            self.assertTrue((boot/'selection.json').exists())
            self.assertEqual(report['selection']['model_id'], 'rgd-abc123')
            self.assertEqual(len(manager.history()),1)

    def test_source_checksum_mismatch_forces_recovery(self):
        with tempfile.TemporaryDirectory() as folder:
            console,boot,*_=make_fixture(Path(folder),wrong_digest=True)
            validator=boot/'rgd'
            validator.write_text('#!/bin/sh\nexit 0\n');validator.chmod(0o755)
            result=BootManager(console,boot,str(validator)).select('instance-0001','rgd-abc123')
            self.assertEqual(result['status'],'recovery_required')
            self.assertFalse(result['physical_execution']['authorized'])

    def test_partial_profile_with_missing_kernel_forces_recovery(self):
        with tempfile.TemporaryDirectory() as folder:
            console,boot,*_=make_fixture(Path(folder),kernel=False)
            validator=boot/'rgd'
            validator.write_text('#!/bin/sh\nexit 0\n');validator.chmod(0o755)
            result=BootManager(console,boot,str(validator)).select('instance-0001','rgd-abc123')
            self.assertEqual(result['status'],'recovery_required')

    def test_valid_canonical_output_is_non_actuating(self):
        with tempfile.TemporaryDirectory() as folder:
            console,boot,*_=make_fixture(Path(folder),wrapped=True)
            validator=boot/'rgd'
            validation={'artifact_type':'OPENRGD_PROFILE_VALIDATION','status':'VALID',
                        'robot_id':'synthetic-reference','physical_execution_assessed':False,
                        'integrity':{'computed':'root','matches':True},'modules_count':3}
            grounding={'artifact_type':'OPENRGD_NON_ACTUATING_GROUNDING_CONTEXT',
                       'robot_id':'synthetic-reference','physical_execution':{
                         'assessed':False,'authorized':False,'status':'NOT_AUTHORIZED_BY_BOOT'},
                       'summary':{'described_joints_count':1,'modules_count':3}}
            import stat
            validator.write_text('#!/usr/bin/env python3\nimport json,sys\n'
                f'print(json.dumps({{"check":{repr(validation)},"boot":{repr(grounding)}}}[sys.argv[2]]))\n')
            validator.chmod(0o755)
            result=BootManager(console,boot,str(validator)).select('instance-0001','rgd-abc123')
            self.assertEqual(result['status'],'ready_non_actuating')
            self.assertFalse(result['physical_execution']['authorized'])
            self.assertEqual(result['validation']['modules_count'],3)
            self.assertEqual(result['grounding']['joint_count'],1)

    def test_invalid_boot_authorization_forces_recovery(self):
        with tempfile.TemporaryDirectory() as folder:
            console,boot,*_=make_fixture(Path(folder))
            validator=boot/'rgd'; validator.write_text('placeholder');validator.chmod(0o755)
            fake={'artifact_type':'OPENRGD_PROFILE_VALIDATION','status':'VALID',
                  'robot_id':'test','physical_execution_assessed':False,
                  'integrity':{'matches':True,'computed':'root'},'modules_count':1}
            unsafe={'artifact_type':'OPENRGD_NON_ACTUATING_GROUNDING_CONTEXT','robot_id':'test',
                    'physical_execution':{'assessed':False,'authorized':True,'status':'MOTION_ALLOWED'}}
            with patch('boot_core.run_canonical',side_effect=lambda _bin,c,_cwd:fake if c=='check' else unsafe):
                report=BootManager(console,boot,str(validator)).select('instance-0001','rgd-abc123')
            self.assertEqual(report['status'],'recovery_required')
            self.assertFalse(report['physical_execution']['authorized'])

    def test_rejects_zip_slip_and_duplicate_entry(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); folderzip=root/'evil.zip'
            with zipfile.ZipFile(folderzip,'w') as z:
                z.writestr('spec/00_core/kernel.jsonc','{}')
                z.writestr('../spec/evil.jsonc','{}')
            checksum='sha256:'+hashlib.sha256(folderzip.read_bytes()).hexdigest()
            with self.assertRaises(ValueError):
                unpack_profile(folderzip,root/'extract',checksum)
            with zipfile.ZipFile(folderzip,'w') as z:
                z.writestr('spec/00_core/kernel.jsonc','{}')
                z.writestr('spec/00_core/kernel.jsonc','{}')
            checksum='sha256:'+hashlib.sha256(folderzip.read_bytes()).hexdigest()
            with self.assertRaises(ValueError):
                unpack_profile(folderzip,root/'extract',checksum)

    def test_rejects_invalid_selection_and_mismatched_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            console,boot,*_=make_fixture(Path(folder))
            manager=BootManager(console,boot,'/missing/rgd')
            with self.assertRaises(ValueError):
                manager.select('../outside','rgd-abc123')
            with self.assertRaises(ValueError):
                manager.select('instance-0001','rgd-elsewhere')
            self.assertFalse((boot/'selection.json').exists())

    def test_cannot_interpret_validation_without_modules_as_ready(self):
        with self.assertRaises(ValueError):
            check_canonical_payload({'artifact_type':'OPENRGD_PROFILE_VALIDATION','status':'VALID',
               'physical_execution_assessed':False,'robot_id':'test','integrity':{'matches':True},'modules_count':0},'check')


if __name__=='__main__':
    unittest.main()
