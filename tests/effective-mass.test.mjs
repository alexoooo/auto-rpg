import test from "node:test";
import assert from "node:assert/strict";
import { actedMassKg, contactGive, effectiveMassKg, lumpLinks, massGive, principalInertia, sharedImpulseNs,
  worldInertia } from "../src/golem/effective-mass.ts";

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
 * **A held axis is locked until the contact asks more of it than it holds** (joint give, Session 2
 * step 5 of `docs/plans/2026-09-27-warrior-rogue-reptile.md`). A rod on a ground ball joint, its Z
 * held to `H`, struck across its tip at `L`: the pivot must supply `P L` of angular impulse, so below
 * `P = H / L` nothing moves, and above it the rod turns on what is left, `(P L - H) / I_pivot`.
 */
test("a_held_axis_locks_its_joint_until_the_contact_asks_more_than_it_holds", () => {
  const holdNms = 0.6;
  const links = [GROUND, rod(2, 1, 0.5)];
  const joints = [{ a: 0, b: 1, pivot: [0, 0, 0], lockedAngular: [], heldAngular: [{ axis: [0, 0, 1], holdNms }] }];
  const contact = { link: 1, point: [1, 0, 0], normal: [0, 1, 0] };
  const give = contactGive(links, joints, contact);
  const pivotInertia = 2 / 3;
  for (const p of [0.1, 0.59, 0.61, 1, 3, 10]) {
    const expected = Math.max(0, (p * 1 - holdNms) * 1 / pivotInertia);
    assert.ok(Math.abs(give(p).give - expected) <= 1e-6 * Math.max(1, expected), `at ${p} N s: ${give(p).give} against ${expected}`);
  }
  // With no hold asked for it reads the free rod, and a held axis at zero is no hold at all.
  near(1 / (give(1e6).give / 1e6), effectiveMassKg(links, joints, contact), 1e-4, "a hard blow gives as the free rod");
  const unheld = contactGive(links, [{ ...joints[0], heldAngular: [{ axis: [0, 0, 1], holdNms: 0 }] }], contact);
  near(unheld(2).give, 2 / (2 / 3), 1e-7, "a zero hold");
  // Against a lone mass closing at v: P / M + (P L - H) / I_p = v, once the joint has given.
  const massKg = 5, closing = 4;
  const p = sharedImpulseNs(give, massGive(massKg), closing);
  near(p, (closing + holdNms / pivotInertia) / (1 / massKg + 1 / pivotInertia), 1e-7, "the shared impulse");
  near(actedMassKg(give, p), p / ((p - holdNms) / pivotInertia), 1e-7, "the mass the rod acted as");
  // A soft contact that the joint holds entirely: the rod is immovable and the whole impulse is the mass's.
  near(sharedImpulseNs(give, massGive(massKg), 0.1), 0.5, 1e-7, "held throughout");
  assert.equal(actedMassKg(give, 0.5), Infinity);
});

/**
 * The active set against a reference that shares none of its code: the same contact's rows built
 * here, and the box-constrained problem they pose solved by projected Gauss-Seidel. Floating chains
 * of three rods on ball joints, each axis held at a random impulse, locked or free, struck at random.
 * A held axis the solve released too early, or never released, moves the answer.
 */
test("joint_give_agrees_with_projected_gauss_seidel_on_random_chains", () => {
  let state = 7;
  const uniform = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let released = 0;
  for (let trial = 0; trial < 12; trial++) {
    const links = [0, 1, 2].map((k) => ({ massKg: 0.5 + 3 * uniform(), centre: [0.4 * k + 0.1 * uniform(), 0.3 * uniform(), 0.2 * uniform()],
      inertia: diag([0.01 + 0.05 * uniform(), 0.01 + 0.05 * uniform(), 0.01 + 0.05 * uniform()]) }));
    const joints = [0, 1].map((k) => ({ a: k, b: k + 1, pivot: [0.4 * k + 0.2, 0.3 * uniform(), 0.1 * uniform()], lockedAngular: [],
      heldAngular: [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((axis) => ({ axis, holdNms: [0, 0.05, 0.2, 1e9][Math.floor(4 * uniform())] })) }));
    const contact = { link: 2, point: [1.0, 0.2 * uniform(), 0.1], normal: [uniform() - 0.5, 1, uniform() - 0.5] };
    const give = contactGive(links, joints, contact);
    // The reference: rows as velocity constraints, lambda minimising 1/2 l^T A l + l^T y P on the box.
    const n = Math.hypot(...contact.normal);
    const normal = contact.normal.map((x) => x / n);
    const response = (link, linear, angular) => ({ link, v: linear.map((x) => x / links[link].massKg),
      w: angular.map((x, i) => x / links[link].inertia[4 * i]) });
    const rows = [];
    for (const joint of joints) {
      const ra = sub(joint.pivot, links[joint.a].centre), rb = sub(joint.pivot, links[joint.b].centre);
      for (const e of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
        rows.push({ hold: Infinity, terms: [{ link: joint.a, linear: e, angular: cross(ra, e) },
          { link: joint.b, linear: e.map((x) => -x), angular: cross(rb, e).map((x) => -x) }] });
      }
      for (const { axis, holdNms } of joint.heldAngular) {
        if (holdNms > 0) rows.push({ hold: holdNms, terms: [{ link: joint.a, linear: [0, 0, 0], angular: axis },
          { link: joint.b, linear: [0, 0, 0], angular: axis.map((x) => -x) }] });
      }
    }
    const probe = { terms: [{ link: 2, linear: normal, angular: cross(sub(contact.point, links[2].centre), normal) }] };
    const product = (r, s) => {
      let sum = 0;
      for (const t of r.terms) for (const u of s.terms) {
        if (t.link !== u.link) continue;
        const m = response(u.link, u.linear, u.angular);
        sum += dot(t.linear, m.v) + dot(t.angular, m.w);
      }
      return sum;
    };
    const a = rows.map((r) => rows.map((s) => product(r, s)));
    const y = rows.map((r) => product(r, probe));
    const free = product(probe, probe);
    for (const p of [0.05, 0.5, 3, 20]) {
      const lambda = new Array(rows.length).fill(0);
      for (let sweep = 0; sweep < 40000; sweep++) {
        for (let i = 0; i < rows.length; i++) {
          let w = y[i] * p;
          for (let j = 0; j < rows.length; j++) w += a[i][j] * lambda[j];
          const next = lambda[i] - w / a[i][i];
          lambda[i] = Math.max(-rows[i].hold, Math.min(rows[i].hold, next));
        }
      }
      let expected = free * p;
      for (let i = 0; i < rows.length; i++) expected += y[i] * lambda[i];
      released += rows.some((row, i) => Number.isFinite(row.hold) && row.hold < 1e8 && Math.abs(lambda[i]) >= row.hold * (1 - 1e-9)) ? 1 : 0;
      const got = give(p).give;
      assert.ok(Math.abs(got - expected) <= 1e-4 * Math.max(expected, 1e-3), `trial ${trial} at ${p} N s: ${got} against ${expected}`);
    }
  }
  assert.ok(released >= 16, `the control: some held axes gave (${released} of 48 cases)`);
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

/**
 * **`Combat` prices a blow with the walk's two masses, and they are not the item's.** A synthetic
 * contact from the left golem's blade onto the right golem's core, at a stated normal, with nothing
 * stepped in between: the report's striker and part masses are `effectiveMassAt` of each body at
 * that point along that normal. The point is the blade's own centre of mass, where a blade on its
 * own would answer with exactly its 1.30 kg, so whatever it reads above that is the arm behind it.
 */
test("combat_reads_both_effective_masses_at_the_contact", async () => {
  const { Logger } = await import("@babylonjs/core/Misc/logger.js");
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const { PhysicsEventType } = await import("@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js");
  const { createBout, freshHavok } = await import("./harness/bout-runner.mjs");
  const { namedBuild } = await import("../src/golem/roster.ts");
  const { contactGiveAt, effectiveMassAt } = await import("../src/body-inertia.ts");
  const { Combat } = await import("../src/combat.ts");
  const { CONFIG } = await import("../src/config.ts");
  const { TERMINAL_BLADE } = await import("../src/golem/config.ts");
  Logger.LogLevels = Logger.ErrorLogLevel;
  const setup = namedBuild("default").setup;
  const bout = createBout({ left: "idle", right: "idle", leftGolem: setup, rightGolem: setup,
    locomotionMode: "supported", physics: await freshHavok(), seeds: [1, 2] });
  try {
    for (let i = 0; i < 30; i++) bout.step();
    const striker = bout.left.strikers.find((s) => s.kind === "sword");
    const limb = bout.right.limbs.find((l) => l.key.endsWith("core"));
    assert.ok(striker && limb, "the control: a blade and a core to put it on");
    const combat = new Combat("left", [striker]);
    combat.advance(1);
    combat.attach(bout.right);
    const point = striker.centreOfMass().clone();
    const normal = striker.edgeDirection().clone().normalize();
    // A cut at 9 m/s along the normal, sampled the way a solver step samples it (see `strike` in
    // `tests/knockback.test.mjs`), so the joints are asked to hold something.
    striker.body.setLinearVelocity(normal.scale(9));
    striker.body.setAngularVelocity(Vector3.Zero());
    const scene = striker.body.transformNode.getScene();
    scene.onBeforePhysicsObservable.notifyObservers(scene);
    striker.body.getCollisionObservable().notifyObservers({ collider: striker.body, collidedAgainst: limb.part.body,
      type: PhysicsEventType.COLLISION_STARTED, point, normal: normal.scale(2), distance: 0, impulse: 0 });
    const report = combat.lastHit;
    assert.ok(report, "the contact reached the scorer");
    // Each side as far as its motors hold over the contact against the impulse the two pass.
    const holdSeconds = CONFIG.combat.jointHoldSeconds;
    assert.ok(holdSeconds > 0 && report.closingSpeed > 0, "the control: a contact that asks the joints to hold");
    const strikerGive = contactGiveAt(striker.body, point, normal, { holdSeconds });
    const partGive = contactGiveAt(limb.part.body, point, normal, { holdSeconds });
    const impulseNs = sharedImpulseNs(strikerGive, partGive, report.closingSpeed);
    near(report.strikerMassKg, actedMassKg(strikerGive, impulseNs), 1e-9, "striker");
    near(report.partMassKg, actedMassKg(partGive, impulseNs), 1e-9, "part");
    // Held joints couple more of the body than free ones, and never less.
    assert.ok(report.strikerMassKg > effectiveMassAt(striker.body, point, normal) * 1.01,
      `the striker's motors hold: ${report.strikerMassKg} kg against ${effectiveMassAt(striker.body, point, normal)} free`);
    assert.ok(report.strikerMassKg > TERMINAL_BLADE.mass * 1.1,
      `the arm behind the blade counts: ${report.strikerMassKg} kg against its own ${TERMINAL_BLADE.mass}`);
  } finally { bout.dispose(); }
});
