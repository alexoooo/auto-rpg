/**
 * **How the Arena's kicking profile does in a bout** (`research/arena-combat.mjs`; Node, core world,
 * Rapier, 120 Hz, no assist): either foot kicks, completes and lands blows on a standing Scrapper.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {combatTrial} from '../research/arena-combat.mjs';
import {SCRAPPER} from '../src/core/mind/config.ts';
import {KICKER} from './fixtures/minds.mjs';
import {STAND_ORDERS} from '../src/core/mind/orders.ts';

const kicks={...KICKER,actions:KICKER.actions.filter(action=>action.executor==='kick'),tactics:{...KICKER.tactics,choose:{kind:'rotate',rethink:.2,patience:2}}};

test('the selectable Arena profile completes either-foot native strikes and keeps the retained profiles unchanged',async()=>{
  assert.equal(SCRAPPER.actions.some(action=>action.effectors.some(effector=>effector.startsWith('foot.'))),false);
  for(const side of ['left','right']){
    const row=await combatTrial({left:side==='left'?kicks:'scrapper',right:side==='right'?kicks:'scrapper',
      recipe:{capSeconds:90},tape:[{step:0,side:side==='left'?'right':'left',orders:STAND_ORDERS}]});
    const r=row.sides[side];assert.equal(r.falls,0);assert.deepEqual(r.assist,{force:0,moment:0});
    assert.equal(r.actionEndings.filter(record=>record.effector.startsWith('foot.')&&record.ending.kind==='stalled').length,0);
    for(const foot of ['left','right'])assert.ok(r.actionEndings.some(record=>record.effector==='foot.'+foot&&record.ending.kind==='completed'),JSON.stringify(r));
    assert.ok(r.nativeKickContacts>=1&&r.nativeKickDamage>0,JSON.stringify(r));
    assert.ok(r.drivenKicks>=1&&r.kickDamage>0,JSON.stringify(r));
  }
});
