/**
 * **How well the stance goes** (`src/core/control/stance.ts`), measured on the Node core stand,
 * Rapier, both humans, on a ground, 120 Hz, and not a gate (`tests/experimental.json`): a human
 * on both feet, asked to stand 3 cm under its reference height, stands there without drifting, its
 * centre of mass over the middle of its soles and its feet still; asked for a place, a height and a
 * heading, it goes there; asked for a place its ankles cannot reach, one its knees cannot, or one
 * past its soles, it stops where it can and stands, and without the limit that stops it does not
 * (the controls); a place at a sideways edge holds with the sole margin, and catches of forward
 * shoves the margin holds fall without it (the control).
 * Asked for a step, it shifts its weight, swings the foot to where it was asked, lands and stands;
 * asked to turn as it steps, the foot lands facing the new heading.
 * Shoved at the trunk past what its soles hold, it steps to catch itself and stands, where without
 * the step it falls (the control); shoved lightly, it does not step. Shoved back as it shifts its
 * weight for a step it was asked for, the Warrior catches itself first and stands, where a stance
 * that does not step of itself falls still shifting (the control). Asked to walk, it steps of
 * itself, goes the way and about the speed asked, and asked to walk nowhere, stops and stands. A
 * walk stopped ends with its feet back at the width the body was built standing at, and holds a
 * sideways shove there that the gait's width did not (`shove` in `research/core-stance-trials.mjs`).
 * Shoved hard straight to the side, the Warrior catches itself with the near foot stepping out once
 * the far one has come in. What any stance passes is `core-stance.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { SOLE_MARGIN, STANCE_ANKLE_SPARE } from "../src/core/control/stance-tuning.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { shove } from "../research/core-stance-trials.mjs";
import { across, GUARD, shoved, shovedShifting, standing, stepping, walking } from "./fixtures/core-stance.mjs";

for (const model of ["workshop-fighter", "workshop-rogue"]) {
  test(`${model} stands without drifting`, async () => {
    const r = await standing(model, 5, (first) => ({ feet: ["left", "right"], centre: null, height: first.height - 0.03, heading: 0 }), { posture: GUARD });
    const off = across(r.after.centre, r.after.support), drift = Vector3.Distance(r.after.centre, r.before.centre);
    const low = Math.abs(r.after.height - r.goal.height);
    assert.ok(off < 0.001, `the centre of mass stopped ${(1000 * off).toFixed(2)} mm from the middle of the soles`);
    assert.ok(low < 0.001, `the centre of mass stood ${(1000 * low).toFixed(2)} mm off its height`);
    assert.ok(drift < 0.0005 && r.after.speed < 0.001, `it drifted ${(1000 * drift).toFixed(3)} mm in 2 s, at ${(100 * r.after.speed).toFixed(3)} cm/s`);
    // The feet settle 4-5 mm into the ground in the first second, as the engine's contact takes the
    // weight, and are still after.
    assert.ok(r.slide < 0.002 && r.sink < 0.008 && r.still < 0.0001,
      `the feet slid ${(1000 * r.slide).toFixed(2)} mm, sank ${(1000 * r.sink).toFixed(2)} mm, moved ${(1000 * r.still).toFixed(4)} mm in the last 2 s`);
    assert.ok(r.inertia.every((x) => Math.abs(x - 1) < 1e-9), `the feet's inertia was not their own: x${r.inertia}`);
  });
}

// The skeleton's thighs, built inside each other, held its pelvis from turning at all.
test("the stance goes where it is asked: a place, a height, a heading, the Rogue and the skeleton", async () => {
  for (const model of ["workshop-rogue", "crypt-skeleton"]) {
    const r = await standing(model, 5, (first) => ({ feet: ["left", "right"],
      centre: [first.support.x + 0.02, first.support.z + 0.03], height: first.height - 0.03, heading: 0.2 }));
    const off = Math.hypot(r.after.centre.x - r.goal.centre[0], r.after.centre.z - r.goal.centre[1]);
    const low = Math.abs(r.after.height - r.goal.height), turned = Math.abs(r.heading - r.goal.heading);
    assert.ok(off < 0.005, `${model}: the centre of mass stopped ${(1000 * off).toFixed(1)} mm from its place`);
    assert.ok(low < 0.005, `${model}: the centre of mass stood ${(1000 * low).toFixed(1)} mm off its height`);
    assert.ok(turned < 0.02, `${model}: the pelvis faced ${turned.toFixed(3)} rad off its heading`);
    assert.ok(r.slide < 0.005, `${model}: the feet slid ${(1000 * r.slide).toFixed(1)} mm`);
  }
});

test("a height beyond the ankles' range is not reached: each human sinks to their reach less the spare and stands, and asked for it does not", async () => {
  // 10 cm lower, and 3 cm further forward, asks the ankles for more dorsiflexion than their range
  // (humanSpec) has, with the feet flat.
  for (const model of ["workshop-rogue", "workshop-fighter"]) {
    const ask = (first) => ({ feet: ["left", "right"], centre: [first.support.x, first.support.z + 0.03], height: first.height - 0.1, heading: 0 });
    const r = await standing(model, 5, ask), control = await standing(model, 5, ask, { stance: { ankleSpare: null } });
    const upper = humanSpec(model).joints.find((j) => j.name === "ankle.left").dofs.find((d) => d.positive === "dorsiflexion").max.value;
    const ankleOf = (s) => Math.max(s.angles["ankle.left dorsiflexion"], s.angles["ankle.right dorsiflexion"]);
    const ankle = ankleOf(r), above = r.after.height - r.goal.height, off = across(r.after.centre, r.place);
    const fell = control.after.height < control.goal.height - 0.1, pressed = ankleOf(control) > upper - 0.005, missed = across(control.after.centre, control.place);
    assert.ok(above > 0.03, `${model} sank within ${(1000 * above).toFixed(1)} mm of a height past the ankles' range`);
    assert.ok(ankle < upper - STANCE_ANKLE_SPARE + 0.01, `${model}'s ankle bent to ${ankle.toFixed(3)} rad, past its range ${upper.toFixed(3)} less the spare`);
    assert.ok(off < 0.005 && r.after.speed < 0.01, `${model} did not stand: ${(1000 * off).toFixed(1)} mm off at ${(100 * r.after.speed).toFixed(2)} cm/s`);
    // Asked past the ankles' range, a body falls, or stands with its ankles on their stops, where
    // they can no longer carry it to its place.
    assert.ok(fell || (pressed && missed > 0.005), `the control: asked past the ankles' range, ${model} stood ${(1000 * missed).toFixed(1)} mm from its place, ankle ${ankleOf(control).toFixed(3)} rad`);
  }
});

test("a place past the soles is held at the edge of what they hold, each way, and the body stands", async () => {
  // 40 cm out is past what the soles hold every way: 23 cm to the side, 4 forward and 10 back. Over
  // a foot's outer edge the plan comes down to the legs' reach, and the body stands at the plan's
  // height; the foot rolls onto that edge, which carries its node about 2 mm across.
  for (const [dx, dz] of [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]) {
    const r = await standing("workshop-fighter", 6, (first) => ({ feet: ["left", "right"],
      centre: [first.support.x + dx, first.support.z + dz], height: first.height - 0.03, heading: 0 }));
    const off = Math.hypot(r.after.centre.x - r.place.x, r.after.centre.z - r.place.z);
    const moved = Math.hypot(r.place.x - r.goal.centre[0], r.place.z - r.goal.centre[1]);
    assert.ok(moved > 0.1, `(${dx}, ${dz}): a place 40 cm out was held only ${(1000 * moved).toFixed(0)} mm in`);
    assert.ok(off < 0.015 && Math.abs(r.after.held) < 0.005, `(${dx}, ${dz}): stood ${(1000 * off).toFixed(1)} mm from the held place, ${(1000 * r.after.held).toFixed(1)} mm off the height held`);
    assert.ok(r.slide < 0.004 && r.still < 0.0005, `(${dx}, ${dz}): the feet moved ${(1000 * r.slide).toFixed(1)} mm, ${(1000 * r.still).toFixed(2)} mm in the last 2 s`);
  }
});

test("shoved past its soles, each human steps to catch itself and stands, and without the step falls; shoved lightly, it does not step", async () => {
  // Each at most what STANCE_RECOVERY's sweep holds that way stepping, and more than it holds
  // unstepped: the Rogue 35 N s back (20 unstepped) and 40 forward right (30); the Warrior 55
  // forward (30), forward right (40) and back (30). Straight to the side a step holds no more than
  // standing (the Rogue to its left stands 35 either way and falls from 40 either way), so no case is
  // there; the Rogue forward is the next test's.
  const cases = [["workshop-rogue", 35, 180], ["workshop-rogue", 40, 45],
    ["workshop-fighter", 55, 0], ["workshop-fighter", 55, 45], ["workshop-fighter", 55, 180]];
  for (const [model, impulse, degrees] of cases) {
    const caught = await shoved(model, impulse, degrees), free = await shoved(model, impulse, degrees, { recovery: null });
    const at = `${model} ${impulse} N s at ${degrees}`;
    assert.ok(caught.steps >= 1 && !caught.fell, `${at}: ${caught.steps} steps, ${caught.fell ? "fell" : "stood"}`);
    // A wide stance a step leaves reaches only so high (STANCE_KNEE_BEND, STANCE_ANKLE_SPARE): the
    // height it holds is its plan's, which may be under the goal's.
    assert.ok(caught.speed < 0.01 && Math.abs(caught.held) < 0.005 && Math.abs(caught.low) < 0.05,
      `${at}: ended ${(1000 * caught.low).toFixed(1)} mm low, ${(1000 * caught.held).toFixed(1)} mm off the height held, at ${(100 * caught.speed).toFixed(2)} cm/s`);
    assert.ok(free.fell, `the control: ${at} unstepping stood`);
  }
  // Forward, what the ankles hold reaches only a few cm past the soles' middle (ANKLE_HOLD): the
  // Rogue shoved 10 N s forward steps, and 8 N s any way neither human does.
  for (const model of ["workshop-rogue", "workshop-fighter"]) for (const degrees of [0, 90, 180, 270]) {
    const light = await shoved(model, 8, degrees);
    assert.deepEqual([light.steps, light.fell], [0, false], `${model} 8 N s at ${degrees}: ${light.steps} steps, ${light.fell ? "fell" : "stood"}`);
  }
});

test("shoved forward past its soles, the Rogue steps to catch itself and stands at the height it holds, and without the step falls", async () => {
  // 35 N s: what STANCE_RECOVERY's sweep holds forward stepping, 20 unstepped.
  const caught = await shoved("workshop-rogue", 35, 0), free = await shoved("workshop-rogue", 35, 0, { recovery: null });
  assert.ok(caught.steps >= 1 && !caught.fell, `${caught.steps} steps, ${caught.fell ? "fell" : "stood"}`);
  assert.ok(caught.speed < 0.01 && Math.abs(caught.held) < 0.005 && Math.abs(caught.low) < 0.07,
    `ended ${(1000 * caught.low).toFixed(1)} mm low, ${(1000 * caught.held).toFixed(1)} mm off the height held, at ${(100 * caught.speed).toFixed(2)} cm/s`);
  assert.ok(free.fell, "the control: unstepping it stood");
});

test("shoved back as it shifts its weight for a step it was asked, the Warrior catches itself first and stands", async () => {
  // 35 N s: 32 the shift outlasts, its capture point coming back over the bearing sole, and from 39
  // the catch takes a second step.
  const caught = await shovedShifting(35), free = await shovedShifting(35, { recovery: null });
  assert.deepEqual(caught, { phases: ["shift", "swing", "stand", "shift", "swing", "stand"], steps: 1, down: false }, "the catch, then the step asked");
  assert.deepEqual(free, { phases: ["shift"], steps: 0, down: true }, "the control: it falls still shifting");
});

test("the sole margin holds a sideways edge and a catch: the Rogue stands at +x with it, and without it falls from forward shoves it catches with it", async () => {
  // Standing, the plan keeps within what the ankles hold, short of the sole's edge, so the margin
  // shows where a catch bears a sole near its edge: shoved forward 28 to 37 N s, the Rogue without
  // it fell from 28, 33 and 35, and with it from none.
  const edge = await standing("workshop-rogue", 6, (first) => ({ feet: ["left", "right"],
    centre: [first.support.x + 0.3, first.support.z], height: first.height - 0.03, heading: 0 }), { stance: { soleMargin: SOLE_MARGIN } });
  const off = Math.hypot(edge.after.centre.x - edge.place.x, edge.after.centre.z - edge.place.z);
  assert.ok(off < 0.005 && edge.slide < 0.002, `with the margin, it stood ${(1000 * off).toFixed(1)} mm off, the feet slid ${(1000 * edge.slide).toFixed(1)} mm`);
  const impulses = [28, 31, 33, 35, 37], fell = async (soleMargin) => {
    const falls = [];
    for (const impulse of impulses) if ((await shoved("workshop-rogue", impulse, 0, { soleMargin })).fell) falls.push(impulse);
    return falls;
  };
  const held = await fell(SOLE_MARGIN), free = await fell(0);
  assert.deepEqual(held, [], `with the margin, it fell from ${held.join(", ")} N s`);
  assert.ok(free.length >= 2, `the control: with no margin it fell only from ${free.join(", ") || "none"} of ${impulses.join(", ")} N s`);
});

test("each human steps each foot 15 and 25 cm forward, 15 cm back and 10 cm out, lands where asked and stands", async () => {
  for (const model of ["workshop-rogue", "workshop-fighter"]) for (const foot of ["left", "right"]) {
    const out = foot === "left" ? -0.1 : 0.1;
    for (const [dx, dz] of [[0, 0.15], [0, 0.25], [0, -0.15], [out, 0]]) {
      const r = await stepping(model, foot, dx, dz);
      const at = `${model} ${foot} (${dx}, ${dz})`;
      assert.deepEqual(r.phases, ["stand", "shift", "swing", "stand"], `${at}: phases ${r.phases.join(" ")}`);
      // Carried on the path's speeds alone, with no pull onto it, a step back lands 18 to 23 mm off.
      assert.ok(r.miss < 0.017, `${at}: landed ${(1000 * r.miss).toFixed(1)} mm from the asked place`);
      assert.ok(r.turned < 0.05, `${at}: the foot turned ${r.turned.toFixed(3)} rad in the air`);
      // A spread stance is held lower than asked, for the legs' reach (STANCE_KNEE_BEND).
      assert.ok(r.off < 0.005 && r.low > -0.005 && r.low < 0.05 && r.speed < 0.01,
        `${at}: stood ${(1000 * r.off).toFixed(1)} mm from the held place, ${(1000 * r.low).toFixed(1)} mm low, at ${(100 * r.speed).toFixed(2)} cm/s`);
      assert.ok(r.drift < 0.01, `${at}: the other foot moved ${(1000 * r.drift).toFixed(1)} mm`);
    }
  }
});

test("each human steps each foot 15 cm forward turned half a radian its own way, and lands facing the heading", async () => {
  // Turned without its own rate, only pulled onto its path at the swing's constant, a foot lags the
  // whole of its turn and lands off the heading.
  for (const model of ["workshop-rogue", "workshop-fighter"]) for (const foot of ["left", "right"]) {
    const heading = foot === "right" ? 0.5 : -0.5, r = await stepping(model, foot, 0, 0.15, undefined, heading);
    const at = `${model} ${foot}`;
    assert.deepEqual(r.phases, ["stand", "shift", "swing", "stand"], `${at}: phases ${r.phases.join(" ")}`);
    assert.ok(r.faced < 0.05, `${at}: landed ${r.faced.toFixed(3)} rad off the heading`);
    assert.ok(r.miss < 0.017, `${at}: landed ${(1000 * r.miss).toFixed(1)} mm from the asked place`);
    assert.ok(r.drift < 0.01, `${at}: the other foot moved ${(1000 * r.drift).toFixed(1)} mm`);
  }
});

test("asked higher than the legs reach with their knees bent, each human stands at that reach, and held to the height asked wanders", async () => {
  // The Rogue 10 cm higher, the Warrior 5: past the reach of legs bent by STANCE_KNEE_BEND, where a
  // leg is near straight and its Jacobian near singular. Held to the height asked, a human wanders on
  // its feet (the control): at the end it is still moving, at 9 to 23 mm/s where the bent stance is
  // under 0.01.
  for (const [model, rise] of [["workshop-rogue", 0.1], ["workshop-fighter", 0.05]]) {
    const ask = (first) => ({ feet: ["left", "right"], centre: null, height: first.height + rise, heading: 0 });
    const bent = await standing(model, 5, ask), straight = await standing(model, 5, ask, { stance: { kneeBend: null } });
    const drift = (r) => Vector3.Distance(r.after.centre, r.before.centre);
    assert.ok(drift(bent) < 0.0005 && bent.after.speed < 0.001 && bent.slide < 0.002,
      `${model}: with the bend, it drifted ${(1000 * drift(bent)).toFixed(2)} mm in 2 s, its feet ${(1000 * bent.slide).toFixed(1)} mm`);
    assert.ok(bent.after.height < bent.goal.height - 0.02, `${model}: with the bend, it rose to within ${(1000 * (bent.goal.height - bent.after.height)).toFixed(1)} mm of a height past the legs' reach`);
    assert.ok(straight.after.speed > 0.005, `the control: ${model}, held to the height asked, it ended moving at only ${(1000 * straight.after.speed).toFixed(2)} mm/s`);
  }
});

test("asked to walk, each human steps of itself the way and about the speed asked, and asked to stop, stops and stands", async () => {
  const speed = 0.3;
  for (const model of ["workshop-rogue", "workshop-fighter"]) for (const degrees of [0, 90, 180]) {
    const r = await walking(model, degrees, speed);
    const at = `${model} at ${speed} m/s, ${degrees}`;
    assert.ok(!r.fell && r.strides >= 8, `${at}: ${r.strides} strides, ${r.fell ? "fell" : "stood"}`);
    // A walk goes at about 0.94 of the speed asked (STANCE_GAIT).
    assert.ok(r.along > 0.7 * speed && r.along < 1.25 * speed && Math.abs(r.across) < 0.25 * speed,
      `${at}: ${r.along.toFixed(3)} m/s along, ${r.across.toFixed(3)} across`);
    // Stopped, it steps no more and stands still over its place.
    assert.ok(r.phase === "stand" && r.stepped === 0 && r.off < 0.01 && r.speed < 0.01,
      `${at}: stopped, ${r.phase}, ${r.stepped} steps over its last 2 s, ${(100 * r.off).toFixed(1)} cm off its place at ${(100 * r.speed).toFixed(2)} cm/s`);
  }
  // The control: walking nowhere, it takes no step and goes nowhere.
  const still = await walking("workshop-rogue", 0, 0);
  assert.ok(still.strides === 0 && !still.fell && Math.abs(still.along) < 0.01 && still.speed < 0.01,
    `the control: walking nowhere, ${still.strides} strides, ${still.along.toFixed(3)} m/s`);
});

test("a walk stopped settles its feet to the body's own width, and holds a sideways shove as the built stance does", async () => {
  // An impulse each human holds sideways at its built width and not on the gait's narrower one (the
  // sweep's shove battery at rest, and with `--walked 0.3` without the settle step: Rogue 25, Warrior
  // 35 N s at 90).
  for (const [model, impulse] of [["workshop-rogue", 30], ["workshop-fighter", 45]]) {
    const rest = await shove({ model, impulse, degrees: 90 }), walked = await shove({ model, impulse, degrees: 90, walked: 0.3 });
    assert.ok(Math.abs(walked.apart - rest.apart) < 0.01, `${model}: apart ${walked.apart.toFixed(3)} m after a walk, ${rest.apart.toFixed(3)} built`);
    assert.ok(!rest.fell && !walked.fell, `${model}: ${impulse} N s at 90 ${rest.fell ? "fell" : "held"} built, ${walked.fell ? "fell" : "held"} after a walk`);
  }
});

test("shoved hard to the side, the Warrior brings its far foot in and steps out with the near one, and stands", async () => {
  // 60 N s straight to each side: past the 55 the shove battery holds there when only the far foot
  // steps (`docs/reference/stance-tuning.md#recovery-step`).
  for (const degrees of [90, 270]) {
    const r = await shove({ model: "workshop-fighter", impulse: 60, degrees });
    assert.ok(!r.fell && r.steps >= 2 && r.speed < 0.05, `at ${degrees}: ${r.fell ? "fell" : "held"} in ${r.steps} steps at ${r.speed.toFixed(3)} m/s`);
  }
});
