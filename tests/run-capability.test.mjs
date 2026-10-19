/**
 * **How well the run goes** (`run`, `src/core/skills/run.ts`), measured on the Node stand at
 * 120 Hz, and not a gate (`tests/experimental.json`): a Warrior with it runs on the spot for four
 * seconds on its feet, each step thrown into a flight (`"flight"`) that lands.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { RUN } from "../src/core/skills/run.ts";
import { labActor } from "../src/lab/actor.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { coreStand } from "./harness/core-stand.mjs";

const RUNNING = { ...LAB_PRESETS.script.config, locomotion: { kind: "run", ...RUN } };

test("a_warrior_with_the_run_runs_on_the_spot_each_step_a_flight_that_lands", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  const actor = labActor(stand.built, stand.world, { mind: RUNNING });
  actor.drive({ name: "on-the-spot", decide: ({ view }) => ({ move: view.time < 1 ? null : [0, 0], face: 0, guard: NO_COVER, actions: [] }) });
  const phases = { stand: 0, shift: 0, swing: 0, flight: 0 };
  let landed = 0, last = null;
  try {
    stand.step(stand.seconds(1));
    for (let k = 0; k < 480 && !actor.body.view.down; k++) {
      stand.step(1);
      const phase = actor.body.view.stance.phase;
      phases[phase]++;
      if (last === "flight" && phase !== "flight") landed++;
      last = phase;
    }
    assert.equal(actor.body.view.down, false, `fell at ${actor.body.view.time.toFixed(2)} s`);
    assert.ok(landed >= 6, `flights landed: ${landed}; ${JSON.stringify(phases)}`);
    assert.ok(phases.flight > 0 && phases.swing > phases.flight, `the steps bear and fly: ${JSON.stringify(phases)}`);
  } finally { actor.dispose(); stand.dispose(); }
});
