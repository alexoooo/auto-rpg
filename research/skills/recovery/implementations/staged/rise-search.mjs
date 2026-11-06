import { isRefused } from "../../../../../src/core/refusal.ts";
/**
 * Search one body's loadout-specific recovery settings with immutable technique overrides.
 * Each candidate's ground profiles are calibrated before its normal chooser is scored.
 * Node core world, Rapier, 120 Hz, no assists. Fresh falls are reserved for confirmation.
 *
 * node research/skills/recovery/implementations/staged/rise-search.mjs --model workshop-fighter --loadout empty,club --generations 8 --lambda 8 --workers 8 --out research/runs/rise-search/best.json
 * --resume <checkpoint.json> continues a calibrated search; --offsets trains on other directions.
 * Calibration uses the profile writer's offsets; the fresh protocol is excluded from both.
 * Played calibration and scoring rows are kept beside --out as .trials.jsonl on the same build.
 * A pass stops after eight minutes or before another generation projects past ten.
 */
import '../../../../../tests/harness/preload-data.mjs';
import { isMainThread, parentPort } from 'node:worker_threads';
import { parseArgs } from 'node:util';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { cmaSearch, workerPool } from '../../../../cma.mjs';
import { risingJobs, targetGates } from '../../../../../src/evaluation/rising.ts';
import { buildFall } from "../../../../../src/app/node/evaluation.ts";
import { stepUpTuning } from "../../../../../src/skills/recovery/implementations/staged/records.ts";
import { modelHolding } from "../../../../../src/core/bodies/models.ts";
import { MINDS } from "../../../../../src/app/catalog.ts";
import { BUILD_IDENTITY } from '../../../../../scripts/build-identity.mjs';
import { edgeTrial, edgeProfiles } from '../../edge-profile-trial.mjs';

const dimensions = [
  ['fold', .12, .7], ['tuck', .12, .7], ['prop', .1, .7], ['fours', .3, 1.2],
  ['plant knee', 1.9, 2.2], ['plant hip', 1.5, 2.1], ['up hip', .4, .85], ['climb', .35, .85],
];
const initial = (base) => [...['fold','tuck','prop','fours'].map(k => base.stages[k].scale), base.stages.plant.posture?.['knee.left flexion'] ?? 2.05, base.stages.plant.posture?.['hip.left flexion'] ?? 1.9, base.stages.up.posture?.['hip.left flexion'] ?? .6, base.climb];
const decode = (base,u) => {
  const values = u.map((v,i) => +(dimensions[i][1] + Math.max(0,Math.min(1,v)) * (dimensions[i][2]-dimensions[i][1])).toFixed(5));
  const t = structuredClone(base);
  ['fold','tuck','prop','fours'].forEach((k,i) => {t.stages[k].scale = values[i];});
  t.stages.plant.posture = {...t.stages.plant.posture, 'knee.left flexion':values[4], 'knee.right flexion':values[4], 'hip.left flexion':values[5], 'hip.right flexion':values[5]};
  t.stages.up.posture = {...t.stages.up.posture, 'hip.left flexion':values[6], 'hip.right flexion':values[6]};
  t.climb = values[7];
  return t;
};
const staged = new Set(['staged-roll','staged-down','sit-back','front-sit-back']);
const mindOf = tuning => ({...MINDS.option.config, options:MINDS.option.config.options.map(o => staged.has(o.skill?.kind) ? {...o,skill:{...o.skill,tuning}} : o)});

async function trial(job,mind) {
  const b = await buildFall({...job,cap:16,mind},'rapier');
  if (isRefused(b)) throw new Error(b.refused);
  try {
    while (!b.ended) {b.world.step(); b.afterStep();}
    const r=b.reading(), time=r.takeover===null?null:r.stood&&r.verified!==null?r.verified:16;
    return {loadout:job.loadout,degrees:job.degrees,reading:r,time,
      score:time===null?0:time<10?10+(10-time)/10:(16-time)/6};
  } finally {b.dispose();}
}

/** One candidate: its profiles measured first, then its normal chooser scored on those profiles. */
async function candidate({jobs,profileJobs,offsets,tuning}) {
  const template=mindOf(tuning), calibration=[];
  for(const job of profileJobs) calibration.push(await edgeTrial(job,template));
  const profiles=edgeProfiles(calibration.flatMap(row=>row.trials)).map(({label,...profile})=>profile);
  const mind={...template,predictions:{kind:'measured',edges:profiles}}, rows=[];
  for(const job of jobs) rows.push(await trial(job,mind));
  const gates=offsets.map((offset,index)=>({offset,...targetGates(rows.slice(index*16,(index+1)*16).map(row=>({degrees:row.degrees,time:row.time,made:row.reading.takeover!==null})),offset)}));
  const met=gates.every(group=>Object.values(group.gates).every(Boolean));
  // Meeting every target gate outranks a faster record that remains short.
  return {score:rows.reduce((sum,row)=>sum+row.score,0)/rows.length+(met?20:0),met,gates,
    within:rows.filter(row=>row.time!==null&&row.time<10).length,rows,profiles,calibration};
}

if(!isMainThread) {
  parentPort.on('message',async({id,x})=>{
    try {parentPort.postMessage({id,r:await candidate(x)});}
    catch(error) {throw new Error(`calibrated recovery search: ${error.stack??error}`);}
  });
} else {
  const {values}=parseArgs({options:{model:{type:'string',default:'workshop-fighter'},loadout:{type:'string',default:'empty,empty'},
    generations:{type:'string',default:'8'},lambda:{type:'string',default:'8'},workers:{type:'string',default:'8'},
    out:{type:'string'},sigma:{type:'string',default:'.13'},resume:{type:'string'},offsets:{type:'string',default:'0'}}});
  if(!values.out) throw new Error('--out is required');
  const previous=values.resume?JSON.parse(readFileSync(values.resume,'utf8')):null;
  if(previous&&(previous.mode!=='calibrated'||previous.model!==values.model||previous.loadout!==values.loadout
    ||JSON.stringify(previous.dimensions)!==JSON.stringify(dimensions))) throw new Error('resume needs a calibrated checkpoint of the same body, loadout and dimensions');
  const [left,right]=values.loadout.split(','), base=previous?.base??structuredClone(stepUpTuning(modelHolding(values.model,{left,right})));
  const offsets=values.offsets.split(',').map(Number);
  const trainingOffset=offset=>Number.isFinite(offset)&&Math.abs(((offset%22.5)+22.5)%22.5-11.25)>=1e-9;
  if(offsets.some(offset=>!trainingOffset(offset))) throw new Error('training offsets must be finite and leave the fresh protocol unused');
  const profileOffsets=JSON.parse(readFileSync('assets/skills/recovery/edge-profiles.json','utf8')).source.offsets;
  if(!Array.isArray(profileOffsets)||!profileOffsets.length||profileOffsets.some(offset=>!trainingOffset(offset))) throw new Error('calibration offsets must leave the fresh protocol unused');
  const selected=job=>job.model===values.model&&`${job.loadout.left},${job.loadout.right}`===values.loadout;
  const jobs=offsets.flatMap(offset=>risingJobs({target:true,offset})).filter(selected);
  const profileJobs=profileOffsets.flatMap(offset=>risingJobs({target:true,offset})).filter(selected)
    .map(({model,loadout,seed,start,degrees,balance,grit,gusts})=>({model,loadout,seed,start,degrees,balance,grit,gusts,target:true}));
  if(!jobs.length||!profileJobs.length) throw new Error('the body and loadout need training and calibration cases');
  const workers=Number(values.workers),lambda=Number(values.lambda),generations=Number(values.generations);
  if(!Number.isSafeInteger(lambda)||lambda<2||!Number.isSafeInteger(generations)||generations<0) throw new Error('lambda and generations need valid integer counts');
  const pool=workerPool(new URL(import.meta.url),{},workers);
  const start=initial(base).map((value,i)=>(value-dimensions[i][1])/(dimensions[i][2]-dimensions[i][1]));
  const started=Date.now();
  mkdirSync(dirname(values.out),{recursive:true});
  const cacheFile=`${values.out}.trials.jsonl`,cache=new Map();
  if(existsSync(cacheFile)) for(const line of readFileSync(cacheFile,'utf8').trim().split('\n').filter(Boolean)) {
    const row=JSON.parse(line);
    if(row.build===BUILD_IDENTITY&&row.mode==='calibrated') cache.set(JSON.stringify([row.jobs,row.profileJobs,row.offsets,row.tuning]),row.result);
  }
  const score=async tuning=>{
    const key=JSON.stringify([jobs,profileJobs,offsets,tuning]);
    if(cache.has(key)) return cache.get(key);
    const result=await pool.evaluate({jobs,profileJobs,offsets,tuning});
    cache.set(key,result);
    appendFileSync(cacheFile,JSON.stringify({build:BUILD_IDENTITY,mode:'calibrated',jobs,profileJobs,offsets,tuning,result})+'\n');
    return result;
  };
  try {
    const baseline=await score(base);
    console.log(`calibrated baseline: ${baseline.within}/${jobs.length} under 10 s, gates ${baseline.met?'met':'short'}, score ${baseline.score.toFixed(4)}; ${((Date.now()-started)/1000).toFixed(1)} s`);
    let kept={tuning:base,...baseline};
    if(previous) {const reading=await score(previous.best.tuning);if(reading.score>kept.score)kept={tuning:previous.best.tuning,...reading};}
    const resume=previous?.checkpoint;
    if(resume) {resume.best.r=await score(decode(base,resume.best.u));resume.best.score=resume.best.r.score;}
    const save=(log,checkpoint)=>writeFileSync(values.out,JSON.stringify({build:BUILD_IDENTITY,mode:'calibrated',model:values.model,loadout:values.loadout,
      base,baseline,dimensions,offsets,profileOffsets,seconds:(Date.now()-started)/1000,log,best:kept,checkpoint},null,1));
    save(previous?.log??[],resume??null);
    let generationStarted=Date.now();
    const result=await cmaSearch({n:dimensions.length,start,sigma:Number(values.sigma),lambda,generations:kept.met?0:generations,seed:13,resume,
      score:unit=>score(decode(base,unit)),
      onGeneration(entry,search) {
        if(search.best.score>kept.score) kept={tuning:decode(base,search.best.u),...search.best.r};
        const now=Date.now(),seconds=(now-started)/1000,generationSeconds=(now-generationStarted)/1000;
        generationStarted=now;
        save(search.log,search.checkpoint);
        console.log(`generation ${entry.g}: kept ${kept.within}/${jobs.length}, gates ${kept.met?'met':'short'}, score ${kept.score.toFixed(4)}; ${seconds.toFixed(0)} s`);
        if(kept.met||seconds>=480||seconds+generationSeconds>600) return false;
      }});
    console.log(`finished: kept ${kept.within}/${jobs.length}, score ${kept.score.toFixed(4)}; ${result.log.length} generations`);
  } finally {await pool.terminate();}
}
