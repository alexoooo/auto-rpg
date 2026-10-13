import test from 'node:test';
import assert from 'node:assert/strict';
import { modelSpec } from '../src/core/models.ts';
import { guardPosture } from '../src/core/skills/guard.ts';
import { LAB_PRESETS } from '../src/lab/scenarios.ts';
import { labActor } from '../src/lab/actor.ts';
import { startStance } from '../src/lab/stance-mode.ts';
import { coreStand } from './harness/core-stand.mjs';

test('a live Stance fall retries an exhausted reference and returns to quiet standing', async () => {
  const spec = modelSpec('workshop-fighter');
  const stand = await coreStand(spec, { engine: 'rapier-coordinate', groundSize: 40, posture: guardPosture(spec) });
  const mind = { ...LAB_PRESETS.script.config, subs: [{ kind: 'research-rise' }] };
  const stance = startStance(labActor(stand.built, stand.world, { mind }));
  try {
    stand.world.step(240);
    stance.shove(60, 0);
    stand.world.step(24);
    stance.shove(60, 0);
    const state = stance.body.state.mind.subs[0];
    let exhausted = null, retried = null;
    while (stand.world.time < 17) {
      stand.world.step();
      if (state.attempts === 1 && state.exhaustedAt !== null) exhausted ??= state.exhaustedAt;
      if (state.attempts === 2) retried ??= stand.world.time;
      assert.equal(stance.body.assist.meter.force, 0);
      assert.equal(stance.body.assist.meter.moment, 0);
    }
    assert.notEqual(exhausted, null);
    assert.notEqual(retried, null);
    assert.ok(retried - exhausted >= 2 && retried - exhausted <= 2 + 2 * stand.world.dt);
    assert.deepEqual({ active: state.active, attempts: state.attempts, completed: state.completed,
      down: stance.body.down, controller: stance.body.has },
    { active: false, attempts: 2, completed: 1, down: false, controller: 'command' });
    assert.ok(stance.body.observe().height > .95);
  } finally { stance.dispose(); stand.dispose(); }
});
