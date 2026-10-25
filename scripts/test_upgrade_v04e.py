"""v0.4E installer cannot touch live configuration, Docker volumes or other modules."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    'services/api/src/model_import.rs',
    'services/api/src/routes.rs',
    'apps/web/src/lib/contracts.ts',
    'apps/web/src/components/onboarding.tsx',
    'scripts/contract-check.test.mjs',
]


class UpgradeHalPreviewTests(unittest.TestCase):
    def test_safe_overlay_and_backup(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            dest = home / 'openrgd/repos/openrgd-console'
            for rel in REQUIRED:
                file = dest / rel
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes((ROOT / rel).read_bytes())
            (dest / 'services/boot-manager').mkdir(parents=True)
            (dest / 'services/boot-manager/boot_core.py').write_text('DO NOT MODIFY')
            (dest / 'scripts').mkdir(exist_ok=True)
            (dest / 'config').mkdir()
            (dest / 'config/special.ini').write_text('PRESERVE')
            (dest / 'data').mkdir()
            (dest / 'data/workspace.json').write_text('DO NOT TOUCH')
            result = subprocess.run(['bash', str(ROOT / 'scripts/upgrade-v04e-hal-preview.sh'), str(dest)],
                                    env={**os.environ, 'HOME': str(home)}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((dest / 'config/special.ini').read_text(), 'PRESERVE')
            self.assertEqual((dest / 'data/workspace.json').read_text(), 'DO NOT TOUCH')
            self.assertEqual((dest / 'services/boot-manager/boot_core.py').read_text(), 'DO NOT MODIFY')
            self.assertTrue((dest / 'scripts/hal-smoke.py').is_file())
            backups = list((home / 'openrgd/backups').glob('console-hal-preview-before-v04E-*.tar.gz'))
            self.assertEqual(len(backups), 1)

    def test_unknown_target_fails_before_writing(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            result = subprocess.run(['bash', str(ROOT / 'scripts/upgrade-v04e-hal-preview.sh'), str(home / 'other')],
                                    env={**os.environ, 'HOME': str(home)}, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((home / 'openrgd/backups').exists())


if __name__ == '__main__':
    unittest.main()
