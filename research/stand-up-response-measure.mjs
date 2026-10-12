import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {deserialize} from 'node:v8';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {isMainThread,workerData,parentPort} from 'node:worker_threads';
import {workerPool} from './cma.mjs';
import {responseFeatures} from './stand-up-response-policy.mjs';

const frozen=new URL('../.tools/stand-up-frozen/',import.meta.url);
const {acceptanceEnvironment,frozenRevision}=await import(new URL('research/stand-up-acceptance.mjs',frozen));
const {unassistedAudit,unassistedResult}=await import(new URL('research/stand-up-unassisted.mjs',frozen));
const manifest=JSON.parse(readFileSync(new URL('research/stand-up-acceptance/cases.json',frozen)));
const hash=v=>createHash('sha256').update(v).digest('hex');

async function measuredStand(configuration) {
  const source=deserialize(gunzipSync(readFileSync(configuration.source))),c=manifest.cases[configuration.caseIndex??0],e=await acceptanceEnvironment(c.configuration);
  assert.ok(source.result.success);assert.deepEqual(source.identity,e.identity);
  if(source.configuration?.fall)await e.fall({...c.fall,...source.configuration.fall});
  else {
    const saved=readFileSync(new URL('research/stand-up-acceptance/'+c.file,frozen));assert.equal(hash(saved),c.sha256);
    e.restore(gunzipSync(saved));
  }
  assert.deepEqual(e.observe(),source.initial,'physical preparation reproduces the reference starting state');
  const run=(snapshot,step,channel,offset)=>{
    e.restore(snapshot);const audit=unassistedAudit(e.stand.built,()=>e.stand.world.steps);
    try {
      let features;
      for(let i=0;i<configuration.horizon*(configuration.coast?2:1);i++) {
        const action=structuredClone(source.rows[step+i].action);
        if(i<configuration.horizon&&action.kind==='muscles'&&channel!==null)for(const j of Array.isArray(channel)?channel:[channel]) {
          if(typeof action.velocity[j]==='number')action.velocity[j]+=offset;
        }
        const row=e.step(action,{automaticHandover:true});
        if(i+1===configuration.horizon)features=responseFeatures(row.observation,configuration.rootMotion);
        if(row.result.failure||audit.events.length)break;
      }
      const result=unassistedResult(e.result(),audit.events);
      assert.equal(result.failure,null);assert.equal(result.externalActuation.length,0);assert.ok(result.effortViolation<.0001);
      assert.ok(features?.every(Number.isFinite));
      if(channel===null)assert.deepEqual(features,responseFeatures(source.rows[step+configuration.horizon-1].observation,configuration.rootMotion));
      const coast=configuration.coast?responseFeatures(e.observe(),configuration.rootMotion):undefined;
      if(channel===null&&coast)assert.deepEqual(coast,responseFeatures(source.rows[step+2*configuration.horizon-1].observation,configuration.rootMotion));
      return {features,coast,effortViolation:result.effortViolation};
    }finally{audit.dispose();}
  };
  return {e,source,run,c};
}

if(!isMainThread) {
  const stand=await measuredStand(workerData.configuration),{horizon,delta}=workerData.configuration;
  parentPort.on('message',({id,x})=>{
    try {
      const baseline=stand.run(x.snapshot,x.step,null,0),columns=[],coastColumns=[],diagnostics=[];
      for(let j=0;j<stand.e.channels.length;j++) {
        const plus=stand.run(x.snapshot,x.step,j,delta),minus=stand.run(x.snapshot,x.step,j,-delta);
        const column=plus.features.map((v,k)=>(v-minus.features[k])/(2*delta));columns.push(column);
        if(plus.coast)coastColumns.push(plus.coast.map((v,k)=>(v-minus.coast[k])/(2*delta)));
        diagnostics.push({response:Math.sqrt(column.reduce((s,v)=>s+v*v,0)),
          curvature:Math.sqrt(plus.features.reduce((s,v,k)=>s+(v+minus.features[k]-2*baseline.features[k])**2,0)),
          effortViolation:Math.max(plus.effortViolation,minus.effortViolation)});
      }
      const first=Math.floor(x.step/workerData.configuration.stride)%stand.e.channels.length;
      const channels=[first,(first+1)%stand.e.channels.length],offset=delta/2;
      const measured=stand.run(x.snapshot,x.step,channels,offset).features.map((v,i)=>v-baseline.features[i]);
      const predicted=baseline.features.map((_,i)=>channels.reduce((sum,j)=>sum+offset*columns[j][i],0));
      const norm=v=>Math.sqrt(v.reduce((s,x)=>s+x*x,0));
      const validation={channels,offset,measured,predicted,relativeError:norm(predicted.map((v,i)=>v-measured[i]))/Math.max(1e-12,norm(measured))};
      parentPort.postMessage({id,r:{step:x.step,columns,...(coastColumns.length?{coastColumns}:{}),diagnostics,validation,
        steps:(2+2*stand.e.channels.length)*horizon*(workerData.configuration.coast?2:1)}});
    }catch(error){parentPort.postMessage({id,r:{step:x.step,error:String(error.stack)}});}
  });
}else {
  const {values:v}=parseArgs({options:Object.fromEntries(['source','reference','out','horizon','stride','delta','wall','root-motion','coast','case'].map(k=>[k,{type:'string'}]))});
  assert.ok(v.source&&v.reference&&v.out);
  const configuration={source:resolve(v.source),caseIndex:Number(v.case??0),horizon:Number(v.horizon??12),stride:Number(v.stride??12),delta:Number(v.delta??4),rootMotion:v['root-motion']==='yes',coast:v.coast==='yes'};
  assert.ok(Number.isSafeInteger(configuration.caseIndex)&&manifest.cases[configuration.caseIndex]);
  assert.ok(Number.isSafeInteger(configuration.horizon)&&configuration.horizon>0&&Number.isSafeInteger(configuration.stride)&&configuration.stride>0&&configuration.delta>0);
  mkdirSync(dirname(resolve(v.out)),{recursive:true});const revision=frozenRevision(),begun=Date.now(),deadline=begun+Number(v.wall??300)*1000;
  const reference=JSON.parse(gunzipSync(readFileSync(v.reference))),stand=await measuredStand(configuration),samples=[];
  assert.equal(reference.sourcePhysicalTraceSha256,stand.source.traceSha256,'the reference and measured trace describe the same physical trajectory');
  assert.deepEqual(reference.identity,stand.source.identity);
  if(configuration.rootMotion)reference.frames.forEach((f,i)=>f.rootMotion=responseFeatures(i?stand.source.rows[i-1].observation:stand.source.initial,true).slice(-6));
  const pool=workerPool(new URL(import.meta.url),{configuration},3);
  let cursor=0,steps=0;
  try {
    for(let start=0;start<reference.release&&Date.now()<deadline;start+=3*configuration.stride) {
      const jobs=[];
      for(let slot=0;slot<3;slot++) {
        const step=start+slot*configuration.stride;if(step>=reference.release)break;
        while(cursor<step) {
          const row=stand.e.step(stand.source.rows[cursor].action,{automaticHandover:true});
          assert.deepEqual(row.observation,stand.source.rows[cursor].observation);cursor++;
        }
        jobs.push(pool.evaluate({step,snapshot:stand.e.save()}));
      }
      for(const result of await Promise.all(jobs)) {
        assert.ok(!result.error,result.error);samples.push(result);steps+=result.steps;
        appendFileSync(v.out+'.jsonl',JSON.stringify(result)+'\n');
      }
      writeFileSync(v.out+'.progress.json',JSON.stringify({samples:samples.length,last:samples.at(-1).step,steps,wallSeconds:(Date.now()-begun)/1000}));
      console.log(JSON.stringify({samples:samples.length,last:samples.at(-1).step,steps}));
    }
    const complete=samples.length===Math.ceil(reference.release/configuration.stride);
    const report={revision,configuration,case:stand.c.id,fall:stand.source.configuration?.fall??null,
      checkpointSha256:stand.source.configuration?.fall?null:stand.c.sha256,initialObservationSha256:hash(JSON.stringify(stand.source.initial)),
      complete,steps,wallSeconds:(Date.now()-begun)/1000,sourcePhysicalTraceSha256:stand.source.traceSha256,
      sourceSha256:hash(readFileSync(v.source)),referenceSha256:hash(readFileSync(v.reference)),
      sources:Object.fromEntries(['stand-up-response-measure.mjs','stand-up-response-policy.mjs'].map(n=>[n,hash(readFileSync(new URL(n,import.meta.url)))])),
      samples:samples.map(({columns,coastColumns,...r})=>r)};
    writeFileSync(v.out+'.json',JSON.stringify(report,null,2)+'\n');
    if(complete)writeFileSync(v.out+'.json.gz',gzipSync(JSON.stringify({...reference,responseMeasurement:report,responses:samples.map(({step,columns,coastColumns})=>({step,columns,coastColumns}))})));
    console.log(JSON.stringify({complete,samples:samples.length,steps,wallSeconds:report.wallSeconds}));
  }finally{await pool.terminate();stand.e.dispose();}
}
