/**
 * **A crippled limb is weaker by the rule, wherever a peak torque is read** (`crippleLimb`,
 * `BuiltBody.strength`). A Warrior walking at 1 m/s under its Option Mind is saved 2 s in; one copy
 * walks on with its left leg crippled through the rule, and the save is loaded into a Warrior built
 * with the muscles of that leg's joints at the rule's share of their peaks, which walks on too. The
 * two follow each other to the bit: a reader of a peak torque that keeps what it read before the
 * crippling, or reads the spec's whole peak, sets them apart.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { coreStand, loadStand, saveStand } from "./harness/core-stand.mjs";
import { GAME, MINDS } from "../src/entrants/game.ts";
import { builtAngles, createMind } from "../src/core/mind/minds.ts";
import { clockSenses } from "../src/core/mind/senses.ts";
import { directMovement } from "../src/core/intent/movement.ts";
import { modelSpec } from "../src/core/models.ts";
import { crippleLimb } from "../src/core/rules/pool.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";

const LIMB = "leg.left", WALK = { move: directMovement(0, 1), pace: 1, face: null };
const rules = rulebook("arena");

/** `spec` with the muscles of every joint whose child is in `limb` at `share` of their peaks. */
function weakened(spec, limb, share) {
  const segments = spec.wounds.limbs.find((one) => one.name === limb).segments;
  const scaled = (q) => ({ ...q, value: q.value * share });
  return { ...spec, joints: spec.joints.map((joint) => !segments.includes(joint.child) ? joint : { ...joint,
    dofs: joint.dofs.map((dof) => ({ ...dof, muscle: { ...dof.muscle, peakPositive: scaled(dof.muscle.peakPositive), peakNegative: scaled(dof.muscle.peakNegative) } })) }) };
}

/** A Warrior of `spec` on a stand, walking ahead under its Option Mind. */
async function walker(spec) {
  const stand = await coreStand(spec, { joints: builtAngles(GAME, spec, MINDS.option.config) });
  const minded = createMind(GAME, stand.built, stand.world, MINDS.option.config, { name: "walker", rules, senses: clockSenses(stand.world), orders: () => WALK });
  return { stand, minded, states: { body: minded.body.state } };
}

/** Every segment's position and turn, in its spec's order. */
const poseOf = (built) => [...built.segments.values()].flatMap(({ pose: { position: p, rotation: q } }) => [p.x, p.y, p.z, q.x, q.y, q.z, q.w]);

test("a limb crippled by the rule walks as the body built with that limb's muscles at the rule's share", async () => {
  const whole = modelSpec("workshop-fighter"), half = weakened(whole, LIMB, rules.crippled.value);
  const cripplings = whole.joints.filter((joint) => whole.wounds.limbs.find((one) => one.name === LIMB).segments.includes(joint.child)).map((joint) => joint.name);
  assert.deepEqual(cripplings, ["hip.left", "knee.left", "ankle.left"], "the fixture cripples the left hip, knee and ankle");
  const a = await walker(whole), b = await walker(half);
  try {
    const start = a.stand.built.segments.get("lowerTrunk").pose.position.z;
    a.stand.step(a.stand.seconds(2));
    const walked = a.stand.built.segments.get("lowerTrunk").pose.position.z - start;
    assert.ok(walked > 0.5 && !a.minded.body.down, `the fixture walks before the crippling: ${walked.toFixed(3)} m in 2 s, limit 0.5`);
    loadStand(b.stand.world, b.states, saveStand(a.stand.world, a.states));
    crippleLimb(a.stand.built, LIMB, rules);
    const steps = a.stand.seconds(2);
    for (let step = 1; step <= steps; step++) {
      a.stand.step(1); b.stand.step(1);
      const mine = poseOf(a.stand.built), theirs = poseOf(b.stand.built);
      const apart = mine.findIndex((x, k) => x !== theirs[k]);
      assert.equal(apart, -1, `step ${step} after the crippling: number ${apart} of the poses differs, ${mine[apart]} against ${theirs[apart]}`);
    }
    assert.ok(!a.minded.body.down, "the crippled body walks on, not down");
  } finally {
    a.minded.body.dispose(); b.minded.body.dispose(); a.stand.dispose(); b.stand.dispose();
  }
});
