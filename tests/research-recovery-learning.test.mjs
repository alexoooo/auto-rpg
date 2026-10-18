import test from 'node:test';
import assert from 'node:assert/strict';
import { learningEnvironment } from '../research/stand-up-learning-environment.mjs';
import { SEARCH_FALL } from '../src/lab/stance-mode.ts';

for (const mode of ['torque','targets']) test(`${mode} learning resumes physical transitions, action history, reward and sampling state`, async()=>{
  const e=await learningEnvironment({seed:4,balance:50,mode});
  try {
    const reset=await e.reset({degrees:90});
    assert.equal(reset.result.fell,true);
    assert.ok(reset.observation.length>e.actionSize && reset.observation.every(Number.isFinite));
    const saved=e.save();
    assert.throws(()=>e.step(Array(e.actionSize).fill(NaN)),/invalid policy action/);
    assert.deepEqual(e.save(),saved);
    const action=Array(e.actionSize).fill(.1);
    const result=e.step(action);
    assert.equal(result.episodeSteps,3);
    assert.ok(Number.isFinite(result.reward));
    e.restore(saved);
    assert.deepEqual(e.step(action),result);
    assert.equal(result.terminated,false);
    assert.equal(result.truncated,false);
  }finally{e.dispose();}
});

test('a prevented shove is recorded before declared fallback falls', async()=>{
  const e=await learningEnvironment({seed:4,balance:50});
  try {
    const reset=await e.reset({degrees:180});
    assert.equal(reset.attempts[0].fell,false);
    assert.equal(reset.attempts[0].impulse,SEARCH_FALL.impulse);
    assert.equal(reset.result.fell,true);
    assert.ok([90,120,160].includes(reset.recipe.impulse));
    assert.deepEqual(reset.requestedRecipe,{degrees:180,impulse:SEARCH_FALL.impulse,separation:SEARCH_FALL.separation,settleSteps:0});
    assert.deepEqual(reset.attempts.at(-1),{...reset.recipe,fell:true});
  }finally{e.dispose();}
});
