import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {bodyClearance,sensedBounds,sensedFootClearance,lowOpponent} from '../src/core/mind/sensed-bounds.ts';
import {clearanceExit,clearStep} from '../src/core/mind/clear-step.ts';
import {buildBout} from '../research/bout.mjs';
import {COMBAT} from '../src/core/mind/config.ts';
import {DEFAULT_ENGINE,loadEngine} from '../src/core/engine/engines.ts';
import {STAND_ORDERS} from '../src/core/mind/orders.ts';
import {upperSurface,highestSurface} from '../src/core/mind/openings.ts';
import {centreOfToRef} from '../src/core/control/support.ts';

test('the physical Warrior hull and attached club contribute to detached bounds',async()=>{
 const b=await buildBout({left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'club'},minds:{left:COMBAT,right:COMBAT}},
  {physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try {
  b.duel.order('left',STAND_ORDERS);b.duel.order('right',STAND_ORDERS);b.world.step(240);
  const left=b.duel.duelists.left,view=left.body.view,foe=view.senses.others[0],bounds=sensedBounds(foe);
  assert.ok(bodyClearance(left.built.spec)>.15,'hull torso contributes real horizontal extent');
  assert.equal(bounds.length,foe.spec.segments.length+foe.spec.held[0].item.shapes.length);
  const trunk=bounds.find(s=>s.name.includes('/upperTrunk/'));assert.ok(trunk.size[0]>.15&&trunk.size[1]>.15);
  const hand=bounds.filter(s=>s.name.includes('/hand.right/'));
  assert.ok(hand.length>1);assert.ok(hand.slice(1).some(s=>s.centre.some((v,k)=>Math.abs(v-hand[0].centre[k])>hand[0].size[k]/2)),
   'attached geometry extends beyond the bare hand bounds');
  assert.equal(lowOpponent(view,foe),false);
  const part=b.duel.duelists.right.built.segments.get('upperTrunk');
  part.body.applyImpulse(new Vector3(0,0,90),centreOfToRef(part,new Vector3()));b.world.step(120);
  const top=upperSurface(left.body.view.senses.others[0],'upperTrunk');
  const torso=sensedBounds(left.body.view.senses.others[0]).find(s=>s.name.includes('/upperTrunk/'));
  const highest=highestSurface(left.body.view.senses.others[0],'upperTrunk',left.body.view.stance.centre.asArray());
  assert.ok(Math.abs(highest[1]-torso.centre[1]-torso.size[1]/2)<1e-12);
  assert.ok(highest[1]>=top[1]);
  assert.ok(top[1]>torso.centre[1]);
  assert.ok(top.every((v,k)=>Math.abs(v-torso.centre[k])<=torso.size[k]/2+1e-12));
  assert.equal(lowOpponent(left.body.view,left.body.view.senses.others[0]),true,'actual shove supplies the low reading');
  const clear=sensedFootClearance(left.body.view.senses.others[0]);
  assert.equal(clear([-5,0,-5],[-5,0,5],.12),true);
  const fallen=sensedBounds(left.body.view.senses.others[0]).find(s=>s.name.includes('/head/'));
  assert.equal(clear(fallen.centre,fallen.centre,.12),false,'the stationary placement gate rejects occupied physical space');
 }finally{b.dispose();}
});

test('boundary separation chooses the nearest face and transforms rotated boxes',()=>{
 const wall=[{name:'wall',kind:'box',centre:[0,1,2],size:[4,2,.2]}];
 assert.deepEqual(clearanceExit([0,1,1.75],.2,wall),[0,-1]);
 assert.equal(clearanceExit([0,1,1],.2,wall),null);
 assert.equal(clearStep([0,1,1.75],[.1,1,1.75],.2,wall),true,'parallel motion preserves an existing clearance margin');
 const turned=[{...wall[0],turn:Math.PI/2}];
 const exit=clearanceExit([-.25,1,2],.2,turned);
 assert.ok(exit[0]<-.999&&Math.abs(exit[1])<1e-12);
 assert.throws(()=>clearanceExit([0,1,0],NaN,wall),/radius/);
});
