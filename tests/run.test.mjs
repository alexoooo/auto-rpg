/**
 * **The run** (`run`, `src/core/skills/run.ts`), on the Node stand at 120 Hz: a Warrior with it
 * runs on the spot for two seconds on its feet, a flight (`"flight"`) among its steps that lands;
 * and its faults refuse settings it cannot carry out. How many flights land is measured in
 * `run-capability.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { RUN } from "../src/core/skills/run.ts";
import { labActor } from "../src/lab/actor.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { coreStand } from "./harness/core-stand.mjs";

const RUNNING = { ...LAB_PRESETS.script.config, locomotion: { kind: "run", ...RUN } };

test("a_warrior_with_the_run_runs_on_the_spot_on_its_feet_a_flight_among_its_steps", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  const actor = labActor(stand.built, stand.world, { mind: RUNNING });
  actor.drive({ name: "on-the-spot", decide: ({ view }) => ({ move: view.time < 1 ? null : [0, 0], face: 0, guard: NO_COVER, actions: [] }) });
  const phases = { stand: 0, shift: 0, swing: 0, flight: 0 };
  let landed = 0, last = null;
  try {
    stand.step(stand.seconds(1));
    for (let k = 0; k < 240 && !actor.body.view.down; k++) {
      stand.step(1);
      const phase = actor.body.view.stance.phase;
      phases[phase]++;
      if (last === "flight" && phase !== "flight") landed++;
      last = phase;
    }
    assert.equal(actor.body.view.down, false, `fell at ${actor.body.view.time.toFixed(2)} s`);
    assert.ok(landed >= 1 && phases.flight > 0, `flights landed: ${landed}; ${JSON.stringify(phases)}`);
  } finally { actor.dispose(); stand.dispose(); }
});

test("the_run_is_a_fighters_locomotion_and_refuses_what_it_cannot_carry_out", () => {
  assert.deepEqual(treeFaults(RUNNING, ["script"]), []);
  for (const bad of [{ contact: 0 }, { flight: -0.1 }, { gain: -1 }, { width: Number.NaN }, { drop: -0.01 }, { accel: 0 }]) {
    const faults = treeFaults({ ...RUNNING, locomotion: { ...RUNNING.locomotion, ...bad } }, ["script"]);
    assert.ok(faults.some((f) => f.includes("run")), `${JSON.stringify(bad)}: ${JSON.stringify(faults)}`);
  }
});
