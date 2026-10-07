import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { threatReader, guardCanReach } from '../src/core/mind/threat.ts';
import { clearStep } from '../src/core/mind/clear-step.ts';
import { solidSenses } from '../src/core/mind/object-senses.ts';
import { frameOf } from '../src/core/spec/body.ts';
import { modelSpec } from '../src/core/models.ts';
import { ARENA_FIGHTER } from '../src/core/mind/config.ts';
import { armed } from '../src/core/human/grip.ts';
import { woodenClub } from '../src/core/items/club.ts';
import { rigidPoints } from '../src/core/build/rigid.ts';
import { aimOf } from '../src/core/skills/strikes.ts';
import { loadEngine,DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { buildBout } from '../research/bout.mjs';
import { traceOf } from './harness/trace.mjs';
import { STAND_ORDERS } from '../src/core/mind/orders.ts';

const { incomingThreat } = threatReader();
const spec=modelSpec('workshop-fighter');

function fixture(hand,position,velocity,{age=0,spin=[0,0,0],offset=[0,0,0],model=spec}={}){
 const segment=model.segments.find(s=>s.name===`hand.${hand}`),frame=frameOf(segment),p=rigidPoints(model,segment).get(aimOf(model,hand)).value;
 const d=p.map((v,k)=>v-frame.origin[k]),local=[frame.x,frame.y,frame.z].map(a=>a.reduce((s,v,k)=>s+v*d[k],0));
 const node=position.map((v,k)=>v-local[k]);
 const sensed={position:new Vector3(...node),rotation:Quaternion.Identity(),centre:new Vector3(...position.map((v,k)=>v-offset[k])),velocity:new Vector3(...velocity),spin:new Vector3(...spin)};
 return {time:1,head:new Vector3(0,1.6,0),fists:{left:{position:new Vector3(-.1,1.6,.3)},right:{position:new Vector3(.1,1.6,.3)}},senses:{time:1,side:'left',others:[{id:'foe',side:'right',out:false,time:1-age,spec:model,segments:new Map([[`hand.${hand}`,sensed]])}]}};
}

test('incoming strikes use both hands, own-head relative motion, sample age and spin while rejecting tangential misses',()=>{
 for(const hand of ['left','right']){
  const v=fixture(hand,[0,1.6,.8],[0,0,-4]),t=incomingThreat(v,[0,0,0]);
  assert.ok(t);assert.equal(t.hand,hand);assert.equal(t.foe,'foe');assert.ok(Math.abs(t.seconds-.125)<1e-12);
  assert.equal(incomingThreat(v,[0,0,-3]),null,'retreat removes the closing threat');
  assert.ok(incomingThreat(v,[0,0,2]).seconds<t.seconds,'head moving into the strike shortens arrival');
  const aged=incomingThreat(fixture(hand,[0,1.6,1.2],[0,0,-4],{age:.1}),[0,0,0]);
  assert.ok(Math.abs(aged.seconds-t.seconds)<1e-12);
  assert.equal(incomingThreat(fixture(hand,[.7,1.6,.8],[0,0,-4]),[0,0,0]),null);
  assert.equal(incomingThreat(fixture(hand,[0,1.6,.8],[0,0,-1]),[0,0,0]),null);
  const spinning=incomingThreat(fixture(hand,[0,1.6,.8],[0,0,0],{spin:[0,5,0],offset:[1,0,0]}),[0,0,0]);
  assert.ok(spinning);assert.ok(spinning.closing>4);
  assert.equal(guardCanReach(v,spec,'left',t),true);
  const club=incomingThreat(fixture(hand,[0,1.6,.8],[0,0,-4],{model:armed(spec,hand,woodenClub())}),[0,0,0]);
  assert.ok(club);assert.ok(Math.abs(club.seconds-t.seconds)<1e-12);
  v.fists.left.position.set(-1,1.6,-1);assert.equal(guardCanReach(v,spec,'left',t),false);
 }
});

test('fixed geometry grants preserve physical sizes and reject swept walls, posts and corners without trapping touching bodies',()=>{
 const input=[{name:'floor',kind:'box',centre:[0,-.5,0],size:[20,1,20]},
  {name:'wall',kind:'box',centre:[0,1,2],size:[4,2,.2]},
  {name:'post',kind:'hull',centre:[3,1,0],points:[[2.8,0,-.2],[3.2,0,-.2],[3.2,2,.2],[2.8,2,.2]]}];
 const solids=solidSenses(input);input[1].size[0]=100;assert.equal(solids[1].size[0],4);assert.ok(Object.isFrozen(solids[1].size));
 assert.equal(clearStep([0,1,0],[0,1,1],.2,solids),true);
 assert.equal(clearStep([0,1,0],[0,1,3],.2,solids),false);
 assert.equal(clearStep([0,1,0],[4,1,0],.2,solids),false);
 assert.equal(clearStep([0,1,1.75],[0,1,1],.2,solids),true);
 assert.equal(clearStep([0,1,1.75],[0,1,1.74],.2,solids),true);
 assert.equal(clearStep([0,1,1.75],[0,1,1.76],.2,solids),false);
 assert.equal(clearStep([0,1,1.75],[.1,1,1.76],.2,solids),false);
 assert.equal(clearStep([0,1,1.75],[0,1,2.5],.2,solids),false);
 const turned=solidSenses([{name:'diagonal',kind:'box',centre:[0,1,2],size:[4,2,.2],turn:Math.PI/2}]);
 assert.equal(clearStep([-1,1,2],[1,1,2],.2,turned),false);
 assert.equal(clearStep([-1,1,0],[-1,1,4],.2,turned),true);
 assert.throws(()=>solidSenses([input[0],input[0]]),/identity/);assert.throws(()=>clearStep([0,0,0],[1,0,0],-1,solids),/radius/);
});

test('physical predictive defense covers only an available hand and preserves its timing through a fresh-world fork',async()=>{
 const recipe={left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},
  minds:{left:{...ARENA_FIGHTER,defenseMode:'predictive'},right:ARENA_FIGHTER},senseDelay:6,recoverySeconds:null,capSeconds:30};
 const a=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)}),b=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try{
  const d=a.duel.duelists.left;let defended=0,evaded=0,covered=0,forked=false;
  for(let i=0;i<3000&&!a.duel.verdict;i++){
   a.world.step();const st=d.minded.skills.state,v=d.minded.body.view;
   defended+=Number(st.tactics.defense==='guard');evaded+=Number(st.tactics.defense==='evade');
   if(st.tactics.defense==='guard'){
    const hands=Object.entries(st.command.effectors).filter(([h,g])=>h!==`hand.${st.hand}`&&g);
    assert.ok(hands.length<=1);covered+=hands.length;
    for(const [,goal]of hands)assert.ok(goal.seconds>0&&goal.seconds<=.15);
    const foe=v.senses.others[0];assert.ok(v.time>=foe.time);assert.ok(v.senses.solids.length>20);
    if(!forked){
     b.duel.load(a.duel.save());const ta=traceOf(Object.values(a.duel.duelists).map(d=>d.built)),tb=traceOf(Object.values(b.duel.duelists).map(d=>d.built));
     for(let k=0;k<120;k++){a.world.step();b.world.step();ta.take();tb.take();}
     assert.deepEqual(b.duel.save().state,a.duel.save().state);assert.equal(ta.digest(),tb.digest());forked=true;
    }
   }
  }
  assert.ok(defended>10);assert.ok(covered>10);assert.ok(evaded>0);assert.equal(forked,true);
 }finally{a.dispose();b.dispose();}
});

test('an ordered approach reaches the real parapet, then autonomous combat escapes and forks beside it',async()=>{
 const recipe={left:'workshop-fighter',right:'workshop-fighter',gap:1.2,held:{left:'empty',right:'empty'},balance:{left:0,right:0},minds:{left:ARENA_FIGHTER,right:ARENA_FIGHTER},recoverySeconds:null,capSeconds:160};
 const a=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)}),b=await buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 try{
  const left=a.duel.duelists.left,right=a.duel.duelists.right;
  const moving={move:{x:-1,z:0},face:{x:-1,z:0},attack:null};
  a.duel.order('left',moving);a.duel.order('right',moving);
  while(left.minded.body.view.stance.centre.x> -12.45&&a.duel.clock<100)a.world.step();
  a.duel.order('left',STAND_ORDERS);a.duel.order('right',STAND_ORDERS);a.world.step(240);
  assert.ok(left.minded.body.view.stance.centre.x< -12.5);assert.equal(left.body.down,false);
  a.duel.order('right',moving);a.world.step(480);a.duel.order('right',STAND_ORDERS);
  a.duel.order('left',null);a.duel.order('right',null);let forked=false,escaped=0;
  for(let i=0;i<1200;i++){
   a.world.step();const st=left.minded.skills.state;
   escaped+=Number(st.tactics.phase==='escape');
   assert.ok(left.minded.body.view.stance.centre.x> -12.9,'the body stays inside the physical parapet');
   if(!forked&&st.tactics.phase==='escape'){
    b.duel.load(a.duel.save());const ta=traceOf(Object.values(a.duel.duelists).map(d=>d.built)),tb=traceOf(Object.values(b.duel.duelists).map(d=>d.built));
    for(let k=0;k<120;k++){a.world.step();b.world.step();ta.take();tb.take();}
    assert.deepEqual(b.duel.save().state,a.duel.save().state);assert.equal(ta.digest(),tb.digest());forked=true;
   }
  }
  assert.ok(escaped>0);assert.equal(forked,true);
  assert.ok(left.minded.skills.report.strike.thrown.left+left.minded.skills.report.strike.thrown.right>0);
 }finally{a.dispose();b.dispose();}
});
