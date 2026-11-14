import test from 'node:test';
import assert from 'node:assert/strict';
import { decode, searchOn, startOf } from '../research/skills/skill-search.mjs';
import { HUMANOID_MODELS, modelSpec } from '../src/core/bodies/models.ts';
import { SIT_BACK, stageFaults } from '../src/skills/recovery/shared/staged/stages.ts';
import { stepUpRecipe, stepUpTuningWith } from '../src/skills/recovery/shared/staged/records.ts';

test('searched recovery angles remain inside the body ranges at both decoded endpoints', () => {
  for (const model of HUMANOID_MODELS) for (const skill of ['roll', 'sit-back']) {
    const search = searchOn(skill, model), spec = modelSpec(model), start = startOf(skill, model);
    const unit = search.dims.map(([key, lo, hi]) => (search.get(start, key) - lo) / (hi - lo));
    for (let i = 0; i < unit.length; i++) for (const end of [0, 1]) {
      const candidate = [...unit]; candidate[i] = end;
      const settings = decode(search, start, candidate);
      const tuning = stepUpTuningWith(spec, skill === 'roll' ? { stepUp: settings } : { sitBack: settings });
      const recipe = skill === 'roll' ? stepUpRecipe(tuning) : stepUpRecipe(tuning, SIT_BACK);
      assert.deepEqual(stageFaults(recipe, spec), [], `${model}, ${skill}, ${search.dims[i][0]}, endpoint ${end}`);
    }
  }
});
