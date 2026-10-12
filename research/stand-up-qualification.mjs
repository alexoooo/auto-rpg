import cases from './stand-up-learning-cases.json' with { type: 'json' };
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const models=['workshop-fighter','workshop-rogue'],heldItems=['empty','club'];
const limits={selection:{count:16,full:[61,15,4,6],substantial:[58,14,8,12]},
  validation:{count:32,full:[122,30,4,6],substantial:[116,28,8,12]},
  disturbed:{count:8,full:[31,7,Infinity,6],substantial:[29,7,Infinity,12]}};
const canonical=value=>JSON.stringify(value,(_,v)=>v && !Array.isArray(v) && typeof v==='object'
  ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
const completed=(row,deadline)=>row?.result?.fell===true && row.result.success===true && !row.result.failure
  && Number.isFinite(row.result.seconds) && row.result.seconds>=0 && row.result.seconds<=deadline
  && row.result.effortViolation<.0001 && !(row.identity?.balance===0 && row.result.assisted);
const middle=values=>{const v=[...values].sort((a,b)=>a-b),n=v.length;return n ? (v[Math.floor((n-1)/2)]+v[Math.floor(n/2)])/2 : Infinity;};

/** Frozen-case coverage and failure-inclusive timing gates; gameplay review remains a separate requirement. */
export function recoveryQualification(rows,{partition='selection',level='full'}={}) {
  if (!['full','substantial'].includes(level) || ![...Object.keys(limits),'repeated'].includes(partition)) throw new Error('unknown recovery qualification');
  const expected=cases[partition], keys=rows.map(r=>canonical(r.case));
  const complete=rows.length===expected.length && expected.every(c=>keys.filter(k=>k===canonical(c)).length===1);
  const repeated=partition==='repeated', limit=repeated ? null : limits[partition];
  const [minimum,perGroup,medianLimit,deadline]=repeated ? [15,0,Infinity,level==='full'?6:12] : limit[level];
  const successesOf=row=>repeated ? Array.isArray(row.falls) && row.falls.length===3 && row.falls.every(f=>completed(f,deadline)) : completed(row,deadline);
  const groups=models.flatMap(model=>heldItems.map(held=>{
    const selected=rows.filter(r=>r.case.model===model && r.case.held===held), count=repeated ? 4 : limit.count;
    const successes=selected.filter(successesOf).length;
    const median=repeated ? null : middle(selected.map(r=>completed(r,deadline)?r.result.seconds:Infinity));
    const cardinal=partition!=='selection' || [0,90,180,270].every(d=>selected.some(r=>r.case.degrees===d && successesOf(r)));
    const poses=['prone','supine','left-side','right-side'];
    const coverage=partition!=='validation' || poses.every(p=>selected.some(r=>r.initialPose===p));
    return {model,held,trials:selected.length,successes,median:Number.isFinite(median)?median:null,cardinal,coverage,
      pass:selected.length===count && successes>=perGroup && (repeated || median<=medianLimit) && cardinal && coverage};
  }));
  const flat=repeated ? rows.flatMap(r=>r.falls??[]) : rows;
  const configurations=new Set(flat.map(r=>canonical([r.identity?.balance,r.identity?.host,r.identity?.hz,r.identity?.artifactSha,r.identity?.actuation,r.identity?.sourceSha,r.policySha])));
  const declared=flat.every(r=>Number.isFinite(r.identity?.balance) && typeof r.identity?.host==='string' && typeof r.policySha==='string');
  const successes=rows.filter(successesOf).length;
  return {partition,level,complete,declared,consistent:configurations.size===1,trials:rows.length,successes,groups,
    pass:complete && declared && configurations.size===1 && successes>=minimum && groups.every(g=>g.pass),
    later35:repeated ? null : rows.filter(r=>completed(r,35)).length,
    scope:'This partition only; comparator, remaining partitions and gameplay review are separate gates.'};
}

/** Same-body, same-host comparisons keep assistance changes separate from algorithmic improvement. */
export function recoveryComparison(candidate,baseline) {
  const key=r=>canonical(r.case), byCase=new Map(baseline.map(r=>[key(r),r]));
  const fields=['specSha','balance','host','hz','artifactSha','actuation','sourceSha'];
  const matched=recoveryQualification(candidate,{level:'substantial'}).complete && recoveryQualification(baseline,{level:'substantial'}).complete && candidate.every(r=>{
    const b=byCase.get(key(r));return b && fields.every(k=>r.identity?.[k]!==undefined && r.identity[k]===b.identity?.[k]);});
  const wins=rows=>rows.filter(r=>completed(r,12)).length;
  const median=rows=>middle(rows.map(r=>completed(r,12)?r.result.seconds:Infinity));
  const a=wins(candidate),b=wins(baseline),am=median(candidate),bm=median(baseline);
  const baselineQualified=recoveryQualification(baseline,{level:'substantial'}).pass;
  return {matched,candidate:a,baseline:b,additional:a-b,
    candidateMedian:Number.isFinite(am)?am:null,baselineMedian:Number.isFinite(bm)?bm:null,
    pass:matched && (baselineQualified ? a>=b && am<=.7*bm : a-b>=10)};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const report=JSON.parse(readFileSync(process.argv[2],'utf8'));
  console.log(JSON.stringify(['substantial','full'].map(level=>recoveryQualification(report.records,{partition:report.partition,level})),null,2));
}
