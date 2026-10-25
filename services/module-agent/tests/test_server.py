"""Hermetic Module Agent tests; no GitHub, Cargo, devices or network downloads."""
import copy
import io
import zipfile
import http.client
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import types
import unittest
from unittest import mock


DESCRIPTOR = {
    'id': 'org.openrgd.calibration', 'version': '0.2.0', 'maturity': 'candidate',
    'permissions_required': [], 'safety': {
        'non_actuating': True, 'automatic_motion_on_load': False,
        'active_calibration_supported': False,
    },
    'distribution': {'hosts': ['linux-x86_64']},
}

fake_registry = types.ModuleType('rgd_registry')
core = types.ModuleType('rgd_registry.core')
core.CONTRACT_VERSION = '0.1.0-candidate'
core.RegistryError = type('RegistryError', (Exception,), {})
core.installed = {}
core.install_calls = 0
core.catalog = lambda: [copy.deepcopy(DESCRIPTOR)]
core.entry = lambda module_id, version: copy.deepcopy(DESCRIPTOR) if (module_id, version) == ('org.openrgd.calibration', '0.2.0') else (_ for _ in ()).throw(core.RegistryError('unknown module'))
core._host = lambda: 'linux-x86_64'


def status_of(module_id, *, version, prefix):
    state = core.installed.get((module_id, version), 'not_installed')
    return {'module_id': module_id, 'version': version, 'status': state,
            'binary_sha256': 'sha256:mock-only' if state == 'ready' else None}


def install(module_id, *, version, prefix, build):
    core.install_calls += 1
    core.installed[(module_id, version)] = 'ready' if build else 'source_only'
    return {'module_id': module_id, 'version': version,
            'status': core.installed[(module_id, version)],
            'source_commit': '0'*40, 'binary_sha256': 'sha256:mock-only' if build else None}


core.status_of = status_of
core.install = install
core.resolve_binary = lambda module_id, *, version, prefix: {
    'status': 'ready', 'binary': '/tmp/test-rgd-calibration-binary',
    'binary_sha256': 'sha256:' + 'a' * 64,
}
fake_registry.core = core
sys.modules['rgd_registry'] = fake_registry
sys.modules['rgd_registry.core'] = core
module_path = Path(__file__).resolve().parent.parent/'server.py'
sys.path.insert(0, str(module_path.parent))
spec = importlib.util.spec_from_file_location('openrgd_module_agent_test_server', module_path)
server_module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = server_module
spec.loader.exec_module(server_module)


class AgentAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.manager = server_module.ModuleManager(Path(cls.tmp.name))
        cls.httpd = server_module.ThreadingHTTPServer(('127.0.0.1', 0), server_module.handler_factory(cls.manager))
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=3)
        cls.tmp.cleanup()

    def setUp(self):
        core.installed.clear()
        core.install_calls = 0
        self.manager.jobs.clear()
        self.manager.busy_job = None

    def call(self, method, path, payload=None, *, binary=False):
        connection = http.client.HTTPConnection('127.0.0.1', self.httpd.server_address[1], timeout=6)
        data = payload if binary else (json.dumps(payload).encode() if payload is not None else None)
        headers = {'Content-Type': 'application/zip' if binary else 'application/json'} if payload is not None else {}
        try:
            connection.request(method, path, body=data, headers=headers)
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    @staticmethod
    def build_payload(mode='build', confirmation=None):
        return {
            'module_id': 'org.openrgd.calibration', 'version': '0.2.0', 'mode': mode,
            'confirmation': confirmation or f'INSTALL org.openrgd.calibration@0.2.0 {mode}',
        }

    def test_discovery_is_read_only_and_provenance_is_explicit(self):
        code, result = self.call('GET', '/internal/v1/catalog')
        self.assertEqual(code, 200)
        self.assertFalse(result['actuation_enabled'])
        self.assertFalse(result['auto_install'])
        self.assertEqual(result['catalog'][0]['installation']['state'], 'not_installed')
        self.assertEqual(core.install_calls, 0)

    def test_install_requires_explicit_matching_confirmation(self):
        payload = self.build_payload(confirmation='yes')
        code, data = self.call('POST', '/internal/v1/install', payload)
        self.assertEqual(code, 422)
        self.assertIn('Conferma', data['error'])
        self.assertEqual(core.install_calls, 0)

    def test_explicit_build_triggers_a_single_background_install(self):
        code, job = self.call('POST', '/internal/v1/install', self.build_payload())
        self.assertEqual(code, 202)
        self.assertEqual(len(job['job_id']), 32)
        self.assertFalse(job['hardware_access'])
        for _ in range(90):
            status_code, progress = self.call('GET', f"/internal/v1/jobs/{job['job_id']}")
            self.assertEqual(status_code, 200)
            if progress['state'] in ('succeeded', 'failed'):
                break
            time.sleep(0.02)
        self.assertEqual(progress['state'], 'succeeded')
        self.assertEqual(progress['result']['state'], 'ready')
        self.assertEqual(core.install_calls, 1)
        code, catalog = self.call('GET', '/internal/v1/catalog')
        self.assertEqual(catalog['catalog'][0]['installation']['state'], 'ready')
        code, result = self.call('POST', '/internal/v1/install', self.build_payload())
        self.assertEqual(code, 422)
        self.assertIn('già presente', result['error'])

    def test_cannot_auto_upgrade_source_only_install(self):
        core.installed[('org.openrgd.calibration', '0.2.0')] = 'source_only'
        code, data = self.call('POST', '/internal/v1/install', self.build_payload())
        self.assertEqual(code, 422)
        self.assertIn('source_only', data['error'])
        self.assertEqual(core.install_calls, 0)

    def test_non_actuating_policy_rejects_device_permissions(self):
        original = core.entry
        def dangerous(*args):
            desc = copy.deepcopy(DESCRIPTOR)
            desc['permissions_required'] = ['motor.write']
            return desc
        core.entry = dangerous
        try:
            code, data = self.call('POST', '/internal/v1/install', self.build_payload())
            self.assertEqual(code, 422)
            self.assertIn('safety', data['error'])
            self.assertEqual(core.install_calls, 0)
        finally:
            core.entry = original

    def test_unknown_paths_and_non_json_data_fail_closed(self):
        code, _ = self.call('GET', '/internal/v1/execute')
        self.assertEqual(code, 404)
        code, _ = self.call('GET', '/internal/v1/jobs/../../escape')
        self.assertEqual(code, 404)
        code, _ = self.call('POST', '/internal/v1/execute', {})
        self.assertEqual(code, 404)

    def test_does_not_allow_unknown_install_fields(self):
        data = self.build_payload()
        data['command'] = 'rm -rf /'
        code, result = self.call('POST', '/internal/v1/install', data)
        self.assertEqual(code, 422)
        self.assertIn('soltanto', result['error'])
        self.assertEqual(core.install_calls, 0)

    def test_rejects_wrong_version_or_module_id(self):
        data = self.build_payload()
        data['module_id'] = '../foo'
        code, result = self.call('POST', '/internal/v1/install', data)
        self.assertEqual(code, 422)
        self.assertEqual(core.install_calls, 0)
        data = self.build_payload()
        data['version'] = '999.999.999'
        data['confirmation'] = 'INSTALL org.openrgd.calibration@999.999.999 build'
        code, _ = self.call('POST', '/internal/v1/install', data)
        self.assertEqual(code, 422)

    def test_passive_inspection_denies_missing_or_tampered_module(self):
        archive = self.fake_zip()
        code, response = self.call('POST', '/internal/v1/calibration/inspect', archive, binary=True)
        self.assertEqual(code, 422)
        self.assertIn('ready', response['error'])
        core.installed[('org.openrgd.calibration', '0.2.0')] = 'tampered'
        code, response = self.call('POST', '/internal/v1/calibration/inspect', archive, binary=True)
        self.assertEqual(code, 422)

    @staticmethod
    def fake_zip(filename='spec/01_foundation/description.jsonc'):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as out:
            out.writestr(filename, '{"meta_group":{"model_id_str":"synthetic_test"},"joint_topology_map":{}}')
        return buffer.getvalue()

    @staticmethod
    def valid_report():
        return {
            'report_version': '0.2.0', 'model_id':'synthetic_test',
            'current_robot_position_observed': False,
            'physical_drift_evaluated': False,
            'claims_physical_calibration_certified': False,
            'export_preview': None,
            'coverage': {
                'candidate_fields':0, 'declared_fields':0, 'saved_evidence_fields':0,
                'without_saved_measurements':0, 'without_declared_values':0,
            },
            'parameters': [], 'findings': [], 'source_digests': [{'role':'description','path':'spec/01_foundation/description.jsonc','raw_file_sha256':'sha256:' + 'f'*64}],
            'profile_id': None, 'profile_state': None, 'profile_binding': 'no_profile',
        }

    def test_ready_calibration_only_executes_allowlisted_passive_inspect(self):
        core.installed[('org.openrgd.calibration','0.2.0')] = 'ready'
        mock_result = type('Result', (), {'returncode':0, 'stdout':json.dumps(self.valid_report()).encode(), 'stderr':b''})()
        with mock.patch('calibration_passive.subprocess') as process:
            process.run.return_value = mock_result
            code, data = self.call('POST','/internal/v1/calibration/inspect', self.fake_zip(), binary=True)
            self.assertEqual(code, 200)
            self.assertEqual(data['inspection_contract'], 'console.passive-calibration.v0.4b')
            self.assertFalse(data['actuation_enabled'])
            self.assertFalse(data['physical_calibration_certified'])
            self.assertEqual(data['report']['coverage']['candidate_fields'], 0)
            call_args = process.run.call_args
            argv = call_args.args[0]
            self.assertEqual(argv[1:3], ['inspect','--bundle'])
            self.assertEqual(len(argv), 4)
            self.assertNotIn('--profile', argv)
            self.assertNotIn('--out', argv)
            self.assertNotIn('--model-hash', argv)

    def test_zip_traversal_and_bad_content_type_are_blocked(self):
        core.installed[('org.openrgd.calibration','0.2.0')] = 'ready'
        code, _ = self.call('POST','/internal/v1/calibration/inspect', {'oops':'not zip'})
        self.assertEqual(code, 415)
        code, data = self.call('POST','/internal/v1/calibration/inspect', self.fake_zip('../spec/01_foundation/description.jsonc'), binary=True)
        self.assertEqual(code, 422)
        self.assertIn('Percorso ZIP', data['error'])

    def test_calibration_cannot_claim_physical_certification(self):
        from calibration_passive import InspectionError, validate_cal02_report
        invalid = self.valid_report()
        invalid['current_robot_position_observed'] = True
        with self.assertRaises(InspectionError):
            validate_cal02_report(invalid)
        invalid = self.valid_report()
        invalid['export_preview'] = {'applied': True}
        with self.assertRaises(InspectionError):
            validate_cal02_report(invalid)

    def test_calibration_report_is_not_executable_without_user_request(self):
        core.installed[('org.openrgd.calibration', '0.2.0')] = 'ready'
        with mock.patch('calibration_passive.subprocess.run') as worker:
            self.call('GET', '/internal/v1/catalog')
            self.call('GET', '/internal/v1/healthz')
            worker.assert_not_called()

    def test_executes_real_fake_cli_only_with_imported_zip_and_ready_digest(self):
        core.installed[('org.openrgd.calibration','0.2.0')] = 'ready'
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory)/'fake-rgd-calibration'
            fake = json.dumps(self.valid_report())
            executable.write_text(
                '#!/usr/bin/env python3\n'
                'import sys\n'
                'assert sys.argv[1] == "inspect" and sys.argv[2] == "--bundle" and len(sys.argv) == 4\n'
                f'print({fake!r})\n'
            )
            executable.chmod(0o755)
            with mock.patch.object(core, 'resolve_binary', return_value={
                'status':'ready', 'binary':str(executable), 'binary_sha256':'sha256:' + 'a'*64,
            }):
                code, result = self.call('POST','/internal/v1/calibration/inspect', self.fake_zip(), binary=True)
            self.assertEqual(code, 200)
            self.assertEqual(result['report']['model_id'], 'synthetic_test')
            self.assertFalse(result['physical_calibration_certified'])



if __name__ == '__main__':
    unittest.main()
