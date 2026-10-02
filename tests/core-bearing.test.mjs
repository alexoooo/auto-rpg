/**
 * **The bearing solve** (`src/core/control/bearing.ts`) under a mind that knows no stance: limbs,
 * their tasks and their patches written here, the solve called as motor control orders it. Node
 * stand, Rapier, 120 Hz; the Warrior, unarmed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { bearLimbs, carryRoot, limbMotion, makeBearing } from "../src/core/control/bearing.ts";
import { servoAsk, servoSolve } from "../src/core/control/servo.ts";
import { bearingSole, centreOfToRef, footStatesOf, motionAtToRef, readSupport } from "../src/core/control/support.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { embody } from "../src/core/mind/mind.ts";
import { coreStand } from "./harness/core-stand.mjs";

const spec = humanSpec("workshop-fighter");
const massOf = (built) => [...built.segments.values()].reduce((sum, segment) => sum + segment.rigid.mass, 0);
/** A body's centre of mass, world, into `out`: the mass-weighted mean of its segments' centres. */
function centreOfMassToRef(built, out) {
  const p = new Vector3();
  out.setAll(0);
  for (const segment of built.segments.values()) out.addInPlace(centreOfToRef(segment, p).scaleInPlace(segment.rigid.mass));
  return out.scaleInPlace(1 / massOf(built));
}
/** Its velocity: an engine's linear velocity is a segment's centre of mass's. */
function centreVelocityToRef(built, out) {
  const v = new Vector3();
  out.setAll(0);
  for (const segment of built.segments.values()) { segment.body.linearVelocityToRef(v); out.addInPlace(v.scaleInPlace(segment.rigid.mass)); }
  return out.scaleInPlace(1 / massOf(built));
}

/** The time constant the mind's aims and its limbs' tasks are critically damped at, and its servo's, s. */
const SECONDS = 0.1;
/** The part of a sole's half-length and half-width its centre of pressure is kept to. */
const KEEP = 0.9;
/** Accelerations a leg's freedoms are asked toward beneath its task, rad/s2, hip outward. */
const TOWARD = [3, -2, 1, -4, 5, 2];

/**
 * A mind of the bearing solve and the servo alone. Its two legs are limbs that end in the feet,
 * each asked to hold its sole's middle still; where `bears`, each bears on its sole. Its aim is the
 * centre of mass where the mind first finds it and the pelvis not turning. Every freedom outside
 * the legs is servoed to the reference pose. `found` is the solve's records, the mind's to read.
 *
 * `probe`, if given, is called each step before the solve with the limbs, their tasks set, and
 * `carry`: the solve's first half run on them as they then are, answering each limb's freedoms'
 * accelerations. What it changes is set again before the step's own solve.
 */
const bearing = (bears, found, probe = null) => (own) => {
  const { built, muscles } = own, feet = footStatesOf(built), pelvis = muscles.dynamics.root.segment, e = 1 / SECONDS;
  const limbs = feet.map((foot) => ({
    segment: foot.segment, memory: foot.memory, reach: foot.reach,
    task: { on: true, bearing: bears, linear: new Vector3(), angular: new Vector3(), accel: new Float64Array(foot.chain.reduce((count, joint) => count + joint.dofs.length, 0)) },
    stem: [], work: { at: new Vector3(), rows: null, ahead: [], toward: null, patch: null, share: 1 },
  }));
  const solve = makeBearing(null, limbs, found);
  const aim = { spin: new Vector3(), centre: new Vector3() };
  const support = new Vector3(), centre = new Vector3(), velocity = new Vector3(), spin = new Vector3();
  let from = null, inLeg = null;
  return {
    name: "bearing",
    step(_senses, dt) {
      if (!inLeg) {
        inLeg = new Uint8Array(muscles.channels.length);
        for (const foot of feet) {
          foot.memory.channels = foot.chain.flatMap((joint) => joint.dofs.map((dof) => muscles.channel(`${joint.spec.name} ${dof.spec.positive}`)));
          for (const i of foot.memory.channels) inLeg[i] = 1;
        }
        from = centreOfMassToRef(built, new Vector3());
      }
      readSupport(feet, feet, support);
      const ask = () => feet.forEach((foot, f) => {
        const { task, work } = limbs[f];
        work.at.copyFrom(foot.middle);
        work.rows = null;
        work.ahead.length = foot.memory.channels.length;
        work.ahead.fill(NaN);
        work.patch = bears ? bearingSole(foot, KEEP) : null;
        motionAtToRef(foot.segment, work.at, task.linear, task.angular);
        task.linear.scaleInPlace(-e);
        task.angular.scaleInPlace(-e);
      });
      ask();
      centreOfMassToRef(built, centre);
      centreVelocityToRef(built, velocity);
      pelvis.body.angularVelocityToRef(spin);
      aim.centre.copyFrom(from).subtractInPlace(centre).scaleInPlace(e * e).subtractInPlace(velocity.scaleInPlace(2 * e));
      aim.spin.copyFrom(spin).scaleInPlace(-2 * e);
      const lever = Math.max(feet[0].reach, muscles.dynamics.root.centre[1] - support.y);
      const work = servoAsk(muscles, (i) => inLeg[i] ? undefined : 0, SECONDS, dt);
      if (probe) {
        probe({ limbs, feet, carry: () => { carryRoot(solve, muscles, work, aim, lever); return limbs.map((limb) => Array.from(limb.task.accel)); } });
        ask();
      }
      const root = carryRoot(solve, muscles, work, aim, lever);
      servoSolve(muscles, work, root);
      bearLimbs(solve, muscles, work, lever, true);
    },
  };
};

/**
 * The Warrior on the ground under `bearing(bears)` for `seconds`; from `pull.from` s, for `pull.for`
 * s, pulled at its root's centre of mass by a steady tenth of its weight along z. `each` is called
 * after every step with the time, where its centre of mass is from where it began, and the solve's
 * shortfall as a part of its weight. `probe` is the mind's.
 */
async function borne(bears, seconds, each, pull = null, probe = null) {
  const stand = await coreStand(spec);
  const found = {
    root: new Float64Array(6), helped: { force: new Vector3(), moment: new Vector3() },
    held: { channels: [], z0: [], Z: [] }, shortfall: { force: new Vector3(), moment: new Vector3() },
  };
  const { own, dispose } = embody(stand.built, stand.world, bearing(bears, found, probe));
  try {
    const built = stand.built, weight = massOf(built) * Math.hypot(...built.physics.gravity), root = own.muscles.dynamics.root.segment;
    const from = centreOfMassToRef(built, new Vector3()), now = new Vector3(), at = new Vector3();
    const push = new Vector3(0, 0, weight / 10 / stand.world.hz);
    for (let step = 0; step < stand.seconds(seconds); step++) {
      const time = step / stand.world.hz;
      if (pull && time >= pull.from && time < pull.from + pull.for) root.body.applyImpulse(push, centreOfToRef(root, at));
      stand.step();
      centreOfMassToRef(built, now);
      each({ time: (step + 1) / stand.world.hz, off: now.subtract(from), shortfall: found.shortfall.force.length() / weight });
    }
  } finally {
    dispose();
    stand.dispose();
  }
}

test("a body bears on its soles through the solve alone", async () => {
  const mm = (v) => `(${[v.x, v.y, v.z].map((x) => (x * 1000).toFixed(1)).join(", ")}) mm`;
  let far = 0, last = null;
  await borne(true, 3, (row) => { far = Math.max(far, row.off.length()); last = row; });
  console.log(`borne 3 s: farthest ${(far * 1000).toFixed(1)} mm, at the end ${mm(last.off)}, shortfall ${last.shortfall.toExponential(2)} of the weight`);
  assert.ok(last.off.length() < 0.01, `3 s on the centre of mass is ${last.off.length()} m from where it began`);
  assert.ok(last.shortfall < 0.01, `the soles miss ${last.shortfall} of the weight`);

  // Pulled by a tenth of its weight from 1 s to 2 s, it gives less than 3 cm and comes back to where it stood.
  let stood = null, gave = 0;
  await borne(true, 4, (row) => {
    if (row.time <= 1) stood = row.off;
    else gave = Math.max(gave, Vector3.Distance(row.off, stood));
    last = row;
  }, { from: 1, for: 1 });
  const back = Vector3.Distance(last.off, stood);
  console.log(`pulled a tenth of its weight for 1 s: it stood at ${mm(stood)}, gave ${(gave * 1000).toFixed(1)} mm, and 2 s after is ${(back * 1000).toFixed(2)} mm from there`);
  assert.ok(gave < 0.03, `pulled, the centre of mass goes ${gave} m`);
  assert.ok(gave > 0.002, `a pull that moves nothing shows nothing: ${gave} m`);
  assert.ok(back < 0.002, `2 s after the pull it is ${back} m from where it stood`);

  // The control: the same limbs bearing on nothing take none of the ground's wrench, and the body goes down.
  let drop = 0;
  await borne(false, 1, (row) => { drop = -row.off.y; });
  console.log(`bearing on nothing: the centre of mass is ${(drop * 100).toFixed(1)} cm lower 1 s on`);
  assert.ok(drop > 0.3, `with no limb bearing the centre of mass drops ${drop} m in a second`);
});

test("a limb's task asks the rows it names and no other, around the freedoms asked ahead of it", async () => {
  // The body stood half a second; on its last step the left limb's task is solved again and again,
  // one thing changed each time. Its foot faces +z, so its sole's front edge lies along x.
  const steps = 60, hard = 40;
  let step = 0, read = null;
  await borne(true, steps / 120, () => {}, null, ({ limbs, feet, carry }) => {
    if (++step < steps) return;
    const { task, work } = limbs[0], foot = feet[0], ankle = foot.chain[0].dofs.length + foot.chain[1].dofs.length;
    // The stance's rows for a foot rolled on an edge along x: of the spin's, the one about the
    // level normal to the edge (z) and the one about up; the point's three. The turn about the edge is free.
    const w = Vector3.Cross(new Vector3(1, 0, 0), Vector3.UpReadOnly);
    const pivoting = [[[0, w.x], [1, w.y], [2, w.z]], [[1, 1]], [[3, 1]], [[4, 1]], [[5, 1]]];
    const solved = ({ rows, about = "x", spin = 0, ahead = 0, toward = null }) => {
      const was = task.angular.clone();
      work.rows = rows;
      work.ahead[ankle] = ahead;
      work.toward = toward;
      task.angular[about] += spin;
      const accel = carry()[0];
      task.angular.copyFrom(was);
      work.toward = null;
      return accel;
    };
    // The point's velocity alone: three rows, which the leg's five freedoms that are not asked ahead take with two to spare.
    const point = [[[3, 1]], [[4, 1]], [[5, 1]]];
    read = {
      ankle,
      pivoting: solved({ rows: pivoting }),
      aboutTheEdge: solved({ rows: pivoting, spin: hard }),
      aboutItsNormal: solved({ rows: pivoting, about: "z", spin: hard }),
      ahead: solved({ rows: pivoting, ahead: 7 }),
      whole: solved({ rows: null }),
      wholeAboutTheEdge: solved({ rows: null, spin: hard }),
      named: solved({ rows: [0, 1, 2, 3, 4, 5].map((row) => [[row, 1]]) }),
      backward: solved({ rows: [5, 4, 3, 2, 1, 0].map((row) => [[row, 1]]) }),
      point: solved({ rows: point }),
      pointTowardNone: solved({ rows: point, toward: TOWARD.map(() => 0) }),
      pointToward: solved({ rows: point, toward: TOWARD }),
      wholeToward: solved({ rows: null, toward: TOWARD }),
    };
  });
  const most = (a, b) => Math.max(...a.map((v, k) => Math.abs(v - b[k])));
  console.log(`a spin of ${hard} rad/s2 asked: about the free edge it moves a freedom's acceleration ${most(read.pivoting, read.aboutTheEdge)} rad/s2 at most; about its normal ${most(read.pivoting, read.aboutItsNormal).toFixed(1)}; with every row asked ${most(read.whole, read.wholeAboutTheEdge).toFixed(1)}; the six named backward ${most(read.backward, read.whole).toExponential(1)}`);
  assert.equal(read.pivoting.length, 6);
  // Every row named whole is every row as it is, to the bit; named in another order, each row's
  // ask goes with it, and the answer is the same but for the order of the sums.
  assert.deepEqual(read.named, read.whole);
  assert.ok(most(read.backward, read.whole) < 1e-9, `the six rows named backward moved the freedoms ${most(read.backward, read.whole)} rad/s2`);
  // What is asked along a row the task leaves out changes nothing, to the bit.
  assert.deepEqual(read.aboutTheEdge, read.pivoting);
  // The same spin along a row it keeps is taken up: the weighted row is a row asked.
  assert.ok(most(read.pivoting, read.aboutItsNormal) > 10, `a spin about the edge's normal moved the freedoms ${most(read.pivoting, read.aboutItsNormal)} rad/s2`);
  // The control: with every row asked, the spin about the edge is taken up too.
  assert.ok(most(read.whole, read.wholeAboutTheEdge) > 10, `with every row asked, a spin about the edge moved the freedoms ${most(read.whole, read.wholeAboutTheEdge)} rad/s2`);
  // A freedom asked ahead of the task has what it was asked, and the others take the task around it.
  assert.equal(read.pivoting[read.ankle], 0);
  assert.equal(read.ahead[read.ankle], 7);
  assert.ok(most(read.pivoting, read.ahead) >= 7 && read.ahead.some((v, k) => k !== read.ankle && Math.abs(v - read.pivoting[k]) > 1), "the other freedoms did not move around the ankle's ask");
  // Freedoms to spare go toward what they are asked beneath the task: asked toward nothing they move
  // the least, as with no such ask; asked toward `TOWARD` they come nearer it, the ankle still as
  // it was asked ahead; and with every row asked there is little to spare, and they move as the task has them.
  const from = (accel) => Math.hypot(...accel.map((v, k) => (k === read.ankle ? 0 : v - TOWARD[k])));
  console.log(`asked toward ${TOWARD}: the point's task alone leaves the freedoms ${from(read.point).toFixed(2)} rad/s2 from it, and with the ask ${from(read.pointToward).toFixed(2)}; every row asked, the ask moves a freedom ${most(read.whole, read.wholeToward).toFixed(3)} rad/s2 at most`);
  assert.ok(most(read.point, read.pointTowardNone) < 1e-9, `asked toward nothing, the freedoms moved ${most(read.point, read.pointTowardNone)} rad/s2 otherwise`);
  assert.ok(from(read.pointToward) < from(read.point) - 1 && most(read.point, read.pointToward) > 1, `asked toward it, the freedoms are ${from(read.pointToward)} rad/s2 from it, and unasked ${from(read.point)}`);
  assert.equal(read.pointToward[read.ankle], 0);
  assert.ok(most(read.whole, read.wholeToward) < 0.1 * most(read.point, read.pointToward), `with every row asked the ask moved the freedoms ${most(read.whole, read.wholeToward)} rad/s2`);
});

test("the servo is told which freedoms a driven limb moves, and how", () => {
  // Six freedoms: a limb that is on has the third and fourth and hangs from the first; one that is
  // off has the fifth and hangs from the second; the sixth is no limb's.
  const limb = (on, channels, stem, accel) => ({ task: { on, accel: Float64Array.from(accel) }, memory: { channels }, stem });
  const work = { fixed: new Uint8Array(6).fill(1), accel: new Float64Array(6).fill(9) }, moved = new Uint8Array(6).fill(1);
  limbMotion({ limbs: [limb(true, [2, 3], [0], [5, 6]), limb(false, [4], [1], [7])] }, work, moved);
  // The driven limb's own freedoms move as its task has them and are none of the servo's to hold;
  // its stem's are marked and left as the servo asked them; the rest are as they were, unmarked.
  assert.deepEqual({ moved: [...moved], fixed: [...work.fixed], accel: [...work.accel] },
    { moved: [1, 0, 1, 1, 0, 0], fixed: [1, 1, 0, 0, 1, 1], accel: [9, 9, 5, 6, 9, 9] });
});
