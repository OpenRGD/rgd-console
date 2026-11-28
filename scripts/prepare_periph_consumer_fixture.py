"""Use actual pinned PERIPH status logic with fake probes and fake systemd.
Never install, open devices, connect to a broker or issue lifecycle commands.
"""
import argparse
import json
from pathlib import Path
import sys
from unittest.mock import patch
from uuid import uuid4

PIN='a36c2d7c42b0bb3f4b2e4c78b42b999be0fac6cd'

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--owner',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--robot-id',default='rc-lab-unbound')
    a=p.parse_args()
    module=a.owner.resolve(strict=True)/'services/peripheral-manager'
    sys.path.insert(0,str(module/'tests'))
    sys.path.insert(0,str(module))
    import host_broker as h
    import control_cli as cli
    from contract_validation import validate_instance
    from test_host_manager import SystemdFake,SERVICE
    from subprocess import check_output
    if check_output(['git','-C',str(a.owner),'rev-parse','HEAD'],text=True).strip()!=PIN:
        raise RuntimeError('Unexpected PERIPH source pin')
    svc=dict(SERVICE,robot_id=a.robot_id)
    fake=SystemdFake(active='active')
    broker=h.Broker({'schema_version':h.ALLOWLIST_SCHEMA,'services':[svc]},fake)
    req={'schema_version':h.SCHEMA,'request_id':str(uuid4()),'robot_id':a.robot_id,'peripheral_id':svc['peripheral_id'],'action':'status'}
    validate_instance('host-request',req)
    key=(req['robot_id'],req['peripheral_id'])
    with patch.object(h,'device_identity',return_value=('present',True)):
        reply=cli.validate_reply(broker.process(req),req)
        broker.uncertain.add(key)
        qreq=dict(req,request_id=str(uuid4()))
        quarantine=cli.validate_reply(broker.process(qreq),qreq)
    assert reply['publisher']['lifecycle']=='running' and quarantine['error_code']=='reconciliation_required'
    assert fake.calls and all(argv[2]=='show' for argv in fake.calls)
    descriptor={'schema_version':'console.peripheral-descriptor.v0.1-candidate','robot_id':req['robot_id'],'peripheral_id':req['peripheral_id'],
      'display_name':'Synthetic sensor','category':'generic','source_kind':'physical',
      'binding':{'transport':'usb_serial','binding_ref':'fixture:unbound','verification':'configured_unverified'},
      'publisher':{'publisher_id':'fixture-publisher','host_id':'fixture-host','manager':'systemd_user','service_ref':svc['service_ref'],'resource_lock':'fixture:exclusive','ownership':'exclusive_device_owner','startup_policy':'manual'},
      'streams':[{'stream_id':'fixture.sample','sample_schema':'fixture.sample.v1','data_class':'sensor_observation','freshness_ms':3000,'nominal_rate_hz':None,'fanout':'multiple_read_only_consumers','buffer_policy':'latest_only'}],
      'capabilities':['observation.read','acquisition.start','acquisition.stop'],'actuation_enabled':False}
    validate_instance('descriptor',descriptor)
    status={'schema_version':'console.peripheral-status.v0.1-candidate','robot_id':req['robot_id'],'peripheral_id':req['peripheral_id'],
      'status_revision':reply['status_revision'],'reported_at':reply['observed_at'],
      'device':dict(reply['device'],checked_at=reply['observed_at']),
      'publisher':{'lifecycle':'running','desired_state':'unknown','manager_available':True,'enabled_on_boot':False,'reported_at':reply['observed_at'],'error_code':None},
      'streams':[{'stream_id':'fixture.sample','state':'no_source','source_kind':'unknown','last_received_at':None,'age_ms':None}],
      'controls':{'can_start':False,'can_stop':False,'reason':'not_authorized'},'actuation_enabled':False}
    validate_instance('status',status)
    def frame(value):return json.dumps(value,separators=(',',':'),allow_nan=False)+'\n'
    def snapshot(request,response,public):
        return {'schema_version':'console.periph-offline-snapshot.v0.1-candidate','owner_commit':PIN,'robot_id':req['robot_id'],'source_kind':'synthetic','entries':[{'descriptor':descriptor,'request_frame':frame(request),'response_frame':frame(response) if response is not None else None,'public_status':public}],'live_connection':False,'actuation_enabled':False}
    a.out.mkdir(parents=True,exist_ok=False)
    for name,value in [('running',snapshot(req,reply,status)),('quarantine',snapshot(qreq,quarantine,None)),('unavailable',snapshot(req,None,None)),('descriptor',descriptor),('status',status)]:
        (a.out/(name+'.json')).write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
    print('PASS actual PERIPH mock status/quarantine; zero lifecycle commands')

if __name__=='__main__':main()
