/**
 * Search one body's staged recovery settings on target falls, with immutable technique overrides.
 * Node core world, Rapier, 120 Hz, no assists. Fresh falls are reserved for confirmation.
 *
 * node research/rise-search.mjs --model workshop-fighter --generations 8 --lambda 10 --workers 8 --out research/runs/rise-search/best.json
 * --resume <checkpoint.json> continues the same search; --all widens it to every standard fall.
 * Each played trial is kept beside --out as .trials.jsonl, reused only on the same build.
 * A pass stops at a generation boundary once eight minutes have elapsed.
 */
import '../tests/harness/preload-data.mjs';
import { isMainThread, parentPort } from 'node:worker_threads';
import { parseArgs } from 'node:util';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { cmaSearch, workerPool } from './cma.mjs';
import { risingJobs } from '../src/evaluation/rising.ts';
import { buildFall } from '../src/evaluation/fall.ts';
import { stepUpTuning } from '../src/core/recovery/ground/step-up.ts';
import { modelHolding, modelSpec } from '../src/core/models.ts';
import { MINDS } from '../src/entrants/game.ts';
import { BUILD_IDENTITY } from '../scripts/build-identity.mjs';

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

async function trial({job,tuning}) {
  const b = await buildFall({...job, cap:16, mind:mindOf(tuning)},'rapier');
  try {
    while (!b.ended) {b.world.step(); b.afterStep();}
    const r = b.reading();
    const time = r.takeover === null ? null : r.stood && r.verified !== null ? r.verified : 16;
    return {loadout:job.loadout,degrees:job.degrees,reading:r,time,
      score:time === null ? 0 : time < 10 ? 10 + (10-time)/10 : (16-time)/6};
  } finally {b.dispose();}
}
if (!isMainThread) {
  parentPort.on('message',async ({id,x}) => {
    try {parentPort.postMessage({id,r:await trial(x)});}
    catch(e) {throw new Error(`recovery search trial: ${e.stack ?? e}`);}
  });
} else {
  const {values} = parseArgs({options:{model:{type:'string',default:'workshop-fighter'},generations:{type:'string',default:'8'},lambda:{type:'string',default:'10'},workers:{type:'string',default:'8'},out:{type:'string'},sigma:{type:'string',default:'.13'},all:{type:'boolean'},resume:{type:'string'},loadout:{type:'string'}}});
  if (!values.out) throw new Error('--out is required');
  const previous = values.resume ? JSON.parse(readFileSync(values.resume,'utf8')) : null;
  if (previous && (previous.model !== values.model || JSON.stringify(previous.dimensions) !== JSON.stringify(dimensions))) throw new Error('resume needs the same body and search dimensions');
  const [left,right] = values.loadout?.split(',') ?? [];
  const base = previous?.base ?? structuredClone(stepUpTuning(values.loadout ? modelHolding(values.model,{left,right}) : modelSpec(values.model)));
  const jobs = risingJobs({target:true}).filter(j => j.model === values.model && (!values.loadout || `${j.loadout.left},${j.loadout.right}` === values.loadout) && (values.all || [0,135,270].includes(j.degrees) || (j.degrees===22.5 && j.loadout.left==='buckler') || (j.degrees===202.5 && j.loadout.right==='sword')));
  const pool = workerPool(new URL(import.meta.url),{},Number(values.workers));
  const start = initial(base).map((v,i)=>(v-dimensions[i][1])/(dimensions[i][2]-dimensions[i][1]));
  const started = Date.now(); let baseline;
  mkdirSync(dirname(values.out),{recursive:true});
  const cacheFile = `${values.out}.trials.jsonl`, cache = new Map();
  if (existsSync(cacheFile)) for (const line of readFileSync(cacheFile,'utf8').trim().split('\n').filter(Boolean)) {const r=JSON.parse(line); if (r.build === BUILD_IDENTITY) cache.set(JSON.stringify([r.job,r.tuning]),r.result);}
  const score = async tuning => {
    const rows = await Promise.all(jobs.map(async job => {
      const key=JSON.stringify([job,tuning]);
      if (cache.has(key)) return cache.get(key);
      const result=await pool.evaluate({job,tuning});
      cache.set(key,result); appendFileSync(cacheFile,JSON.stringify({build:BUILD_IDENTITY,job,tuning,result})+'\n');
      return result;
    }));
    return {score:rows.reduce((s,r)=>s+r.score,0)/rows.length,within:rows.filter(r=>r.time!==null && r.time<10).length,rows};
  };
  try {
    baseline = await score(base);
    console.log(`baseline: ${baseline.within}/${jobs.length} under 10 s, score ${baseline.score.toFixed(4)}; ${((Date.now()-started)/1000).toFixed(1)} s`);
    const resume = previous?.checkpoint;
    if (resume) {resume.best.r=await score(previous.best.tuning); resume.best.score=resume.best.r.score;}
    const result = await cmaSearch({n:dimensions.length,start,sigma:Number(values.sigma),lambda:Number(values.lambda),generations:Number(values.generations),seed:13,resume,
      score:u=>score(decode(base,u)),
      onGeneration(entry,search) {
        const best = search.best;
        writeFileSync(values.out,JSON.stringify({build:BUILD_IDENTITY,model:values.model,base,baseline,dimensions,seconds:(Date.now()-started)/1000,log:search.log,best:{tuning:decode(base,best.u),...best.r},checkpoint:search.checkpoint},null,1));
        console.log(`generation ${entry.g}: best ${best.r.within}/${jobs.length}, score ${best.score.toFixed(4)}; ${((Date.now()-started)/1000).toFixed(0)} s`);
        if (Date.now()-started >= 480_000) return false;
      }});
    console.log(`finished: ${result.best.r.within}/${jobs.length}, score ${result.best.score.toFixed(4)}`);
  } finally {await pool.terminate();}
}
