"""Generate only synthetic owner outputs, using exact owner checkouts.
No robot data, runtime daemon, hardware access, or registry installation.
"""
import argparse
from copy import deepcopy
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--visual',type=Path,required=True)
    p.add_argument('--status',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    a=p.parse_args()
    visual=a.visual.resolve(strict=True)
    status=a.status.resolve(strict=True)
    out=a.out.resolve()
    out.mkdir(parents=True,exist_ok=False)
    sys.path.insert(0,str(visual/'src'))
    from rgd_visual.expression_packs import load_pack,preview_profile
    from rgd_visual.eye_composition import compose_preview
    from rgd_visual.expression_director import ExpressionDirector
    from rgd_visual.catalog import CatalogStore
    import rgd_visual
    if not Path(rgd_visual.__file__).resolve().is_relative_to(visual):
        raise RuntimeError('Unexpected visual package')
    pack=load_pack(visual/'packs/eyes/core-v0.1.json')
    def dump(name,data):
        (out/name).write_text(json.dumps(data,ensure_ascii=False,allow_nan=False),encoding='utf-8')
    dump('profile-a.json',preview_profile(pack,'fixture-one'))
    dump('profile-b.json',preview_profile(pack,'fixture-two',include_ring=False))
    inp=json.loads((visual/'examples/expressions/eye-composition-speaking-friendly.synthetic.json').read_text())
    inp['robot_id']='fixture-one'
    dump('composition.json',compose_preview(pack,inp))
    inp['display']['eyes_enabled']=False
    dump('blank.json',compose_preview(pack,inp))
    frames=json.loads((visual/'examples/expressions/expression-director.synthetic.json').read_text())
    for frame in frames: frame['composition']['robot_id']='fixture-one'
    director=ExpressionDirector(pack,robot_id='fixture-one',session_id=frames[0]['session_id'])
    dump('director.json',[director.step(frame)['composition'] for frame in frames])
    with TemporaryDirectory(prefix='visual-catalog-fixture-') as folder:
        store=CatalogStore(Path(folder)/'catalog','fixture-one')
        recipe=deepcopy(next(iter(pack['expressions'].values())))
        recipe['origin']='operator'
        first=store.queue(recipe)
        store.approve(first['proposal_id'],expected_revision=0,confirmation='APPROVE fixture-one '+first['proposal_id'])
        recipe['label']='Synthetic revision two'
        second=store.queue(recipe)
        store.approve(second['proposal_id'],expected_revision=1,confirmation='APPROVE fixture-one '+second['proposal_id'])
        store.rollback(recipe['expression_id'],to_revision=1,expected_revision=2,
                       confirmation='ROLLBACK fixture-one '+recipe['expression_id']+' TO 1')
        dump('catalog.json',store.export_snapshot())
    # Separate process: status has independent source tree and no shared imports.
    raw=(status/'tests/fixtures/ri/legacy-status.synthetic.json').read_bytes()
    env={**os.environ,'PYTHONPATH':str(status/'src')}
    result=subprocess.run([sys.executable,'-m','rgd_visual.ri_report','--input-kind','synthetic'],
                          cwd=status,env=env,input=raw,capture_output=True,timeout=15,check=True)
    dump('status.json',json.loads(result.stdout))
    print('Prepared actual owner pack/composer/director/catalog and status synthetic outputs')

if __name__=='__main__': main()
