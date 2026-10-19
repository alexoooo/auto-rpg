import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBout} from '../research/bout.mjs';
import {loadEngine,DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {STAND_ORDERS} from '../src/core/mind/orders.ts';
import {traceOf} from './harness/trace.mjs';
import {COMBAT} from './fixtures/minds.mjs';

const candidate=(region={kind:'mark',mark:'high'})=>({...COMBAT,actions:[{...COMBAT.actions[0],name:'lead',effectors:['hand.right'],regions:[region]},
 {...COMBAT.actions[0],name:'follow',effectors:['hand.left'],regions:[region]}],tactics:{...COMBAT.tactics,
 choose:{kind:'rules',rethink:.1,patience:.5,rules:[{when:{kind:'follow-up',seconds:2},actions:['follow']}],otherwise:['lead']}}});
// The foe stands still with its guard down, so a lead reaches it; how often a lead lands on a fighting foe is
// `core-combat-capability`'s.
const still={...COMBAT,tactics:{...COMBAT.tactics,list:[{kind:'follow-orders'}]}};
async function make(side='left',{gap=.9,region}={}){
 const s=await buildBout({left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},
 minds:{left:side==='left'?candidate(region):still,right:side==='right'?candidate(region):still},gap,recoverySeconds:null,capSeconds:30},
 {physicsEngine:await loadEngine(DEFAULT_ENGINE)});
 s.duel.order(side==='left'?'right':'left',STAND_ORDERS);
 return s;
}
const touched=skills=>[...skills.report.actions,...skills.report.ledger].filter(record=>record.contacts.lastTarget!==null);

test('both Arena assignments admit follow-up actions only after exact target contact', async()=>{
 for(const side of ['left','right']){
  const s=await make(side);
  try{
   const d=s.duel.duelists[side],skills=d.minded.skills;let followed=0;const seen=new Set();
   for(let i=0;i<2400&&!s.duel.verdict&&!followed;i++){
    s.world.step();
    for(const action of skills.report.actions)if(action.action==='follow'&&!seen.has(action.id)){
     seen.add(action.id);followed++;
     const contacts=touched(skills).filter(record=>record.target.body===action.target.body);
     assert.ok(contacts.some(record=>action.began-record.contacts.lastTarget<=2&&action.began>=record.contacts.lastTarget),JSON.stringify(action));
    }
   }
   assert.ok(touched(skills).length>0,`${side}: no lead touched the still foe: the fixture did not reach its case`);
   assert.ok(followed>0,`${side} reaches a follow-up after its lead touched`);
   assert.deepEqual({force:d.body.assist.meter.force,moment:d.body.assist.meter.moment},{force:0,moment:0});
  }finally{s.dispose();}
 }
 // The control: leads aimed at the trunk from further off commit and never touch, and no follow-up is admitted.
 const s=await make('left',{gap:1.4,region:{kind:'segment',segment:'upperTrunk'}});
 try{
  const skills=s.duel.duelists.left.minded.skills;let followed=false;
  for(let i=0;i<2400&&!s.duel.verdict;i++){s.world.step();followed||=skills.report.actions.some(action=>action.action==='follow');}
  const leads=skills.report.ledger.filter(record=>record.action==='lead'&&record.committed).length;
  assert.ok(leads>=3&&touched(skills).length===0,`${leads} leads committed, ${touched(skills).length} touched: the control did not reach its case`);
  assert.equal(followed,false);
 }finally{s.dispose();}
});

test('fresh-world forks retain a contact-selected follow-up and ordinary orders withdraw requests', async()=>{
 const a=await make(),b=await make();
 try{
  const skills=a.duel.duelists.left.minded.skills;
  while(a.duel.clock<20&&!skills.report.actions.some(action=>action.action==='follow'))a.world.step();
  assert.ok(skills.report.actions.some(action=>action.action==='follow'),'no follow-up began: the fixture did not reach its case');
  b.duel.load(a.duel.save());const trace=s=>traceOf(Object.values(s.duel.duelists).map(d=>d.built)),ta=trace(a),tb=trace(b);
  for(let i=0;i<240;i++){a.world.step();b.world.step();ta.take();tb.take();}
  assert.deepEqual(a.duel.save().state,b.duel.save().state);assert.equal(ta.digest(),tb.digest());
  a.duel.order('left',STAND_ORDERS);a.world.step(600);assert.deepEqual(skills.report.actions,[]);
  const before=structuredClone(skills.report.ledger);a.world.step(120);assert.deepEqual(skills.report.ledger,before);
 }finally{a.dispose();b.dispose();}
});
