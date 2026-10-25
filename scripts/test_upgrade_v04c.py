"""Source-only upgrade test in a synthetic home, no Docker or robot."""
from pathlib import Path
import os
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('upgrade-v04c.sh')

class V04CUpgradeTests(unittest.TestCase):
    def test_upgrade_keeps_secrets_config_and_local_data(self):
        with tempfile.TemporaryDirectory(prefix='rgd-console-04c-') as tmp:
            home = Path(tmp)
            target = home/'openrgd'/'repos'/'openrgd-console'
            (target/'services'/'api'/'src').mkdir(parents=True)
            (target/'apps'/'web'/'src'/'components').mkdir(parents=True)
            (target/'config').mkdir()
            (target/'data').mkdir()
            (target/'docker-compose.yml').write_text('services: {}\n')
            (target/'services'/'api'/'src'/'main.rs').write_text('// keep Rust running\n')
            (target/'apps'/'web'/'src'/'components'/'calibration-inspector.tsx').write_text('old\n')
            (target/'config'/'robots.json').write_text('LOCAL_CONFIG\n')
            (target/'.env').write_text('SECRET_PRESERVE=1\n')
            (target/'.env.local').write_text('LOCAL_PRESERVE\n')
            (target/'data'/'db.json').write_text('DO_NOT_REMOVE\n')
            env = {**os.environ, 'HOME': str(home)}
            result = subprocess.run(['bash', str(SCRIPT), str(target)], capture_output=True, text=True, timeout=30, env=env)
            self.assertEqual(result.returncode,0, result.stderr)
            self.assertEqual((target/'config'/'robots.json').read_text(),'LOCAL_CONFIG\n')
            self.assertEqual((target/'.env').read_text(),'SECRET_PRESERVE=1\n')
            self.assertEqual((target/'.env.local').read_text(),'LOCAL_PRESERVE\n')
            self.assertEqual((target/'data'/'db.json').read_text(),'DO_NOT_REMOVE\n')
            self.assertTrue((target/'apps'/'web'/'app'/'live'/'page.tsx').is_file())
            self.assertIn('requestFullscreen()', (target/'apps/web/src/components/robot-live.tsx').read_text())
            self.assertIn('/api/v1', (target/'apps/web/src/lib/api.ts').read_text())
            self.assertIn('NET_BIND_SERVICE', (target/'docker-compose.yml').read_text())
            self.assertEqual((target/'apps/web/src/components/robot-live.tsx').stat().st_mode & 0o444, 0o444)
            backups=list((home/'openrgd'/'backups').glob('console-source-before-v04C-*.tar.gz'))
            self.assertEqual(len(backups), 1)
            self.assertGreater(backups[0].stat().st_size,100)
            self.assertEqual(backups[0].stat().st_mode & 0o077,0)

    def test_missing_target_is_safe_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            env={**os.environ,'HOME':tmp}
            target=Path(tmp)/'not-a-console'
            result=subprocess.run(['bash',str(SCRIPT),str(target)],capture_output=True,text=True,timeout=10,env=env)
            self.assertNotEqual(result.returncode,0)
            self.assertFalse(target.exists())

if __name__=='__main__': unittest.main()
