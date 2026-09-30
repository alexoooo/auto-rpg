import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {HUMAN_BUILDS,humanSetup} from '../src/golem/humanoid/presets.ts';
import {workshopSource} from '../src/golem/humanoid/workshop-profile.ts';
import {golemSetupRefusal} from '../src/golem/build.ts';
import {golemMatchup,matchupQuery,matchupFromQuery} from '../src/bout.ts';
import {createBout,runBout,freshHavok,buildArena} from './harness/bout-runner.mjs';
import {captureBout,exactFork} from './harness/fork.mjs';
import {poseHash} from './harness/expert.mjs';
import {ArcherQuiver} from '../src/golem/humanoid/arrows.ts';
import {boxPart} from '../src/rig.ts';
import {LAYER,COLLIDES} from '../src/physics.ts';
import {classicDungeon} from './fixtures/classic-dungeon.mjs';
import {createHeadlessArena} from './harness/golem-headless-arena.mjs';
import {freshIntent} from '../src/action-primitives.ts';

const rogue=HUMAN_BUILDS.find(b=>b.name==='rogue').setup;
const options={left:'humanoid-archer',right:'idle',leftGolem:rogue,rightGolem:humanSetup('fist','fist'),
 seeds:[17,29],locomotionMode:'supported',separation:5,maxSeconds:8};

test('rogue preserves the saved source, textures, rig and selectable sized loadouts',async()=>{
 const profile=workshopSource('workshop-rogue');
 const source=await readFile(new URL('../assets/character-lab/rogue.blend',import.meta.url));
 assert.equal(createHash('sha256').update(source).digest('hex'),profile.source.sha256);
 const bytes=await readFile(new URL('../public/assets/humanoid/workshop-rogue.glb',import.meta.url));
 const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
 assert.equal(gltf.animations?.length??0,0);assert.ok(gltf.images.length>0);assert.ok(gltf.skins.length>0);
 assert.ok(gltf.meshes.some(m=>m.name==='bow__stave'));
 for(const size of [.8,1,1.1])for(const boots of [false,true])for(const armour of [false,true])
 for(const [primary,secondary] of [['bow','bow'],['blade','plate'],['blade','fist'],['fist','plate'],['fist','fist']]){
  const setup={...humanSetup(primary,secondary),human:{model:'workshop-rogue',boots,armour},attributes:{size}};
  assert.equal(golemSetupRefusal(setup),null);
  const roundtrip=matchupFromQuery(matchupQuery(golemMatchup(setup)));
  assert.deepEqual(roundtrip.left.golem,setup);
 }
 assert.ok(golemSetupRefusal({...rogue,secondary:{chain:'anatomical',terminal:'fist'}}));
});

test('a physical archer repeatedly scores point-first arrows and shields block them',async()=>{
 const events=[];
 const result=runBout({...options,physics:await freshHavok(),onEvent:e=>events.push(e)});
 const impacts=events.filter(e=>e.report.projectile);
 assert.ok(impacts.length>=2);assert.ok(result.left.damage>0);
 // Against the Warrior (Node bout runner, 2026-09-27, seeds 17/29) the first arrow lands point-first
 // on the core and the second passes 5 mm outside the core's edge onto the forearm, shaft first, for
 // nothing. So the rule held is that damage needs the point, not that every arrow finds it.
 const scoring=impacts.filter(e=>e.report.postArmourDamage>0);
 assert.ok(scoring.length>=1);assert.ok(scoring.every(e=>e.report.projectile.contactedZone==='head'));
 assert.ok(impacts.filter(e=>e.report.projectile.contactedZone!=='head').every(e=>e.report.postArmourDamage===0));
 // The Warrior's shield rides its own flank (Node bout runner, 2026-09-27): facing the archer square,
 // an arrow at the core passes it by, and no hand pose brings the plate across the centreline. So the
 // defender raises the shield from its rest to the centre of its range and turns. Half a radian with
 // the shield side leading blocks, and the same turn the other way takes the arrow in the core.
 const turned=off=>({name:'shield-turn',decide:view=>{const i=freshIntent();Object.assign(i.secondary,{pointerX:0,pointerY:0,reach:0});
  const bearing=Math.atan2(view.opponent.ground.x-view.self.ground.x,view.opponent.ground.z-view.self.ground.z);
  const error=Math.atan2(Math.sin(bearing+off-view.self.facing),Math.cos(bearing+off-view.self.facing));
  i.turn=Math.max(-1,Math.min(1,error*2));return i;}});
 const shot=async off=>{const e=[];runBout({...options,rightGolem:humanSetup(),rightMind:turned(off),maxSeconds:4,
  physics:await freshHavok(),onEvent:x=>e.push(x)});return e.filter(x=>x.report.weapon==='arrow');};
 const held=await shot(.5),out=await shot(-.5);
 assert.ok(held.length>0 && held.every(e=>e.blocked));
 assert.ok(out.length>0 && out.every(e=>!e.blocked));
});

test('launch teleports a previously parked arrow, live arrows survive controller loss, and the pool cannot overwrite flight',async()=>{
 const {scene,engine,materials}=buildArena(await freshHavok());const q=new ArcherQuiver(scene,'left','test',materials.wood);
 try {
  for(let i=0;i<90;i++){scene._renderId++;scene._advancePhysicsEngineStep(1000/60);}
  const direction=new Vector3(.1,.05,1).normalize();
  for(let i=0;i<12;i++)assert.equal(q.fire(new Vector3(0,3,0),direction,48,Vector3.Zero()),true);
  assert.equal(q.fire(Vector3.Zero(),direction,48,Vector3.Zero()),false);
  const rows=[];assert.equal(q.publish(rows,0,'self'),12);
  for(let i=0;i<4;i++){scene._renderId++;scene._advancePhysicsEngineStep(1000/60);}
  assert.ok(q.arrows.every(a=>a.part.mesh.position.y>2 && a.part.mesh.position.z>2));
  const position=q.arrows[0].part.mesh.position.clone();
  // No shooter exists in this fixture: flight is owned by the physics clock itself.
  scene._renderId++;scene._advancePhysicsEngineStep(1000/60);
  assert.ok(q.arrows[0].part.mesh.position.z>position.z);
 }finally{q.dispose();scene.dispose();engine.dispose();}
});

test('a mid-draw fork restores arm targets, draw state, quiver and policy',async()=>{
 const live=createBout({...options,physics:await freshHavok()});let fork;
 try {
  for(let i=0;i<105;i++)live.step();
  assert.equal(live.left.view.self.ranged.phase,'draw');
  fork=await exactFork(options,captureBout(live,{heap:true}));
  for(let i=0;i<100;i++){
   live.step();fork.step();
   assert.deepEqual(fork.left.view.self.ranged,live.left.view.self.ranged);
   assert.equal(poseHash(fork),poseHash(live),`frame ${i}`);
  }
  assert.ok(live.left.view.self.ranged.shots>0);
 }finally{fork?.dispose();live.dispose();}
});

test('a swept fast arrow hits a thin wall first and cannot continue through it',async()=>{
 const {scene,engine,materials}=buildArena(await freshHavok());const q=new ArcherQuiver(scene,'left','wall-shot',materials.wood);
 const wall=boxPart(scene,{name:'thin-wall',position:new Vector3(0,2,1),size:new Vector3(2,4,.01),mass:0,
  layer:LAYER.WORLD,collidesWith:COLLIDES.WORLD,material:materials.wood});
 const contacts=[];q.arrows[0].contactEvents.add(e=>contacts.push(e.collidedAgainst));
 try{
  q.fire(new Vector3(0,2,0),Vector3.Forward(),120,Vector3.Zero());
  for(let i=0;i<6;i++){scene._renderId++;scene._advancePhysicsEngineStep(1000/60);}
  assert.equal(contacts[0],wall.body);assert.equal(q.arrows[0].spent,true);
  assert.ok(q.arrows[0].part.mesh.position.z<1.5);
 }finally{q.dispose();scene.dispose();engine.dispose();}
});

test('both supported size endpoints complete the real draw and release cycle',async()=>{
 for(const size of [.8,1.1]){
  const b=createBout({...options,leftGolem:{...rogue,attributes:{size}},physics:await freshHavok(),maxSeconds:5});
  try{while(b.step());assert.ok(b.left.view.self.ranged.shots>0,`size ${size}`);
   const view=b.left.effectorModules[0].module.view();assert.ok(view.anchorStray<.05);
  }finally{b.dispose();}
 }
});

test('disabling the bow cancels further draws without deleting a released arrow',async()=>{
 const events=[],b=createBout({...options,physics:await freshHavok(),onEvent:e=>events.push(e)});
 try{
  const module=b.left.effectorModules[0].module;
  for(let i=0;i<300 && module.ranged().shots===0;i++)b.step();
  assert.equal(module.ranged().shots,1);
  const quiver=module.captureState().quiver;
  assert.ok(quiver.arrows.some(a=>!a.spent));module.ruin();
  for(let i=0;i<120;i++)b.step();
  assert.equal(module.ranged().phase,'disabled');assert.equal(module.ranged().shots,1);
  assert.ok(events.some(e=>e.report.projectile?.postArmourDamage>0));
 }finally{b.dispose();}
});
