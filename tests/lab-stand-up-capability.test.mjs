/**
 * **How well a body gets up in the Lab's Stand-up scenario** (`src/lab/ground-mode.ts`), measured on
 * the Node stand as the page runs it, and not a gate (`tests/experimental.json`): the Warrior,
 * empty-handed, through a round of the owner's target's falls (sixteen ways round at 1.5 N s a kg,
 * one after another on the one body), each stand verified as the target verifies it. The game's
 * Stand up (step-up) stands most of them; the learned rise stands as many, sooner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { labAddress } from "../src/lab/scenarios.ts";
import { loadoutSpec } from "../src/lab/loadout.ts";
import { groundPlacement } from "../src/lab/ground-starts.ts";
import { ROUND_FALLS, startGround } from "../src/lab/ground-mode.ts";
import { labActor } from "../src/lab/actor.ts";
import { PUNCHER, STAND_UP } from "../src/core/mind/config.ts";
import { coreStand } from "./harness/core-stand.mjs";

/** A round on the Warrior getting up by `technique`, to its end. */
async function round(technique) {
  const defaults = labAddress("?scenario=ground"), at = { ...defaults, ground: { ...defaults.ground, start: "round" } };
  const spec = loadoutSpec(at), stand = await coreStand(spec, { ...groundPlacement(spec, at), groundSize: 200 });
  const run = startGround(labActor(stand.built, stand.world, { mind: { ...PUNCHER, subs: [{ ...STAND_UP, techniques: [technique] }] } }), at);
  try {
    while (run.state.status === "running") stand.step(12);
    return { status: run.state.status, ...run.frame().round, falls: run.state.falls };
  } finally { run.dispose(); stand.dispose(); }
}

for (const [technique, least, median] of [["step-up", 12, 18], ["learned-rise", 13, 11]]) {
  test(`the_warrior_gets_up_by_${technique}_from_a_round_of_the_target's_falls`, async (t) => {
    const r = await round(technique);
    t.diagnostic(`${technique}: ${r.status}, stood ${r.stood} of ${r.falls.length}, median ${r.median?.toFixed(2)} s; ${r.falls.map((f) => f.verified?.toFixed(1) ?? f.end).join(" ")}`);
    assert.equal(r.status, "round done", "it gets up after every fall, so the round ends");
    assert.equal(r.falls.length, ROUND_FALLS);
    assert.ok(r.stood >= least, `stood ${r.stood} of ${ROUND_FALLS}, not ${least}`);
    assert.ok(r.median <= median, `median ${r.median.toFixed(2)} s, over ${median}`);
  });
}
