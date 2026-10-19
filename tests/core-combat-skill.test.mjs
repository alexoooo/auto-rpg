import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPE_FIGHTER } from '../src/core/mind/config.ts';
import { COMBAT } from './fixtures/minds.mjs';
import { STAND_ORDERS } from '../src/core/mind/orders.ts';
import { loadEngine, DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { buildBout } from '../research/bout.mjs';
import { traceOf } from './harness/trace.mjs';
import { poseBlocked } from '../src/core/build/hand-poses.ts';

test('explicit orders suppress pursuit and a fresh-world combat fork preserves the whole strike and return', async () => {
 const recipe={left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},
  minds:{left:COMBAT,right:COMBAT},recoverySeconds:null,capSeconds:30};
 const a=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 const b=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try {
  a.duel.order('left',STAND_ORDERS);a.world.step(360);
  assert.equal(a.duel.duelists.left.minded.skills.report.actions.length,0);
  assert.equal(a.duel.duelists.left.minded.skills.report.engagement.phase,'guard');
  a.duel.order('left',null);
  while(a.duel.duelists.left.minded.skills.report.actions[0]?.phase!=='commit'&&a.duel.clock<20)a.world.step();
  assert.equal(a.duel.duelists.left.minded.skills.report.actions[0]?.phase,'commit');
  b.duel.load(a.duel.save());
  const traced=stand=>traceOf(Object.values(stand.duel.duelists).map(d=>d.built));
  const ta=traced(a),tb=traced(b);
  for(let i=0;i<180;i++){a.world.step();b.world.step();ta.take();tb.take();}
  assert.deepEqual(b.duel.save().state,a.duel.save().state);
  assert.equal(tb.digest(),ta.digest());
  a.duel.order('left',STAND_ORDERS);a.world.step(180);
  assert.equal(a.duel.duelists.left.minded.skills.report.actions.length,0);
  assert.equal(a.duel.duelists.left.minded.skills.report.engagement.phase,'guard');
 } finally {a.dispose();b.dispose();}
});


test('every skill set closes a bare hand for its blow and opens it in the guard', async () => {
 for(const mind of [COMBAT,RECIPE_FIGHTER]) {
  const bout=await buildBout({left:'workshop-fighter',right:'workshop-fighter',gap:2,capSeconds:30,recoverySeconds:null,
   balance:{left:0,right:0},held:{left:'empty',right:'empty'},minds:{left:mind,right:mind}},{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
  const tally={},free={left:0,right:0},blocked={};
  // Blocked as `createHandPoses` blocks a change, read where it reads it: before the step, after it has had its say.
  const hook=bout.world.beforeStep(()=>{for(const side of ['left','right'])for(const hand of ['left','right']){
   const part=bout.duel.duelists[side].built.segments.get(`hand.${hand}`);
   blocked[`${side}.${hand}`]={open:poseBlocked(bout.world,part,part.poses.open.collider),fist:poseBlocked(bout.world,part,part.poses.fist.collider)};}});
  try {
   bout.duel.play([]);
   // Until some hand has swung, and every hand has been open in the guard on more than a hundred steps.
   const seen=()=>Object.values(tally).some(t=>t.swing>0)&&['left','right'].every(side=>['left','right'].every(hand=>tally[`${mind.kind} ${side}.${hand}`]?.guardOpen>100));
   while(bout.duel.verdict===null&&bout.duel.clock<30&&!seen()) {
    bout.world.step();
    for(const side of ['left','right']) {
     const d=bout.duel.duelists[side],actions=d.minded.skills.report.actions,poses=d.built.handPoses.state;
     // A step after its last blow has ended, a hand is asked open; one held shut is only an opening blocked until it is clear.
     free[side]=actions.length===0&&!d.body.view.down?free[side]+1:0;
     for(const hand of ['left','right']) {
      const t=tally[`${mind.kind} ${side}.${hand}`]??={swing:0,swingAsked:0,swingFist:0,swingBlocked:0,guard:0,guardAsked:0,guardOpen:0,guardBlocked:0};
      if(actions.some(action=>action.effector===`hand.${hand}`&&action.phase==='commit')){
       t.swing++;if(poses[hand].requested==='fist')t.swingAsked++;if(poses[hand].applied==='fist')t.swingFist++;else if(blocked[`${side}.${hand}`].fist)t.swingBlocked++;}
      if(free[side]>=2){t.guard++;if(poses[hand].requested==='open')t.guardAsked++;if(poses[hand].applied==='open')t.guardOpen++;else if(blocked[`${side}.${hand}`].open)t.guardBlocked++;}
     }
    }
   }
  } finally {hook.dispose();bout.dispose();}
  // Which hands a mind swings is its tactics'; a hand that swings asks for its fist, and every step
  // it swings not closed, its closing is blocked: it meets something as its stroke commits.
  assert.ok(Object.values(tally).some(t=>t.swing>0),`${mind.kind} swings: ${JSON.stringify(tally)}`);
  for(const [key,t] of Object.entries(tally)) {
   assert.ok(t.swingAsked===t.swing&&t.swingFist+t.swingBlocked===t.swing,`${key} swings with its fist: ${JSON.stringify(t)}`);
   // Every step a hand asked open in the guard is not open, its opening is blocked; and it is open on more than a hundred.
   assert.ok(t.guard>100&&t.guardAsked===t.guard&&t.guardOpen+t.guardBlocked===t.guard&&t.guardOpen>100,`${key} opens in the guard: ${JSON.stringify(t)}`);
  }
 }
});
