/**
 * **A cut limb comes off, in the simulation** (`cutOff`, `EngineJoint.release`). A bout of two
 * Warriors under the Option Mind is saved 1 s in; the left one's right arm is then cut off by a
 * blow through its pool (`woundBody`), and the minds run on for 3 s. The shoulder is released in
 * the engine, the arm parts from the shoulder it hung from, and its muscles give nothing and no
 * motor turns its joints; the save from before the cut, loaded, cut and stepped again, follows the first run to
 * the bit, so the load restores the joint the cut released.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildBout } from "../src/evaluation/bout.ts";
import { traceOf } from "../src/evaluation/trace.ts";
import { BOUT_ENGINE } from "../research/bout.mjs";
import { MINDS } from "../src/entrants/game.ts";
import { pointOfToRef } from "../src/core/read-motion.ts";
import { Vector3 } from "../src/core/math/vector.ts";
import { woundBody } from "../src/core/rules/pool.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";

const rules = rulebook("arena"), LIMB = "arm.right", SHOULDER = "shoulder.right";

test("an arm cut off in a bout falls free, undriven, and a load from before the cut replays it to the bit", async () => {
  const config = MINDS.option.config;
  const bout = await buildBout({ left: "workshop-fighter", right: "workshop-fighter", gap: 2, minds: { left: config, right: config } }, { engine: BOUT_ENGINE });
  const { world, duel } = bout, { built, pool } = duel.duelists.left;
  try {
    const limb = built.spec.wounds.limbs.find((one) => one.name === LIMB), shoulder = built.joints.get(SHOULDER);
    // Each freedom of the arm's joints: its joint, its index there and its channel (`BuiltBody.strength`, the spec's joints' freedoms in order).
    const channels = built.spec.joints.flatMap((joint) => joint.dofs.map((_, k) => ({ joint: built.joints.get(joint.name), k, cut: limb.segments.includes(joint.child) })))
      .flatMap((freedom, i) => freedom.cut ? [{ ...freedom, i }] : []);
    assert.ok(channels.length > 0 && shoulder.child.spec.name === limb.segments[0], `the fixture cuts at ${SHOULDER}, ${channels.length} freedoms beyond it`);
    world.step(Math.round(1 / world.dt));
    const saved = duel.save();
    /** The bout from the cut on: its trace, and the most the shoulder's two sides parted, m. */
    const cut = () => {
      const wound = pool.wound({ part: limb.segments[0], damage: pool.limb(LIMB).full, mechanism: "edge" });
      assert.deepEqual({ cut: wound.cut, ending: wound.ending }, { cut: limb.segments, ending: null }, "the fixture's blow takes the arm off and the fight goes on");
      woundBody(built, wound, rules);
      const trace = traceOf([built, duel.duelists.right.built]), on = new Vector3(), off = new Vector3();
      let parted = 0;
      for (let step = 1; step <= Math.round(3 / world.dt); step++) {
        world.step(); trace.take();
        assert.equal(shoulder.attached(), false, `step ${step}: the shoulder stays released`);
        for (const { joint, k, i } of channels) {
          const driven = [built.strength[i], joint.joint.motorStepImpulse(k), joint.strength(k)];
          assert.ok(driven.every((x) => x === 0), `step ${step}: ${joint.spec.name} freedom ${k} is driven: strength, motor impulse and strength read ${driven.join(", ")}`);
        }
        const centre = shoulder.spec.centre.value;
        parted = Math.max(parted, pointOfToRef(shoulder.parent, centre, on).subtract(pointOfToRef(shoulder.child, centre, off)).length());
      }
      return { digest: trace.digest(), parted };
    };
    const first = cut();
    assert.ok(first.parted > 0.2, `the arm parts from the shoulder: ${first.parted.toFixed(3)} m at most, limit 0.2`);
    duel.load(saved);
    assert.equal(shoulder.attached(), true, "the load restores the shoulder");
    assert.deepEqual(cut(), first, "the run from the save follows the first to the bit");
  } finally { bout.dispose(); }
});
