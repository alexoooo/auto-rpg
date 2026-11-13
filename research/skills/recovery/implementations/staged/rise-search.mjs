/**
 * Search one body's loadout-specific recovery settings with immutable technique overrides, scored
 * on its drill ([research scores on its drill](../../../../../docs/recipes/skill.md#an-options-code)):
 * the twin of the body's way-up cells holding the loadout (the way-up drill's fresh falls
 * and bouts, `research/skills/recovery/way-up-trials.mjs`), every staged way up played on the candidate's
 * tuning, which holds both the step-up's and the sit-back's stages, so every way up's cell reads
 * it. A candidate's score is the cells' value, negated: the mean over the falls exercised of the
 * seconds an attempt at the cell's way up, one not reaching where it goes at `ATTEMPT_CAP`.
 * Node core world, Rapier, 120 Hz, the drills' Option Mind (`option-drill`), no assists; trials
 * played on the drill's trial pool (`trialPool`, `scoreOn`, `research/drill-trials.mjs`).
 *
 * node research/skills/recovery/implementations/staged/rise-search.mjs --model man --loadout empty,club --generations 8 --lambda 8 --workers 8 --out .tmp/rise-search/best.json
 * --resume <checkpoint.json> continues a search. --confirm <out.json> plays the search's best and
 * the body's records on the cells' own falls at 120 and 480 Hz, the worse counting (`confirmRow`).
 * Scored candidates are kept beside --out as .trials.jsonl on the same build.
 * A pass stops after eight minutes or before another generation projects past ten.
 */
import '../../../../../tests/harness/preload-data.mjs';
import { parseArgs } from 'node:util';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { cmaSearch } from '../../../../cma.mjs';
import { confirmRow, drillTrials, scoreOn, subjectOf, trialPool } from '../../../../drill-trials.mjs';
import { RECORD_WAYS, stagedValue, wayCells } from '../../way-up-trials.mjs';
import { stepUpTuning } from "../../../../../src/skills/recovery/implementations/staged/records.ts";
import { modelHolding } from "../../../../../src/core/bodies/models.ts";
import { BUILD_IDENTITY } from '../../../../../scripts/build-identity.mjs';

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

/** Every way up a staged tuning drives: both records'. */
const WAYS = [...RECORD_WAYS['step-up'], ...RECORD_WAYS['sit-back']];

/** A trial's subject value with every staged way up on `tuning`. */
const valueOn = (tuning) => (one) => stagedValue(subjectOf(one).value, tuning);

const {values}=parseArgs({options:{model:{type:'string',default:'man'},loadout:{type:'string',default:'empty,empty'},
  generations:{type:'string',default:'8'},lambda:{type:'string',default:'8'},workers:{type:'string',default:'8'},
  out:{type:'string'},sigma:{type:'string',default:'.13'},resume:{type:'string'},confirm:{type:'string'}}});
const [left,right]=values.loadout.split(','), record=structuredClone(stepUpTuning(modelHolding(values.model,{left,right})));
const cells=wayCells(WAYS,values.model,values.loadout);
if(!cells.length) throw new Error(`the table has no way-up cell of ${values.model} holding ${values.loadout}`);
const pool=trialPool(Number(values.workers));
if(values.confirm) {
  // The search's best against the body's records, on each cell's own falls at 120 and 480 Hz, the worse counting.
  const found=JSON.parse(readFileSync(values.confirm,'utf8'));
  try {
    const records=await confirmRow(cells,valueOn(record),{play:pool.play}), best=await confirmRow(cells,valueOn(found.best.tuning),{play:pool.play});
    cells.forEach((cell,i)=>console.log(`${cell.skill}: records ${records.cells[i].worse?.toFixed(2)??'none'} s an attempt, best ${best.cells[i].worse?.toFixed(2)??'none'} (the worse of 120 and 480 Hz)`));
    console.log(`the cells' mean: records ${records.worse?.toFixed(2)??'none'}, best ${best.worse?.toFixed(2)??'none'} s an attempt`);
  } finally {await pool.terminate();}
  process.exit(0);
}
if(!values.out) throw new Error('--out is required');
const previous=values.resume?JSON.parse(readFileSync(values.resume,'utf8')):null;
if(previous&&(previous.mode!=='drill'||previous.model!==values.model||previous.loadout!==values.loadout
  ||JSON.stringify(previous.dimensions)!==JSON.stringify(dimensions))) throw new Error('resume needs a drill checkpoint of the same body, loadout and dimensions');
const base=previous?.base??record;
const trials=cells.flatMap(cell=>drillTrials(cell,'twin'));
const lambda=Number(values.lambda),generations=Number(values.generations);
if(!Number.isSafeInteger(lambda)||lambda<2||!Number.isSafeInteger(generations)||generations<0) throw new Error('lambda and generations need valid integer counts');
const start=initial(base).map((value,i)=>(value-dimensions[i][1])/(dimensions[i][2]-dimensions[i][1]));
const started=Date.now();
mkdirSync(dirname(values.out),{recursive:true});
const names=trials.map(one=>one.name),cacheFile=`${values.out}.trials.jsonl`,cache=new Map();
if(existsSync(cacheFile)) for(const line of readFileSync(cacheFile,'utf8').trim().split('\n').filter(Boolean)) {
  const row=JSON.parse(line);
  if(row.build===BUILD_IDENTITY&&row.mode==='drill') cache.set(JSON.stringify([row.names,row.tuning]),row.result);
}
/** A candidate: every twin trial played on its tuning, its score the cells' value negated, none counting at -Infinity. */
const score=async tuning=>{
  const key=JSON.stringify([names,tuning]);
  if(cache.has(key)) return cache.get(key);
  const r=await scoreOn(trials,valueOn(tuning),{play:pool.play});
  const result={score:r.value===null?-Infinity:-r.value,counted:r.each.filter(one=>one.value!==null).length,reached:r.each.filter(one=>one.outcome==='reached').length,each:r.each};
  cache.set(key,result);
  appendFileSync(cacheFile,JSON.stringify({build:BUILD_IDENTITY,mode:'drill',names,tuning,result})+'\n');
  return result;
};
const said=reading=>`${reading.reached}/${reading.counted} falls every attempt reached, ${(-reading.score).toFixed(2)} s an attempt`;
try {
  const baseline=await score(base);
  console.log(`baseline: ${said(baseline)}; ${((Date.now()-started)/1000).toFixed(1)} s`);
  let kept={tuning:base,...baseline};
  if(previous) {const reading=await score(previous.best.tuning);if(reading.score>kept.score)kept={tuning:previous.best.tuning,...reading};}
  const resume=previous?.checkpoint;
  if(resume) {resume.best.r=await score(decode(base,resume.best.u));resume.best.score=resume.best.r.score;}
  const save=(log,checkpoint)=>writeFileSync(values.out,JSON.stringify({build:BUILD_IDENTITY,mode:'drill',model:values.model,loadout:values.loadout,
    base,baseline,dimensions,trials:trials.length,seconds:(Date.now()-started)/1000,log,best:kept,checkpoint},null,1));
  save(previous?.log??[],resume??null);
  let generationStarted=Date.now();
  const result=await cmaSearch({n:dimensions.length,start,sigma:Number(values.sigma),lambda,generations,seed:13,resume,
    score:unit=>score(decode(base,unit)),
    onGeneration(entry,search) {
      if(search.best.score>kept.score) kept={tuning:decode(base,search.best.u),...search.best.r};
      const now=Date.now(),seconds=(now-started)/1000,generationSeconds=(now-generationStarted)/1000;
      generationStarted=now;
      save(search.log,search.checkpoint);
      console.log(`generation ${entry.g}: kept ${said(kept)}; ${seconds.toFixed(0)} s`);
      if(seconds>=480||seconds+generationSeconds>600) return false;
    }});
  console.log(`finished: kept ${said(kept)}; ${result.log.length} generations`);
} finally {await pool.terminate();}
