/**
 * **Locomotion's heading ceiling** (`src/core/skills/locomotion.ts`): a ceiling that is not finite
 * and positive is refused, and none given keeps the envelope's.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {locomotion,validTurnLimit} from '../src/core/skills/locomotion.ts';

test('heading ceilings reject invalid values and an omitted ceiling retains the envelope',()=>{
 for(const value of [-1,0,Infinity,NaN,null]){assert.equal(validTurnLimit(value),false);assert.throws(()=>locomotion(null,value),/finite and positive/);}
 assert.equal(validTurnLimit(),true);assert.equal(validTurnLimit(2),true);
});
