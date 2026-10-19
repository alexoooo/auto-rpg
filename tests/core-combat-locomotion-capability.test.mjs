/**
 * **How an unassisted Warrior turns fast as it walks** (`src/core/skills/locomotion.ts`), measured on
 * the Node core stand, Rapier, 120 Hz, and not a gate (`tests/experimental.json`): starting a half
 * turn at 4 rad/s at each pace, with the ceiling or under 2 rad/s, it stays up, ends standing and
 * walks more than four strides (`combatTurn`, `research/combat-locomotion.mjs`). That the heading
 * asked never turns faster than its ceiling is `core-combat-locomotion.test.mjs`'s.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {combatTurn} from '../research/combat-locomotion.mjs';

test('an unassisted Warrior starting a fast left turn stands',async()=>{
 // A step lands no further round than the bearing hip lets the pelvis turn (`landingHeading`); without it these three fell.
 for(const speed of [.18,.35,.5]){
  const config={speed,rate:4,sense:-1,after:0};
  for(const run of [await combatTurn(config),await combatTurn({...config,turnLimit:2})]){
   assert.equal(run.firstDown,null,JSON.stringify(run));assert.equal(run.phase,'stand',JSON.stringify(run));assert.ok(run.strides>4,JSON.stringify(run));
  }
 }
});
