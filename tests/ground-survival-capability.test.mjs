/** Real ground ownership on the Node stand, Rapier, 120 Hz; locomotion and contacts remain physical. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { saveStand, loadStand } from './harness/core-stand.mjs';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { shows } from './harness/fork.mjs';
import { groundFoe } from './harness/ground-foe.mjs';

test('an active escape roll forks with its selected side and moves away from a real foe', async () => {
  const config = { kind: 'get-away', metres: 2 }, a = await groundFoe(config, [1, .3, -.9]), b = await groundFoe(config, [1, .3, -.9]);
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
  const f = await groundFoe({ kind: 'ground-fight', reach: 1.2, kicks: 'right' }, [.65, .15, -.4]);
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
