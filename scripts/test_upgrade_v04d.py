"""Upgrade check in synthetic HOME. Does not invoke Docker or change Linux."""
from pathlib import Path
import os
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('upgrade-v04d.sh')

class BootUpgradeTests(unittest.TestCase):
    def test_upgrade_preserves_config_secrets_local_data_and_code_readability(self):
        with tempfile.TemporaryDirectory(prefix='rgd-boot-upgrade-') as folder:
            home=Path(folder)
            target=home/'openrgd/repos/openrgd-console'
            (target/'services/api/src').mkdir(parents=True)
            (target/'apps/web/src/components').mkdir(parents=True)
            (target/'config').mkdir(parents=True)
            (target/'data').mkdir(parents=True)
            (target/'docker-compose.yml').write_text('services: {}\n')
            (target/'services/api/src/module_manager.rs').write_text('// v0.4C\n')
            (target/'apps/web/src/components/robot-live.tsx').write_text('PREVIOUS UI\n')
            (target/'config/robots.json').write_text('PERSISTED_CONFIG\n')
            (target/'.env').write_text('DO_NOT_OVERWRITE\n')
            (target/'.env.local').write_text('SAVED\n')
            (target/'data/state.json').write_text('SAVED_DATA\n')
            env={**os.environ,'HOME':str(home)}
            result=subprocess.run(['bash',str(SCRIPT),str(target)],capture_output=True,text=True,timeout=40,env=env)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual((target/'config/robots.json').read_text(),'PERSISTED_CONFIG\n')
            self.assertEqual((target/'.env').read_text(),'DO_NOT_OVERWRITE\n')
            self.assertEqual((target/'.env.local').read_text(),'SAVED\n')
            self.assertEqual((target/'data/state.json').read_text(),'SAVED_DATA\n')
            self.assertTrue((target/'services/boot-manager/boot_core.py').exists())
            self.assertTrue((target/'apps/web/app/boot/page.tsx').exists())
            self.assertIn('boot-manager', (target/'docker-compose.yml').read_text())
            self.assertEqual((target/'services/boot-manager/boot_core.py').stat().st_mode & 0o444,0o444)
            backups=list((home/'openrgd/backups').glob('console-source-before-v04D-*.tar.gz'))
            self.assertEqual(len(backups),1)
            self.assertEqual(backups[0].stat().st_mode & 0o077,0)

    def test_missing_previous_release_fails_before_creating_target(self):
        with tempfile.TemporaryDirectory(prefix='rgd-boot-upgrade-') as folder:
            target=Path(folder)/'missing'
            result=subprocess.run(['bash',str(SCRIPT),str(target)],capture_output=True,text=True,
                                  timeout=20,env={**os.environ,'HOME':folder})
            self.assertNotEqual(result.returncode,0)
            self.assertFalse(target.exists())

if __name__=='__main__': unittest.main()
