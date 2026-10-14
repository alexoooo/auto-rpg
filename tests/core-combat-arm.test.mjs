import test from 'node:test';
import assert from 'node:assert/strict';
import {combatStrike} from '../research/combat-strikes.mjs';

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
