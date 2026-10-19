/** Real ground ownership on the Node stand, Rapier, 120 Hz; locomotion and contacts remain physical. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { saveStand, loadStand } from './harness/core-stand.mjs';
import { shows } from './harness/fork.mjs';
import { groundFoe } from './harness/ground-foe.mjs';

test('cover-only ground fighting stays down near a foe and hands the body to standing recovery when it leaves', async () => {
  const f = await groundFoe({ kind: 'ground-fight', reach: 1.2, kicks: 'none' });
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

test('an active escape roll picks a side and forks with it', async () => {
  const config = { kind: 'get-away', metres: 2 }, a = await groundFoe(config, [1, .3, -.9]), b = await groundFoe(config, [1, .3, -.9]);
  try {
    a.step(120);
    assert.equal(a.body.has, 'Get away');
    assert.ok(['left', 'right'].includes(a.body.state.mind.subs[0].side), a.body.state.mind.subs[0].side);
    const saved = saveStand(a.world, a.states);
    loadStand(b.world, b.states, saved); b.hub.show();
    for (let step = 0; step < 180; step++) { a.step(); b.step(); }
    assert.deepEqual(saveStand(a.world, a.states).state, saveStand(b.world, b.states).state);
    assert.deepEqual(shows(a.body), shows(b.body));
  } finally { a.dispose(); b.dispose(); }
});

test('ground fighting with kicks hands the body to standing recovery once its foe leaves, with nothing left live', async () => {
  const f = await groundFoe({ kind: 'ground-fight', reach: 1.2, kicks: 'right' }, [.65, .15, -.4]);
  try {
    f.step(1200);
    f.moveFoe([4, .15, -.2]);
    for (let step = 0; step < 600 && !f.body.has.startsWith('stand up:'); step++) f.step();
    assert.match(f.body.has, /^stand up:/);
    assert.deepEqual(f.body.state.mind.subs[0].skills.actions.live, []);
  } finally { f.dispose(); }
});
