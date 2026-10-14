/** Real ground ownership on the Node stand, Rapier, 120 Hz; locomotion and contacts remain physical. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { coreStand, saveStand, loadStand } from './harness/core-stand.mjs';
import { shows } from './harness/fork.mjs';
import { modelSpec } from '../src/core/models.ts';
import { uprightness } from '../src/core/control/ground.ts';
import { GUARD } from '../src/core/skills/guard.ts';
import { createBody } from '../src/core/body.ts';
import { subMindsOf } from '../src/core/mind/sub-minds.ts';
import { createSenses } from '../src/core/mind/senses.ts';
import { buildBody } from '../src/core/build/build-body.ts';
import { dummySpec } from '../src/lab/targets.ts';

async function fixture(config, at = [.12, .35, -.25]) {
  const spec = modelSpec('workshop-fighter'), rotation = Quaternion.RotationAxis(Vector3.Right(), -Math.PI / 2).asArray();
  const initial = await coreStand(spec, { posture: GUARD, rotation });
  const height = .02 - uprightness(initial.built).lowest(); initial.dispose();
  const stand = await coreStand(spec, { posture: GUARD, rotation, position: [0, height, 0] });
  const hub = createSenses(stand.world), senses = hub.add({ id: 'own', side: 'a', built: stand.built, out: () => false });
  let target;
  const moveFoe = position => {
    if (target) { hub.remove('foe'); target.dispose(); }
    target = buildBody(dummySpec(spec), stand.world, { position });
    for (const part of target.segments.values()) part.body.setFixed(true);
    hub.add({ id: 'foe', side: 'b', built: target, out: () => false });
  };
  moveFoe(at);
  const body = createBody(stand.built, stand.world, { feedback: true, senses,
    subs: subMindsOf([config, { kind: 'stand-up', techniques: ['roll', 'roll-back', 'plant-up', 'sit-up', 'post-up'] }]),
    contactIdentity: other => [...target.segments.values()].some(part => part.body === other)
      ? { kind: 'body', body: 'foe', segment: 'head', guard: false } : null });
  return { ...stand, body, hub, moveFoe, states: { body: body.state, senses: hub.state },
    dispose() { body.dispose(); hub.dispose(); target.dispose(); stand.dispose(); } };
}

test('cover-only ground fighting stays down near a foe and hands the body to standing recovery when it leaves', async () => {
  const f = await fixture({ kind: 'ground-fight', reach: 1.2, kicks: 'none' });
  try {
    f.step(60);
    assert.equal(f.body.has, 'Fight on the ground');
    for (let step = 60; step < 1200; step++) { f.step(); assert.equal(f.body.view.down, true); }
    assert.equal(f.body.has, 'Fight on the ground');
    assert.deepEqual(f.body.state.mind.subs[0].skills.actions.ledger, []);
    f.moveFoe([4, .35, -.25]); f.step(2);
    assert.match(f.body.has, /^stand up:/);
  } finally { f.dispose(); }
});

test('an active escape roll forks with its selected side and moves away from a real foe', async () => {
  const config = { kind: 'get-away', metres: 2 }, a = await fixture(config, [1, .3, -.9]), b = await fixture(config, [1, .3, -.9]);
  try {
    a.step(120);
    assert.equal(a.body.has, 'Get away');
    assert.equal(a.body.state.mind.subs[0].side, 'left');
    const saved = saveStand(a.world, a.states);
    loadStand(b.world, b.states, saved); b.hub.show();
    for (let step = 0; step < 180; step++) { a.step(); b.step(); }
    assert.deepEqual(saveStand(a.world, a.states).state, saveStand(b.world, b.states).state);
    assert.deepEqual(shows(a.body), shows(b.body));
    assert.ok(a.body.view.stance.centre.x < -.3, JSON.stringify(a.body.view.stance.centre));
    assert.equal(a.body.state.mind.subs[0].failed, 0);
  } finally { a.dispose(); b.dispose(); }
});

test('ground fighting turns its pelvis toward an off-axis foe, makes physical contact and verifies its return', async () => {
  const f = await fixture({ kind: 'ground-fight', reach: 1.2, kicks: 'right' }, [.65, .15, -.4]);
  try {
    let contact = null, turned = 0;
    const axis = new Vector3();
    for (let step = 0; step < 1200; step++) {
      f.step();
      axis.set(0, -1, 0).applyRotationQuaternionToRef(f.body.view.root.rotation, axis);
      turned = Math.max(turned, Math.atan2(axis.x, axis.z));
      const records = f.body.state.mind.subs[0].skills.actions.ledger;
      contact ??= records.find(record => record.ending.kind === 'completed' && record.contacts.loadedInCommit && record.contacts.counts.commit.target > 0);
      assert.equal(f.body.view.down, true);
    }
    assert.ok(turned > .2, `pelvis turns toward the foe by ${turned} rad`);
    assert.ok(contact, JSON.stringify(f.body.state.mind.subs[0].skills.actions.ledger));
    assert.equal(contact.effector, 'foot.right');
    assert.deepEqual(contact.target, { kind: 'body', body: 'foe', region: { kind: 'segment', segment: 'head' } });
    assert.equal(contact.committed, true);
    f.moveFoe([4, .15, -.2]);
    for (let step = 0; step < 600 && !f.body.has.startsWith('stand up:'); step++) f.step();
    assert.match(f.body.has, /^stand up:/);
    assert.deepEqual(f.body.state.mind.subs[0].skills.actions.live, []);
  } finally { f.dispose(); }
});
