"""Opt-in offline adapter for an owner-provided nominal URDF fixture.
No robot-specific data, acquisition, installation, network or test results.
"""
import argparse
import csv
import json
from pathlib import Path
import sys
import zipfile

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--core',type=Path,required=True)
    p.add_argument('--urdf',type=Path,required=True)
    p.add_argument('--inventory',type=Path)
    p.add_argument('--out',type=Path,required=True)
    a=p.parse_args()
    core=a.core.resolve(strict=True)
    sys.path.insert(0,str(core/'src'))
    from openrgd.importers.urdf.parser import URDFImporter
    import openrgd.importers.urdf.parser as owner
    if not Path(owner.__file__).resolve().is_relative_to(core):
        raise RuntimeError('Wrong Core source')
    a.out.mkdir(parents=True,exist_ok=False)
    urdf=a.urdf.resolve(strict=True)
    if not urdf.is_file() or urdf.stat().st_size>8*1024*1024:
        raise ValueError('External URDF fixture missing or over test budget')
    docs=URDFImporter(str(urdf)).parse()
    if set(docs)!={'spec/01_foundation/description.jsonc','spec/01_foundation/actuation_dynamics.jsonc'}:
        raise RuntimeError('Unexpected importer contract')
    with zipfile.ZipFile(a.out/'reference.rgd','x',zipfile.ZIP_STORED) as z:
        for name,raw in docs.items(): z.writestr(name,raw.encode('utf-8'))
    if a.inventory:
        if not a.inventory.is_file() or a.inventory.stat().st_size>2*1024*1024:
            raise ValueError('External inventory missing or over test budget')
        with a.inventory.open(newline='',encoding='utf-8') as h:
            rows=list(csv.DictReader(h))
        if len(rows)>512:
            raise ValueError('External inventory exceeds preview joint budget')
        expected=[{'id':r['joint_name'],'type':r['type'].upper(),'parent':r['parent_link'],'child':r['child_link']} for r in rows]
        if len({r['id'] for r in expected})!=len(expected): raise ValueError('Duplicate inventory joint')
        (a.out/'expected.json').write_text(json.dumps(expected),encoding='utf-8')
    print('Prepared external nominal fixture; no instance data copied into repository')

if __name__=='__main__': main()
