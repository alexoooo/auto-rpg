import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { combatRating } from './arena-combat.mjs';

/** A checkpoint retains the entire frozen job manifest; a failed simulation never scores. */
export function combatCheckpoint(jobs, fingerprint, previous = null) {
 if(!Array.isArray(jobs)||!jobs.length||jobs.some(j=>!j?.config||typeof j.id!=='string'||!j.id))throw new Error('combat checkpoint needs a physical job manifest');
 if(new Set(jobs.map(j=>j.id)).size!==jobs.length)throw new Error('duplicate combat job id');
 if(typeof fingerprint!=='string'||!fingerprint)throw new Error('combat checkpoint needs a source fingerprint');
 if(previous){
  if(previous.version!==2||previous.fingerprint!==fingerprint)throw new Error('checkpoint version or source fingerprint differs');
  if(!isDeepStrictEqual(previous.jobs,jobs))throw new Error('checkpoint job manifest differs');
  if(!Array.isArray(previous.rows)||!Array.isArray(previous.failures)||!Number.isFinite(previous.secondsElapsed)||previous.secondsElapsed<0)throw new Error('invalid combat checkpoint');
 }
 const record={version:2,fingerprint,jobs:structuredClone(jobs),rows:[],failures:structuredClone(previous?.failures??[]),complete:false,secondsElapsed:previous?.secondsElapsed??0};
 for(const failure of record.failures){
  const job=jobs.find(j=>j.id===failure?.id),{result,error,...metadata}=failure;
  if(!job||typeof error!=='string'||result||!isDeepStrictEqual(metadata,job))throw new Error('invalid failed trial history');
 }
 for(const row of previous?.rows??[])appendCombatRow(record,row);
 record.complete=record.rows.length===jobs.length;
 if(previous?.complete&&!record.complete)throw new Error('complete checkpoint is missing physical results');
 return record;
}

/** Accept only the assigned job's whole record, including its actual trial configuration. */
export function appendCombatRow(record, row) {
 const job=record.jobs.find(j=>j.id===row?.id);
 if(!job)throw new Error('unexpected combat job result');
 const {result,error,...metadata}=row;
 if(!isDeepStrictEqual(metadata,job))throw new Error('combat result job metadata differs');
 if(record.rows.some(r=>r.id===row.id))throw new Error('duplicate combat result');
 if(error){if(typeof error!=='string'||result)throw new Error('invalid failed trial');record.failures.push(structuredClone(row));return;}
 if(!result||!isDeepStrictEqual(result.config,job.config)||!result.verdict||!result.harness||!result.sides?.left||!result.sides?.right)
  throw new Error('combat result does not contain its physical trial');
 if(!['left','right',null].includes(result.verdict.winner)||!Number.isFinite(result.seconds)||result.seconds<=0)throw new Error('invalid physical outcome');
 record.rows.push(structuredClone(row));
 record.rows.sort((a,b)=>record.jobs.findIndex(j=>j.id===a.id)-record.jobs.findIndex(j=>j.id===b.id));
 record.complete=record.rows.length===record.jobs.length;
}

function canonical(value) {
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}

/** Pairwise ratings retain policy, body, loadout, assist, rule and engine strata. */
export function combatGroups(rows) {
 const groups=new Map();
 for(const row of rows){
  if(!row.candidateSide||!Number.isInteger(row.pair)||row.error)throw new Error('league ratings need successful mirrored candidate jobs');
  const side=row.candidateSide,other=side==='left'?'right':'left',r=row.result,p=r.recipe;
  const descriptor={candidate:row.config[side],opponent:row.config[other],body:p[side],opponentBody:p[other],
   held:p.held?.[side],opponentHeld:p.held?.[other],balance:p.balance?.[side],opponentBalance:p.balance?.[other],
   capSeconds:p.capSeconds,recoverySeconds:p.recoverySeconds,harness:r.harness,protocol:r.protocol};
  const key=JSON.stringify(canonical(descriptor));let group=groups.get(key);
  if(!group){group={id:createHash('sha256').update(key).digest('hex'),descriptor,rows:[]};groups.set(key,group);}
  group.rows.push(row);
 }
 return [...groups.values()].map(group=>{
  const rating=combatRating(group.rows),pairs=new Map();
  const total={seconds:0,driven:0,opposingDriven:0,drivenDamage:0,opposingDrivenDamage:0,falls:0,opposingFalls:0,lowDriven:0};
  for(const row of group.rows){const side=row.candidateSide,other=side==='left'?'right':'left',r=row.result,a=r.sides[side],b=r.sides[other];
   if(![a,b].every(out=>['driven','drivenDamage','falls','lowDriven'].every(k=>Number.isFinite(out[k])&&out[k]>=0)))throw new Error('incomplete physical metrics');
   total.seconds+=r.seconds;for(const field of ['driven','drivenDamage','falls']){total[field]+=a[field];total['opposing'+field[0].toUpperCase()+field.slice(1)]+=b[field];}total.lowDriven+=a.lowDriven;
   const deltas=pairs.get(row.pair)??[];deltas.push((a.drivenDamage-b.drivenDamage)/r.seconds);pairs.set(row.pair,deltas);
  }
  const deltas=[...pairs.values()].map(values=>(values[0]+values[1])/2),mean=deltas.reduce((sum,v)=>sum+v,0)/deltas.length;
  const variance=deltas.length>1?deltas.reduce((sum,v)=>sum+(v-mean)*(v-mean),0)/(deltas.length-1):null;
  const endings={};for(const row of group.rows){const verdict=row.result.verdict,k=verdict.winner===null?'draws':verdict.winner===row.candidateSide?'wins':'losses';const bucket=endings[verdict.ending]??={wins:0,losses:0,draws:0};bucket[k]++;}
  return {id:group.id,descriptor:group.descriptor,rating,endings,total,
   damagePerSecond:total.drivenDamage/total.seconds,opposingDamagePerSecond:total.opposingDrivenDamage/total.seconds,
   pairedDamageDelta:{mean,standardError:variance===null?null:Math.sqrt(variance/deltas.length)}};
 });
}

/** A retained league separates code seasons and counts identical deterministic mirrors once. */
export function combatLeague(runs) {
 const seasons=new Map();let duplicatePairs=0;
 for(const run of runs){
  if(run.complete!==true||typeof run.fingerprint!=='string'||!Array.isArray(run.rows))throw new Error('league needs complete physical runs');
  if(run.version===2)combatCheckpoint(run.jobs,run.fingerprint,run);
  else {const jobs=run.rows.map(({result,error,...job})=>job);combatCheckpoint(jobs,run.fingerprint,{version:2,fingerprint:run.fingerprint,jobs,rows:run.rows,failures:[],secondsElapsed:run.secondsElapsed??0,complete:true});}
  let season=seasons.get(run.fingerprint);if(!season){season={fingerprint:run.fingerprint,rows:[],seen:new Set(),next:0};seasons.set(run.fingerprint,season);}
  const pairs=new Map();for(const row of run.rows){const pair=pairs.get(row.pair)??[];pair.push(row);pairs.set(row.pair,pair);}
  for(const pair of pairs.values()){
   combatRating(pair);
   const keys=pair.map(row=>JSON.stringify(canonical({recipe:row.result.recipe,tape:row.config.tape??[],harness:row.result.harness,protocol:row.result.protocol})));
   const duplicate=keys.map(key=>season.seen.has(key));
   if(duplicate.every(Boolean)){duplicatePairs++;continue;}
   if(duplicate.some(Boolean)||keys[0]===keys[1])throw new Error('partially duplicated mirrored recipe');
   for(let i=0;i<pair.length;i++){season.seen.add(keys[i]);season.rows.push({...pair[i],pair:season.next});}season.next++;
  }
 }
 return {version:1,duplicatePairs,seasons:[...seasons.values()].map(s=>({fingerprint:s.fingerprint,groups:combatGroups(s.rows)}))};
}
