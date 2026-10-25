"""Hermetic tests; uses synthetic /sys and /dev fixtures, not actual hardware."""
from pathlib import Path
import importlib.util
import json
import tempfile
import unittest

MODULE = Path(__file__).with_name('host-snapshot.py')
spec = importlib.util.spec_from_file_location('openrgd_host_snapshot', MODULE)
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)


class HostSnapshotTests(unittest.TestCase):
    def test_synthetic_can_tty_video_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            net = base/'sys'/'class'/'net'
            dev = base/'dev'
            (net/'can0').mkdir(parents=True)
            (net/'eth0').mkdir(parents=True)
            dev.mkdir()
            (net/'can0'/'type').write_text('280\n')
            (net/'can0'/'operstate').write_text('down\n')
            (net/'eth0'/'type').write_text('1\n')
            (dev/'ttyACM0').touch()
            (dev/'video2').touch()
            (dev/'ttyS0').touch()
            osrel = base/'os-release'
            osrel.write_text('ID=ubuntu\nPRETTY_NAME="Ubuntu 22.04 LTS"\n')
            result = snapshot.collect_snapshot(net, dev, osrel)
            self.assertEqual(result['schema_version'], 'console.host-inventory.v1')
            self.assertEqual([row['endpoint'] for row in result['interfaces']], ['can0', '/dev/ttyACM0', '/dev/video2'])
            self.assertEqual(result['platform']['os_id'], 'ubuntu')
            self.assertNotIn('ttyS0', json.dumps(result))

    def test_without_sysfs_or_devices_is_empty_not_simulated(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report = snapshot.collect_snapshot(root/'no-sysfs', root/'no-dev', root/'no-os-release')
            self.assertEqual(report['interfaces'], [])
            self.assertEqual(report['platform']['os_id'], 'unknown')

    def test_does_not_introspect_synthetic_non_can_net(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            n = root/'network'/'eno1'
            n.mkdir(parents=True)
            (n/'type').write_text('1\n')
            self.assertEqual(snapshot.detect_interfaces(root/'network', root/'devices'), [])


if __name__ == '__main__':
    unittest.main()
