import test from 'node:test';
import assert from 'node:assert/strict';
import { modelSpec } from '../src/core/models.ts';
import { guardPosture } from '../src/core/skills/guard.ts';
import { LAB_PRESETS } from '../src/lab/scenarios.ts';
import { labActor } from '../src/lab/actor.ts';
import { startStance } from '../src/lab/stance-mode.ts';
import { coreStand } from './harness/core-stand.mjs';
import { unassistedAudit } from '../research/stand-up-unassisted.mjs';

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

test('live left gusts select body-matched guidance and return to standing and walking in one attempt', async () => {
  for (const [impulse, reference] of [[60, 3], [62, 4]]) {
    const spec = modelSpec('workshop-fighter');
    const stand = await coreStand(spec, { engine: 'rapier-coordinate', groundSize: 40, posture: guardPosture(spec) });
    const stance = startStance(labActor(stand.built, stand.world,
      { mind: { ...LAB_PRESETS.script.config, subs: [{ kind: 'research-rise' }] } }));
    let audit;
    try {
      stand.world.step(240); stance.shove(impulse, -90);
      stand.world.step(24); stance.shove(impulse, -90); stand.world.step();
      audit = unassistedAudit(stand.built, () => stand.world.steps);
      const state = stance.body.state.mind.subs[0];
      const step = () => {
        stand.world.step();
        assert.equal(stance.body.assist.meter.force, 0);
        assert.equal(stance.body.assist.meter.moment, 0);
        for (const j of stance.body.observe().joints)
          assert.ok(Math.max(j.effort - j.positive, -j.effort - j.negative) < .0001);
      };
      while (state.completed === 0 && stand.world.time < 10) step();
      assert.deepEqual({ attempts: state.attempts, completed: state.completed, reference: state.policy.reference },
        { attempts: 1, completed: 1, reference });
      assert.ok(stand.world.time - state.started < 7);
      for (let i = 0; i < 240; i++) {
        step(); assert.equal(stance.body.down, false); assert.equal(stance.body.has, 'command');
      }
      const from = stance.body.observe().centre;
      stance.orders.forward = .3;
      for (let i = 0; i < 120; i++) {
        step(); assert.equal(stance.body.down, false); assert.equal(stance.body.has, 'command');
      }
      const to = stance.body.observe().centre;
      assert.ok(Math.hypot(to[0] - from[0], to[2] - from[2]) >= .1);
      audit.check();
    } finally { audit?.dispose(); stance.dispose(); stand.dispose(); }
  }
});
