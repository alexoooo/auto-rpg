import test from 'node:test';
import assert from 'node:assert/strict';
import {frontKickCalibration,frontKickStand} from '../research/front-kicks.mjs';
import {KICK_PATH,validKickTuning} from '../src/core/skills/kick.ts';
import {saveStand,loadStand} from './harness/core-stand.mjs';
import {traceOf} from './harness/trace.mjs';

test('either foot unloads, strikes, withdraws, lands and recentres against real contacts and misses',async()=>{
  for(const foot of ['left','right'])for(const mode of ['hit','miss','block']){
    const r=await frontKickCalibration({foot,mode});
    assert.deepEqual(r.qualification,{accepted:true,faults:[]},JSON.stringify({foot,mode,report:r.report,phases:r.phases}));
    assert.equal(r.loadedLaunches,0);assert.ok(r.unloadedLaunches>=3);
    assert.equal(r.fell,false);assert.equal(r.floorContacts,0);assert.equal(r.report.failed,0);
    assert.ok(r.report.returned[foot]>=3);assert.deepEqual(r.assist,{force:0,moment:0});
    assert.ok(r.head[1]>1.5);
    if(mode==='miss')assert.deepEqual(r.impacts,[]);
    else assert.ok(r.impacts.filter(e=>e.eligible).length>=3);
    if(mode==='block')assert.equal(r.cycle.impacts.admitted,0,'an unrelated blocker cannot admit follow-through');
    else if(mode==='hit')assert.ok(r.cycle.impacts.admitted>=3,'matched target contacts admit the bounded interval');
    for(const impact of r.impacts.filter(e=>e.eligible)){
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
      while(a.world.time<10&&(stage==='impact'?!a.skills.state.kick.cycle.impact:a.skills.report.kick.stage!==stage))a.step();
      assert.ok(a.world.time<10,stage);
      loadStand(b.world,states(b),saveStand(a.world,states(a)));
      const ta=traceOf([a.built]),tb=traceOf([b.built]);
      for(let i=0;i<720;i++){a.step();b.step();ta.take();tb.take();}
      assert.equal(ta.digest(),tb.digest(),stage);
      assert.deepEqual(saveStand(a.world,states(a)).state,saveStand(b.world,states(b)).state);
      assert.ok(a.skills.report.kick.returned.right>=1);assert.equal(a.body.down,false);
    }finally{a.dispose();b.dispose();}
  }
});

test('cancelling a committed kick withdraws and places the foot without starting another stroke',async()=>{
  for(const foot of ['left','right']){
    const s=await frontKickStand({foot,cancelAt:5.3});
    try{
      s.step(15*120);const r=s.reading();
      assert.equal(r.fell,false);assert.equal(r.floorContacts,0);assert.equal(r.report.foot,null);
      assert.equal(r.report.failed,0);assert.equal(r.report.returned[foot],1);
      assert.equal(r.unloadedLaunches,1);assert.equal(r.loadedLaunches,0);
      assert.ok(s.body.view.stance.velocity.length()<.05);
      assert.ok(s.body.view.head.y>1.58);
      assert.ok(Math.abs(s.body.view.stance.centre.y-s.body.view.stance.support.y-(s.skills.report.reference-.03))<.02);
    }finally{s.dispose();}
  }
});

test('kick durations and bounded execution are validated before a physical body is driven',()=>{
  assert.equal(validKickTuning(KICK_PATH),true);
  for(const key of ['setupLimit','transferLimit','transferSeconds','chamberSeconds','swingSeconds','returnSeconds',
    'prepareLimit','returnLimit','hold','placeSeconds','placeLimit','recenterLimit','contactSpeed','response'])
    assert.equal(validKickTuning({...KICK_PATH,[key]:0}),false,key);
  assert.equal(validKickTuning({...KICK_PATH,rotationError:1.1}),false);
  assert.equal(validKickTuning({...KICK_PATH,normalAlignment:1.1}),false);
  assert.equal(validKickTuning({...KICK_PATH,soleTurn:1.1}),false);
  assert.equal(validKickTuning({...KICK_PATH,lift:NaN}),false);
});
