/**
 * **How the Lab's attack order does** (`src/lab/attack-mode.ts`; Node core stand, Rapier, 120 Hz,
 * no assist): the Puncher walks to a seeded target and hits it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { modelSpec } from "../src/core/models.ts";
import { PUNCHER } from "../src/core/mind/config.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { labActor } from "../src/lab/actor.ts";
import { startAttack } from "../src/lab/attack-mode.ts";
import { coreStand } from "./harness/core-stand.mjs";

const spec = modelSpec("workshop-fighter");

test("a game attack order approaches and physically hits a seeded target", async () => {
  const stand = await coreStand(spec, { posture: guardPosture(spec) });
  const actor = labActor(stand.built, stand.world, { mind: PUNCHER });
  const attack = startAttack(actor, { count: 1, seed: 42 });
  try {
    let committed = false;
    for (let step = 0; step < 1800 && !attack.state.hits && !actor.body.view.down; step++) {
      stand.step(); committed ||= attack.skills.report.actions.some((action) => action.phase === "commit");
    }
    assert.ok(committed, "no strike committed");
    assert.equal(attack.state.hits, 1, JSON.stringify(attack.frame()));
    assert.equal(attack.frame().targets[0].hit, true);
  } finally { attack.dispose(); stand.dispose(); }
});
