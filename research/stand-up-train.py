"""Train the local published SAC implementation against persistent Rapier workers."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
import numpy as np
import torch

parser=argparse.ArgumentParser()
parser.add_argument('--reference',default='.tools/get-up-reference')
parser.add_argument('--config',default='research/runs/get-up-learning/train-config.json')
parser.add_argument('--output',default='research/runs/get-up-learning/train-120')
parser.add_argument('--transitions',type=int,default=100000)
parser.add_argument('--wall-seconds',type=float,default=1800)
parser.add_argument('--step-limit',type=int,default=2000000)
parser.add_argument('--workers',type=int,default=3)
parser.add_argument('--warmup',type=int,default=10000)
parser.add_argument('--batch',type=int,default=256)
parser.add_argument('--hidden',type=int,default=1024)
parser.add_argument('--resume',action='store_true')
parser.add_argument('--warm-start',help='Load learned networks into a new, explicitly identified experiment; replay and optimizer restart.')
options=parser.parse_args()
output=Path(options.output).resolve(); output.mkdir(parents=True,exist_ok=True)
config=json.loads(Path(options.config).read_text())
sys.path.insert(0,str(Path(options.reference).resolve()))
from SAC import SAC
from main import ArgParserTrain
from utils import ReplayBuffer

torch.set_num_threads(2)
np.random.seed(config.get('seed',1));torch.manual_seed(config.get('seed',1))
server=subprocess.Popen(['node','research/stand-up-learning-server.mjs',options.config,str(options.workers)],
    stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(output/'worker.log').open('w'),text=True,bufsize=1)
def receive():
    line=server.stdout.readline()
    if not line: raise RuntimeError('Rapier server exited; inspect worker.log')
    result=json.loads(line)
    if 'error' in result: raise RuntimeError(result['error'])
    return result
def call(op,values):
    server.stdin.write(json.dumps({'op':op,'values':values})+'\n');server.stdin.flush()
    return receive()['results']

started=time.monotonic();last_checkpoint=started;last_log=started
try:
    metadata=receive()['ready'];obs=metadata[0]['observationSize'];actions=metadata[0]['actionSize']
    assert all(x['observationSize']==obs and x['actionSize']==actions for x in metadata)
    args=ArgParserTrain().parse_args([]);args.seed=config.get('seed',1);args.batch_size=options.batch
    # A bounded architecture ablation preserves the upstream actor/critic and update equations.
    linear=torch.nn.Linear
    if options.hidden!=1024:
        def sized(a,b,*args,**kwargs):
            return linear(options.hidden if a==1024 else a,options.hidden if b==1024 else b,*args,**kwargs)
        torch.nn.Linear=sized
    try:
        policy=SAC(obs,actions,discount=config.get('discount',.97),actor_lr=1e-5,args=args)
    finally: torch.nn.Linear=linear
    replay=ReplayBuffer(obs,actions,args,max_size=200000)
    completed=0;episodes=0;physical_steps=0;elapsed_before=0;recent=[]
    timing={key:0 for key in ['action','rollout','reset','update','checkpoint']}
    identity={'configuration':config,'workers':options.workers,'hidden':options.hidden,'batch':options.batch,
        'observations':obs,'actions':actions,'environments':metadata,
        'upstream':subprocess.check_output(['git','-C',options.reference,'rev-parse','HEAD'],text=True).strip(),
        'adapterSha256':hashlib.sha256(Path('research/stand-up-learning-environment.mjs').read_bytes()).hexdigest()}
    if not options.resume:
        (output/'source.patch').write_bytes(subprocess.check_output(['git','diff','HEAD','--binary']))
        (output/'source-commit.txt').write_text(subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()+'\n')
        for name in subprocess.check_output(['git','ls-files','--others','--exclude-standard'],text=True).splitlines():
            source=Path(name)
            if source.is_file():
                target=output/'source-untracked'/source;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(source.read_bytes())
    if options.warm_start:
        assert not options.resume,'resume and warm-start are distinct operations'
        parent=torch.load(options.warm_start,map_location='cpu',weights_only=False)
        policy.actor.load_state_dict(parent['actor']);policy.critic.load_state_dict(parent['critic']);policy.critic_target.load_state_dict(parent['target'])
        identity['parent']={'path':options.warm_start,'sha256':hashlib.sha256(Path(options.warm_start).read_bytes()).hexdigest(),
            'transitions':parent['transitions'],'physicalSteps':parent['physicalSteps']}
    checkpoint_file=output/'training.pt'
    if options.resume:
        saved=torch.load(checkpoint_file,map_location='cpu',weights_only=False)
        if 'parent' in saved['identity']:identity['parent']=saved['identity']['parent']
        assert saved['identity']==identity,'training resume configuration/source changed'
        policy.actor.load_state_dict(saved['actor']);policy.critic.load_state_dict(saved['critic']);policy.critic_target.load_state_dict(saved['target'])
        policy.actor_optimizer.load_state_dict(saved['actorOptimizer']);policy.critic_optimizer.load_state_dict(saved['criticOptimizer'])
        policy.log_alpha.data.copy_(saved['logAlpha']);policy.log_alpha_optimizer.load_state_dict(saved['alphaOptimizer']);policy.total_it=saved['updates']
        for key,value in saved['replay'].items():
            if isinstance(value,np.ndarray):getattr(replay,key)[:len(value)]=value
            else:setattr(replay,key,value)
        np.random.set_state(saved['numpyRandom']);torch.set_rng_state(saved['torchRandom'])
        if torch.cuda.is_available() and saved.get('cudaRandom') is not None:torch.cuda.set_rng_state_all(saved['cudaRandom'])
        call('restore',saved['worlds']);states=saved['observations'];completed=saved['transitions'];episodes=saved['episodes']
        physical_steps=saved['physicalSteps'];elapsed_before=saved['wallSeconds']
    else:
        reset=call('reset',[{} for _ in metadata]);states=[r['observation'] for r in reset];physical_steps=sum(r['totalSteps'] for r in reset)
    def persist():
        checkpoint_started=time.monotonic()
        worlds=call('save',[{} for _ in metadata])
        saved={'identity':identity,'actor':policy.actor.state_dict(),'critic':policy.critic.state_dict(),'target':policy.critic_target.state_dict(),
            'actorOptimizer':policy.actor_optimizer.state_dict(),'criticOptimizer':policy.critic_optimizer.state_dict(),
            'logAlpha':policy.log_alpha.detach(),'alphaOptimizer':policy.log_alpha_optimizer.state_dict(),'updates':policy.total_it,
            'replay':{k:(getattr(replay,k)[:replay.size] if isinstance(getattr(replay,k),np.ndarray) else getattr(replay,k)) for k in ['state','action','next_state','reward','not_done','ptr','size']},
            'numpyRandom':np.random.get_state(),'torchRandom':torch.get_rng_state(),
            'cudaRandom':torch.cuda.get_rng_state_all() if torch.cuda.is_available() else None,'worlds':worlds,'observations':states,
            'transitions':completed,'episodes':episodes,'physicalSteps':physical_steps,'wallSeconds':elapsed_before+time.monotonic()-started}
        temporary=output/'training.tmp.pt';torch.save(saved,temporary);temporary.replace(checkpoint_file)
        layers=[]
        for layer in policy.actor.trunk:
            if isinstance(layer,linear):layers.append({'weights':layer.weight.detach().cpu().tolist(),'bias':layer.bias.detach().cpu().tolist()})
        actor_path=output/'actor.tmp.json'
        actor_path.write_text(json.dumps({'version':1,'identity':identity,'layers':layers,'actions':actions,'activation':'relu-tanh','transitions':completed}))
        actor_path.replace(output/'actor.json')
        timing['checkpoint']+=time.monotonic()-checkpoint_started
    while completed<options.transitions and elapsed_before+time.monotonic()-started<options.wall_seconds and physical_steps+options.workers*(9000+config.get('actionRepeat',3))<options.step_limit:
        part=time.monotonic()
        selected=[(np.random.uniform(-1,1,actions) if completed<options.warmup else policy.sample_action(np.asarray(s))).tolist() for s in states]
        timing['action']+=time.monotonic()-part;part=time.monotonic()
        rows=call('step',selected);timing['rollout']+=time.monotonic()-part
        reset_values=[]
        for i,row in enumerate(rows):
            replay.add(np.asarray(states[i]),np.asarray(selected[i]),np.asarray(row['observation']),row['reward'],row['terminated'])
            states[i]=row['observation'];completed+=1
            done=row['terminated'] or row['truncated'];reset_values.append({} if done else None)
            if done:
                episodes+=1;record={'episode':episodes,'return':row['returnValue'],'result':row['result'],'physicalSteps':row['totalSteps']}
                recent.append(record)
                with (output/'episodes.jsonl').open('a') as log:log.write(json.dumps(record)+'\n')
        physical_steps=sum(r['totalSteps'] for r in rows)
        if any(v is not None for v in reset_values):
            part=time.monotonic();reset=call('reset',reset_values);timing['reset']+=time.monotonic()-part
            for i,r in enumerate(reset):
                if r is not None:states[i]=r['observation'];rows[i]=r
            physical_steps=sum(r['totalSteps'] for r in rows)
        if completed>=options.warmup and replay.size>=options.batch:
            part=time.monotonic();policy.train(replay,options.batch);timing['update']+=time.monotonic()-part
        if time.monotonic()-last_log>=15:
            record={'transitions':completed,'updates':policy.total_it,'physicalSteps':physical_steps,'episodes':episodes,
                'wallSeconds':elapsed_before+time.monotonic()-started,'recent':recent[-6:],'timing':timing,
                'criticLoss':policy.loss_dict['critic'][-1] if policy.loss_dict['critic'] else None}
            with (output/'progress.jsonl').open('a') as log:log.write(json.dumps(record)+'\n')
            print(json.dumps(record),flush=True);policy.reset_record();last_log=time.monotonic()
        if time.monotonic()-last_checkpoint>=60:persist();last_checkpoint=time.monotonic()
    persist()
    print(json.dumps({'transitions':completed,'updates':policy.total_it,'physicalSteps':physical_steps,'wallSeconds':elapsed_before+time.monotonic()-started,'checkpoint':str(checkpoint_file)}),flush=True)
finally:
    if server.poll() is None:
        server.stdin.close()
        try:server.wait(timeout=20)
        except subprocess.TimeoutExpired:server.terminate();server.wait(timeout=20)
