import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { serialize, deserialize } from 'node:v8';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { isMainThread, workerData, parentPort } from 'node:worker_threads';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { workerPool } from './cma.mjs';
import { turningToRef } from '../src/core/build/joint-state.ts';
import { recordedPolicy } from './stand-up-rollout-candidate.mjs';

const frozen=new URL('../.tools/stand-up-frozen/',import.meta.url);
const {acceptanceEnvironment,evaluateAcceptanceCase,frozenRevision}=await import(new URL('research/stand-up-acceptance.mjs',frozen));
const {unassistedAudit,unassistedResult}=await import(new URL('research/stand-up-unassisted.mjs',frozen));
const manifest=JSON.parse(readFileSync(new URL('research/stand-up-acceptance/cases.json',frozen)));
const digest=v=>createHash('sha256').update(v).digest('hex');
const write=(file,data)=>writeFileSync(file,JSON.stringify(data,null,2)+'\n');

/** Branches restore complete game states; every simulated continuation uses ordinary muscle actions. */
async function rolloutStand(sourcePath,caseIndex=0,options={}) {
  const source=deserialize(gunzipSync(readFileSync(sourcePath))),c=manifest.cases[caseIndex];
  assert.ok(source.result.success&&Number.isFinite(source.result.seconds),'the reference is a complete recovery');
  const sourceTrace=createHash('sha256');source.rows.forEach(r=>sourceTrace.update(JSON.stringify(r.observation)));
  const sourcePhysicalTraceSha256=sourceTrace.digest('hex');
  const e=await acceptanceEnvironment(c.configuration),bytes=readFileSync(new URL('research/stand-up-acceptance/'+c.file,frozen));
  assert.equal(digest(bytes),c.sha256);const initial=gunzipSync(bytes);e.restore(initial);
  assert.equal(digest(JSON.stringify(e.observe())),c.observationSha256);
  assert.equal(digest(JSON.stringify(source.initial)),c.observationSha256,'the demonstration starts at the selected saved fall');
  const root=e.stand.built.segments.get('lowerTrunk'),inverse=Quaternion.Inverse(root.rest);
  const axis=new Vector3(0,1,0).applyRotationQuaternionToRef(inverse,new Vector3());
  const describe=o=>{
    const q=new Quaternion(...o.segments.find(s=>s.name==='lowerTrunk').rotation),up=axis.applyRotationQuaternionToRef(q,new Vector3());
    const body=o.segments.find(s=>s.name==='lowerTrunk');
    const gravity=new Vector3(0,1,0).applyRotationQuaternionToRef(Quaternion.Inverse(q),new Vector3());
    const loads=o.segments.map(s=>o.contacts.filter(c=>c.segment===s.name&&c.fixed!==null).reduce((sum,c)=>sum+c.impulse,0));
    const total=loads.reduce((sum,v)=>sum+v,0);
    return {angles:o.joints.map(j=>j.angle),speeds:o.joints.map(j=>j.speed),height:o.height,up:up.asArray(),
      gravity:gravity.asArray(),loads:loads.map(v=>total?v/total:0),velocity:body.velocity,spin:body.spin};
  };
  const observations=[source.initial,...source.rows.map(r=>r.observation)],reference=observations.map(describe);
  const last=Math.min(reference.length-1,Math.round(source.result.seconds*120));
  const distance=(a,b)=>4*(a.height-b.height)**2+2*(options.fullOrientation
    ?a.gravity.reduce((s,v,i)=>s+(v-b.gravity[i])**2,0):(a.up[1]-b.up[1])**2)+
    (options.contactWeight??0)*a.loads.reduce((s,v,i)=>s+(v-b.loads[i])**2,0)+
    a.angles.reduce((s,v,i)=>s+(v-b.angles[i])**2/a.angles.length,0)+
    (options.velocityWeight??0)*(a.speeds.reduce((s,v,i)=>s+(v-b.speeds[i])**2/a.speeds.length,0)
      +a.velocity.reduce((s,v,i)=>s+(v-b.velocity[i])**2,0)+a.spin.reduce((s,v,i)=>s+(v-b.spin[i])**2,0));
  const evaluate=(o,phase,span=360)=>{
    const d=describe(o);let best={score:-Infinity,phase};
    for(let i=Math.max(0,Math.floor((phase-120)/6)*6);i<=Math.min(last,phase+span);i+=6) {
      const error=distance(d,reference[i]),score=i/120-(options.penalty??6)*error;
      if(score>best.score)best={score,phase:i,poseError:error};
    }
    return {...best,height:d.height,up:d.up[1]};
  };
  const action=(control,step)=>{
    if(control.kind==='host')return {kind:'host'};
    if(control.kind==='replay')return source.rows[Math.min(source.rows.length-1,Math.round(control.start+step*control.rate))].action;
    if(control.kind==='pose')return {kind:'targets',angles:reference[control.target].angles.map((v,i)=>Math.max(e.channels[i].min,Math.min(e.channels[i].max,v))),
      response:control.response,speed:control.speed,activation:1};
    if(control.kind==='hybrid') {
      const base=source.rows[Math.min(source.rows.length-1,control.start+step)].action;
      if(base.kind!=='muscles')return base;
      const out=structuredClone(base),o=e.observe();let offset=0;
      for(const joint of e.stand.built.joints.values()) {
        const n=joint.dofs.length,angles=o.joints.slice(offset,offset+n).map(j=>j.angle),turning=turningToRef(joint,angles,[]);
        for(let i=0;i<n;i++)if(/^(hip|knee|ankle)\./.test(e.channels[offset+i].name)) {
          out.velocity[offset+i]=turning[i].reduce((sum,v,k)=>sum+v*Math.max(-6,Math.min(6,
            (reference[control.target].angles[offset+k]-angles[k])/control.response)),0);out.activation[offset+i]=1;
        }
        offset+=n;
      }
      return out;
    }
    throw new Error('unknown rollout control');
  };
  const run=(snapshot,control,phase,capture=false)=>{
    e.restore(snapshot);const audit=unassistedAudit(e.stand.built,()=>e.stand.world.steps),rows=[],hash=createHash('sha256');
    let steps=0;
    try {
      for(let i=0;i<control.steps;i++) {
        const row=e.step(action(control,i),{automaticHandover:true});steps++;hash.update(JSON.stringify(row.observation));
        if(capture)rows.push(row);
        if(row.result.success||row.result.failure||audit.events.length)break;
      }
      const result=unassistedResult(e.result(),audit.events),observation=e.observe();
      return {snapshot:e.save(),result,steps,...evaluate(observation,phase),observationSha256:digest(JSON.stringify(observation)),
        traceSha256:hash.digest('hex'),...(capture?{rows}:{})};
    }finally{audit.dispose();}
  };
  return {e,initial,c,source,last,run,evaluate,sourcePhysicalTraceSha256};
}

if(!isMainThread&&workerData?.rolloutSearch) {
  const stand=await rolloutStand(workerData.source,workerData.caseIndex,workerData.options);
  parentPort.on('message',({id,x})=>{
    try{parentPort.postMessage({id,r:stand.run(x.snapshot,x.control,x.phase)});}
    catch(error){parentPort.postMessage({id,r:{error:String(error.stack),score:-Infinity}});}
  });
}else if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const {values:v}=parseArgs({options:Object.fromEntries(['source','out','mode','plan','stage','case','width','block','seconds','wall','penalty','velocity-weight','anchor','orientation','contact-weight'].map(k=>[k,{type:'string'}]))});
  assert.ok(v.source&&v.out);mkdirSync(dirname(resolve(v.out)),{recursive:true});
  const revision=frozenRevision(),sourceSha256=digest(readFileSync(v.source)),codeSha256=digest(readFileSync(new URL(import.meta.url)));
  const options={penalty:Number(v.penalty??6),velocityWeight:Number(v['velocity-weight']??0),
    fullOrientation:v.orientation==='full',contactWeight:Number(v['contact-weight']??0)};
  const stand=await rolloutStand(v.source,Number(v.case??0),options),begun=Date.now();
  try {
    if(v.mode==='verify') {
      const control={kind:'replay',start:0,rate:1,steps:stand.source.rows.length};
      const a=stand.run(stand.initial,control,0,true),b=stand.run(stand.initial,control,0,true);
      assert.deepEqual(a.rows,b.rows);assert.deepEqual(a.rows.map(r=>r.observation),stand.source.rows.map(r=>r.observation));
      const splitAt=Math.floor(control.steps/2),split=stand.run(stand.initial,{...control,steps:splitAt},0);
      stand.run(split.snapshot,{kind:'pose',target:Math.min(900,stand.last),response:.1,speed:6,steps:24},splitAt);
      const tail=stand.run(split.snapshot,{...control,start:splitAt,steps:control.steps-splitAt},splitAt,true);
      assert.deepEqual(tail.rows,a.rows.slice(splitAt));
      write(v.out+'.json',{revision,sourceSha256,codeSha256,steps:a.steps,traceSha256:a.traceSha256,exact:true,result:a.result});
      console.log('exact replay, restore and split continuation verified');
    }else if(v.mode==='record') {
      const book=JSON.parse(readFileSync(v.plan)),plan=v.stage?book.stages[v.stage]:book,rows=[];
      assert.ok(Array.isArray(plan?.plan),'select a recorded plan');
      if(plan.sourcePhysicalTraceSha256)assert.equal(stand.sourcePhysicalTraceSha256,plan.sourcePhysicalTraceSha256);
      let snapshot=stand.initial,phase=0,last;
      for(const control of [...plan.plan,{kind:'host',steps:120*6}]) {
        last=stand.run(snapshot,control,phase,true);rows.push(...last.rows);snapshot=last.snapshot;phase=last.phase;
        if(last.result.success||last.result.failure)break;
      }
      const trace=createHash('sha256');rows.forEach(r=>trace.update(JSON.stringify(r.observation)));
      const record={initial:stand.source.initial,geometry:stand.source.geometry,identity:stand.e.identity,checkpointSha256:stand.c.sha256,
        rows,result:last.result,screenOutcome:last.result.success?'success':last.result.failure??'screen-deadline',
        traceSha256:trace.digest('hex'),revision,sourceSha256,sourcePhysicalTraceSha256:stand.sourcePhysicalTraceSha256,codeSha256,plan:plan.plan};
      const tape={channels:stand.e.channels,initialObservationSha256:stand.c.observationSha256,actions:rows.map(r=>r.action)};
      writeFileSync(v.out+'.actions.json.gz',gzipSync(JSON.stringify(tape)));
      if(record.result.success) {
        const official=await evaluateAcceptanceCase(stand.c,manifest,({channels})=>recordedPolicy({channels,tape}));
        assert.deepEqual(official.result,record.result);assert.equal(official.traceSha256,record.traceSha256);
        record.official=official;
      }
      writeFileSync(v.out+'.trace.gz',gzipSync(serialize(record)));
      const {rows:omit,initial:omitInitial,geometry:omitGeometry,...report}=record;write(v.out+'.json',report);console.log(JSON.stringify(report.result));
    }else if(v.mode==='search') {
      const width=Number(v.width??12),block=Number(v.block??24),seconds=Number(v.seconds??6),deadline=begun+Number(v.wall??600)*1000;
      assert.ok(Number.isInteger(width)&&width>0&&Number.isInteger(block)&&block>0&&Number.isFinite(seconds)&&seconds>0);
      const configuration={width,block,seconds,wall:Number(v.wall??600),anchor:v.anchor==='yes',options};
      const pool=workerPool(new URL(import.meta.url),{rolloutSearch:true,source:resolve(v.source),caseIndex:Number(v.case??0),options},3);
      let beam=[{snapshot:stand.initial,phase:0,score:0,plan:[]}],evaluations=0,steps=0,complete=null,anchor=beam[0];
      try {
        for(let depth=0;depth*block<seconds*120&&Date.now()<deadline;depth++) {
          const jobs=beam.flatMap(parent=>{
            const start=Math.min(stand.last,Math.round(parent.phase)),duration=Math.min(block,seconds*120-depth*block);
            const controls=[1,1.5,2,3].map(rate=>({kind:'replay',start,rate,steps:duration}));
            for(const ahead of [30,60,120,240])for(const response of [.1,.3])controls.push({kind:'pose',target:Math.min(stand.last,start+ahead),response,speed:6,steps:duration});
            for(const ahead of [30,120,240])controls.push({kind:'hybrid',start,target:Math.min(stand.last,start+ahead),response:.2,steps:duration});
            if(parent.height>.5)controls.push({kind:'host',steps:duration});
            return controls.map(control=>({parent,control}));
          });
          const children=await Promise.all(jobs.map(async({parent,control})=>{
            const r=await pool.evaluate({snapshot:parent.snapshot,control,phase:parent.phase});evaluations++;steps+=r.steps??0;
            const {snapshot,...record}=r;appendFileSync(v.out+'.jsonl',JSON.stringify({depth,control,parentPhase:parent.phase,...record})+'\n');
            return {...r,plan:[...parent.plan,control]};
          }));
          const viable=children.filter(r=>!r.error&&!r.result.failure).sort((a,b)=>b.score-a.score),seen=new Set(),buckets=new Map();beam=[];
          for(const child of viable) {
            const bucket=Math.round(child.phase/30);
            if(seen.has(child.observationSha256)||(buckets.get(bucket)??0)>=3)continue;
            seen.add(child.observationSha256);buckets.set(bucket,(buckets.get(bucket)??0)+1);beam.push(child);if(beam.length===width)break;
          }
          if(!beam.length)break;
          if(v.anchor==='yes') {
            const control={kind:'replay',start:depth*block,rate:1,steps:block};
            const next=await pool.evaluate({snapshot:anchor.snapshot,control,phase:depth*block});evaluations++;steps+=next.steps??0;
            assert.ok(!next.error&&!next.result.failure);anchor={...next,phase:(depth+1)*block,plan:[...anchor.plan,control]};
            if(!seen.has(anchor.observationSha256)) {if(beam.length===width)beam.pop();beam.push(anchor);}
          }
          for(const node of beam.filter(n=>n.result.handover!==null || n.height>.85&&n.up>.9)) {
            const control={kind:'host',steps:720};
            const tail=await pool.evaluate({snapshot:node.snapshot,control,phase:node.phase});evaluations++;steps+=tail.steps??0;
            const {snapshot,...record}=tail;
            appendFileSync(v.out+'.jsonl',JSON.stringify({depth,control,parentPhase:node.phase,verification:true,...record})+'\n');
            if(tail.result?.success&&(!complete||tail.result.seconds<complete.result.seconds))complete={...tail,plan:[...node.plan,control]};
          }
          const best=complete??beam[0],{snapshot,...record}=best;
          write(v.out+'.best.json',{revision,sourceSha256,sourcePhysicalTraceSha256:stand.sourcePhysicalTraceSha256,codeSha256,configuration,options,...record,evaluations,steps});
          write(v.out+'.progress.json',{depth,elapsed:(depth+1)*block/120,beam:beam.map(({phase,score,height,up,result})=>({phase,score,height,up,result})),evaluations,steps});
          console.log(JSON.stringify({depth,elapsed:(depth+1)*block/120,phase:best.phase/120,height:best.height,up:best.up,score:best.score,evaluations,steps,success:best.result.success}));
          if(complete?.result.seconds<=6)break;
        }
        write(v.out+'.summary.json',{revision,sourceSha256,codeSha256,configuration,options,evaluations,steps,wallSeconds:(Date.now()-begun)/1000,
          success:complete?.result??null,remaining:beam.map(({snapshot,...r})=>r)});
      }finally{await pool.terminate();}
    }else throw new Error('choose verify, search or record');
  }finally{stand.e.dispose();}
}
