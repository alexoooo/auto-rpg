import test from "node:test";
import assert from "node:assert/strict";
import { effectiveMassKg, lumpLinks, principalInertia, worldInertia } from "../src/golem/effective-mass.ts";

const IDENTITY = [0, 0, 0, 1];
const diag = ([x, y, z]) => [x, 0, 0, 0, y, 0, 0, 0, z];
const near = (actual, expected, relative, what) =>
  assert.ok(Math.abs(actual - expected) <= relative * Math.abs(expected), `${what}: ${actual} against ${expected}`);
/** A rod of `mass` and `length` along world X, centred at `centreX`. */
const rod = (mass, length, centreX, extra = {}) => ({ massKg: mass, centre: [centreX, 0, 0],
  inertia: worldInertia(principalInertia({ kind: "cylinder", height: length, radius: 1e-4 }, mass), [0, 0, -Math.SQRT1_2, Math.SQRT1_2]), ...extra });
const GROUND = { massKg: 1, centre: [0, 0, 0], inertia: diag([1, 1, 1]), pinned: true };
const HINGE_Z = (a, b, x) => ({ a, b, pivot: [x, 0, 0], lockedAngular: [[1, 0, 0], [0, 1, 0]] });

test("a_single_free_body_reads_its_mass_at_its_centre_and_the_rigid_body_formula_off_it", () => {
  const box = { massKg: 4, centre: [0, 0, 0], inertia: diag(principalInertia({ kind: "box", size: [0.2, 0.6, 0.1] }, 4)) };
  near(effectiveMassKg([box], [], { link: 0, point: [0, 0, 0], normal: [1, 0, 0] }), 4, 1e-12, "at the centre");
  // Struck at the top, sideways: 1/m_eff = 1/m + (r x n)^T I^-1 (r x n), r = (0, 0.3, 0), n = x.
  const iz = 4 * (0.2 * 0.2 + 0.6 * 0.6) / 12;
  near(effectiveMassKg([box], [], { link: 0, point: [0, 0.3, 0], normal: [1, 0, 0] }), 1 / (1 / 4 + 0.09 / iz), 1e-12, "off the centre");
  // Along the line through the centre it is the whole mass whatever the lever.
  near(effectiveMassKg([box], [], { link: 0, point: [0, 0.3, 0], normal: [0, -3, 0] }), 4, 1e-12, "along its line");
});

test("a_rod_hinged_to_the_ground_reads_its_pivot_inertia_over_the_lever_squared_and_nothing_moves_along_it", () => {
  const links = [GROUND, rod(2, 1, 0.5)];
  const joints = [HINGE_Z(0, 1, 0)];
  // m L^2 / 3 about the pivot, struck across at the far end: I / d^2 = m / 3.
  near(effectiveMassKg(links, joints, { link: 1, point: [1, 0, 0], normal: [0, 1, 0] }), 2 / 3, 1e-6, "across the tip");
  near(effectiveMassKg(links, joints, { link: 1, point: [0.5, 0, 0], normal: [0, 1, 0] }), 2 * 4 / 3, 1e-6, "across the middle");
  assert.equal(effectiveMassKg(links, joints, { link: 1, point: [1, 0, 0], normal: [1, 0, 0] }), Infinity, "along the rod");
  // The locked axes carry load: across the hinge's plane the rod cannot turn at all.
  assert.equal(effectiveMassKg(links, joints, { link: 1, point: [1, 0, 0], normal: [0, 0, 1] }), Infinity, "out of the hinge's plane");
});

test("a_floating_chain_is_never_heavier_than_its_whole_mass_and_is_exactly_that_straight_along_itself", () => {
  // Two rods end to end along X, joined by a ball, floating: a thrust along the line moves the lot.
  const links = [rod(3, 1, 0.5), rod(1, 0.8, 1.4)];
  const joints = [{ a: 0, b: 1, pivot: [1, 0, 0], lockedAngular: [] }];
  near(effectiveMassKg(links, joints, { link: 1, point: [1.8, 0, 0], normal: [1, 0, 0] }), 4, 1e-6, "straight along");
  // Everywhere else, less: the ceiling is the physical one, and a keyframed trunk would break it.
  let worst = 0;
  for (let i = 0; i < 200; i++) {
    const t = i * 0.7;
    const normal = [Math.cos(t), Math.sin(1.3 * t), Math.cos(2.1 * t) + 0.1];
    const point = [1 + 0.8 * ((i % 10) / 10), 0, 0];
    worst = Math.max(worst, effectiveMassKg(links, joints, { link: 1, point, normal }));
  }
  assert.ok(worst <= 4 * (1 + 1e-9), `a floating chain read ${worst} kg of its 4`);
  // The control: the same chain pinned by its first link reads more than its whole mass straight along.
  assert.equal(effectiveMassKg([{ ...links[0], pinned: true }, links[1]], joints,
    { link: 1, point: [1.8, 0, 0], normal: [1, 0, 0] }), Infinity);
});

test("a_loop_closed_on_a_weld_reads_what_the_single_weld_reads", () => {
  // The maul's case: a second hand on a body already held. A redundant weld must not move the answer.
  const links = [GROUND, rod(2, 1, 0.5), rod(1, 0.5, 1.25)];
  const weld = { a: 1, b: 2, pivot: [1, 0, 0], lockedAngular: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
  const once = [HINGE_Z(0, 1, 0), weld];
  const twice = [...once, { ...weld, pivot: [1.2, 0, 0] }];
  const contact = { link: 2, point: [1.5, 0, 0], normal: [0, 1, 0] };
  near(effectiveMassKg(links, twice, contact), effectiveMassKg(links, once, contact), 1e-6, "redundant weld");
  // And the welded pair is one rod of 3 kg, 1.5 m, hinged at the ground: I_pivot / 1.5^2.
  const pivotInertia = 2 / 3 + 1 * (0.5 * 0.5 / 12 + 1.25 * 1.25);
  near(effectiveMassKg(links, once, contact), pivotInertia / (1.5 * 1.5), 1e-6, "the welded pair");
});

test("lumping_carries_each_inertia_to_the_common_centre_and_the_closed_forms_agree_at_their_limits", () => {
  const a = { massKg: 1, centre: [-1, 0, 0], inertia: diag([0, 0, 0]) };
  const b = { massKg: 3, centre: [1, 0, 0], inertia: diag([0.1, 0.1, 0.1]) };
  const lump = lumpLinks([a, b]);
  assert.deepEqual(lump.centre, [0.5, 0, 0]);
  // Point masses at -1.5 and +0.5 from the centre: 1 * 2.25 + 3 * 0.25 = 3, plus b's own 0.1.
  near(lump.inertia[8], 3.1, 1e-12, "about Z");
  near(lump.inertia[0], 0.1, 1e-12, "about X");
  // A capsule with no cylinder is a sphere; a cylinder's axis is local Y.
  const capsule = principalInertia({ kind: "capsule", height: 0.4, radius: 0.2 }, 5);
  const sphere = principalInertia({ kind: "sphere", radius: 0.2 }, 5);
  for (let k = 0; k < 3; k++) near(capsule[k], sphere[k], 1e-12, `capsule axis ${k}`);
  assert.deepEqual(principalInertia({ kind: "cylinder", height: 2, radius: 0.5 }, 2).map((x) => +x.toFixed(12)), [0.791666666667, 0.25, 0.791666666667]);
  // A long capsule tends to a thin rod about its middle: m L^2 / 12.
  near(principalInertia({ kind: "capsule", height: 10.002, radius: 0.001 }, 1)[0], 100 / 12, 1e-3, "thin capsule");
  // A rotation moves the moments with it and keeps the trace.
  const turned = worldInertia([1, 2, 3], [0, 0, Math.SQRT1_2, Math.SQRT1_2]);
  near(turned[0], 2, 1e-12, "X after a quarter turn about Z");
  near(turned[4], 1, 1e-12, "Y after a quarter turn about Z");
  assert.deepEqual(worldInertia([1, 2, 3], IDENTITY), diag([1, 2, 3]));
});

/**
 * The walk against the solver. `effectiveMassAt` with the bench's keyframed stand pinned is the
 * quantity the tap measures, so the two must agree: measured to within
 * 3 % on every edge tap (physical contact session 05, the Node impact bench). A wrongly walked chain,
 * a joint recorded on the wrong axes, or Havok's per-kilogram inertia read as kg m2 each move this.
 */
test("the_walk_reads_what_the_solver_does_at_an_edge_tap", async () => {
  const { tapProbe } = await import("./harness/impact-bench.mjs");
  for (const moduleId of ["effector.wrist.blade", "effector.wrist.mace", "effector.pitch.blade"]) {
    const tap = await tapProbe({ moduleId, normal: "edge", settleSeconds: 0.5 });
    near(tap.modelPinnedKg, tap.chainKg, 0.05, `${moduleId} walked against tapped`);
  }
});

/**
 * **The floating base is the physical ceiling**: whatever the point and the direction, a free body
 * cannot answer a blow with more than its whole mass. The control pins the heaviest part, which is
 * what walking to a keyframed carrier would do, and then some direction reads more than the body.
 */
test("a_floating_golem_is_never_heavier_at_a_contact_than_the_whole_of_itself", async () => {
  const { Logger } = await import("@babylonjs/core/Misc/logger.js");
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const { createBout, freshHavok } = await import("./harness/bout-runner.mjs");
  const { namedBuild } = await import("../src/golem/roster.ts");
  const { effectiveMassAt } = await import("../src/body-inertia.ts");
  Logger.LogLevels = Logger.ErrorLogLevel;
  const setup = namedBuild("default").setup;
  const bout = createBout({ left: "idle", right: "idle", leftGolem: setup, rightGolem: setup,
    locomotionMode: "supported", physics: await freshHavok(), seeds: [1, 2] });
  try {
    for (let i = 0; i < 30; i++) bout.step();
    const bodies = bout.left.limbs.map((limb) => limb.part.body);
    const wholeKg = bodies.reduce((sum, body) => sum + body.getMassProperties().mass, 0);
    const heaviest = bodies.reduce((a, b) => (b.getMassProperties().mass > a.getMassProperties().mass ? b : a));
    let floating = 0, pinned = 0;
    for (const [k, limb] of bout.left.limbs.entries()) {
      const body = limb.part.body;
      if (body === heaviest) continue;
      for (let j = 0; j < 12; j++) {
        const t = 0.9 * k + 1.7 * j;
        const normal = new Vector3(Math.cos(t), Math.sin(1.3 * t), Math.cos(2.1 * t) + 0.2).normalize();
        const point = limb.part.mesh.position.add(new Vector3(Math.sin(t), Math.cos(t), Math.sin(2 * t)).scale(0.2));
        floating = Math.max(floating, effectiveMassAt(body, point, normal));
        for (const inertia of ["geometric", "solver"]) {
          floating = Math.max(floating, effectiveMassAt(body, point, normal, { inertia }));
          pinned = Math.max(pinned, effectiveMassAt(body, point, normal, { inertia, pinned: new Set([heaviest]) }));
        }
      }
    }
    assert.ok(floating <= wholeKg * (1 + 1e-6), `a floating golem of ${wholeKg.toFixed(2)} kg read ${floating.toFixed(2)} kg`);
    assert.ok(floating > 0.3 * wholeKg, `and a thrust into it moves a good share of it: ${floating.toFixed(2)} kg`);
    assert.ok(pinned > wholeKg, `pinned by its heaviest part it reads ${pinned} kg of its ${wholeKg.toFixed(2)}`);
  } finally { bout.dispose(); }
});
