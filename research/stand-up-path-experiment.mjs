import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { deserialize, serialize } from 'node:v8';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { isMainThread, workerData, parentPort } from 'node:worker_threads';
import { pathPolicy } from './stand-up-path-policy.mjs';
import { compactPolicy } from './stand-up-compact-policy.mjs';
import { contactModel } from './stand-up-contact-model.mjs';
import { contactPolicy } from './stand-up-contact-policy.mjs';
import { trackingPolicy } from './stand-up-tracking-policy.mjs';
import { cmaSearch, workerPool } from './cma.mjs';

const frozen = new URL('../.tools/stand-up-frozen/',import.meta.url);
const { acceptanceEnvironment, frozenRevision } = await import(new URL('research/stand-up-acceptance.mjs',frozen));
const { unassistedAudit, unassistedResult } = await import(new URL('research/stand-up-unassisted.mjs',frozen));
const manifest = JSON.parse(readFileSync(new URL('research/stand-up-acceptance/cases.json',frozen)));
const digest = x => createHash('sha256').update(x).digest('hex');
const write = (file,data) => writeFileSync(file,JSON.stringify(data,null,2)+'\n');
const sourceIdentity=()=>Object.fromEntries(['stand-up-path-policy.mjs','stand-up-compact-policy.mjs','stand-up-path-experiment.mjs','stand-up-contact-model.mjs','stand-up-contact-policy.mjs','stand-up-detached-dynamics.mjs','stand-up-tracking-policy.mjs']
  .map(name=>[name,digest(readFileSync(new URL(name,import.meta.url)))]));

/** Execute only candidate muscle actions from the unchanged complete saved fall. */
async function trial(configuration, { caseIndex=0, seconds=20, capture=false }={}) {
  const c=manifest.cases[caseIndex], e=await acceptanceEnvironment(c.configuration), rows=[], timeline=[];
  const reference=JSON.parse(gunzipSync(readFileSync(configuration.reference)));
  const model=['contact','tracking'].includes(configuration.kind)?contactModel(e):undefined;
  let audit;
  try {
    const saved=readFileSync(new URL(`research/stand-up-acceptance/${c.file}`,frozen));
    assert.equal(digest(saved),c.sha256);
    if(configuration.standing) { /* The standing component does not constitute a recovered fall. */ }
    else if(configuration.fall)await e.fall({...c.fall,...configuration.fall});
    else e.restore(gunzipSync(saved));
    const initial=e.observe(); if(!configuration.fall&&!configuration.standing)assert.equal(digest(JSON.stringify(initial)),c.observationSha256);
    const factory=configuration.kind==='tracking'?trackingPolicy:configuration.kind==='contact'?contactPolicy:configuration.kind==='compact'?compactPolicy:pathPolicy;
    const policy=factory({channels:e.channels,reference,model,parameters:configuration.parameters});
    audit=unassistedAudit(e.stand.built,()=>e.stand.world.steps);
    let steps=0, peakHeight=0, last, quality=0, peakQuality=0;
    const hash=createHash('sha256');
    while(e.result().elapsed<seconds&&steps<seconds*120) {
      const action=steps<(configuration.prefixSteps??0)?reference.frames[steps]:policy(e.observe());
      const row=e.step(action,{automaticHandover:!configuration.standing}); steps++;
      hash.update(JSON.stringify(row.observation)); if(capture)rows.push(row);
      peakHeight=Math.max(peakHeight,row.observation.height);
      if(row.result.elapsed>1) {
        const height=Math.max(0,Math.min(1,row.observation.height)),up=Math.max(0,row.rootUp);
        const feet=['foot.left','foot.right'].filter(n=>row.observation.contacts.some(c=>c.segment===n&&c.fixed!==null&&c.impulse>0)).length;
        const q=height*(.2+.4*up+.2*row.soleUp.reduce((s,v)=>s+Math.max(0,v),0))*(.5+.25*feet);
        quality+=q/120;peakQuality=Math.max(peakQuality,q);
      }
      const marker=Math.floor(row.result.elapsed*2);
      if(marker!==last) {last=marker;timeline.push({seconds:row.result.elapsed,phase:policy.state.phase,
        height:row.observation.height,rootUp:row.rootUp,soleUp:row.soleUp,centre:row.observation.centre,
        feet:row.observation.segments.filter(s=>s.name.startsWith('foot.')).map(s=>({name:s.name,centre:s.centre,
          impulse:row.observation.contacts.filter(c=>c.segment===s.name&&c.fixed!==null).reduce((sum,c)=>sum+c.impulse,0)})),
        loaded:row.observation.contacts.filter(c=>c.fixed!==null&&c.impulse>0).map(c=>c.segment),
        ...(['contact','tracking'].includes(configuration.kind)?{control:structuredClone(policy.state)}:{})});}
      if(row.result.success||row.result.failure||audit.events.length)break;
    }
    const result=unassistedResult(e.result(),audit.events), measured=e.measure();
    if(!result.success&&!result.failure)result.failure='episode deadline';
    const score=result.success ? 100000-1000*result.seconds : -10000+100*quality+100*peakQuality;
    return {configuration,case:c.id,result,steps,score,peakHeight,quality,peakQuality,timeline,
      nonfinite:measured.observation.joints.filter(j=>![j.angle,j.rate,j.speed,j.effort,j.positive,j.negative].every(Number.isFinite)),
      invalidCommands:[...e.body.muscles.activation].map((v,i)=>({name:e.channels[i].name,activation:v,velocity:e.body.muscles.velocity[i]})).filter(c=>!Number.isFinite(c.activation)||Number.isNaN(c.velocity)),
      traceSha256:hash.digest('hex'),
      ...(capture?{initial,rows,identity:e.identity,checkpointSha256:configuration.fall||configuration.standing?null:c.sha256,
        geometry:JSON.parse(JSON.stringify([...e.stand.built.segments.values()].map(s=>({name:s.spec.name,frame:s.frame,
          shapes:s.rigid.shapes,poses:s.poses&&Object.fromEntries(Object.entries(s.poses).map(([name,pose])=>[name,pose.rigid.shapes]))}))))}: {})};
  } finally {audit?.dispose();e.dispose();}
}

if(!isMainThread&&workerData?.pathExperiment) parentPort.on('message',async({id,x})=> {
  try {parentPort.postMessage({id,r:await trial(x,workerData.options)});}
  catch(error){parentPort.postMessage({id,r:{score:-20000,error:String(error.stack)}});}
});
else if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const {values:v}=parseArgs({options:Object.fromEntries(['mode','source','out','config','case','seconds','wall','seed','sigma'].map(k=>[k,{type:'string'}]))});
  assert.ok(v.out);mkdirSync(dirname(resolve(v.out)),{recursive:true});const revision=frozenRevision(),sources=sourceIdentity();
  if(v.mode==='extract') {
    const source=deserialize(gunzipSync(readFileSync(v.source))),e=await acceptanceEnvironment(manifest.cases[0].configuration);
    try {
      const rest=e.stand.built.segments.get('lowerTrunk').rest;
      const {Vector3,Quaternion}=await import('@babylonjs/core/Maths/math.vector.js');
      const rootUp=Vector3.UpReadOnly.applyRotationQuaternionToRef(Quaternion.Inverse(rest),new Vector3()).asArray();
      const rootFront=new Vector3(0,0,1).applyRotationQuaternionToRef(Quaternion.Inverse(rest),new Vector3()).asArray();
      const rootAcross=new Vector3(1,0,0).applyRotationQuaternionToRef(Quaternion.Inverse(rest),new Vector3()).asArray();
      const {RISE}=await import(new URL('src/core/mind/rise/stages.ts',frozen));
      const rotate=(rotation)=>new Vector3(...rootUp).applyRotationQuaternionToRef(new Quaternion(...rotation),new Vector3()).asArray();
      const release=source.rows.findIndex(r=>r.action.kind==='host');
      const frames=source.rows.slice(0,release).map((r,i)=>{const o=i?source.rows[i-1].observation:source.initial;
        return {...r.action,angles:o.joints.map(j=>j.angle),speeds:o.joints.map(j=>j.speed),up:rotate(o.segments.find(s=>s.name==='lowerTrunk').rotation)};});
      const joints=[...e.stand.built.joints.values()].map(j=>({dofs:j.dofs.map(d=>({sign:d.sign}))}));
      writeFileSync(v.out,gzipSync(JSON.stringify({sourceSha256:digest(readFileSync(v.source)),rootUp,rootFront,rootAcross,joints,roll:RISE.roll,release,frames})));
      console.log(JSON.stringify({release,frames:frames.length,output:v.out}));
    } finally {e.dispose();}
  } else {
    const configuration=JSON.parse(readFileSync(v.config)),options={caseIndex:Number(v.case??0),seconds:Number(v.seconds??20)};
    if(v.mode==='record') {
      const r=await trial(configuration,{...options,capture:true});
      writeFileSync(v.out+'.trace.gz',gzipSync(serialize(r)));const {rows,initial,geometry,...report}=r;
      write(v.out+'.json',{revision,sources,...report});console.log(JSON.stringify(report));
    } else if(v.mode==='grid') {
      const pool=workerPool(new URL(import.meta.url),{pathExperiment:true,options},3),results=[];
      try {
        const jobs=configuration.grid.map(({fall,...parameters})=>({...configuration,grid:undefined,
          ...(fall?{fall}:{}),parameters:{...configuration.parameters,...parameters}}));
        await Promise.all(jobs.map(async config=>{const r=await pool.evaluate(config);results.push(r);appendFileSync(v.out+'.jsonl',JSON.stringify(r)+'\n');
          console.log(JSON.stringify({parameters:config.parameters,result:r.result,error:r.error}));}));
      } finally {await pool.terminate();write(v.out+'.json',{revision,sources,results});}
    } else if(v.mode==='search') {
      const pool=workerPool(new URL(import.meta.url),{pathExperiment:true,options},3),begun=Date.now(),deadline=begun+Number(v.wall??600)*1000;
      let steps=0,evaluations=0;
      const fields=configuration.fields,start=fields.map(([name,lo,hi])=>(configuration.parameters[name]-lo)/(hi-lo));
      try {
        const result=await cmaSearch({n:fields.length,start,sigma:Number(v.sigma??.15),lambda:12,generations:10000,seed:Number(v.seed??123),
          score:async u=>{if(Date.now()>=deadline)return {score:-20000,error:'wall limit'};
            const config={...configuration,parameters:{...configuration.parameters,...Object.fromEntries(fields.map(([name,lo,hi],i)=>[name,lo+(hi-lo)*u[i]]))}};
            const r=await pool.evaluate(config);steps+=r.steps??0;evaluations++;appendFileSync(v.out+'.jsonl',JSON.stringify(r)+'\n');return r;},
          onGeneration:(entry,s)=>{write(v.out+'.progress.json',{revision,sources,entry,steps,evaluations,optimizer:s.checkpoint});
            write(v.out+'.best.json',s.best.r);console.log(JSON.stringify({entry,best:s.best.r?.result}));return Date.now()<deadline-20000;}});
        write(v.out+'.summary.json',{revision,sources,steps,evaluations,wallSeconds:(Date.now()-begun)/1000,result});
      }finally{await pool.terminate();}
    } else throw new Error('choose extract, record, grid or search');
  }
}
