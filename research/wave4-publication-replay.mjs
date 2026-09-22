/** Reproduce every admission bout after the scoped-policy picker integration. No reselection. */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './fingerprint.mjs';
import { atomicJson, lockRun } from './runner.mjs';
import { stable, digest } from './schedule.mjs';
import { labFingerprint, snapshotSources } from './lab/experiments.mjs';
import { AUTHORIZATION, remainingAllowance } from './lab/wave4-protocol.mjs';
import { createEnvironment } from './lab/environment.mjs';
import { applicability } from './lab/wave4.mjs';
import { Logger } from '@babylonjs/core/Misc/logger.js';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const directory=join(ROOT,'research/runs/wave4-publication-replay');
const primary=join(ROOT,'research/runs/wave4-2026-09-22-r2');

if (!isMainThread) {
 Logger.LogLevels=Logger.ErrorLogLevel;
 parentPort.on('message',async task=>{
  try {
   const rows=[];
   for(const expected of task.rows){
    const {side,seed,build,opponentBuild,opponentSpec}=expected;
    const env=await createEnvironment({seed:side==='left'?seed:seed^0x123456,
     leftBuild:side==='left'?build:opponentBuild,rightBuild:side==='right'?build:opponentBuild,
     left:side==='left'?task.spec:opponentSpec,right:side==='right'?task.spec:opponentSpec});
    try {
     let state=env.state();
     while(!state.terminated&&!state.truncated&&Date.now()<workerData.deadline) state=env.step();
     if(!state.terminated&&!state.truncated) throw Error('deadline; unfinished pair excluded');
     const result=env.result(),behavior=env.behaviors[side],bins=result.behaviour[side].rangeBins;
     const actual={...expected,applicability:applicability(task.spec,build).status,
      opponentApplicability:applicability(opponentSpec,opponentBuild).status,
      terminated:state.terminated,truncated:state.truncated,seconds:state.clock,winner:state.winner,
      score:state.winner===side?1:state.winner===null?0.5:0,damage:result[side].damage,
      behavior:{attackRate:behavior.attackEdges/state.clock,retreatFraction:behavior.retreatSeconds/state.clock,
       nearFraction:bins[0]/Math.max(1e-9,bins.reduce((a,b)=>a+b,0))}};
     const projected=Object.fromEntries(Object.keys(expected).map(key=>[key,actual[key]]));
     if(stable(projected)!==stable(expected)) throw Error(`source replay differs: ${task.id}/${side}`);
     rows.push(projected);
    } finally {env.close();}
   }
   parentPort.postMessage({id:task.id,rows});
  } catch(error){parentPort.postMessage({error:String(error)});}
 });
} else {
 mkdirSync(directory,{recursive:true});
 const declarationPath=join(directory,'declaration.json');
 if(process.argv[2]==='declare'){
  const confirmation=read(join(primary,'confirmation.json'));
  const matched=read(join(ROOT,'research/runs/wave4-matched-controls/confirmation-summary.json'));
  if(!confirmation.complete||!matched.complete||!matched.studentBeatsMatchedControls) throw Error('confirmation gates incomplete');
  const names=['student-confirmation','student-confirmation-control','student-constant-confirmation',
   ...[0,1,2,3].map(n=>`student-clock-${n}-confirmation`),'ppo-confirmation','ppo-confirmation-control'];
  const datasets=names.map(name=>{
   const path=join(primary,`evaluation-${name}.json`),data=read(path);
   if(!data.complete)throw Error('incomplete input');
   return {name,path,hash:digest(data),spec:data.spec,rows:data.rows};
  });
  for(const name of ['constant','clock']){
   const path=join(ROOT,`research/runs/wave4-matched-controls/${name}-confirmation.json`),data=read(path);
   const spec={kind:'network',model:read(join(ROOT,`research/runs/wave4-matched-controls/${name}.json`))};
   if(!data.complete||data.policyHash!==digest(spec))throw Error('matched control mismatch');
   datasets.push({name:`matched-${name}`,path,hash:digest(data),spec,rows:data.rows});
  }
  const declaration={originalFingerprint:labFingerprint(),source:readFileSync(import.meta.filename,'utf8'),datasets,
   purpose:'Same-seed source equivalence replay, not new independent confirmation. All recorded bout fields must reproduce; no candidate selection or gate changes.'};
  if(existsSync(declarationPath)&&stable(read(declarationPath))!==stable(declaration))throw Error('declaration changed');
  atomicJson(declarationPath,declaration);
  console.log(JSON.stringify({declaredBouts:datasets.reduce((n,d)=>n+d.rows.length,0)}));
 } else if(process.argv[2]==='evaluate'){
  const declaration=read(declarationPath),fingerprint=labFingerprint();
  if(declaration.source!==readFileSync(import.meta.filename,'utf8'))throw Error('replay source changed');
  for(const data of declaration.datasets)if(digest(read(data.path))!==data.hash)throw Error('frozen evidence changed');
  const manifest={fingerprint,originalFingerprint:declaration.originalFingerprint,declarationHash:digest(declaration)};
  const manifestPath=join(directory,'manifest.json');
  if(existsSync(manifestPath)&&stable(read(manifestPath))!==stable(manifest))throw Error('replay source changed');
  atomicJson(manifestPath,manifest);atomicJson(join(directory,'sources.json'),snapshotSources());
  const budgetDir=join(ROOT,'research/runs/wave4-budget'),unlock=lockRun(budgetDir),budgetPath=join(budgetDir,'budget.json');
  const budget=read(budgetPath),started=Date.now();
  if(stable(budget.authorization)!==stable(AUTHORIZATION)){unlock();throw Error('wrong authorization');}
  const deadline=started+remainingAllowance(budget.usedMs,3600000),workers=[];
  const checkpoint=()=>atomicJson(budgetPath,{...budget,usedMs:budget.usedMs+Date.now()-started,
   active:{stage:'publication-replay',pid:process.pid}});
  const timer=setInterval(checkpoint,1000);let status='failed';
  try {
   const completedPath=join(directory,'pairs.json');
   const completed=existsSync(completedPath)?read(completedPath):{};
   const tasks=declaration.datasets.flatMap(data=>{
    const pairs=new Map();
    for(const row of data.rows){const key=JSON.stringify([row.seed,row.build,row.opponentBuild,row.opponent]);if(!pairs.has(key))pairs.set(key,[]);pairs.get(key).push(row);}
    return [...pairs].map(([key,rows])=>{if(rows.length!==2||new Set(rows.map(r=>r.side)).size!==2)throw Error('incomplete source pair');
     return {id:`${data.name}/${key}`,dataset:data.name,spec:data.spec,rows};});
   });
   for(const [id,rows] of Object.entries(completed)){const task=tasks.find(t=>t.id===id);if(!task||stable(rows)!==stable(task.rows))throw Error('saved replay changed');}
   const pending=tasks.filter(t=>!completed[t.id]);let cursor=0;
   await Promise.all(Array.from({length:Math.min(8,pending.length)},()=>new Promise((resolve,reject)=>{
    const worker=new Worker(new URL(import.meta.url),{workerData:{deadline}});workers.push(worker);
    let finished=false;
    const next=()=>{if(cursor>=pending.length){finished=true;resolve();return;}worker.postMessage(pending[cursor++]);};
    worker.on('error',reject);worker.on('exit',code=>{if(!finished)reject(Error(`replay worker exited ${code}`));});
    worker.on('message',message=>{if(message.error){reject(Error(message.error));return;}
     completed[message.id]=message.rows;atomicJson(completedPath,completed);
     if(Object.keys(completed).length%32===0)console.log(JSON.stringify({replayedBouts:Object.keys(completed).length*2,total:tasks.length*2}));next();});
    next();
   })));
   if(labFingerprint()!==fingerprint)throw Error('source changed during replay');
   for(const data of declaration.datasets)atomicJson(join(directory,`${data.name}.json`),{
    spec:data.spec,rows:tasks.filter(t=>t.dataset===data.name).flatMap(t=>completed[t.id]),complete:true,
    provenance:{source:data.path,originalHash:data.hash,originalFingerprint:declaration.originalFingerprint}});
   atomicJson(join(directory,'summary.json'),{...manifest,complete:true,bouts:tasks.length*2,allRecordedFieldsIdentical:true});status='complete';
  } finally {
   await Promise.all(workers.map(worker=>worker.terminate()));clearInterval(timer);budget.usedMs+=Date.now()-started;delete budget.active;
   budget.runs.push({stage:'publication-replay',status,elapsedMs:Date.now()-started});atomicJson(budgetPath,budget);unlock();
  }
 } else throw Error('expected declare or evaluate');
}
