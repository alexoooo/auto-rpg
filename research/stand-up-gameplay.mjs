import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {buildBout} from './bout.mjs';
import {freshEngine} from '../tests/harness/core-stand.mjs';
import {traceOf} from '../tests/harness/trace.mjs';
import {PUNCHER} from '../src/core/mind/config.ts';
import {SIMBICON} from '../src/core/skills/simbicon.ts';
import {centreOfToRef} from '../src/core/control/support.ts';
import {deepFreeze} from '../src/core/state.ts';

const output=process.argv[2];if(!output)throw new Error('output JSON required');
const mind=deepFreeze({...PUNCHER,locomotion:{kind:'simbicon',...SIMBICON},subs:[{kind:'assisted-rise'}]});
const recipe={left:'workshop-fighter',right:'workshop-rogue',held:{left:'empty',right:'empty'},
 balance:{left:100,right:100},recoverySeconds:null,minds:{left:mind,right:mind},gap:3.25};
const e=await buildBout(recipe,{physicsEngine:await freshEngine('rapier-coordinate'),actuation:'symmetric'});
const {world,duel}=e,at=new Vector3(),impulse=new Vector3(-90,0,0),sides=['left','right'];
const scheduled=[240,264,1680,1704];
const push=world.beforeStep(()=>{if(scheduled.includes(duel.steps)){
 const trunk=duel.duelists.left.built.segments.get('middleTrunk');trunk.body.applyImpulse(impulse,centreOfToRef(trunk,at));}});
const read=()=>sides.map(side=>{const u=duel.duelists[side];return{side,has:u.body.has,down:u.body.down,bar:u.pool.bar(),force:u.body.assist.given.force.length(),moment:u.body.assist.given.moment.length()};});
const run=()=>{
 const trace=traceOf(sides.map(s=>duel.duelists[s].built)),stateHash=createHash('sha256'),events=[],cost=[],previous=new Map();let peakHeap=0;
 while(duel.steps<3600&&!duel.verdict){const before=performance.now();world.step();cost.push(performance.now()-before);trace.take();const state=read();stateHash.update(JSON.stringify(state));
  if(duel.steps%120===0)peakHeap=Math.max(peakHeap,process.memoryUsage().heapUsed);
  for(const row of state){if(previous.get(row.side)!==row.has){events.push({time:duel.clock,...row,blows:duel.blows.length});previous.set(row.side,row.has);}}}
 cost.sort((a,b)=>a-b);return{digest:trace.digest(),stateDigest:stateHash.digest('hex'),finalStateDigest:createHash('sha256').update(JSON.stringify(duel.save().state)).digest('hex'),events,blows:duel.blows.length,verdict:duel.verdict,final:read(),steps:cost.length,
  timing:{harness:'Node two-unit Arena, gameplay Rapier coordinate engine, symmetric muscles, 120 Hz',meanStepMs:cost.reduce((a,b)=>a+b,0)/cost.length,p50StepMs:cost[Math.floor(cost.length*.5)],p95StepMs:cost[Math.floor(cost.length*.95)],peakHeapBytes:peakHeap}};
};
try{while(duel.steps<330)world.step();const saved=duel.save(),first=run();duel.load(saved);const second=run();
 assert.equal(second.digest,first.digest,'physical checkpoint continuation');assert.equal(second.stateDigest,first.stateDigest,'control/wound checkpoint continuation');assert.deepEqual(second.events,first.events);assert.equal(second.finalStateDigest,first.finalStateDigest);
 const returns=first.events.filter(r=>r.side==='left'&&r.has==='command');
 assert.ok(returns.length>=2,'the same fighter returns from at least two recoveries');
 assert.ok(first.final.every(r=>!r.down&&r.has==='command'&&r.bar<1),'both fighters return to active combat and take wounds');
 assert.ok(first.blows>returns.at(-1).blows,'combat resumes after recovery');
 writeFileSync(output,JSON.stringify({recipe,checkpointStep:330,scheduledShoves:scheduled,shoveNs:90,exactContinuation:true,first,second},null,2));console.log(JSON.stringify({events:first.events,blows:first.blows,exactContinuation:true,timing:first.timing}));
}finally{push.dispose();e.dispose();}
