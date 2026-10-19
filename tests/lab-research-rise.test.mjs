/**
 * **The research rise in the Lab's Stance mode** (`research-rise`, `src/lab/stance-mode.ts`), on the
 * Node core stand, the coordinate engine, 120 Hz: an attempt whose reference is exhausted is retried
 * two seconds on, unassisted and within every joint's effort, whatever its ending. Whether it stands
 * is `lab-research-rise-capability.test.mjs`'s.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { modelSpec } from '../src/core/models.ts';
import { guardPosture } from '../src/core/skills/guard.ts';
import { LAB_PRESETS } from '../src/lab/scenarios.ts';
import { labActor } from '../src/lab/actor.ts';
import { startStance } from '../src/lab/stance-mode.ts';
import { coreStand } from './harness/core-stand.mjs';

test('a live Stance fall retries an exhausted reference two seconds on, unassisted, whatever its ending', async () => {
  const spec = modelSpec('workshop-fighter');
  const stand = await coreStand(spec, { engine: 'rapier-coordinate', groundSize: 40, posture: guardPosture(spec) });
  const stance = startStance(labActor(stand.built, stand.world, { mind: { ...LAB_PRESETS.script.config, subs: [{ kind: 'research-rise' }] } }));
  try {
    stand.world.step(240);
    stance.shove(60, 0);
    stand.world.step(24);
    stance.shove(60, 0);
    const state = stance.body.state.mind.subs[0];
    let exhausted = null, retried = null;
    while (stand.world.time < 17 && retried === null) {
      stand.world.step();
      if (state.attempts === 1 && state.exhaustedAt !== null) exhausted ??= state.exhaustedAt;
      if (state.attempts === 2) retried ??= stand.world.time;
      assert.equal(stance.body.assist.meter.force, 0);
      assert.equal(stance.body.assist.meter.moment, 0);
      for (const j of stance.body.observe().joints)
        assert.ok(Number.isFinite(j.effort) && Math.max(j.effort - j.positive, -j.effort - j.negative) < .0001);
    }
    assert.ok(exhausted !== null && retried !== null,
      `the fixture did not reach its case: by ${stand.world.time} s, ${state.attempts} attempts, ${state.completed} completed`);
    assert.ok(retried - exhausted >= 2 && retried - exhausted <= 2 + 2 * stand.world.dt, `exhausted at ${exhausted} s, retried at ${retried} s`);
  } finally { stance.dispose(); stand.dispose(); }
});
