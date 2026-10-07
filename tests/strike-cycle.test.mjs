import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceStrike,strikeTransition,STRIKE_EVENT} from '../src/core/skills/strike-cycle.ts';
const limits={near:.05,slow:.6,hold:.05,prepareLimit:.8,returnLimit:1.2,followSeconds:.04,
 impact:{impactSeconds:.04,impactTravel:.04}};
const fresh=()=>({phase:null,time:0,ready:0,sequence:0,velocity:[0,0,0],touching:false,impact:null});
const motion={at:[0,0,0],velocity:[0,0,0],home:[0,0,0],chamber:[0,0,0],requested:true,down:false,
 supported:true,prepared:true,touching:false,intended:false,aligned:true,contactVelocity:[0,0,5],seconds:.12};

test('preparation needs measured support, closure, proximity and low speed; its deadline withdraws',()=>{
 for(const change of [{supported:false},{prepared:false},{at:[.051,0,0]},{velocity:[.601,0,0]}]) {
  const s=fresh();strikeTransition(s,'chamber',[0,0,0]);
  assert.equal(advanceStrike(s,{...motion,...change},limits,.05),0);assert.equal(s.phase,'chamber');
  assert.equal(advanceStrike(s,{...motion,...change},limits,.75),STRIKE_EVENT.failed);assert.equal(s.phase,'return');
 }
 const s=fresh();strikeTransition(s,'chamber',[0,0,0]);
 assert.equal(advanceStrike(s,motion,limits,.05),STRIKE_EVENT.launch);assert.equal(s.phase,'swing');
});

test('only an intended aligned first contact admits a finite impact; blocks and support loss withdraw',()=>{
 for(const change of [{intended:false},{aligned:false},{supported:false},{down:true},{requested:false}]) {
  const s=fresh();strikeTransition(s,'swing',[0,0,0]);
  assert.ok(advanceStrike(s,{...motion,touching:true,intended:true,...change},limits,.01)&STRIKE_EVENT.thrown);
  assert.equal(s.phase,'return');assert.equal(s.impact,null);
 }
 for(const end of [{dt:.04,change:{}},{dt:.01,change:{at:[0,0,.04]}},
  {dt:.01,change:{supported:false}},{dt:.01,change:{requested:false}}]) {
  const s=fresh();strikeTransition(s,'swing',[0,0,0]);
  assert.equal(advanceStrike(s,{...motion,touching:true,intended:true},limits,.01),STRIKE_EVENT.admitted);
  assert.deepEqual(s.impact,{origin:[0,0,0],finish:[0,0,.04],elapsed:0});
  assert.ok(advanceStrike(s,{...motion,...end.change},limits,end.dt)&STRIKE_EVENT.thrown);
  assert.equal(s.phase,'return');assert.equal(s.impact,null);
 }
});

test('a finite miss withdraws and a timeout or fallen home never counts as a verified return',()=>{
 const s=fresh();strikeTransition(s,'swing',[0,0,0]);
 assert.equal(advanceStrike(s,motion,limits,.16),STRIKE_EVENT.thrown);
 assert.equal(advanceStrike(s,{...motion,down:true},limits,1.2),STRIKE_EVENT.finished|STRIKE_EVENT.failed);
 assert.equal(s.phase,null);
 strikeTransition(s,'return',[0,0,0]);
 assert.equal(advanceStrike(s,motion,limits,.05),STRIKE_EVENT.finished|STRIKE_EVENT.returned);
});

test('contact release gates a measured return and still has a finite deadline',()=>{
 for(const released of [false,true,undefined]) {
  const s=fresh();strikeTransition(s,'return',[0,0,0]);
  const result=advanceStrike(s,{...motion,released},limits,.05);
  assert.equal(result,released===false?0:STRIKE_EVENT.finished|STRIKE_EVENT.returned);
  assert.equal(s.phase,released===false?'return':null);
  if(released===false) {
   assert.equal(s.ready,0);
   assert.equal(advanceStrike(s,{...motion,released},limits,1.15),STRIKE_EVENT.finished|STRIKE_EVENT.failed);
   assert.equal(s.phase,null);
  }
 }
 const s=fresh();strikeTransition(s,'return',[0,0,0]);
 advanceStrike(s,{...motion,released:false},limits,.04);
 assert.equal(advanceStrike(s,{...motion,released:true},limits,.025),0);
 assert.equal(advanceStrike(s,{...motion,released:false},limits,.025),0);
 assert.equal(s.ready,0);
 assert.equal(advanceStrike(s,{...motion,released:true},limits,.05),STRIKE_EVENT.finished|STRIKE_EVENT.returned);
});
