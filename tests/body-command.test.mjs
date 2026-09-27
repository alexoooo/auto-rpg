// The body command (`src/body-command.ts`): the adapter every `Intent` mind goes through, the
// channels each module declares, and a feature a module did not declare being inert.
//
// Harness: the Node bout runner (`tests/harness/bout-runner.mjs`), supported locomotion.
import assert from "node:assert/strict";
import test from "node:test";

import {
  CHANNEL_FLAGS, CHANNEL_KINDS, cloneBodyCommand, copyBodyCommand, declares, freshBodyCommand, intentToCommand,
  parseChannelFlags, setChannelFlags,
} from "../src/body-command.ts";
import { freshGolemIntent } from "../src/golem/tactics.ts";
import { defaultGolemSetup } from "../src/golem/build.ts";
import { createBout, freshHavok } from "./harness/bout-runner.mjs";

/** An intent with a distinct value in every leaf, so a dropped or crossed field shows. */
function distinctIntent() {
  const intent = freshGolemIntent();
  intent.forward = 0.11; intent.strafe = -0.22; intent.turn = 0.33; intent.actingHand = "secondary";
  intent.natural.thrust = true; intent.natural.guard = false;
  intent.posture.trunkLean = 0.44; intent.posture.trunkTwist = -0.55; intent.posture.crouch = 0.66;
  Object.assign(intent.primary, { pointerX: 0.1, pointerY: 0.2, reach: 0.3, roll: 0.4, wristBend: 0.5, thrust: true, guard: false });
  Object.assign(intent.secondary, { pointerX: -0.1, pointerY: -0.2, reach: -0.3, roll: -0.4, wristBend: -0.5, thrust: false, guard: true });
  return intent;
}

test("the_adapter_carries_every_intent_field_to_its_channel_and_leaves_the_rest_neutral", () => {
  const intent = distinctIntent();
  const command = intentToCommand(intent);
  assert.deepEqual(command, {
    actingHand: "secondary",
    effectors: { primary: { aim: { ...intent.primary } }, secondary: { aim: { ...intent.secondary } } },
    trunk: { lean: 0.44, twist: -0.55, crouch: 0.66 },
    gait: { forward: 0.11, strafe: -0.22, turn: 0.33, stance: { width: 0, lead: 0, weight: 0 }, step: null },
    natural: { thrust: true, guard: false },
  });
  // The hand records are the intent's own: a body reads the object it read before the seam.
  assert.equal(command.effectors.primary.aim, intent.primary);
  assert.equal(command.effectors.secondary.aim, intent.secondary);
  // A neutral intent is the neutral command, leaf for leaf.
  assert.deepEqual(intentToCommand(freshGolemIntent()), freshBodyCommand());
  // Reuse: a command that carried a stance and a step is put back to neutral on both.
  const reused = freshBodyCommand();
  reused.gait.stance.width = 1; reused.gait.stance.lead = -1; reused.gait.stance.weight = 0.5;
  reused.gait.step = { x: 1, z: 2, within: 0.5 };
  intentToCommand(freshGolemIntent(), reused);
  assert.deepEqual(reused, freshBodyCommand());
});

test("a_copied_command_is_a_deep_copy_of_every_leaf", () => {
  const from = intentToCommand(distinctIntent(), freshBodyCommand());
  from.gait.stance.width = 0.7; from.gait.stance.lead = -0.8; from.gait.stance.weight = 0.9;
  from.gait.step = { x: 1.5, z: -2.5, within: 0.4 };
  from.effectors.primary.aim.orientation = { x: 0, y: 0.6, z: 0, w: 0.8 };
  const copy = cloneBodyCommand(from);
  assert.deepEqual(copy, from);
  // Nothing is shared: writing the source afterwards leaves the copy standing.
  from.gait.stance.width = 0; from.gait.step.x = 0; from.effectors.primary.aim.pointerX = 9;
  from.effectors.primary.aim.orientation.y = 0;
  assert.equal(copy.gait.stance.width, 0.7);
  assert.equal(copy.gait.step.x, 1.5);
  assert.equal(copy.effectors.primary.aim.pointerX, 0.1);
  assert.equal(copy.effectors.primary.aim.orientation.y, 0.6);
  // And a null step and an absent orientation copy as such over a command that had both.
  const back = copyBodyCommand(intentToCommand(distinctIntent()), copy);
  assert.equal(back.gait.step, null);
  assert.equal("orientation" in back.effectors.primary.aim, false);
});

test("channel_flags_parse_by_name_and_refuse_a_name_that_is_not_a_channel", () => {
  assert.deepEqual(parseChannelFlags("stance,step"), { stance: true, step: true });
  assert.deepEqual(parseChannelFlags(""), {});
  assert.throws(() => parseChannelFlags("stance,footwork"), /footwork/);
});

// ---------------------------------------------------------------------------------------------
// The declarations, on real bodies
// ---------------------------------------------------------------------------------------------

const none = { chain: "none", terminal: "none" };
/** Odd morphologies: a wheeled head-rammer with no arms, and a one-armed multileg. */
const BODIES = Object.freeze({
  default: defaultGolemSetup(),
  "wheeled-rammer": { ...defaultGolemSetup(), locomotion: "locomotion.wheel", head: "head.ram", primary: none, secondary: none },
  "one-armed-multileg": { ...defaultGolemSetup(), locomotion: "locomotion.multileg", secondary: none },
});

/** The channels a body declares, as `kind(hand):features` strings, built under `flags`. */
async function channelsOf(setup, flags = {}) {
  const previous = setChannelFlags(flags);
  const bout = createBout({ left: "golem-duelist", right: "golem-duelist", seeds: [1, 2], physics: await freshHavok(),
    leftGolem: setup, locomotionMode: "supported", maxSeconds: 1 });
  try {
    const channels = bout.left.view.self.capabilities.channels;
    for (const channel of channels) {
      assert.ok(channel.module.length > 0, "a channel names its module");
      assert.ok(channel.actuator.length > 20, `${channel.kind} names the actuator that carries it out`);
      assert.ok(CHANNEL_KINDS.includes(channel.kind));
    }
    return { channels, list: channels.map((c) => `${c.kind}${c.hand ? `(${c.hand})` : ""}:${c.features.join("+")}`).sort() };
  } finally {
    bout.dispose();
    setChannelFlags(previous);
  }
}

test("each_module_declares_its_channels_from_the_shared_kinds_and_odd_bodies_declare_only_what_they_have", async () => {
  const stone = await channelsOf(BODIES.default);
  assert.deepEqual(stone.list, [
    "effector(primary):aim", "effector(secondary):aim", "natural-striker:guard", "stepping-gait:travel+turn",
    "trunk:crouch", "trunk:lean+twist",
  ]);
  // A wheel rolls and has one height; a rammer's head strikes; no arms, no effector channel.
  const rammer = await channelsOf(BODIES["wheeled-rammer"]);
  assert.deepEqual(rammer.list, ["natural-striker:thrust+guard", "rolling-base:travel+turn", "trunk:lean+twist"]);
  const multileg = await channelsOf(BODIES["one-armed-multileg"]);
  assert.deepEqual(multileg.list, [
    "effector(primary):aim", "natural-striker:guard", "stepping-gait:travel+turn", "trunk:lean+twist",
  ]);
});

test("a_flag_declares_its_feature_only_on_a_gait_that_can_carry_it", async () => {
  const flags = { stance: true, step: true, effector: false };
  const stone = await channelsOf(BODIES.default, flags);
  assert.ok(declares(stone.channels, "stepping-gait", "stance"), "a biped stands where it is told to");
  assert.ok(declares(stone.channels, "stepping-gait", "step"));
  // A wheel has no feet to place and six legs have no stance IK: the step, and never a stance.
  const rammer = await channelsOf(BODIES["wheeled-rammer"], flags);
  assert.ok(declares(rammer.channels, "rolling-base", "step"));
  assert.ok(!rammer.list.some((entry) => entry.includes("stance")), rammer.list.join(", "));
  const multileg = await channelsOf(BODIES["one-armed-multileg"], flags);
  assert.ok(!multileg.list.some((entry) => entry.includes("stance")), multileg.list.join(", "));
  // The flags are back where they were.
  assert.deepEqual({ ...CHANNEL_FLAGS }, { stance: false, step: false, effector: false });
});

// ---------------------------------------------------------------------------------------------
// A command mind drives an odd body, and an undeclared feature is inert
// ---------------------------------------------------------------------------------------------

/** A command mind: forward at `forward`, the ram thrown from 0.5 s, and whatever `extra` writes. */
function commandMind(forward, extra = () => {}) {
  const out = freshBodyCommand();
  let t = 0;
  return {
    name: "command-probe",
    command(view, dt) {
      t += dt;
      out.gait.forward = forward;
      out.natural.thrust = t > 0.5;
      extra(out, t);
      return out;
    },
  };
}

/** Ground track of the left body over `seconds`, and the natural attack's published state. */
async function drive(setup, mind, seconds = 2) {
  const bout = createBout({ left: "golem-duelist", right: "golem-duelist", seeds: [3, 4], physics: await freshHavok(),
    leftGolem: setup, leftMind: mind, locomotionMode: "supported", maxSeconds: 30, separation: 12 });
  const track = [];
  // The ground track is the carrier's and reads no leg, so every part's position goes in as well:
  // with the ground alone, a stance that moved both feet compared equal (mutation-checked).
  const meshes = bout.left.limbs.map((l) => l.part.mesh);
  try {
    const frames = Math.round(seconds * 60);
    for (let f = 0; f < frames && bout.step(); f += 1) {
      const g = bout.left.view.self.ground;
      track.push([g.x, g.y, g.z, ...meshes.flatMap((m) => [m.position.x, m.position.y, m.position.z])]);
    }
    return { track, held: bout.left.control.driver.held };
  } finally {
    bout.dispose();
  }
}

test("a_command_mind_drives_a_wheeled_rammer_and_its_command_is_what_the_driver_applied", async () => {
  const still = await drive(BODIES["wheeled-rammer"], commandMind(0));
  const rolling = await drive(BODIES["wheeled-rammer"], commandMind(1));
  const travelled = (run) => Math.hypot(run.track.at(-1)[0] - run.track[0][0], run.track.at(-1)[2] - run.track[0][2]);
  assert.ok(travelled(rolling) > 0.5, `forward rolled the wheel ${travelled(rolling).toFixed(3)} m`);
  assert.ok(travelled(still) < 0.1, `a zero command stood still (${travelled(still).toFixed(3)} m)`);
  assert.equal(rolling.held.natural.thrust, true, "the ram's thrust reached the driver");
  assert.equal(rolling.held.gait.forward, 1);
});

test("a_feature_the_body_did_not_declare_is_inert_bit_for_bit", async () => {
  // A wheel declares no stance even with the flag on; a stepping biped with the flag off declares
  // none either. Writing one must change nothing, to the last bit of the track.
  const stanceWriter = (out, t) => { out.gait.stance.width = Math.sin(t); out.gait.stance.lead = 1; out.gait.stance.weight = -1; };
  const previous = setChannelFlags({ stance: true });
  try {
    const plain = await drive(BODIES["wheeled-rammer"], commandMind(0.6));
    const written = await drive(BODIES["wheeled-rammer"], commandMind(0.6, stanceWriter));
    assert.deepEqual(written.track, plain.track);
  } finally { setChannelFlags(previous); }
  const plain = await drive(BODIES.default, commandMind(0.6), 1.5);
  const written = await drive(BODIES.default, commandMind(0.6, stanceWriter), 1.5);
  assert.deepEqual(written.track, plain.track);
  // The control: the same writer on the same body with the flag on does move it, so the two
  // equalities above are about the declaration and not about a reading that cannot see a stance.
  const again = setChannelFlags({ stance: true });
  try {
    const declared = await drive(BODIES.default, commandMind(0.6, stanceWriter), 1.5);
    assert.notDeepEqual(declared.track, plain.track, "a declared stance moved nothing this test reads");
  } finally { setChannelFlags(again); }
});
