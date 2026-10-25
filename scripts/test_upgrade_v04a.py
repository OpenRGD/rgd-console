"""Upgrade preservation regression: no Docker actions, entirely temporary directories."""
from pathlib import Path
import os
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parent


class UpgradeTests(unittest.TestCase):
    def test_preserves_config_env_data_and_creates_backup(self):
        with tempfile.TemporaryDirectory(prefix='openrgd-console-upgrade-') as temp:
            home = Path(temp)
            target = home/'openrgd'/'repos'/'openrgd-console'
            (target/'services'/'api'/'src').mkdir(parents=True)
            (target/'config').mkdir()
            (target/'data').mkdir()
            (target/'config'/'robots.json').write_text('{"specific": "robot-config-preserved"}\n')
            (target/'data'/'marker.txt').write_text('existing-user-data\n')
            (target/'.env').write_text('EXISTING_ENV="keep"\n')
            (target/'services'/'api'/'src'/'main.rs').write_text('// old api source\n')
            (target/'docker-compose.yml').write_text('name: old-console\nservices: {}\n')
            env = dict(os.environ, HOME=str(home))
            result = subprocess.run(
                ['bash', str(HERE/'upgrade-v04a.sh'), str(target)],
                capture_output=True, text=True, check=False, env=env, timeout=20
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((target/'config'/'robots.json').read_text(), '{"specific": "robot-config-preserved"}\n')
            self.assertEqual((target/'data'/'marker.txt').read_text(), 'existing-user-data\n')
            self.assertEqual((target/'.env').read_text(), 'EXISTING_ENV="keep"\n')
            self.assertTrue((target/'deploy'/'Dockerfile.module-agent').is_file())
            self.assertTrue((target/'services'/'api'/'src'/'module_manager.rs').is_file())
            self.assertIn('module-agent', (target/'docker-compose.yml').read_text())
            backups = list((home/'openrgd'/'backups').glob('console-source-before-v04A-*.tar.gz'))
            self.assertEqual(len(backups), 1)
            self.assertGreater(backups[0].stat().st_size, 100)


if __name__ == '__main__':
    unittest.main()
