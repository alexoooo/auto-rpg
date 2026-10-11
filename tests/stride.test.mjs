/**
 * **The walk and run** (`stride`, `src/core/skills/stride.ts`), on the Node stand at 120 Hz: a
 * Warrior with it walks forward 5 m and stops, on its feet, its own steps and not the stance's; a
 * fighter with it builds and steps; and its faults refuse settings it cannot carry out.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { STRIDE } from "../src/core/skills/stride.ts";
import { labActor } from "../src/lab/actor.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { coreStand } from "./harness/core-stand.mjs";

const STRIDING = { ...LAB_PRESETS.script.config, locomotion: { kind: "stride", ...STRIDE } };

test("a_warrior_with_the_stride_walks_forward_five_metres_and_stops", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  const actor = labActor(stand.built, stand.world, { mind: STRIDING });
  const start = actor.body.view.stance.centre.z;
  // Forward at 0.5 m/s, facing +z, until the centre of mass is 5 m on; then stand.
  const tactics = {
    name: "five-metres",
    decide: ({ view }) => ({ move: view.stance.centre.z - start < 5 ? [0.5, 0] : null, face: 0, guard: NO_COVER, attack: null }),
  };
  actor.drive(tactics);
  let stopped = null, strides = 0, own = 0;
  try {
    for (let t = 0; t < 20 && !actor.body.view.down; t += 0.1) {
      stand.step(stand.seconds(0.1));
      const s = actor.body.view.stance;
      if (stopped === null && s.centre.z - start >= 5) stopped = actor.body.view.time;
      if (s.phase === "swing") strides++;
      if (s.own) own++;
      if (stopped !== null && actor.body.view.time > stopped + 4) break;
    }
    const s = actor.body.view.stance;
    assert.equal(actor.body.view.down, false, `fell at ${actor.body.view.time.toFixed(2)} s`);
    assert.ok(stopped !== null && stopped < 15, `5 m on by ${stopped?.toFixed(2)} s`);
    assert.ok(s.centre.z - start < 5.6, `stopped within 0.6 m of the mark: ${(s.centre.z - start).toFixed(2)} m`);
    assert.ok(Math.hypot(s.velocity.x, s.velocity.z) < 0.05, `standing still: ${Math.hypot(s.velocity.x, s.velocity.z).toFixed(3)} m/s`);
    assert.equal(s.phase, "stand", "no step under way");
    assert.ok(strides > 20, `its steps: ${strides} readings in a swing`);
    assert.equal(s.strides, 0, "the stance took no walking step of its own");
    assert.ok(own < 5, `the stance stepped of itself in ${own} readings`);
  } finally { actor.dispose(); stand.dispose(); }
});

test("the_stride_is_a_fighters_locomotion_and_refuses_what_it_cannot_carry_out", () => {
  assert.deepEqual(treeFaults(STRIDING, ["script"]), []);
  for (const bad of [{ swing: 0 }, { accel: -1 }, { transfer: -0.1 }, { longest: Number.NaN }]) {
    const faults = treeFaults({ ...STRIDING, locomotion: { ...STRIDING.locomotion, ...bad } }, ["script"]);
    assert.ok(faults.some((f) => f.includes("stride")), `${JSON.stringify(bad)}: ${JSON.stringify(faults)}`);
  }
});
