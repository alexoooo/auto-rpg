import test from 'node:test';
import assert from 'node:assert/strict';
import {validArmExtension,NO_COVER} from '../src/core/mind/intent.ts';
import {ATTACK_PATH} from '../src/core/skills/attack-path.ts';
import {combatSkills} from '../src/core/skills/combat.ts';
import {combatStrike} from '../research/combat-strikes.mjs';
import {coreStand,saveStand,loadStand} from './harness/core-stand.mjs';
import {modelSpec} from '../src/core/models.ts';
import {createBody,SERVO_SECONDS} from '../src/core/body.ts';
import {GUARD} from '../src/core/skills/guard.ts';
import {DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {traceOf} from './harness/trace.mjs';

async function stand(hand,armExtension,elbowExtension=0) {
 const s=await coreStand(modelSpec('workshop-fighter'),{engine:DEFAULT_ENGINE});
 const body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS,feedback:true}),skills=combatSkills(body,{...ATTACK_PATH,elbowExtension});
 const action={kind:'blow',hand,target:[hand==='right'?.1:-.1,1.63,.6],path:{family:'straight',armExtension}};
 body.drive((view,dt)=>skills.command(view,{move:null,face:0,guard:NO_COVER,attack:view.time>=2?action:null},dt));
 return {...s,body,skills,action};
}

test('the shared executor rejects invalid action arm styles before capturing a strike',async()=>{
 for(const v of [undefined,0,.5,1])assert.equal(validArmExtension(v),true);
 for(const v of [-.1,1.1,NaN,Infinity])assert.equal(validArmExtension(v),false);
 const s=await stand('right',0);
 try{
  s.step(240);const snapshot=structuredClone(s.skills.state);
  for(const armExtension of [-.1,1.1,NaN,Infinity]){
   assert.throws(()=>s.skills.command(s.body.view,{move:null,face:0,guard:NO_COVER,attack:{...s.action,path:{...s.action.path,armExtension}}},1/120),/armExtension/);
   assert.equal(s.skills.state.action,snapshot.action);assert.equal(s.skills.state.hand,null);
  }
 }finally{s.body.dispose();s.dispose();}
});

test('action arm style overrides both inherited preferences through whole physical contact and miss cycles on either hand',async()=>{
 for(const hand of ['right','left'])for(const mode of ['hit','miss'])for(const armExtension of [0,1]){
  const common={hand,mode,seconds:8,ahead:.6,across:.1,measureMass:true};
  const expected=await combatStrike({...common,tuning:{elbowExtension:armExtension}});
  const row=await combatStrike({...common,tuning:{elbowExtension:1-armExtension},armExtension});
  const {armExtension:style,...observed}=row;assert.equal(style,armExtension);
  assert.deepEqual({...observed,tuning:expected.tuning},expected);
  assert.equal(row.fell,false);assert.equal(row.cycles.failed,0);assert.ok(row.cycles.returned[hand]>=6);
 }
});

test('captured arm style survives changed proposals, verified return, fresh-world forks and takeover',async()=>{
 for(const hand of ['right','left']){
  const a=await stand(hand,1),b=await stand(hand,1);
  try{
   while(a.skills.report.strike.phase!=='swing'&&a.world.time<5)a.step();a.step(8);
   assert.equal(a.skills.report.strike.phase,'swing');assert.ok(a.skills.state.elbow>0);
   a.action.path.armExtension=0;
   const states=s=>({body:s.body.state,skills:s.skills.state});
   loadStand(b.world,states(b),saveStand(a.world,states(a)));b.action.path.armExtension=0;
   const ta=traceOf([a.built]),tb=traceOf([b.built]);let returned=false;
   for(let i=0;i<200;i++){
    if(a.skills.report.strike.hand&&!returned)assert.equal(a.skills.state.action.path.armExtension,1);
    a.step();b.step();ta.take();tb.take();returned ||= a.skills.report.strike.pointCycle.returned[hand]>0;
   }
   assert.equal(returned,true);assert.deepEqual(saveStand(a.world,states(a)).state,saveStand(b.world,states(b)).state);
   assert.equal(ta.digest(),tb.digest());assert.equal(a.skills.state.action.path.armExtension,0);
   assert.equal(a.skills.state.command.posture[`elbow.${hand} flexion`],GUARD[`elbow.${hand} flexion`]);
   a.skills.resume(a.body.view);assert.equal(a.skills.state.elbow,0);assert.equal(a.skills.state.initialElbow,0);assert.equal(a.skills.state.action,null);
  }finally{a.body.dispose();b.body.dispose();a.dispose();b.dispose();}
 }
});
