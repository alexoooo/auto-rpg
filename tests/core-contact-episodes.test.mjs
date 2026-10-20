import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { sourced } from '../src/core/spec/quantity.ts';
import { buildBody } from '../src/core/build/build-body.ts';
import { watchBlows } from '../src/core/rules/blows.ts';
import { createPool } from '../src/core/rules/pool.ts';
import { rulebook, pointLoadDamage } from '../src/core/rules/rulebook.ts';
import { coreStand, saveStand, loadStand } from './harness/core-stand.mjs';
import { lone } from './fixtures/lone.mjs';
import { centreOfToRef } from '../src/core/control/support.ts';

const q = (v, unit) => sourced(v, unit, 'owner-point-load', 'physical load fixture');
const rules = rulebook('arena');

/** Three physical points press an ordinary rigid slab in the Node stand, without a tissue layer. */
async function rig({ reverse=false, direction=[0,0,1], count=3, force=10, hz=120, rotate=false, both=false, held=false }={}) {
 const base=lone('arbitrary source','contact body',1,{hp:10000});
 const contacts=Array.from({length:count},(_,i)=>{
  const x=count===1?0:(i/(count-1)-.5)*.036;
  return {name:`point.${i}`,shape:{kind:'box',centre:q([x,0,.059],'m'),size:q([.008,.02,.008],'m')},
   surface:{stiffness:q(10e6,'N/m'),directed:{mechanism:'point',direction:q(direction,'1'),alignment:q(.8,'1')}}};
 });
 const spec={...base,segments:base.segments.map(s=>({...s,contacts}))};
 const stand=await coreStand(spec,{gravity:false,ground:false,engine:'rapier-coordinate',hz,rotation:rotate?[0,Math.SQRT1_2,0,Math.SQRT1_2]:undefined});
 const slab=lone('arbitrary target','receiver',1,{hp:10000,stiffness:17000});
 const targetSpec={...slab,segments:slab.segments.map(s=>({...s,
  surface:both?{...s.surface,directed:{mechanism:'point',direction:q([0,0,-1],'1'),alignment:q(.8,'1')}}:s.surface,
  shape:{kind:'box',centre:q([0,0,0],'m'),size:q([.2,.2,.1],'m')}})),
  ...(held?{held:[{segment:'receiver',origin:q([0,0,0],'m'),along:q([0,1,0],'1'),across:q([1,0,0],'1'),
   item:{name:'rigid interceptor',mass:q(1,'kg'),centreOfMass:q([0,0,-.06],'m'),inertia:q([.01,.01,.01],'kg m2'),
    shapes:[{kind:'sphere',centre:q([0,0,-.15],'m'),radius:q(.15,'m')}],points:{},substance:'bone'}}]}:{})};
 const target=buildBody(targetSpec,stand.world,
  {position:rotate?[.12,0,0]:[0,0,held?.4:.12],rotation:rotate?[0,Math.SQRT1_2,0,Math.SQRT1_2]:undefined});
 target.segments.get('receiver').body.setFixed(true);
 const fighters=[{id:'source',side:'one',built:stand.built,pool:createPool(spec,rules)},{id:'target',side:'two',built:target,pool:createPool(target.spec,rules)}];
 const order=reverse?[...fighters].reverse():fighters;
 let watch=watchBlows(stand.world,order,rules);
 const segment=stand.built.segments.get('contact body'),push=new Vector3(),at=new Vector3();
 let pushing=force;
 const hook=stand.world.beforeStep(()=>segment.body.applyForce(push.set(rotate?pushing:0,0,rotate?0:pushing),centreOfToRef(segment,at)));
 return {...stand,fighters,target,get watch(){return watch;},set force(value){pushing=value;},
  states:()=>({pools:fighters.map(f=>f.pool.state),blows:watch.state}),
  replace(){watch.dispose();watch=watchBlows(stand.world,order,rules);},
  dispose(){hook.dispose();watch.dispose();target.dispose();stand.dispose();}};
}
const injury=run=>run.fighters[1].pool.total-run.fighters[1].pool.attachedHp();

test('load injury uses physical impulse and interval, with no fixed damage per contact',()=>{
 assert.equal(pointLoadDamage(rules,1,1),0);
 assert.equal(pointLoadDamage(rules,0,1),0);
 assert.equal(pointLoadDamage(rules,3,1),rules.pointLoad.rate.value*2);
 assert.equal(pointLoadDamage(rules,.3,.1),rules.pointLoad.rate.value*(.3-.1));
 for(const args of [[-1,1],[1,0],[Infinity,1],[1,NaN]])assert.throws(()=>pointLoadDamage(rules,...args));
 for(const [field,unit] of [['threshold','N'],['rate','HP/(N s)']])for(const value of [-1,NaN,Infinity])
  assert.throws(()=>rulebook('arena',{pointLoad:{...rules.pointLoad,[field]:{...q(0,unit),value}}}));
 assert.throws(()=>rulebook('arena',{pointLoad:{...rules.pointLoad,rate:q(1,'N')}}));
 const settings={threshold:q(2,'N'),rate:q(.5,'HP/(N s)')},copy=rulebook('arena',{pointLoad:settings});
 settings.rate=q(100,'HP/(N s)');assert.equal(copy.pointLoad.rate.value,.5);
 assert.equal(pointLoadDamage(copy,3,1),.5);assert.equal(rules.pointLoad.threshold.value,1);
});

test('sustained point load injures ordinary surfaces in either registration order and world rotation',async()=>{
 for(const options of [{},{reverse:true},{rotate:true}]){
  const run=await rig(options);
  try{
   run.step(120);const before=injury(run);run.step(120);
   const actual=injury(run)-before,expected=pointLoadDamage(rules,10,1);
   assert.ok(Math.abs(actual-expected)<expected*.01,JSON.stringify({options,actual,expected}));
   const loads=run.watch.blows.filter(b=>b.kind==='load');assert.ok(loads.length>100);
   assert.ok(loads.every(b=>b.sides.find(s=>s.fighter==='target').mechanism==='point'&&b.seconds===run.world.dt));
   assert.ok(loads.every(b=>!('energy' in b)&&!('work' in b)));
  }finally{run.dispose();}
 }
});

test('tooth count does not multiply injury for the same supported force; rates agree',async()=>{
 const rows=[];
 for(const options of [{count:1},{count:3},{count:3,hz:960}]){
  const run=await rig(options);
  try{run.step(run.world.hz);const before=injury(run);run.step(run.world.hz);rows.push(injury(run)-before);}finally{run.dispose();}
 }
 assert.ok(rows.every(v=>Math.abs(v-rows[0])<rows[0]*.05),JSON.stringify(rows));
});

test('subthreshold, side and reverse loads cause no sustained point injury; unloading stops it',async()=>{
 for(const options of [{force:.5,count:1},{direction:[1,0,0]},{direction:[0,0,-1]}]){
  const run=await rig(options);
  try{run.step(120);const seen=run.watch.blows.length;run.step(120);assert.ok(run.watch.blows.slice(seen).every(b=>b.kind!=='load'),JSON.stringify({options,loads:run.watch.blows.slice(seen).filter(b=>b.kind==='load').map(b=>({impulse:b.impulse,damage:b.sides.map(s=>s.damage)}))}));}finally{run.dispose();}
 }
 const run=await rig();
 try{run.step(120);assert.ok(injury(run)>0);run.force=-10;run.step(60);const before=injury(run);run.force=0;run.step(60);assert.equal(injury(run),before);}finally{run.dispose();}
});

test('loaded contact forks exactly and replacing its observer does not add a wound',async()=>{
 const run=await rig(),twin=await rig();
 try{
  run.step(120);const saved=saveStand(run.world,run.states());loadStand(twin.world,twin.states(),saved);
  const before=injury(run);run.replace();assert.equal(injury(run),before);
  run.step(60);twin.step(60);
  assert.equal(injury(run),injury(twin));
  assert.deepEqual(run.fighters.map(f=>f.pool.state),twin.fighters.map(f=>f.pool.state));
  assert.deepEqual(run.watch.blows,twin.watch.blows.slice(saved.state.blows.blows.length));
 }finally{run.dispose();twin.dispose();}
});

test('opposing points share the same load rule on both sides; held shapes intercept it',async()=>{
 const run=await rig({both:true});
 try{
  run.step(120);const before=run.fighters.map(f=>f.pool.attachedHp());run.step(120);
  const expected=pointLoadDamage(rules,10,1);
  run.fighters.forEach((f,i)=>assert.ok(Math.abs(before[i]-f.pool.attachedHp()-expected)<expected*.01));
  assert.ok(run.watch.blows.some(b=>b.kind==='load'&&b.sides.every(s=>s.damage>0)));
 }finally{run.dispose();}
 const blocked=await rig({held:true});
 try{
  blocked.step(240);
  assert.ok(blocked.watch.blows.some(b=>b.sides.some(s=>s.item==='rigid interceptor')),'the fixture must reach the held shape');
  assert.equal(injury(blocked),0);
  assert.ok(blocked.watch.blows.every(b=>b.kind!=='load'));
 }finally{blocked.dispose();}
});
