/**
 * **How the planted punch strikes a pad** (`research/punch-calibration.mjs`; Node unpinned core
 * stand, Rapier, 120 Hz, no assist): either fist, straight and cross, struck again and again with
 * matched contact and bounded impact paths, returning without a fall.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {punchStand,punchCalibration} from '../research/punch-calibration.mjs';
import {PUNCH_EXECUTION,PLANTED_PUNCH_EXECUTION} from '../src/core/skills/combat.ts';
import {contactResponse} from '../src/core/control/effector-feedback.ts';

test('both planted physical fists use matched tactile contact, bounded impact paths and measured returns', async()=>{
 const settings={execution:PUNCH_EXECUTION,matchedFeedback:true,pad:{face:'compliant'}};
 for(const hand of ['left','right']){
  const s=await punchStand({...settings,execution:PLANTED_PUNCH_EXECUTION,armExtension:.5,hand});let impacts=0;
  try{while(s.world.time<6){s.step();if(s.executorState.cycles[hand].impact){impacts++;
    assert.equal(s.built.handPoses.state[hand].applied,'fist');
    assert.equal(s.skills.state.command.effectors[`hand.${hand}`].places[0].point,'strike');
    const {origin,finish,elapsed}=s.executorState.cycles[hand].impact;
    assert.ok(Math.hypot(...finish.map((v,k)=>v-origin[k]))<=PUNCH_EXECUTION.impactTravel+1e-10);
    assert.ok(elapsed<PUNCH_EXECUTION.impactSeconds);assert.equal(contactResponse(s.body.view.effectors[`hand.${hand}`].feedback,'punch-pad'),'target');
   }}
   const r=s.reading();assert.ok(impacts>=3);assert.ok(r.impactResponse.admitted>=3);
   assert.equal(r.cycles.failed,0);assert.ok(r.cycles.returned[hand]>=3);assert.equal(r.fell,false);
   assert.ok(r.impacts.every(e=>e.preImpact.pose==='fist'&&e.preImpact.anchorErrors.every(j=>j.error<.02)));
   assert.deepEqual(r.assist,{force:0,moment:0});
  }finally{s.dispose();}
 }
});

test('both hands complete planted straight and cross cycles without falls or assistance', async()=>{
 const paths={contactSpeed:5,swingSeconds:.12,elbowExtension:.5,torso:.2};
 for(const hand of ['left','right'])for(const family of ['straight','cross']) {
  const r=await punchCalibration({execution:PLANTED_PUNCH_EXECUTION,paths,armExtension:.5,matchedFeedback:true,pad:{face:'compliant'},hand,family,seconds:8});
  assert.deepEqual(r.qualification,{accepted:true,faults:[]});
  assert.equal(r.cycles.failed,0);assert.equal(r.fell,false);assert.equal(r.floorContacts,0);
  assert.ok(r.cycles.returned[hand]>=3);assert.deepEqual(r.assist,{force:0,moment:0});
 }
});
