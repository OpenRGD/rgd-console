"""Generate synthetic Console fixtures using the actual pinned Core URDF importer.
No devices, installed toolchain changes, model registry or canonical claims.
"""
import argparse
from pathlib import Path
import sys
import tempfile
import zipfile

CORE_PIN = 'afe1a831b950a4e6560f0285a0103fc4eaa343b7'
DESCRIPTION = 'spec/01_foundation/description.jsonc'
SYNTHETIC = '''<robot name="console_metadata_synthetic">
  <link name="base"/><link name="a"/><link name="b"/><link name="c"/>
  <joint name="rotated" type="revolute">
    <parent link="base"/><child link="a"/>
    <origin xyz="0.1 0.2 0.3" rpy="0.25 -1.5 0.5"/>
    <axis xyz="0 0 1"/><limit lower="-1" upper="1" effort="1" velocity="1"/>
  </joint>
  <joint name="zero" type="fixed">
    <parent link="a"/><child link="b"/><origin xyz="0 0 0.1" rpy="0 0 0"/>
  </joint>
  <joint name="unknown" type="fixed">
    <parent link="b"/><child link="c"/><origin xyz="0 0 0.1"/>
  </joint>
</robot>
'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--core', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    core = args.core.resolve(strict=True)
    sys.path.insert(0, str(core / 'src'))
    from openrgd.importers.urdf.parser import URDFImporter
    import openrgd.importers.urdf.parser as owner
    if not Path(owner.__file__).resolve().is_relative_to(core):
        raise RuntimeError('Wrong Core importer source')
    args.out.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.out / 'reference.rgd', 'x', zipfile.ZIP_STORED) as out:
        out.writestr(DESCRIPTION, (core / DESCRIPTION).read_bytes())
    with tempfile.TemporaryDirectory(prefix='core-urdf-fixture-') as temp:
        path = Path(temp) / 'synthetic.urdf'
        path.write_text(SYNTHETIC, encoding='utf-8')
        result = URDFImporter(str(path)).parse()
        if set(result) != {DESCRIPTION, 'spec/01_foundation/actuation_dynamics.jsonc'}:
            raise RuntimeError('Unexpected Core importer output contract')
        with zipfile.ZipFile(args.out / 'urdf-derived.rgd', 'x', zipfile.ZIP_STORED) as out:
            for name, raw in result.items():
                out.writestr(name, raw.encode('utf-8'))
    print(f'Prepared Core source and actual URDF-derived fixtures; CI checkout pin {CORE_PIN}')


if __name__ == '__main__':
    main()
