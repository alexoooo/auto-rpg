import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {punchCalibration,coarseForces} from './punch-calibration.mjs';
import {frontKickCalibration} from './front-kicks.mjs';
import {combatFingerprint} from './arena-combat.mjs';
import {PLANTED_PUNCH_EXECUTION} from '../src/core/skills/combat.ts';
import {ARENA_KICKS} from '../src/core/mind/config.ts';

/** Primary studies and incompatible protocols: docs/reference/trained-attack-force.md. */
export const TRAINED_ATTACKS=Object.freeze({
 punch:Object.freeze({source:'https://doi.org/10.3390/sports12080205',table:1,
  population:'16 male military cadets; three years of close combat lessons',trials:3,
  peakForce:2501,peakForceSD:625,impulse:17.2,impulseSD:3.5,duration:.0173,durationSD:.0042,
  peakWindow:.002,samplingHz:1000,aggregation:'mean of trials',target:'head height',axes:'three-axis resultant'}),
 kick:Object.freeze({source:'https://doi.org/10.1093/milmed/usaa542',table:1,condition:'sub-elite, no load, bare feet',
  trials:6,peakForce:5551,peakForceSD:1243,impulse:153.5,impulseSD:29.5,drivenSpeed:7.1,drivenSpeedSD:.92,
  peakWindow:.002,samplingHz:1000,cameraHz:200,aggregation:'all six trials',target:'abdomen or solar plexus',axes:'three-axis resultant'})
});

/** Engineering acceptance settings, not anatomy or a claim that the apparatus matches a human study. */
export const FORCE_PROTOCOL=Object.freeze({rates:Object.freeze([120,480,960,1920]),trials:3,
 commonHz:120,window:.002,convergence:.1,boundRelativeTolerance:1e-5,
 punchSeconds:8,kickSeconds:24});

const average=values=>values.length?values.reduce((sum,v)=>sum+v,0)/values.length:null;
const statistics=values=>{const mean=average(values);return {count:values.length,mean,
 sd:values.length>1?Math.sqrt(values.reduce((s,v)=>s+(v-mean)*(v-mean),0)/(values.length-1)):null};};

/** Exact integration of a piecewise-constant waveform over every candidate sliding window. */
export function slidingPeak(samples,hz,seconds=FORCE_PROTOCOL.window) {
 if(!(hz>0)||!(seconds>0)||!Number.isFinite(hz)||!Number.isFinite(seconds))throw new Error('invalid force window');
 if(1/hz>seconds)return null;
 if(!samples.length)return null;
 const values=new Map(samples.map(s=>[Math.round(s.time*hz),s.impulse*hz]));
 const first=Math.min(...values.keys()),last=Math.max(...values.keys()),edges=[];
 for(let step=first-1;step<=last;step++)edges.push(step/hz,step/hz-seconds);
 let peak=0;
 for(const start of edges) {
  let integral=0;
  for(let step=Math.floor(start*hz)+1;step<=Math.ceil((start+seconds)*hz);step++) {
   const overlap=Math.max(0,Math.min(start+seconds,step/hz)-Math.max(start,(step-1)/hz));
   integral+=(values.get(step)??0)*overlap;
  }
  peak=Math.max(peak,integral/seconds);
 }
 return peak;
}

/** First clean trials remain in clock order; an impressive later peak cannot replace a weak trial. */
export function forceSummary(result,kind) {
 const events=result.impacts.filter(e=>e.eligible&&!e.preImpact.down).slice(0,FORCE_PROTOCOL.trials),hz=result.harness.hz;
 const force120=events.map(e=>Math.max(0,...coarseForces(e.samples,hz,FORCE_PROTOCOL.commonHz).map(s=>s.force)));
 const peaks=events.map(e=>slidingPeak(e.samples,hz));
 const returned=kind==='punch'?result.cycles.returned[result.config.hand]:result.report.returned[result.config.foot];
 const faults=[...result.qualification.faults];
 if(events.length<FORCE_PROTOCOL.trials)faults.push('fewer than three clean force trials');
 if(!result.effort||result.effort.motor.relativeExcess>FORCE_PROTOCOL.boundRelativeTolerance)faults.push('motor bound exceeded');
 if(!result.effort||result.effort.anatomy.relativeExcess>FORCE_PROTOCOL.boundRelativeTolerance)faults.push('directional anatomical bound exceeded');
 if(returned<FORCE_PROTOCOL.trials)faults.push('fewer than three verified returns');
 return {kind,limb:kind==='punch'?result.config.hand:result.config.foot,hz,actuation:result.harness.actuation,
  family:kind==='punch'?result.config.family:'front',target:result.target,trials:events.map(e=>({launch:e.launch,time:e.time,
   impulse:e.impulse,force120:Math.max(0,...e.waveform120.map(s=>s.force)),peak2ms:slidingPeak(e.samples,hz)})),
  impulse:statistics(events.map(e=>e.impulse)),force120:statistics(force120),
  peak2ms:peaks.every(v=>v!==null)?statistics(peaks):{count:0,mean:null,sd:null},
  stability:result.qualification,effort:result.effort,returned,accepted:faults.length===0,faults,
  protocolMatch:false,protocolDifferences:['normal-only compliant moving pad; study uses a fixed three-axis plate',
   'uncalibrated compliance and no study signal filter',...(kind==='kick'?['low shin kick; study uses a midsection front kick',
    'three-trial engineering screen; study analyzes six kicks']:[])]};
}

/** Convergence requires every required rate and both successive fine-rate comparisons for each limb. */
export function forceAdmission(rows,kind,actuation,family=kind==='punch'?'straight':'front') {
 const selected=rows.filter(r=>r.kind===kind&&r.summary.actuation===actuation&&r.summary.family===family),limbs={};
 for(const limb of ['left','right']) {
  const cells=selected.filter(r=>r.summary.limb===limb).map(r=>r.summary),faults=[];
  for(const hz of FORCE_PROTOCOL.rates)if(cells.filter(c=>c.hz===hz).length!==1)faults.push(`missing or duplicate ${hz} Hz cell`);
  if(cells.some(c=>!c.accepted))faults.push('failed physical or directional-bound qualification');
  const changes=[];
  for(const [lo,hi] of [[480,960],[960,1920]]) {
   const a=cells.find(c=>c.hz===lo),b=cells.find(c=>c.hz===hi);
   for(const metric of ['impulse','force120']) {
    const av=a?.[metric].mean,bv=b?.[metric].mean,relative=av>0&&bv>0?Math.abs(bv-av)/Math.max(av,bv):null;
    changes.push({lo,hi,metric,relative});if(relative===null||relative>FORCE_PROTOCOL.convergence)faults.push(`${metric} does not converge at ${lo}/${hi}`);
   }
  }
  const peakLo=cells.find(c=>c.hz===960)?.peak2ms.mean,peakHi=cells.find(c=>c.hz===1920)?.peak2ms.mean;
  const peakChange=peakLo>0&&peakHi>0?Math.abs(peakHi-peakLo)/Math.max(peakHi,peakLo):null;
  changes.push({lo:960,hi:1920,metric:'peak2ms',relative:peakChange});
  if(peakChange===null||peakChange>FORCE_PROTOCOL.convergence)faults.push('2 ms peak does not converge at 960/1920');
  const fine=cells.find(c=>c.hz===1920),human=TRAINED_ATTACKS[kind];
  const reachesReference=!!fine&&fine.impulse.mean>=human.impulse-human.impulseSD
    &&fine.peak2ms.mean>=human.peakForce-human.peakForceSD;
  limbs[limb]={qualified:faults.length===0,faults,changes,reachesReference,
   parity:faults.length===0&&reachesReference&&cells.every(c=>c.protocolMatch)};
 }
 return {kind,actuation,family,limbs,qualified:Object.values(limbs).every(l=>l.qualified),parity:Object.values(limbs).every(l=>l.parity)};
}

async function measure(job) {
 const result=job.kind==='punch'?await punchCalibration({hand:job.limb,family:job.family,hz:job.hz,actuation:job.actuation,
  seconds:FORCE_PROTOCOL.punchSeconds,armExtension:.5,execution:PLANTED_PUNCH_EXECUTION,matchedFeedback:true,
  paths:{elbowExtension:.5},pad:{face:'compliant'}}):await frontKickCalibration({foot:job.limb,hz:job.hz,
   seconds:FORCE_PROTOCOL.kickSeconds,actuation:job.actuation,tuning:ARENA_KICKS});
 return {...job,result,summary:forceSummary(result,job.kind)};
}

/** A finite, reproducible battery of actual bodies, with rejected cells and full waveforms retained. */
export async function calibrateAttackForce({workers=2}={}) {
 if(!Number.isInteger(workers)||workers<1||workers>4)throw new Error('attack force requires one to four workers');
 const fingerprint=combatFingerprint(),jobs=[],rows=[];
 for(const actuation of ['symmetric','directional'])for(const kind of ['punch','kick'])for(const family of kind==='punch'?['straight','cross']:['front'])
  for(const hz of FORCE_PROTOCOL.rates)for(const limb of ['left','right'])jobs.push({kind,family,hz,limb,actuation});
 const pool=Array.from({length:workers},()=>new Worker(new URL(import.meta.url),{workerData:{entry:import.meta.url}}));let index=0;
 try {
  await Promise.all(pool.map(worker=>new Promise((resolve,reject)=>{
   worker.on('error',reject);worker.on('exit',code=>{if(code!==0)reject(new Error(`force worker exited ${code}`));});
   const next=()=>{if(index===jobs.length)return resolve();const id=index++,job=jobs[id];
    worker.once('message',row=>{if(row.error)return reject(new Error(row.error));rows.push({...row,id});
     process.stderr.write(`${row.kind}/${row.family}/${row.limb}/${row.hz}/${row.actuation}: ${JSON.stringify({accepted:row.summary.accepted,impulse:row.summary.impulse.mean,faults:row.summary.faults})}\n`);next();});
    worker.postMessage(job);};next();
  })));
 }finally{await Promise.all(pool.map(w=>w.terminate()));}
 if(combatFingerprint()!==fingerprint)throw new Error('source changed during attack force calibration');
 rows.sort((a,b)=>a.id-b.id);
 const admissions=[];
 for(const law of ['symmetric','directional'])for(const kind of ['punch','kick'])for(const family of kind==='punch'?['straight','cross']:['front'])
  admissions.push(forceAdmission(rows,kind,law,family));
 return {version:1,fingerprint,human:TRAINED_ATTACKS,protocol:FORCE_PROTOCOL,rows,admissions,parity:admissions.every(a=>a.parity)};
}

// Only a worker started for this module answers: a module that imports this one runs this line in its own workers.
if(!isMainThread&&workerData?.entry===import.meta.url)parentPort.on('message',async job=>{try{parentPort.postMessage(await measure(job));}catch(e){parentPort.postMessage({error:e.stack});}});
else if(isMainThread&&process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const record=await calibrateAttackForce();writeFileSync(process.argv[2]??'docs/reference/attack-force.json.gz',gzipSync(JSON.stringify(record)));
 console.log(JSON.stringify({parity:record.parity,admissions:record.admissions}));
}
