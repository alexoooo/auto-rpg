/**
 * **The tempo fighter** (`src/core/entrants/tempo/`): its config's faults, and a short bout of it on
 * each humanoid with each loadout against the options fighter, which runs, stays finite, reads a
 * phase of its rhythm every step and keeps its memory as plain data. How well it fights is a match
 * (`npm run match -- tempo <mind>`), not a test. Node, core world, Rapier, 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildBout } from "../research/bout.mjs";
import { SIDES } from "../src/arena/duel.ts";
import { CONTROLLERS, MINDS } from "../src/core/mind/controllers.ts";
import { HELD } from "../src/core/items/held.ts";
import { HUMANOID_MODELS, modelSupportsMind } from "../src/core/models.ts";

const TEMPO = MINDS.tempo.config, OPTIONS = MINDS.options.config;
/** Its phases (`tempoTactics`). */
const PHASES = new Set(["wait", "enter", "burst", "exit", "low", "orders"]);
/** Steps a bout: past its first rest, at 120 Hz. */
const STEPS = 360;

test("a tempo config out of its bounds, with no way up or no blow standing, is refused", () => {
  const faults = CONTROLLERS.tempo.faults;
  assert.deepEqual(faults(TEMPO), []);
  assert.deepEqual(faults({ ...TEMPO, burst: 1.5, rest: -1, margin: 2, commit: 0 }), ["burst: 1 to 6", "rest: 0 to 5", "margin: 0 to 1", "commit: 0.2 to 5"]);
  assert.deepEqual(faults({ ...TEMPO, subs: [] }), ["subs: a way up when down"]);
  assert.deepEqual(faults({ ...TEMPO, actions: TEMPO.actions.filter((action) => action.lower !== undefined) }), ["actions: a blow thrown standing"]);
});

for (const model of HUMANOID_MODELS) for (const held of HELD) test(`${model} holding ${held}: a short bout against the options fighter runs, finite, in a phase of its rhythm`, async (t) => {
  if (!modelSupportsMind(model, TEMPO, { left: "empty", right: held })) { t.skip(`the tempo fighter does not fit ${model} holding ${held}`); return; }
  const recipe = { left: model, right: model, gap: 2, loadouts: { left: { left: "empty", right: held }, right: { left: "empty", right: held } }, minds: { left: TEMPO, right: OPTIONS } };
  const { world, duel, dispose } = await buildBout(recipe);
  try {
    duel.play([]);
    const seen = new Set();
    while (duel.steps < STEPS) {
      world.step();
      seen.add(duel.duelists.left.minded.skills.report.engagement.phase);
      for (const side of SIDES) for (const segment of duel.duelists[side].built.segments.values()) {
        const { position: p, rotationQuaternion: q } = segment.node;
        assert.ok([p.x, p.y, p.z, q.x, q.y, q.z, q.w].every(Number.isFinite), `${side}'s ${segment.spec.name} at step ${duel.steps}`);
      }
    }
    assert.deepEqual([...seen].filter((phase) => !PHASES.has(phase)), [], "every phase is one of its rhythm's");
    const memory = duel.duelists.left.minded.state;
    assert.deepEqual(JSON.parse(JSON.stringify(memory)), structuredClone(memory), "its memory is plain data");
  } finally { dispose(); }
});
