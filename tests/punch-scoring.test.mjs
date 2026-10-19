/**
 * **How a punch is admitted and scored** (`contactResponse`, `src/core/control/effector-feedback.ts`;
 * `research/punch-foundation.mjs`, `research/punch-stability.mjs`): what a fist's contact counts as,
 * and which cells a promotion or a stability qualification needs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {PUNCH_EXECUTION,validCombatExecution} from '../src/core/skills/combat.ts';
import {contactResponse} from '../src/core/control/effector-feedback.ts';
import {punchAdmission,punchScore,median} from '../research/punch-foundation.mjs';
import {punchStabilityAdmission} from '../research/punch-stability.mjs';

test('contact admission distinguishes blocks, incidental objects and world, and rejects invalid settings',()=>{
 const touch=target=>({contact:{target}});
 assert.equal(contactResponse(touch({kind:'body',body:'foe',segment:'forearm.left',guard:true}),'foe'),'block');
 assert.equal(contactResponse(touch({kind:'body',body:'foe',segment:'upperTrunk',guard:false}),'foe'),'target');
 assert.equal(contactResponse(touch({kind:'object',id:'other'}),'foe'),'incidental');
 assert.equal(contactResponse(touch({kind:'world'}),'foe'),'world');
 assert.equal(contactResponse({impulse:1},'foe'),null);
 for(const change of [{impactSeconds:NaN},{impactTravel:-1},{normalAlignment:2},{planted:1}])assert.equal(validCombatExecution({...PUNCH_EXECUTION,...change}),false);
});

test('promotion cannot hide a failed cell or an unimproved hand behind an average',()=>{
 assert.equal(median([4,1,3,2]),2.5);assert.equal(median([]),null);
 const score=impulse=>({accepted:true,hands:{left:{impulse,failures:0,falls:0},right:{impulse,failures:0,falls:0}}});
 const baseline=score(5),candidate=score(6);assert.equal(punchAdmission(baseline,candidate),true);
 for(const mutate of [c=>c.accepted=false,c=>c.hands.left.impulse=5.9,c=>c.hands.right.failures=1,c=>c.hands.left.falls=1]){
  const c=structuredClone(candidate);mutate(c);assert.equal(punchAdmission(baseline,c),false);
 }
 assert.equal(punchScore([]).accepted,false);
});

// A standing cell as `punchCalibration` reads one: accepted, one eligible impact.
const cell=(hand,family,impulse=2)=>({config:{hand,family},qualification:{accepted:true},cycles:{failed:0},fell:false,
 impacts:[{eligible:true,last10cmSpeed:4,impulse,preImpact:{motorTorques:[1],bounds:{positive:[2],negative:[2]}}}]});
test('stability admits every hand and family standing and every ground task, and claims no force gain',()=>{
 const rows=['left','right'].flatMap(hand=>['straight','cross'].map(family=>cell(hand,family)));
 const ground=['left','right'].flatMap(hand=>[false,true].map(recover=>({options:{hand,recover},summary:{begun:10,
  lowReady:200,lowDriven:3,attackerFell:false,trunkFloor:0,returnedStanding:true,
  cycles:{returned:{left:3,right:3},failed:0},assist:{force:0,moment:0}}})));
 assert.equal(punchStabilityAdmission(rows,ground),true);
 for(const mutate of [r=>r.summary.attackerFell=true,r=>r.summary.cycles.failed=1,
  r=>r.summary.lowDriven=0,r=>r.summary.returnedStanding=false,r=>r.summary.assist.force=1]) {
  const bad=structuredClone(ground);mutate(bad[0]);assert.equal(punchStabilityAdmission(rows,bad),false);
 }
 assert.equal(punchStabilityAdmission([rows[0],rows[0],rows[2],rows[3]],ground),false,'duplicate cells cannot replace a required hand/family');
 assert.equal(punchStabilityAdmission(rows.slice(1),ground),false);
 assert.equal(punchStabilityAdmission(rows,ground.slice(1)),false);
 const refused=structuredClone(rows);refused[1].qualification.accepted=false;
 assert.equal(punchStabilityAdmission(refused,ground),false,'an unqualified standing cell refuses');
 const weak=structuredClone(rows);for(const row of weak)for(const event of row.impacts)event.impulse*=.1;
 assert.equal(punchStabilityAdmission(weak,ground),true,'stability does not claim a force gain');
});
