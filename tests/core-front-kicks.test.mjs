import test from 'node:test';
import assert from 'node:assert/strict';
import {frontKickCalibration,frontKickStand} from '../research/front-kicks.mjs';
import {saveStand,loadStand} from './harness/core-stand.mjs';
import {traceOf} from './harness/trace.mjs';

test('a blocker admits no follow-through, and every impact has the impulse of its samples', async()=>{
  for(const foot of ['left','right']){
    const r=await frontKickCalibration({foot,mode:'block'});
    const impacts=r.impacts.filter(e=>e.eligible);
    assert.ok(impacts.length>0,`${foot}: no kick met the blocker: the fixture did not reach its case`);
    assert.equal(r.cycle.cycles[foot].admitted,0,'an unrelated blocker cannot admit follow-through');
    for(const impact of impacts){
      assert.ok(impact.preImpact.velocity[2]>0,'the foot is moving toward the pad before the force');
      assert.ok(Math.abs(impact.samples.reduce((n,s)=>n+s.impulse,0)-impact.impulse)<1e-12);
    }
  }
});

const states=s=>({body:s.body.state,skills:s.skills.state,pad:s.sensor.state,measurement:s.state});
test('fresh-world forks reproduce unloading, bounded contact and placement through the whole kick path',async()=>{
  for(const stage of ['unload','impact','place']){
    const a=await frontKickStand(),b=await frontKickStand();
    try{
      while(a.world.time<10&&(stage==='impact'?!a.executorState.cycles.right.impact:a.skills.report.actions[0]?.stage!==stage))a.step();
      assert.ok(a.world.time<10,`${stage}: the fixture did not reach its case`);
      loadStand(b.world,states(b),saveStand(a.world,states(a)));
      const ta=traceOf([a.built]),tb=traceOf([b.built]);
      for(let i=0;i<720;i++){a.step();b.step();ta.take();tb.take();}
      assert.equal(ta.digest(),tb.digest(),stage);
      assert.deepEqual(saveStand(a.world,states(a)).state,saveStand(b.world,states(b)).state);
      assert.ok(a.cycles.reading().returned.right>=1);assert.equal(a.body.down,false);
    }finally{a.dispose();b.dispose();}
  }
});

test('cancelling a committed kick withdraws and places the foot without starting another stroke',async()=>{
  for(const foot of ['left','right']){
    const s=await frontKickStand({foot});
    try{
      while(s.world.time<10&&!s.skills.report.actions.some(action=>action.phase==='commit'))s.step();
      assert.ok(s.skills.report.actions.some(action=>action.phase==='commit'));
      s.state.requesting=false;s.step(10*120);const r=s.reading();
      assert.equal(r.fell,false);assert.equal(r.floorContacts,0);assert.deepEqual(s.skills.report.actions,[]);
      assert.equal(r.report.failed,0);assert.equal(r.report.returned[foot],1);
      assert.equal(r.unloadedLaunches,1);assert.equal(r.loadedLaunches,0);
      assert.ok(s.body.view.stance.velocity.length()<.05);
      assert.ok(s.body.view.head.y>1.58);
      assert.ok(Math.abs(s.body.view.stance.centre.y-s.body.view.stance.support.y-(s.skills.report.reference-.03))<.02);
    }finally{s.dispose();}
  }
});
