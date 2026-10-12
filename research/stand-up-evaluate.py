"""Evaluate deterministic exported actors on declared development or frozen case manifests."""
import argparse
import json
from pathlib import Path
import subprocess
import time
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
import numpy as np

parser=argparse.ArgumentParser()
parser.add_argument('--actor',required=True)
parser.add_argument('--output',required=True)
parser.add_argument('--partition',choices=['development','selection','validation'],default='development')
parser.add_argument('--workers',type=int,default=3)
parser.add_argument('--inference',choices=['core','numpy'],default='core')
options=parser.parse_args()
actor=json.loads(Path(options.actor).read_text());configuration=actor['identity']['configuration']
output=Path(options.output);output.parent.mkdir(parents=True,exist_ok=True)
manifest=json.loads(Path('research/stand-up-learning-cases.json').read_text())
cases=([{'degrees':d,'impulse':60,'separation':.2} for d in [0,90,180,270]]
    if options.partition=='development' else manifest[options.partition])
# Each body/loadout gets its own worker configuration; actor compatibility is checked below.
groups={}
for case in cases:groups.setdefault((case.get('model','workshop-fighter'),case.get('held','empty')),[]).append(case)
layers=[(np.asarray(l['weights'],dtype=np.float64),np.asarray(l['bias'],dtype=np.float64)) for l in actor['layers']]
def act(observation):
    x=np.asarray(observation,dtype=np.float64)
    for i,(w,b) in enumerate(layers):
        x=w@x+b
        if i<len(layers)-1:x=np.maximum(x,0)
    return np.tanh(x[:actor['actions']]).tolist()
records=[];started=time.monotonic();total_steps=0
for (model,held),group in groups.items():
    config={**configuration,'model':model,'held':held,'seconds':35}
    config_path=output.with_suffix('.config.json');config_path.write_text(json.dumps(config))
    server=subprocess.Popen(['node','research/stand-up-learning-server.mjs',str(config_path),str(options.workers),options.actor],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=output.with_suffix('.worker.log').open('w'),text=True,bufsize=1)
    def receive():
        line=server.stdout.readline()
        if not line:raise RuntimeError('evaluation worker exited')
        r=json.loads(line)
        if 'error' in r:raise RuntimeError(r['error'])
        return r
    def call(op,values):
        server.stdin.write(json.dumps({'op':op,'values':values})+'\n');server.stdin.flush();return receive()['results']
    try:
        meta=receive()['ready'];assert all(m['observationSize']==len(layers[0][0][0]) and m['actionSize']==actor['actions'] for m in meta)
        expected=[c['name'] for c in actor['identity']['environments'][0]['identity']['channels']]
        assert all([c['name'] for c in m['identity']['channels']]==expected for m in meta),'actor channel order differs'
        counters=[0]*options.workers
        for start in range(0,len(group),options.workers):
            batch=group[start:start+options.workers];batch+= [None]*(options.workers-len(batch))
            rows=call('reset',batch);active=[r is not None and r['result']['fell'] for r in rows]
            histories=[[] for _ in batch];recipes=[r['recipe'] if r else None for r in rows]
            attempts=[r['attempts'] if r else None for r in rows]
            for i,r in enumerate(rows):
                if r is None:continue
                counters[i]=r['totalSteps']
                if not active[i]:records.append({'case':batch[i],'attempts':attempts[i],'identity':meta[i]['identity'],'result':r['result'],'preventedFall':True})
            while any(active):
                selected=[(act(r['observation']) if options.inference=='numpy' else {}) if active[i] else None for i,r in enumerate(rows)]
                stepped=call('step' if options.inference=='numpy' else 'policyStep',selected)
                for i,r in enumerate(stepped):
                    if r is None:continue
                    rows[i]=r;counters[i]=r['totalSteps']
                    if r['episodeSteps']%120==0:histories[i].append({'time':r['result']['elapsed'],'reward':r['reward'],'components':r['components']})
                    if r['terminated'] or r['truncated']:
                        active[i]=False;record={'case':batch[i],'executedRecipe':recipes[i],'attempts':attempts[i],'identity':meta[i]['identity'],'result':r['result'],'assistance':r['assistance'],'history':histories[i]};records.append(record)
                        output.write_text(json.dumps({'partition':options.partition,'actor':options.actor,'records':records,'physicalSteps':total_steps+sum(counters),'wallSeconds':time.monotonic()-started},indent=2))
                        print(json.dumps({'case':batch[i],'result':r['result']}),flush=True)
        total_steps+=sum(counters)
        output.write_text(json.dumps({'partition':options.partition,'actor':options.actor,'records':records,'physicalSteps':total_steps,'wallSeconds':time.monotonic()-started},indent=2))
    finally:
        server.stdin.close()
        try:server.wait(timeout=20)
        except subprocess.TimeoutExpired:server.terminate();server.wait(timeout=20)
