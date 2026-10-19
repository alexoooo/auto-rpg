/**
 * **How the Arena fighter attacks a fallen foe** (`research/ground-combat.mjs`; Node Arena duel,
 * Rapier, 120 Hz, no assist): either hand lowers, strikes a stationary or a recovering Warrior on
 * the ground and returns standing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { groundFight } from '../research/ground-combat.mjs';

for(const hand of ['right','left'])for(const recover of [false,true])test(`the real Arena ${hand} hand attacks a ${recover?'recovering':'stationary fallen'} Warrior and returns standing`, async()=>{
 const row=await groundFight({hand,recover,seconds:45}),out=row.summary;
 assert.ok(out.begun!==null&&out.begun<15,JSON.stringify(out));
 assert.ok(out.lowReady>100&&out.lowDriven>=2&&out.damage>.015,JSON.stringify(out));
 assert.equal(out.opponentFell,true);assert.equal(out.attackerFell,false);assert.equal(out.trunkFloor,0);
 assert.equal(out.returnedStanding,true);assert.ok(out.cycles.returned[hand]>=2);
 assert.deepEqual(out.assist,{force:0,moment:0});
 // A recovering foe stands again; a stationary one, once down, stays down.
 if(recover)assert.equal(out.opponentRecovered,true,JSON.stringify(out));
 else{const down=row.rows.findIndex(r=>r.foeDown);assert.ok(down>=0&&row.rows.slice(down).every(r=>r.foeDown));}
});
