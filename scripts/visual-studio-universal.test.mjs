import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseVisualJson,validPreviewRobot} from '../apps/web/src/lib/visual-json.ts';
import {createEmptyDraft,validCompleteDraft} from '../apps/web/src/lib/visual-studio-profile.ts';
import {validExpression,validProposal,DEMO_EXPRESSION,DEMO_PROPOSAL} from '../apps/web/src/lib/visual-expression.ts';
import {parseCompositionResult} from '../apps/web/src/lib/eye-composition-result.ts';
import {parseVisualStatus} from '../apps/web/src/lib/visual-status-report.ts';

test('independent synthetic scopes have no built-in machine binding or expression catalog',()=>{
  const a=createEmptyDraft('fixture-one'),b=createEmptyDraft('fixture-two');
  assert.ok(validCompleteDraft(a)&&validCompleteDraft(b));
  assert.notEqual(a.robot_id,b.robot_id);assert.equal(a.mappings.length,0);
  assert.equal(Object.keys(a.expressions).length,0);
  assert.ok(a.zones.every(z=>z.adapter_id===null&&z.binding_status==='planned'));
  a.scenes.preview[0].brightness=99;
  assert.equal(b.scenes.preview[0].brightness,20);
  for(const id of ['','UPPER','a\n','constructor','prototype','__proto__'])assert.equal(validPreviewRobot(id),false);
});
test('closed profile shape and references reject malformed or authority-bearing drafts',()=>{
  const a=createEmptyDraft('fixture-one');
  for(const bad of [{...a,non_actuating:false},{...a,hardware_execution_authorized:true},{...a,fallback_scene:'missing'},
    {...a,zones:[...a.zones,a.zones[0]]},{...a,zones:[{...a.zones[0],adapter_id:'not-bound'},a.zones[1]]},
    {...a,scenes:{preview:[{...a.scenes.preview[0],zone_id:'missing'}]}},
    {...a,scenes:{preview:[{...a.scenes.preview[0],effect:['solid']}]}},
    {...a,mappings:[{source:'demo',event:'preview.show',scene:'missing',priority:1}]}])
    assert.equal(validCompleteDraft(bad),false);
});
test('file parser rejects duplicate decoded keys, unsafe numbers, depth and prototype pollution',()=>{
  assert.deepEqual(parseVisualJson('{"a":{"x":1},"b":{"x":2}}',1024),{a:{x:1},b:{x:2}});
  for(const raw of ['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{"x":1e999}','{"x":9007199254740993}','{"__proto__":{}}','{"constructor":{}}','['.repeat(49)+'0'+']'.repeat(49)])
    assert.throws(()=>parseVisualJson(raw,1024));
  assert.throws(()=>parseVisualJson('"漢字"',5));
});
test('synthetic recipes cannot claim internal emotions or hardware authority',()=>{
  assert.ok(validExpression(DEMO_EXPRESSION));assert.ok(validProposal(DEMO_PROPOSAL));
  assert.equal(validExpression({...DEMO_EXPRESSION,expression_id:'constructor'}),false);
  assert.equal(validExpression({...DEMO_EXPRESSION,claims_emotion_as_internal_state:true}),false);
  assert.equal(validProposal({...DEMO_PROPOSAL,hardware_execution_authorized:true}),false);
});
test('reject invalid composition and unbound status envelope without fabricating a report',()=>{
  assert.throws(()=>parseCompositionResult({schema_version:'openrgd.visual.eye-compose-result.v0.1-candidate',hardware_commands_sent:true},'fixture-one'));
  assert.throws(()=>parseVisualStatus({schema_version:'openrgd.visual.ri-status-report.v0.1-candidate',physical_output_observed:true}));
});
test('Studio has no machine preset, runtime ingress or auto profile persistence; imports scope by key',()=>{
  const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  const paths=['visual-effects-studio.tsx','eye-composition-preview.tsx','expression-catalog-manager.tsx','expressive-eyes.tsx','visual-status-preview.tsx'];
  const all=paths.map(p=>load('apps/web/src/components/'+p)).join('\n');
  assert.doesNotMatch(all,/paky-0[12]|paky01|paky02|apiWrite\(|new WebSocket|navigator\.bluetooth|navigator\.serial|fetch\(/i);
  const studio=load('apps/web/src/components/visual-effects-studio.tsx');
  assert.match(studio,/<StudioWorkspace key=\{robotId\}/);
  assert.doesNotMatch(studio,/localStorage|revision: profile\.revision \+ 1/);
  for(const p of paths.filter(p=>p!=='expressive-eyes.tsx')){
    const s=load('apps/web/src/components/'+p);
    assert.match(s,/revision\.current/);
  }
});
