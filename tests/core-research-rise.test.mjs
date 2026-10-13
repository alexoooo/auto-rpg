import test from 'node:test';
import assert from 'node:assert/strict';
import asset from '../assets/research/research-rise.json' with { type: 'json' };
import observations from './fixtures/research-rise-observations.json' with { type: 'json' };
import { libraryPolicy } from '../src/core/mind/rise/reference-library.ts';
import { pathPolicy } from '../src/core/mind/rise/reference-path.ts';
import { libraryPolicy as researchLibrary } from '../research/stand-up-library-policy.mjs';
import { pathPolicy as researchPath } from '../research/stand-up-path-policy.mjs';
import { loadState, saveState } from '../src/core/state.ts';
import { CLASSIC } from '../src/core/mind/config.ts';
import { modelSpec } from '../src/core/models.ts';
import { mindText, parseMind } from '../src/ui/mind-link.ts';
import { coreStand, saveStand, loadStand } from './harness/core-stand.mjs';
import { labActor } from '../src/lab/actor.ts';
import { startStance } from '../src/lab/stance-mode.ts';
import { LAB_PRESETS } from '../src/lab/scenarios.ts';
const data = JSON.parse(asset.payload);

test('live reference policies preserve the research commands and restore every nested phase', () => {
  for (const entry of [data.default, ...Object.values(data.bodies)]) {
    const channels = entry.channels.map(name => ({ name, min: -10, max: 10 }));
    const args = { ...entry, channels };
    const create = entry.kind === 'library' ? libraryPolicy : pathPolicy;
    const original = (entry.kind === 'library' ? researchLibrary : researchPath)(args);
    const live = create(args), twin = create(args);
    assert.deepEqual(live(observations[0]), original(observations[0]));
    const saved = saveState(live.state);
    loadState(twin.state, saved);
    for (const observation of observations.slice(1)) {
      const action = live(observation);
      assert.deepEqual(action, original(observation));
      assert.deepEqual(twin(observation), action);
      assert.deepEqual(twin.state, live.state);
    }
  }
});

test('research rise is a shared editable recovery choice carried in mind links', () => {
  const config = { ...CLASSIC, subs: [{ kind: 'research-rise' }] };
  for (const model of ['workshop-fighter', 'workshop-rogue'])
    assert.deepEqual(parseMind(mindText(config, {}), modelSpec(model)), { config, faults: [] });
  assert.ok(parseMind(mindText(config, {}), modelSpec('reptile')).faults.length);
});

test('Stance executes live recovery muscles and reproduces a restored fall without assistance', async () => {
  const stand = await coreStand(modelSpec('workshop-fighter'), {
    engine: 'rapier-coordinate', rotation: [Math.sqrt(.5), 0, 0, Math.sqrt(.5)], position: [0, .6, 0],
  });
  const mind = { ...LAB_PRESETS.script.config, subs: [{ kind: 'research-rise' }] };
  const stance = startStance(labActor(stand.built, stand.world, { mind }));
  try {
    stand.world.step(12);
    const recovery = stance.body.state.mind.subs[0];
    assert.equal(recovery.active, true);
    assert.equal(recovery.attempts, 1);
    assert.match(stance.body.has, /^research-rise:/);
    assert.ok(stance.body.muscles.activation.some(v => v > 0));
    assert.deepEqual(Array.from(stance.body.muscles.activation), recovery.action.activation);
    const states = { body: stance.body.state, orders: stance.orders };
    const saved = saveStand(stand.world, states);
    stand.world.step(12);
    const expected = stance.body.observe(), policy = structuredClone(recovery.policy);
    loadStand(stand.world, states, saved);
    stand.world.step(12);
    assert.deepEqual(stance.body.observe(), expected);
    assert.deepEqual(recovery.policy, policy);
    assert.equal(stance.body.assist.meter.force, 0);
    assert.equal(stance.body.assist.meter.moment, 0);
  } finally { stance.dispose(); stand.dispose(); }
});
