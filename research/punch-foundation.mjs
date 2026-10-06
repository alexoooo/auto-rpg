import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {punchCalibration,calibratePunches} from './punch-calibration.mjs';
import {combatFingerprint} from './arena-combat.mjs';
import {PUNCH_EXECUTION} from '../src/core/skills/combat.ts';

/** Fixed finite experiment, with every input and rejected cell retained: punch-foundation.md. */
export const PUNCH_SEARCH=Object.freeze({seconds:8,passes:2,ratio:1.2,
 axes:Object.freeze({contactSpeed:[5,6.5,8],swingSeconds:[.08,.12,.16],elbowExtension:[0,.5,1],torso:[0,.1,.2]})});
export const median=values=>{const a=values.toSorted((x,y)=>x-y),n=a.length;return n?n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2:null;};

/** Every configured family must supply three clean impacts and verified returns on each hand. */
export function punchScore(results) {
 const hands={};
 for(const hand of ['left','right']) {
  const rows=results.filter(r=>r.config.hand===hand),events=rows.flatMap(r=>r.impacts.filter(e=>e.eligible&&e.last10cmSpeed!==null));
  hands[hand]={impulse:median(events.map(e=>e.impulse)),speed:median(events.map(e=>e.last10cmSpeed)),
   failures:rows.reduce((s,r)=>s+r.cycles.failed,0),falls:rows.filter(r=>r.fell).length,
   saturation:median(events.flatMap(e=>e.preImpact.motorTorques.map((torque,i)=>{
    const cap=torque>=0?e.preImpact.bounds.positive[i]:e.preImpact.bounds.negative[i];return cap?Math.abs(torque)/cap:0;})))};
 }
 return {accepted:results.length===4&&results.every(r=>r.qualification.accepted),hands,
  minimumImpulse:Math.min(hands.left.impulse??0,hands.right.impulse??0)};
}
export function punchAdmission(reference,candidate,ratio=PUNCH_SEARCH.ratio) {
 return reference.accepted&&candidate.accepted&&['left','right'].every(h=>candidate.hands[h].impulse>=ratio*reference.hands[h].impulse
  &&candidate.hands[h].failures<=reference.hands[h].failures&&candidate.hands[h].falls<=reference.hands[h].falls);
}

/** Two coordinate passes; a failure never becomes a winning cell by dropping its bad trials. */
export async function searchPunches() {
 const fingerprint=combatFingerprint(),rows=[],cache=new Map(),trace=[];
 const measure=async(settings,execution)=>{
  const key=JSON.stringify({settings,execution});if(cache.has(key))return cache.get(key);
  const results=[];
  for(const hand of ['left','right'])for(const family of ['straight','cross'])results.push(await punchCalibration({hand,family,
   seconds:PUNCH_SEARCH.seconds,contactSpeed:settings.contactSpeed,armExtension:settings.elbowExtension,
   paths:settings,execution,matchedFeedback:true,pad:{face:'compliant'}}));
  const row={id:rows.length,settings:{...settings},execution,results,score:punchScore(results)};
  rows.push(row);cache.set(key,row);process.stderr.write(`cell ${row.id}: ${row.score.accepted}, median ${row.score.hands.left.impulse}/${row.score.hands.right.impulse}\n`);return row;
 };
 const reference={contactSpeed:5,swingSeconds:.12,elbowExtension:0,torso:.2};
 const baseline=await measure(reference,undefined),closed=await measure(reference,{...PUNCH_EXECUTION,impactSeconds:0});
 let selected=await measure(reference,PUNCH_EXECUTION);
 for(let pass=0;pass<PUNCH_SEARCH.passes;pass++)for(const [axis,values]of Object.entries(PUNCH_SEARCH.axes)) {
  const candidates=[];for(const value of values)candidates.push(await measure({...selected.settings,[axis]:value},PUNCH_EXECUTION));
  const feasible=candidates.filter(c=>c.score.accepted).sort((a,b)=>b.score.minimumImpulse-a.score.minimumImpulse||a.id-b.id);
  if(feasible.length&&(!selected.score.accepted||feasible[0].score.minimumImpulse>selected.score.minimumImpulse))selected=feasible[0];
  trace.push({pass,axis,candidates:candidates.map(c=>c.id),selected:selected.id});
 }
 const admitted=punchAdmission(baseline.score,selected.score),fine=[];
 for(const hz of [480,960,1920])for(const hand of ['left','right'])for(const candidate of [false,true]) {
  const settings=candidate?selected.settings:reference;
  const result=await punchCalibration({hand,hz,seconds:PUNCH_SEARCH.seconds,contactSpeed:settings.contactSpeed,
   armExtension:settings.elbowExtension,paths:settings,execution:candidate?PUNCH_EXECUTION:undefined,matchedFeedback:true,pad:{face:'compliant'}});
  fine.push({candidate,result});process.stderr.write(`fine ${hand}/${hz}/${candidate}: ${result.qualification.accepted}\n`);
 }
 const retained=await calibratePunches({seconds:6});
 if(combatFingerprint()!==fingerprint)throw new Error('source changed during punch foundation search');
 return {version:1,fingerprint,protocol:PUNCH_SEARCH,baseline:baseline.id,closed:closed.id,selected:selected.id,admitted,trace,rows,fine,retained};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const record=await searchPunches();writeFileSync(process.argv[2]??'docs/reference/punch-foundation-search.json.gz',gzipSync(JSON.stringify(record)));
 console.log(JSON.stringify({admitted:record.admitted,selected:record.rows[record.selected].settings,score:record.rows[record.selected].score}));
}
