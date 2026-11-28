#!/usr/bin/env python3
"""Isolated lab smoke. Read-only unless --seed-synthetic is explicitly supplied."""
import argparse
import hashlib
import io
import json
import time
import zipfile
from urllib.error import HTTPError, URLError
from urllib.request import build_opener, HTTPRedirectHandler, ProxyHandler, Request

BASE='http://127.0.0.1:8188'
MARKER='console-025a'
LAB_IDS={'rc-lab-sim','rc-lab-unbound'}
MAX_REPLY=8*1024*1024
PAGES=('/overview','/onboarding','/body','/live','/live/configure','/voice','/visual-effects','/boot','/peripherals')

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        return None

OPENER=build_opener(ProxyHandler({}),NoRedirect())

def require(condition,message):
    if not condition:
        raise RuntimeError(message)

def call(path,*,data=None,content_type=None,write_header=True,expected=200,json_reply=True):
    require(path.startswith('/') and not path.startswith('//'),'Invalid local path')
    headers={'Accept':'application/json' if json_reply else 'text/html'}
    if data is not None:
        if write_header: headers['X-OpenRGD-Console']='onboarding.v1'
        headers['Origin']=BASE
        headers['Content-Type']=content_type or 'application/json'
    req=Request(BASE+path,data=data,headers=headers)
    try:
        response=OPENER.open(req,timeout=10)
    except HTTPError as exc:
        response=exc
    with response:
        if response.code in (502,503,504) and data is None:
            raise OSError('Gateway starting or unavailable')
        require(response.headers.get('X-OpenRGD-Lab')==MARKER,'Wrong gateway; stop')
        raw=response.read(MAX_REPLY+1)
        require(len(raw)<=MAX_REPLY,'Response exceeds lab budget')
        if response.code!=expected:
            # Bounded error classification only; never print raw payload/paths.
            detail=''
            try:
                err=json.loads(raw)
                code=err.get('code')
                if isinstance(code,str) and code.isascii() and len(code)<=80 and code.replace('_','').isalnum():
                    detail='; code='+code
                message=err.get('message','')
                if isinstance(message,str) and ('Permission denied' in message or 'os error 13' in message):detail+='; permission denied'
                elif isinstance(message,str) and ('Read-only file system' in message or 'os error 30' in message):detail+='; read-only filesystem'
            except (ValueError,AttributeError):pass
            raise RuntimeError(f'{path}: expected HTTP {expected}, received {response.code}{detail}')
        return json.loads(raw) if json_reply else raw

def ready():
    for attempt in range(25):
        try:
            h=call('/healthz')
            require(h['ok'] is True and h['actuation_enabled'] is False,'API authority mismatch')
            call('/api/v1/boot/health')
            call('/api/v1/modules/agent-health')
            for page in PAGES:
                require(bool(call(page,json_reply=False)),f'Empty startup page {page}')
            return
        except (URLError,OSError,ValueError):
            if attempt==24: raise
            time.sleep(2)

def read_checks():
    status=call('/api/v1/status')
    require(status['actuation_enabled'] is False and status['physical_runtime_connected'] is False
            and status['control_surface']=='none','Unexpected physical authority')
    boot=call('/api/v1/boot/status')
    require(boot['physical_execution']['authorized'] is False and boot['motor_commands_sent'] is False,'Boot authority')
    agent=call('/api/v1/modules/agent-health')
    require(agent['ok'] is True and agent['actuation_enabled'] is False,'Agent authority')
    catalog=call('/api/v1/modules/catalog')
    require(catalog['auto_install'] is False and catalog['actuation_enabled'] is False,'Registry policy')
    robots=call('/api/v1/robots')
    require(LAB_IDS.issubset({r['id'] for r in robots}),'Missing synthetic registry')
    for r in robots:
        require(r['id'] in LAB_IDS or (r['id'].startswith('instance-') and r['adapter_id']=='console.unbound.v1'),'Non-lab registry; stop')
    for path in PAGES:
        require(bool(call(path,json_reply=False)),f'Empty web route {path}')
    print('PASS lab gateway, nine HTTP pages and non-actuating authority')
    return robots

def fixture(name,partial):
    def joint(parent,child,xyz,rpy):
        geo={'origin_xyz_m_vec3_float':xyz}
        if rpy is not None: geo['origin_rpy_rad_vec3_float']=rpy
        return {'type_enum':'REVOLUTE','connectivity':{'parent_link_ref_str':parent,'child_link_ref_str':child},'geometry_ideal':geo}
    links=['root','a','b'] if partial else ['root','a']
    joints={'j1':joint('root','a',[0,0,1],[0,0,0])}
    if partial: joints['j2']=joint('a','b',[1,0,0],None)
    desc={'meta_group':{'model_id_str':name,'species_name_str':name},'kinematic_chain_list':[{'link_id_str':x} for x in links],'joint_topology_map':joints}
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w',zipfile.ZIP_STORED) as z:
        z.writestr('spec/01_foundation/description.jsonc',json.dumps(desc,allow_nan=False))
    return buf.getvalue()

def seed(robots):
    require({r['id'] for r in robots}==LAB_IDS and call('/api/v1/models')==[]
            and call('/api/v1/host-reports/latest') is None,'Seed requires empty synthetic lab; no writes performed')
    for path in ('/api/v1/modules/install','/api/v1/imu/observations','/api/v1/host-reports/import'):
        call(path,data=b'{}',expected=403,json_reply=False)
    call('/api/v1/instances',data=b'{"model_id":"not-a-model","name":"not registered"}',write_header=False,expected=403)
    registered=[]
    for name,partial in [('lab-chain',False),('lab-partial-chain',True)]:
        blob=fixture(name,partial)
        boundary='rc025a-synthetic-boundary'
        body=(('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="'+name+'.zip"\r\nContent-Type: application/zip\r\n\r\n').encode()+blob+('\r\n--'+boundary+'--\r\n').encode())
        model=call('/api/v1/models/import',data=body,content_type='multipart/form-data; boundary='+boundary,expected=201)
        require(model['source_sha256']=='sha256:'+hashlib.sha256(blob).hexdigest(),'Archive digest mismatch')
        require(model['integrity_state']=='canonical_not_verified','Unexpected canonical claim')
        joints={j['id']:j for j in model['joints']}
        require(joints['j1']['origin_rpy_rad']==[0,0,0],'Explicit zero lost')
        if partial: require(joints['j2']['origin_rpy_rad'] is None,'Missing RPY invented')
        robot=call('/api/v1/instances',data=json.dumps({'model_id':model['model_id'],'name':name}).encode(),expected=201)
        require(robot['adapter_id']=='console.unbound.v1' and robot['rgd_model_id']==model['model_id'],'Unexpected binding')
        read=call('/api/v1/robots/'+robot['id']+'/model')
        require(read['source_sha256']==model['source_sha256'],'Wrong model association')
        telem=call('/api/v1/robots/'+robot['id']+'/telemetry')
        require(telem['motors']==[] and telem['power']['voltage']['value'] is None,'Unexpected physical telemetry')
        require(call('/api/v1/robots/'+robot['id']+'/calibration/last') is None,'Unexpected saved CAL report')
        err=call('/api/v1/robots/'+robot['id']+'/calibration/inspect',data=b'{}',expected=422)
        require(err['code']=='calibration_inspect_failed','Unexpected CAL refusal')
        require(call('/api/v1/robots/'+robot['id']+'/calibration/last') is None,'Failed inspection saved report')
        registered.append((robot['id'],model['model_id']))
    require(registered[0][0]!=registered[1][0] and registered[0][1]!=registered[1][1],'Instance collision')
    for robot_id,model_id in registered:
        require(call('/api/v1/robots/'+robot_id+'/model')['model_id']==model_id,'Cross-instance leakage')
    print('PASS blocked writes, two generic ZIP imports, separate unbound instances, zero vs missing RPY, CAL absent fallback')
    print('Synthetic browser fixtures:', ', '.join(x[0] for x in registered))

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--seed-synthetic',action='store_true')
    a=p.parse_args()
    ready()
    robots=read_checks()
    if a.seed_synthetic: seed(robots)
    print('PASS integrated lab smoke (not browser or hardware acceptance)')

if __name__=='__main__':
    main()
