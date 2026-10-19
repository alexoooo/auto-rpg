// What the fighter's actions commit, measured and not a gate (`tests/experimental.json`), on the
// Node arena stand, vendored Rapier, 120 Hz.
import test from 'node:test';
import assert from 'node:assert/strict';
import {RECIPE_FIGHTER,SCRAPPER} from '../src/core/mind/config.ts';
import {STAND_ORDERS} from '../src/core/mind/orders.ts';
import {loadEngine,DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {buildBout} from '../research/bout.mjs';
import {COMBAT,KICKER} from './fixtures/minds.mjs';

const bout=async(left,right,recipe={})=>buildBout({left:'workshop-fighter',right:'workshop-fighter',held:{left:'empty',right:'empty'},balance:{left:0,right:0},
 minds:{left,right},recoverySeconds:null,capSeconds:30,...recipe},{physicsEngine:await loadEngine(DEFAULT_ENGINE)});

test('a named recipe executor commits a blow within the bout',async()=>{
 const s=await bout(RECIPE_FIGHTER,COMBAT,{gap:1.4});
 try{
  const left=s.duel.duelists.left.minded;
  // The recipe places and settles its body before it chambers.
  while(s.duel.clock<30&&!s.duel.verdict&&!left.skills.report.ledger.some(record=>record.committed))s.world.step();
  assert.ok(left.skills.report.ledger.some(record=>record.committed),JSON.stringify(left.skills.report.ledger));
 }finally{s.dispose();}
});

test('a fighter with only the configured kick action commits a kick within 15 s',async()=>{
 const onlyKick={...KICKER,actions:KICKER.actions.filter(action=>action.name==='kick'),tactics:{...KICKER.tactics,
  choose:{kind:'first-ready',rethink:.2,patience:2},list:[{kind:'attack'},{kind:'approach'},{kind:'cover',guard:'pose'}]}};
 const s=await bout(onlyKick,SCRAPPER,{gap:1.4,capSeconds:60});
 try{
  s.duel.order('right',STAND_ORDERS);const skills=s.duel.duelists.left.minded.skills;
  while(s.duel.clock<15&&!s.duel.verdict&&!skills.report.ledger.some(record=>record.committed))s.world.step();
  assert.ok(skills.report.ledger.some(record=>record.action==='kick'&&record.committed),JSON.stringify(skills.report.ledger));
 }finally{s.dispose();}
});
