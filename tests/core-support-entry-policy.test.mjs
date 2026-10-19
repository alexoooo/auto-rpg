/**
 * **The support entry policy** (`supportEntry`, `src/core/control/support-entry.ts`) on hand-made
 * observations: it reads actual orientation and contact, retries without needing support to begin,
 * replays from a save and refuses invalid settings. No world is stepped.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { supportEntry, supportEntryReading } from "../src/core/control/support-entry.ts";
import { saveState, loadState } from "../src/core/state.ts";

const model = { channels: [{ name: "bend", min: -1, max: 1 }] };
const pose = { targets: { bend: .2 }, seconds: .2 };
const settings = { root: "root", reference: [0, 0, 0, 1], facing: .5, required: ["hand", "shin"], forbidden: ["head"],
  slow: .1, stillSeconds: .2, settleLimit: .4, holdLimit: .3, response: .1, speed: 1,
  roll: { back: [pose], left: [pose], right: [pose] }, prepare: [pose], targets: { bend: .1 } };
const observation = () => ({ segments: [{ name: "root", rotation: [Math.sqrt(.5), 0, 0, Math.sqrt(.5)], velocity: [0, 0, 0] }],
  contacts: ["hand", "shin"].map((segment) => ({ segment, fixed: 0, impulse: 1 })), joints: [{ angle: 0 }] });

test("support entry checks actual orientation/contact and retries without requiring support to begin", () => {
  const o = observation();
  assert.deepEqual(supportEntryReading(o, settings), { lie: "front", supported: true, still: true });
  for (const change of [
    (v) => v.contacts.pop(),
    (v) => v.contacts.push({ segment: "head", fixed: 0, impulse: 1 }),
    (v) => { v.contacts[0].impulse = 0; },
    (v) => { v.contacts[0].fixed = null; },
    (v) => { v.segments[0].rotation = [-Math.sqrt(.5), 0, 0, Math.sqrt(.5)]; },
  ]) { const changed = observation(); change(changed); assert.equal(supportEntryReading(changed, settings).supported, false); }
  const missing = observation(); missing.contacts = [];
  const policy = supportEntry(model, settings);
  assert.deepEqual(policy.step(missing, .1), { kind: "velocity", activation: [0], velocity: [1] });
  assert.deepEqual(policy.step(missing, .1), { kind: "velocity", activation: [1], velocity: [1] });
  assert.equal(policy.state.phase, "prepare");
  policy.step(missing, .1); policy.step(missing, .1); assert.equal(policy.state.phase, "hold");
  for (let i = 0; i < 3; i++) policy.step(missing, .1);
  assert.equal(policy.state.phase, "settle"); assert.equal(policy.state.attempts, 1);
  const back = observation(); back.segments[0].rotation[0] *= -1;
  policy.step(back, .1); policy.step(back, .1); assert.equal(policy.state.phase, "roll");
  const saved = saveState(policy.state);
  const branch = () => { const actions = []; for (let i = 0; i < 10; i++) actions.push(structuredClone(policy.step(o, .1))); return { actions, state: saveState(policy.state) }; };
  const expected = branch(); loadState(policy.state, saved); assert.deepEqual(branch(), expected);
  for (const change of [{ response: 0 }, { reference: [0, 0, 0, 0] }, { reference: [1, , , ] },
    { required: ["head"] }, { targets: { bend: 2 } }, { prepare: [] }]) assert.throws(() => supportEntry(model, { ...settings, ...change }), /invalid/);
  assert.throws(() => policy.step(o, 0), /invalid/);
});
