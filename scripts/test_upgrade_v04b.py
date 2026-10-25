"""v0.4B source upgrade safety in a temporary fake home; no live Docker or hardware."""
from pathlib import Path
import os
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('upgrade-v04b.sh')


class V04BUpgradeTests(unittest.TestCase):
    def test_keeps_local_files_and_backs_up_previous_source(self):
        with tempfile.TemporaryDirectory(prefix='rgd-console-04b-upgrade-') as tmp:
            home = Path(tmp)
            target = home / 'openrgd' / 'repos' / 'openrgd-console'
            (target/'services'/'api'/'src').mkdir(parents=True)
            (target/'config').mkdir()
            (target/'data').mkdir()
            (target/'docker-compose.yml').write_text('services: {}\n')
            (target/'services'/'api'/'src'/'main.rs').write_text('/* previous source */\n')
            (target/'config'/'robots.json').write_text('LOCAL_ROBOT_CONFIG\n')
            (target/'.env').write_text('LOCAL_SECRET=preserved\n')
            (target/'.env.local').write_text('KEEP\n')
            (target/'data'/'keep.txt').write_text('DO_NOT_REMOVE\n')
            env = {**os.environ, 'HOME': str(home)}
            result = subprocess.run(['bash', str(SCRIPT), str(target)], env=env,
                                    capture_output=True, text=True, timeout=25)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((target/'config'/'robots.json').read_text(), 'LOCAL_ROBOT_CONFIG\n')
            self.assertEqual((target/'.env').read_text(), 'LOCAL_SECRET=preserved\n')
            self.assertEqual((target/'.env.local').read_text(), 'KEEP\n')
            self.assertEqual((target/'data'/'keep.txt').read_text(), 'DO_NOT_REMOVE\n')
            self.assertTrue((target/'services'/'module-agent'/'calibration_passive.py').is_file())
            self.assertIn('COPY --chmod=0644', (target/'deploy'/'Dockerfile.module-agent').read_text())
            self.assertIn('NET_BIND_SERVICE', (target/'docker-compose.yml').read_text())
            backups = list((home/'openrgd'/'backups').glob('console-source-before-v04B-*.tar.gz'))
            self.assertEqual(len(backups), 1)
            self.assertGreater(backups[0].stat().st_size, 100)


if __name__ == '__main__':
    unittest.main()
