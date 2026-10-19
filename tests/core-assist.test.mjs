/**
 * **The assist** (`src/core/control/assist.ts`): a force and a moment on a body's root that no
 * muscle gives, within a ceiling, metered; and the stance as its first user, asking it for what
 * the soles miss. Node stand, Rapier, 120 Hz; the Warrior, unarmed. Whether the assist holds a
 * body the soles cannot is `core-assist-capability`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { buildBody } from "../src/core/build/build-body.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { embody } from "../src/core/mind/mind.ts";
import { createWorld } from "../src/core/world.ts";
import { centreOfMass, massOf, pulled, weightOf } from "./fixtures/assist-pull.mjs";
import { freshEngine } from "./harness/core-stand.mjs";

const spec = humanSpec("workshop-fighter");
/** A body's momentum, and its angular momentum about its centre of mass: each segment's own, in the mass properties the engine holds. */
function momentumOf(built) {
  const C = centreOfMass(built), linear = new Vector3(), angular = new Vector3();
  const c = new Vector3(), v = new Vector3(), w = new Vector3(), q = new Quaternion(), spin = new Vector3();
  for (const segment of built.segments.values()) {
    const { mass, moments, orientation } = segment.body.massProperties;
    centreOfToRef(segment, c); segment.body.linearVelocityToRef(v); segment.body.angularVelocityToRef(w);
    linear.addInPlace(v.scale(mass));
    angular.addInPlace(Vector3.Cross(c.subtract(C), v).scaleInPlace(mass));
    // Its spin's part: the principal moments, about the axes the engine holds them on.
    segment.node.rotationQuaternion.multiplyToRef(orientation, q);
    w.applyRotationQuaternionToRef(Quaternion.Inverse(q), spin);
    spin.set(spin.x * moments[0], spin.y * moments[1], spin.z * moments[2]);
    angular.addInPlace(spin.applyRotationQuaternionToRef(q, new Vector3()));
  }
  return { linear, angular };
}
/** `v` no longer than `most`: the test's own shortening, for what a ceiling should give. */
const shortened = (v, most) => v.length() > most ? v.scale(most / v.length()) : v.clone();

/**
 * The Warrior limp in a world with gravity and no ground, under a mind that asks its assist for
 * `ask(weight)`'s force and moment every step of its first `asks`, for 60 steps; `withdrawAfter`
 * steps in, the assist is withdrawn. With no `ceiling` the body is embodied with none, as `embody`
 * has it unless told. `owed` is what the ceiling's share of the ask, at the root's centre of mass,
 * and gravity should have given the body by the end: its momentum, and its angular momentum about
 * its own centre of mass.
 */
async function lifted(ceiling, { ask = (weight) => [new Vector3(0, 2 * weight, 0), new Vector3(0, 10 * weight, 0)], asks = Infinity, withdrawAfter = Infinity } = {}) {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine());
  const built = buildBody(spec, world, { position: [0, 0, 0] });
  const weight = weightOf(built), [force, moment] = ask(weight);
  let asked = 0;
  const make = (body) => ({ name: "lift", step() { if (asked++ < asks) body.assist.ask(force, moment); } });
  const { own, dispose } = ceiling ? embody(built, world, make, undefined, ceiling) : embody(built, world, make);
  try {
    const from = centreOfMass(built), root = own.muscles.dynamics.root.segment, dt = 1 / world.hz;
    const owed = { linear: new Vector3(), angular: new Vector3() }, at = new Vector3();
    const down = new Vector3(...built.physics.gravity).scale(massOf(built));
    for (let step = 0; step < 60; step++) {
      if (step === withdrawAfter) own.assist.withdraw();
      const giving = ceiling && step < Math.min(asks, withdrawAfter);
      const push = giving ? shortened(force, ceiling.force * weight) : Vector3.Zero(), turn = giving ? shortened(moment, ceiling.moment * weight) : Vector3.Zero();
      // The force's lever about the body's centre of mass, as the step finds it and as it leaves it.
      const lever = centreOfToRef(root, at).subtract(centreOfMass(built));
      world.step();
      lever.addInPlace(centreOfToRef(root, at).subtract(centreOfMass(built))).scaleInPlace(0.5);
      owed.linear.addInPlace(push.add(down).scaleInPlace(dt));
      owed.angular.addInPlace(Vector3.Cross(lever, push).addInPlace(turn).scaleInPlace(dt));
    }
    const to = centreOfMass(built), { given, meter, most, on, withdrawn } = own.assist;
    const would = { force: new Vector3(), moment: new Vector3() };
    own.assist.clipToRef(force, moment, would.force, would.moment);
    const got = momentumOf(built);
    return {
      would: [would.force.length(), would.moment.length()],
      momentum: { off: Vector3.Distance(got.linear, owed.linear), of: owed.linear.length() },
      turning: { off: Vector3.Distance(got.angular, owed.angular), of: owed.angular.length() },
      weight, on, withdrawn, most: { ...most }, meter: { ...meter }, moved: Vector3.Distance(from, to), fell: from.y - to.y,
      given: { force: given.force.asArray(), moment: given.moment.length() },
    };
  } finally { dispose(); built.dispose(); world.dispose(); scene.dispose(); }
}

test("the_assist_gives_what_a_mind_asks_up_to_its_ceiling_and_nothing_at_none", async () => {
  // Asked for two weights up, a ceiling of one cancels gravity: the centre of mass stays.
  const held = await lifted({ force: 1, moment: 0.05 });
  assert.ok(held.on);
  assert.ok(held.moved < 1e-5, `the centre of mass stayed: ${held.moved} m`);
  assert.ok(Math.abs(held.most.force - held.weight) < 1e-9 && Math.abs(held.most.moment - 0.05 * held.weight) < 1e-9, JSON.stringify(held.most));
  held.given.force.forEach((v, k) => assert.ok(Math.abs(v - (k === 1 ? held.weight : 0)) < 1e-9, `given force ${held.given.force}`));
  assert.ok(Math.abs(held.given.moment - 0.05 * held.weight) < 1e-9, `given moment ${held.given.moment}`);
  assert.ok(Math.abs(held.would[0] - held.weight) < 1e-9 && Math.abs(held.would[1] - 0.05 * held.weight) < 1e-9, `it would give ${held.would}`);
  assert.equal(held.meter.steps, 60);
  assert.ok(Math.abs(held.meter.force / 60 - held.weight) < 1e-9 && Math.abs(held.meter.moment / 60 - 0.05 * held.weight) < 1e-9, JSON.stringify(held.meter));

  // Asked for a weight up and across and a moment about up: the body's momentum is what the force and gravity gave it, and
  // its angular momentum about its own centre of mass what the moment, and the force at the root's centre of mass, gave it.
  // The solver keeps a tumbling chain's angular momentum to about 2 % over these 60 steps.
  const thrown = await lifted({ force: 1, moment: 0.05 }, { ask: (weight) => [new Vector3(0.6 * weight, 0.8 * weight, 0), new Vector3(0, 10 * weight, 0)] });
  assert.ok(thrown.momentum.of > 100 && thrown.momentum.off < 0.001 * thrown.momentum.of, `its momentum is ${thrown.momentum.off} N s off ${thrown.momentum.of}`);
  assert.ok(thrown.turning.of > 10 && thrown.turning.off < 0.05 * thrown.turning.of, `its angular momentum is ${thrown.turning.off} N m s off ${thrown.turning.of}`);

  // Asked once, it gives once: an ask stands for one step.
  const once = await lifted({ force: 1, moment: 0.05 }, { asks: 1 });
  assert.equal(once.meter.steps, 60);
  assert.ok(Math.abs(once.meter.force - once.weight) < 1e-9 && Math.abs(once.meter.moment - 0.05 * once.weight) < 1e-9, JSON.stringify(once.meter));
  assert.deepEqual(once.given, { force: [0, 0, 0], moment: 0 });

  // With none, the default, the same ask gives nothing: half of g over 0.5 s squared.
  const none = await lifted(null);
  assert.equal(none.on, false);
  assert.deepEqual(none.meter, { steps: 0, force: 0, moment: 0 });
  assert.deepEqual(none.given, { force: [0, 0, 0], moment: 0 });
  assert.deepEqual(none.would, [0, 0]);
  assert.ok(Math.abs(none.fell - 1.23) < 0.02, `fell ${none.fell} m`);

  // An ask that is not a number is given nothing, under a ceiling that would give.
  const mad = await lifted({ force: 1, moment: 0.05 }, { ask: () => [new Vector3(0, NaN, 0), new Vector3(NaN, 0, 0)] });
  assert.deepEqual(mad.given, { force: [0, 0, 0], moment: 0 });
  assert.deepEqual([mad.meter.force, mad.meter.moment], [0, 0]);
  assert.ok(Math.abs(mad.fell - none.fell) < 1e-6, `fell ${mad.fell} m, as with none (${none.fell})`);

  // Withdrawn after 0.25 s, it falls from there, and nothing more is metered.
  const dropped = await lifted({ force: 1, moment: 0.05 }, { withdrawAfter: 30 });
  assert.equal(dropped.on, false);
  assert.deepEqual([held.withdrawn, none.withdrawn, dropped.withdrawn], [false, false, true]);
  assert.equal(dropped.meter.steps, 30);
  assert.ok(dropped.fell > 0.28 && dropped.fell < 0.34, `fell ${dropped.fell} m in its last 0.25 s`);
  assert.deepEqual(dropped.given, { force: [0, 0, 0], moment: 0 });
  assert.deepEqual(dropped.would, [0, 0], "withdrawn, it would give none");
});

test("a_pull_the_soles_cannot_hold_is_given_what_they_miss_by_the_assist_alone_and_within_its_ceiling", async () => {
  // Whether it falls alone and holds helped is `core-assist-capability`'s.
  const alone = await pulled(null);
  assert.ok(alone.missed > 0.05, `the fixture did not reach its case: the soles missed ${alone.missed} weights`);
  assert.deepEqual(alone.mean, [0, 0]);
  const helped = await pulled({ force: 0.25, moment: 0.065 });
  const [force, moment] = helped.mean;
  assert.ok(force > 0 && force <= 0.25 * helped.weight && moment > 0 && moment <= 0.065 * helped.weight, `it was given ${force} N and ${moment} N m on average`);
  // The force alone gives no moment, and the moment alone no force.
  assert.equal((await pulled({ force: 0.25, moment: 0 })).mean[1], 0);
  assert.equal((await pulled({ force: 0, moment: 0.065 })).mean[0], 0);
});

test("the_stance_asks_the_assist_for_what_the_soles_miss_and_no_more", async () => {
  // A ceiling small enough to bind: what was given each step is that step's shortfall, shortened to it.
  const ceiling = { force: 0.002, moment: 0.002 };
  const seen = { steps: 0, force: { at: 0, under: 0 }, moment: { at: 0, under: 0 } };
  await pulled(ceiling, ({ body, weight }) => {
    const { shortfall } = body.view.stance, { given } = body.assist;
    for (const part of ["force", "moment"]) {
      const asked = shortfall[part], most = ceiling[part] * weight, size = asked.length();
      const expected = !Number.isFinite(size) || size === 0 ? Vector3.Zero() : asked.scale(Math.min(1, most / size));
      assert.ok(Vector3.Distance(given[part], expected) < 1e-9, `step ${seen.steps}: given ${given[part]} of the ${part} ${asked} under ${most}`);
      if (size > most) seen[part].at += 1; else if (size > 0) seen[part].under += 1;
    }
    seen.steps += 1;
  });
  assert.equal(seen.steps, 480);
  for (const part of ["force", "moment"]) {
    assert.ok(seen[part].at > 0 && seen[part].under > 0, `the ${part} was at its ceiling in ${seen[part].at} steps and under it in ${seen[part].under}`);
  }
});
