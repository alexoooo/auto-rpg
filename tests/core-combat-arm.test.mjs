import test from 'node:test';
import assert from 'node:assert/strict';
import {validArmExtension} from '../src/core/mind/intent.ts';
import {SCRAPPER} from '../src/core/mind/config.ts';
import {actionConfigFaults} from '../src/core/mind/action-config.ts';
import {driveFighter} from '../src/core/mind/fighter.ts';
import {combatStrike} from '../research/combat-strikes.mjs';
import {coreStand,saveStand,loadStand} from './harness/core-stand.mjs';
import {pathStand} from './harness/path-stand.mjs';
import {modelSpec} from '../src/core/models.ts';
import {createBody,SERVO_SECONDS} from '../src/core/body.ts';
import {GUARD} from '../src/core/skills/guard.ts';
import {DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {traceOf} from './harness/trace.mjs';

/** Scrapper with its straight action's arm style set to `armExtension`. */
const styled=armExtension=>({...SCRAPPER,actions:SCRAPPER.actions.map(action=>action.name==='straight'?{...action,armExtension}:action)});

test('an invalid action arm style is a fault of the config, refused before any executor is built',async()=>{
 for(const v of [undefined,0,.5,1])assert.equal(validArmExtension(v),true);
 for(const v of [-.1,1.1,NaN,Infinity])assert.equal(validArmExtension(v),false);
 const spec=modelSpec('workshop-fighter');
 for(const v of [0,.5,1])assert.deepEqual(actionConfigFaults(spec,SCRAPPER.executors,styled(v).actions),[]);
 const s=await coreStand(spec,{engine:DEFAULT_ENGINE}),body=createBody(s.built,s.world,{servoSeconds:SERVO_SECONDS,feedback:true});
 try{
  for(const v of [-.1,1.1,NaN,Infinity]){
   assert.deepEqual(actionConfigFaults(spec,SCRAPPER.executors,styled(v).actions),['straight: invalid arm extension']);
   assert.throws(()=>driveFighter(body,s.world,styled(v),{name:'styled',orders:()=>null}),/^Error: straight: invalid arm extension$/);
  }
 }finally{body.dispose();s.dispose();}
});

test('action arm style overrides both inherited preferences through whole physical contact and miss cycles on either hand',async()=>{
 // 58 cm ahead, where every blow of a hit cell lands on the box.
 for(const hand of ['right','left'])for(const mode of ['hit','miss'])for(const armExtension of [0,1]){
  const common={hand,mode,seconds:8,ahead:.58,across:.1,measureMass:true};
  const expected=await combatStrike({...common,tuning:{elbowExtension:armExtension}});
  const row=await combatStrike({...common,tuning:{elbowExtension:1-armExtension},armExtension});
  const {armExtension:style,...observed}=row;assert.equal(style,armExtension);
  assert.deepEqual({...observed,tuning:expected.tuning},expected);
  assert.equal(row.fell,false);assert.equal(row.cycles.failed,0);assert.ok(row.cycles.returned[hand]>=6);
 }
});

test('an action arm style extends the elbow in its swing, keeps the target it took through a moved proposal and a fresh-world fork to its verified return, and ends on takeover',async()=>{
 for(const hand of ['right','left']){
  const a=await pathStand({hand,action:{armExtension:1}}),b=await pathStand({hand,action:{armExtension:1}}),name=`elbow.${hand} flexion`;
  try{
   while(a.stage()!=='swing'&&a.world.time<5)a.step();a.step(8);
   assert.equal(a.stage(),'swing');
   const live=a.paths.lives[hand],taken=[...live.target];
   assert.ok(live.elbow>0&&a.skills.state.command.posture[name]<GUARD[name]-.1,JSON.stringify({elbow:live.elbow,posture:a.skills.state.command.posture[name]}));
   // The same request, its point moved: the stroke keeps the point it was admitted with.
   a.aim.at=[a.aim.at[0],a.aim.at[1]-.2,a.aim.at[2]];
   loadStand(b.world,b.states(),saveStand(a.world,a.states()));b.aim.at=[...a.aim.at];
   const ta=traceOf([a.built]),tb=traceOf([b.built]),id=live.request.id;
   for(let i=0;i<200&&!a.skills.report.ledger.some(record=>record.id===id);i++){
    assert.deepEqual(a.paths.lives[hand].target,taken);
    a.step();b.step();ta.take();tb.take();
   }
   assert.deepEqual(a.skills.report.ledger.find(record=>record.id===id)?.ending,{kind:'completed'});
   assert.deepEqual([a,b].map(s=>s.cycles.reading().returned[hand]),[1,1]);
   assert.deepEqual(saveStand(a.world,a.states()).state,saveStand(b.world,b.states()).state);
   assert.equal(ta.digest(),tb.digest());
   assert.equal(a.paths.lives[hand],null);assert.equal(a.skills.state.command.posture[name],GUARD[name]);
   // The next stroke, taken over in its swing, ends there and leaves the executor nothing.
   while(a.stage()!=='swing'&&a.world.time<10)a.step();a.step(4);
   const next=a.paths.lives[hand];assert.ok(next&&next.elbow>0);
   a.skills.release(a.body.view,'takeover');
   assert.deepEqual(a.paths.lives,{left:null,right:null});assert.deepEqual(a.skills.report.actions,[]);
   assert.deepEqual(a.skills.report.ledger.at(-1).ending,{kind:'interrupted',reason:'takeover'});
  }finally{a.body.dispose();b.body.dispose();a.dispose();b.dispose();}
 }
});
