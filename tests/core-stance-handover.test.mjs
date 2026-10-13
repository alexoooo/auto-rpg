import test from 'node:test';
import assert from 'node:assert/strict';
import { createBody } from '../src/core/body.ts';
import { withSoles } from '../src/core/human/sole.ts';
import { modelSpec } from '../src/core/models.ts';
import { guardPosture } from '../src/core/skills/guard.ts';
import { coreStand } from './harness/core-stand.mjs';

test('stance torque filtering starts afresh after a sub-mind releases the body', async () => {
  for (const model of ['workshop-fighter', 'workshop-rogue']) {
    const spec = withSoles(modelSpec(model)), posture = guardPosture(spec);
    const stand = await coreStand(spec, { engine: 'rapier-coordinate', posture });
    const state = { active: false };
    const body = createBody(stand.built, stand.world, { subs: [own => ({
      name: 'hold', state, wants: () => state.active, begin() {}, end() {},
      step() { own.muscles.activation.fill(.25); own.muscles.velocity.fill(0); },
    })] });
    let goal;
    body.drive(view => {
      goal ??= { feet: ['left', 'right'], centre: null,
        height: view.stance.centre.y - view.stance.support.y - .03, heading: 0 };
      return { posture, pushes: [], stance: goal };
    });
    const tasks = body.state.mind.host.motor.stance.tasks;
    try {
      stand.world.step(120);
      assert.equal(body.has, 'command');
      assert.deepEqual(tasks.map(t => ({ bearing: t.bearing, finite: [...t.given].map(Number.isFinite) })),
        [{ bearing: true, finite: Array(6).fill(true) }, { bearing: true, finite: Array(6).fill(true) }]);
      assert.ok(tasks.some(t => [...t.given].some(v => Math.abs(v) > 1)), 'loaded stance supplies nonzero torque history');
      state.active = true;
      for (let i = 0; i < 3; i++) {
        stand.world.step();
        assert.equal(body.has, 'hold');
        assert.deepEqual(tasks.map(t => ({ on: t.on, empty: [...t.given].map(Number.isNaN) })),
          [{ on: false, empty: Array(6).fill(true) }, { on: false, empty: Array(6).fill(true) }]);
      }
      state.active = false;
      stand.world.step();
      assert.equal(body.has, 'command');
      for (const [f, side] of ['left', 'right'].entries()) {
        const leg = body.muscles.channels.map((c, i) => ({ c, i }))
          .filter(({ c }) => new RegExp(`^(hip|knee|ankle)\\.${side} `).test(c.name));
        assert.equal(leg.length, 6);
        assert.equal(tasks[f].bearing, true);
        for (const [k, { i }] of leg.entries()) {
          const asked = tasks[f].given[k], sense = Math.sign(asked);
          assert.ok(Number.isFinite(asked));
          const expected = sense * Math.min(Math.abs(asked), body.muscles.strength(i, sense));
          const delivered = Math.sign(body.muscles.velocity[i]) * body.muscles.activation[i]
            * body.muscles.strength(i, Math.sign(body.muscles.velocity[i]));
          assert.ok(Math.abs(delivered - expected) < 1e-10, body.muscles.channels[i].name);
        }
      }
    } finally { body.dispose(); stand.dispose(); }
  }
});
