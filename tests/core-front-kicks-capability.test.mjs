/**
 * **How well the front kick strikes a pad** (`research/front-kicks.mjs`; Node unpinned core stand,
 * Rapier, 120 Hz, no assist): either foot against a pad, a miss and a blocker, kicked again and
 * again, landing and recentring without a fall.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {frontKickCalibration} from '../research/front-kicks.mjs';

test('either foot unloads, strikes, withdraws, lands and recentres against real contacts and misses', async()=>{
  for(const foot of ['left','right'])for(const mode of ['hit','miss','block']){
    const r=await frontKickCalibration({foot,mode});
    assert.deepEqual(r.qualification,{accepted:true,faults:[]},JSON.stringify({foot,mode,report:r.report,phases:r.phases}));
    assert.equal(r.loadedLaunches,0);assert.ok(r.unloadedLaunches>=3);
    assert.equal(r.fell,false);assert.equal(r.floorContacts,0);assert.equal(r.report.failed,0);
    assert.ok(r.report.returned[foot]>=3);assert.deepEqual(r.assist,{force:0,moment:0});
    assert.ok(r.head[1]>1.5);
    if(mode==='miss')assert.deepEqual(r.impacts,[]);
    else assert.ok(r.impacts.filter(e=>e.eligible).length>=3);
    if(mode==='block')assert.equal(r.cycle.cycles[foot].admitted,0,'an unrelated blocker cannot admit follow-through');
    else if(mode==='hit')assert.ok(r.cycle.cycles[foot].admitted>=3,'matched target contacts admit the bounded interval');
    for(const impact of r.impacts.filter(e=>e.eligible)){
      assert.ok(impact.preImpact.velocity[2]>0,'the foot is moving toward the pad before the force');
      assert.ok(Math.abs(impact.samples.reduce((n,s)=>n+s.impulse,0)-impact.impulse)<1e-12);
    }
  }
});
