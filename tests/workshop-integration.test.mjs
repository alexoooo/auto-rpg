import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {humanSetup} from '../src/golem/humanoid/presets.ts';
import {workshopArm,WORKSHOP_SOURCE} from '../src/golem/humanoid/workshop-profile.ts';
import {armForward,solveArm,ARM_REST} from '../src/golem/humanoid/kinematics.ts';
import {golemMatchup,matchupQuery,matchupFromQuery,withPolicy} from '../src/bout.ts';
import {golemSetupRefusal} from '../src/golem/build.ts';
import {runBout,freshHavok} from './harness/bout-runner.mjs';

const build=(primary='blade',secondary='plate',boots=true,armour=true)=>({...humanSetup(primary,secondary),human:{model:'workshop-fighter',boots,armour}});
test('workshop derivative names the unchanged saved source and carries no preview animation',async()=>{
 const source=await readFile(new URL('../assets/character-lab/fighter.blend',import.meta.url));
 assert.equal(createHash('sha256').update(source).digest('hex'),WORKSHOP_SOURCE.source.sha256);
 const bytes=await readFile(new URL('../public/assets/humanoid/workshop-fighter.glb',import.meta.url));
 const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
 assert.equal(doc.animations?.length??0,0);
 assert.ok(doc.images.length>0);assert.ok(doc.materials.some(m=>m.pbrMetallicRoughness?.baseColorTexture));
 assert.ok(!doc.meshes.some(m=>m.name.startsWith('bow__')));
});
test('all sixteen workshop loadouts survive the real matchup codec and copy path',()=>{
 for(const boots of [false,true])for(const armour of [false,true])for(const primary of ['blade','fist'])for(const secondary of ['plate','fist']){
  const setup=build(primary,secondary,boots,armour);assert.equal(golemSetupRefusal(setup),null);
  const matchup=golemMatchup(setup),copied=withPolicy(matchup,'left','humanoid-duelist');
  const parsed=matchupFromQuery(matchupQuery(copied));assert.deepEqual(parsed.left.golem,setup);
  assert.notEqual(copied.left.golem.human,matchup.left.golem.human);
 }
 for(const pair of [['maul','maul'],['blade','blade'],['whip','fist']])assert.ok(golemSetupRefusal(build(...pair)));
 const invalid=golemMatchup(build());invalid.left.golem.human.boots='yes';assert.equal(matchupFromQuery(matchupQuery(invalid)),null);
});
test('workshop arm inverse kinematics uses source lengths and mirrored grip centres',()=>{
 for(const side of [-1,1]){
  const geometry=workshopArm(side),angles=[.3,-.8,.2,-1.2,.3,.1,.1];
  const target=armForward(angles,geometry),solved=armForward(solveArm(target.point,target.rotation,ARM_REST,180,0,false,geometry),geometry);
  assert.ok(Vector3.Distance(solved.point,target.point)<.002);
  assert.ok(Vector3.Distance(armForward(angles).point,target.point)>.03,'legacy geometry must not satisfy this fixture');
 }
});
test('workshop sword and shield participate in a real supported Havok bout',async()=>{
 const result=runBout({left:'humanoid-duelist',right:'humanoid-duelist',leftGolem:build(),rightGolem:humanSetup(),
  seeds:[17,29],locomotionMode:'supported',maxSeconds:8,physics:await freshHavok()});
 assert.ok(result.left.hits+result.right.hits>0);
 assert.ok(result.left.blocks+result.right.blocks>0);
 assert.ok(Number.isFinite(result.left.peakTip));
});
