// The stance channel (`BodyCommand.gait.stance`, behind `CHANNEL_FLAGS.stance`): the biped's pose
// under a stance, as arithmetic, and the body standing where it was told to, in the solver.
//
// Harness: pure arithmetic for the pose; the Node locomotion bench (`research/stance-bench.mjs`,
// a headless supported pair) for the soles; the Node bout runner for the flag's null.
import assert from "node:assert/strict";
import test from "node:test";

import { setChannelFlags, freshBodyCommand } from "../src/body-command.ts";
import { LOCOMOTION_BIPED } from "../src/golem/config.ts";
import { bipedAnkleRoll, bipedPose, bipedStanceFeet } from "../src/golem/locomotion/biped.ts";
import { HUMAN_BIPED } from "../src/golem/humanoid/body.ts";
import { SKELETON_BIPED } from "../src/golem/skeleton/body.ts";
import { defaultGolemSetup } from "../src/golem/build.ts";
import { stanceCell } from "../research/stance-bench.mjs";
import { createBout, freshHavok } from "./harness/bout-runner.mjs";

const TABLES = Object.freeze({ stone: LOCOMOTION_BIPED, human: HUMAN_BIPED, skeleton: SKELETON_BIPED });
const STANCES = Object.freeze([
  { width: 1, lead: 0, weight: 0 }, { width: -1, lead: 0, weight: 0 },
  { width: 0, lead: 1, weight: 0 }, { width: 0, lead: -1, weight: 0 },
  { width: 0, lead: 0, weight: 1 }, { width: 0, lead: 0, weight: -1 },
  { width: 1, lead: 1, weight: 1 }, { width: -1, lead: -1, weight: -1 }, { width: 0.4, lead: -0.7, weight: 0.3 },
]);

test("a_neutral_stance_poses_the_legs_exactly_as_no_stance_does", () => {
  // The restricted side of every with/without run holds the channel at neutral, and the null
  // control says a flag that is off changes nothing. Both rest on this: the neutral stance takes
  // the walk's own path, to the last bit, over the stride, travel and crouch.
  const neutral = { width: 0, lead: 0, weight: 0 };
  for (const [name, B] of Object.entries(TABLES)) {
    for (let phase = 0; phase < Math.PI * 2; phase += Math.PI / 8) {
      for (const [forward, right, turn] of [[0, 0, 0], [1, 0, 0], [0.6, -0.6, -0.8], [0, 1, 1]]) {
        for (const crouch of [0, 0.5, 1]) {
          assert.deepEqual(bipedPose(phase, forward, right, turn, crouch, B, neutral),
            bipedPose(phase, forward, right, turn, crouch, B), `${name} at ${phase}, ${forward}, ${crouch}`);
        }
      }
    }
  }
});

test("each_stance_foot_lands_where_its_placement_asks_with_the_sole_level_and_every_joint_in_range", () => {
  // Forward kinematics of the standing pose against `bipedStanceFeet`: the leg swings out of the
  // sagittal plane by its abduction, and in that plane the thigh and shin reach `fore` ahead and
  // `hypot(out, depth)` down. Both legs reach one depth, so the hips drop by exactly what the
  // placement needed: two planted feet under a stance are two legs of one height (the trap in
  // AGENTS.md about turning a leg about the hip).
  for (const [name, B] of Object.entries(TABLES)) {
    const leg = B.thighLength + B.shinLength;
    for (const stance of STANCES) {
      for (const crouch of [0, 0.5, 1]) {
        const pose = bipedPose(0, 0, 0, 0, crouch, B, stance);
        const feet = bipedStanceFeet(stance, crouch, B);
        const at = (hip, knee, abduct) => {
          const plane = B.thighLength * Math.cos(hip) + B.shinLength * Math.cos(hip + knee);
          return { fore: -(B.thighLength * Math.sin(hip) + B.shinLength * Math.sin(hip + knee)),
            out: plane * Math.sin(Math.abs(abduct)), depth: plane * Math.cos(abduct) };
        };
        const label = `${name} ${JSON.stringify(stance)} crouch ${crouch}`;
        for (const [side, fore, hip, knee, abduct, ankle] of [
          ["left", feet.foreLeft, pose.hipLeft, pose.kneeLeft, pose.abductLeft, pose.ankleLeft],
          ["right", feet.foreRight, pose.hipRight, pose.kneeRight, pose.abductRight, pose.ankleRight],
        ]) {
          const foot = at(hip, knee, abduct);
          assert.ok(Math.abs(foot.fore - fore) < 1e-9, `${label}: ${side} foot ${foot.fore} ahead, asked ${fore}`);
          assert.ok(Math.abs(foot.out - Math.abs(feet.out)) < 1e-9, `${label}: ${side} foot ${foot.out} out`);
          assert.ok(Math.abs(foot.depth - feet.depth) < 1e-9, `${label}: ${side} hip ${foot.depth} up`);
          // In range, and the sole level along its length and across it.
          assert.ok(hip >= B.hipSwingMin && hip <= B.hipSwingMax, `${label}: hip ${hip}`);
          assert.ok(knee >= B.kneeTargetMin && knee <= B.kneeTargetMax, `${label}: knee ${knee}`);
          assert.ok(Math.abs(abduct) <= B.hipAbduct, `${label}: abduct ${abduct}`);
          assert.ok(Math.abs(hip + knee + ankle) < 1e-9, `${label}: the ${side} sole pitches`);
          assert.ok(Math.abs(bipedAnkleRoll(abduct, B) + abduct) < 1e-12, `${label}: the ${side} sole rolls`);
        }
        // The feet splay symmetrically, each out to its own side.
        assert.ok(Math.abs(pose.abductLeft + pose.abductRight) < 1e-12, `${label}: the splay is not mirrored`);
        assert.ok(Math.abs(pose.hipDrop - (leg - feet.depth)) < 1e-9, `${label}: hip drop ${pose.hipDrop}`);
        assert.ok(feet.depth <= leg - crouch * B.crouchDepth + 1e-12, `${label}: a stance lifted the hips`);
      }
    }
    // The placement follows each axis: width outward, lead the right foot ahead, weight forward
    // bringing both feet back under a body leaning over them.
    const f = (s) => bipedStanceFeet({ width: 0, lead: 0, weight: 0, ...s }, 0, B);
    assert.ok(f({ width: 1 }).out > 0.05 && f({ width: -1 }).out < -0.05, name);
    assert.ok(f({ lead: 1 }).foreRight - f({ lead: 1 }).foreLeft > 0.2, name);
    assert.ok(f({ weight: 1 }).foreLeft < -0.05 && f({ weight: 1 }).foreRight < -0.05, name);
  }
});

test("a_wider_stance_command_stands_the_soles_wider_in_the_solver", async () => {
  // The sign of the abduction is measured, as `ABDUCT_SIGN` is: arithmetic cannot tell which way
  // a positive target turns the leg. Read at the soles after the body has settled.
  const previous = setChannelFlags({ stance: true });
  try {
    const setup = defaultGolemSetup();
    const read = async (stance) => (await stanceCell(setup, stance, { settle: 1.5, walk: 0 })).standing;
    const neutral = await read({ width: 0, lead: 0, weight: 0 });
    const wide = await read({ width: 1, lead: 0, weight: 0 });
    const narrow = await read({ width: -1, lead: 0, weight: 0 });
    const staggered = await read({ width: 0, lead: 1, weight: 0 });
    assert.ok(wide.width - neutral.width > 0.12, `width 1 stood the soles ${wide.width.toFixed(3)} apart against ${neutral.width.toFixed(3)}`);
    assert.ok(neutral.width - narrow.width > 0.12, `width -1 stood them ${narrow.width.toFixed(3)} apart`);
    assert.ok(staggered.stagger > 0.2, `lead 1 put the right foot ${staggered.stagger.toFixed(3)} ahead of the left`);
    for (const cell of [neutral, wide, narrow, staggered]) assert.equal(cell.downSteps, 0);
  } finally { setChannelFlags(previous); }
});

test("a_stance_fades_out_of_a_full_speed_walk_rather_than_dragging_the_planted_foot", async () => {
  // Held through a walk without the fade, a full lead read 824 mm/s of planted-sole slip at full
  // forward against 321 neutral (Node locomotion bench, stone): the stride swung each foot about
  // a base the carrier was dragging it off. With it, the full-speed walk is the neutral walk's.
  const previous = setChannelFlags({ stance: true });
  try {
    const setup = defaultGolemSetup();
    const slip = async (stance) => (await stanceCell(setup, stance, { settle: 1, walk: 1.5 })).full.meanFootSlipMps;
    const neutral = await slip({ width: 0, lead: 0, weight: 0 });
    const lead = await slip({ width: 0, lead: 1, weight: 0 });
    assert.ok(lead < neutral * 1.4, `a full lead slipped ${(lead * 1000).toFixed(0)} mm/s against ${(neutral * 1000).toFixed(0)} neutral`);
  } finally { setChannelFlags(previous); }
});

/** A command mind walking at 0.6 with `write` applied to its stance each step. */
function walker(write) {
  const out = freshBodyCommand();
  let t = 0;
  return { name: "stance-walker", command(view, dt) { t += dt; out.gait.forward = 0.6; write(out.gait.stance, t); return out; } };
}

async function track(mind) {
  const bout = createBout({ left: "golem-duelist", right: "golem-duelist", seeds: [3, 4], physics: await freshHavok(),
    leftMind: mind, locomotionMode: "supported", maxSeconds: 30, separation: 12 });
  const out = [];
  // The carrier's ground track does not read the legs at all, so the soles are read as well.
  const feet = bout.left.limbs.filter((l) => /legs\.foot[LR]/.test(l.key)).map((l) => l.part.mesh);
  assert.equal(feet.length, 2);
  try {
    for (let f = 0; f < 90 && bout.step(); f += 1) {
      const g = bout.left.view.self.ground;
      out.push([g.x, g.y, g.z, ...feet.flatMap((m) => [m.position.x, m.position.y, m.position.z])]);
    }
    return out;
  } finally { bout.dispose(); }
}

test("with_the_flag_on_a_neutral_stance_is_the_flag_off_body_bit_for_bit_and_a_written_one_is_not", async () => {
  // The flag on and the stance held at neutral is the restricted side of the headroom run; it
  // has to be the body the null control measured. The control: a written stance moves the track,
  // or the equality proves nothing.
  const neutral = () => {};
  const off = await track(walker(neutral));
  const previous = setChannelFlags({ stance: true });
  try {
    const on = await track(walker(neutral));
    assert.deepEqual(on, off);
    const written = await track(walker((stance, t) => { stance.width = 1; stance.lead = Math.sin(t); stance.weight = -0.5; }));
    assert.notDeepEqual(written, off, "a written stance changed nothing, so the equality above is empty");
  } finally { setChannelFlags(previous); }
});
