/**
 * **How well each human walks with a club in each hand** (`src/lab/loadout.ts`), measured on the
 * Node core stand, and not a gate (`tests/experimental.json`): it stands, walks eight strides in
 * 5 s and stops, bare or shod.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { loadoutSpec } from "../src/lab/loadout.ts";
import { labActor } from "../src/lab/actor.ts";
import { startStance } from "../src/lab/stance-mode.ts";
import { coreStand } from "./harness/core-stand.mjs";

const MODELS = ["workshop-fighter", "workshop-rogue"];
const bare = (model) => ({ model, right: "empty", left: "empty", boots: true, armour: true });

test("with_a_club_in_each_hand_each_human_stands_walks_and_stops_in_the_stance_bare_or_shod", async () => {
  for (const model of MODELS) for (const sole of [false, true]) {
    const stand = await coreStand(loadoutSpec({ ...bare(model), right: "club", left: "club", sole }), { ground: true });
    const stance = startStance(labActor(stand.built, stand.world));
    const run = (seconds) => stand.step(stand.seconds(seconds));
    try {
      run(2);
      const stood = stance.frame();
      stance.orders.forward = 0.3;
      run(5);
      const walked = stance.frame();
      stance.orders.forward = 0;
      run(3);
      const stopped = stance.frame();
      assert.ok(stood.phase === "stand" && stood.recoveries === 0 && !stood.fallen, `${model}${sole ? " shod" : ""} standing: ${JSON.stringify(stood)}`);
      assert.ok(walked.strides >= 8 && !walked.fallen, `${model}${sole ? " shod" : ""} walking: ${JSON.stringify(walked)}`);
      assert.ok(stopped.phase === "stand" && !stopped.fallen, `${model}${sole ? " shod" : ""} stopping: ${JSON.stringify(stopped)}`);
    } finally { stance.dispose(); stand.dispose(); }
  }
});
