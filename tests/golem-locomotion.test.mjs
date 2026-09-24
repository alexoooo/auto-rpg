import assert from "node:assert/strict";
import test from "node:test";

import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsMotionType, PhysicsShapeType } from
  "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";

import { CONFIG } from "../src/config.ts";
import {
  BENCH_STAND, BENCH_STAND_LOCOMOTION, GOLEM_RUIN, LOCOMOTION_BIPED, LOCOMOTION_MULTILEG,
  LOCOMOTION_WHEEL,
} from "../src/golem/config.ts";
import { hobble, legRuin, locomotionCommand } from "../src/golem/locomotion.ts";
import {
  bipedFootSpeed, bipedModule, bipedPose, bipedStandHeight,
} from "../src/golem/locomotion/biped.ts";
import { LOCOMOTION_COURSE } from "../src/golem/locomotion/course.ts";
import {
  MULTILEG_LEGS, multilegModule, multilegPose, multilegStandHeight,
} from "../src/golem/locomotion/multileg.ts";
import { wheelModule, wheelStandHeight } from "../src/golem/locomotion/wheel.ts";
import { golemModule } from "../src/golem/registry.ts";
import { buildGolemStand, golemLayers } from "../src/golem/stand.ts";
import { COLLIDES, LAYER } from "../src/physics.ts";
import { resolvePhysicalSupportedPair } from "../src/supported-locomotion-production.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { SUPPORTED_CARRIER_V1 } from "../src/supported-locomotion-runtime.ts";
import { BUTTON_REACH } from "../src/buttons.ts";
import { SUPPORTED_LOCOMOTION_V1, constructPostureIsSupported } from
  "../src/supported-locomotion-state.ts";
import {
  LOCOMOTION_MODULES, LOCOMOTION_SEQUENCE, WALK_SEQUENCE, runGolemLocomotion, walkSequenceFor,
} from "./harness/golem-bench.mjs";
import { SKELETON_BIPED } from "../src/golem/skeleton/body.ts";
import { ATTRIBUTES, resolveAttributes } from "../src/golem/attributes.ts";
import { baseReachM } from "../src/tipping.ts";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";

/**
 * The locomotion bench's assertions, and the physical obstacle corpus the demolition owed.
 *
 * **Every threshold here is provisional and none of them is a verdict**, in exactly the sense
 * Sessions 02 and 03 marked theirs: the human gate for this session has not been asked, and this
 * plan set exists because three body experiments each cleared a scalar proxy while the owner's
 * judgement stayed red. What is pinned is what the code *did* when it was measured, with a margin,
 * so that a change which moves it says so.
 *
 * **Two harnesses and they are never in one column.** Everything here is the Node bench
 * (`NullEngine`, real Havok, no rendering). The page bench's readings are the page bench's.
 *
 * **Why half of this file builds real bodies rather than fake roots.** `AGENTS.md`'s rule is that
 * a support query unit test is not a physical obstacle corpus: a fake root that records bounded
 * forces can prove a clamp or a slope predicate, but it cannot prove Havok penetration, joint-frame
 * error, or what a real leg does when it meets a real post. Session 01 deleted the real-Havok
 * obstacle, ledge, slope and occupied-recovery corpora because their fixtures were construct
 * humanoids, and `docs/measurements.md` has carried that as owed ever since. The cells below are
 * that corpus rebuilt against the biped, and where a cell could not be rebuilt it says so rather
 * than being relabelled.
 */

const FRAME = 1 / 60;
const SUBSTEP = 1 / CONFIG.world.physicsHz;
const B = LOCOMOTION_BIPED;

// --------------------------------------------------------------------------- pure geometry

/**
 * The hobble's arithmetic, asked of the rule rather than of a walk: the walk is asked in
 * `tests/golem-arena.test.mjs`, on a biped, and cannot tell a leg's share of four from one of two.
 */
test("a_ruined_leg_takes_its_equal_share_of_the_command_and_never_the_recovery", () => {
  const floor = GOLEM_RUIN.strippedMobility;
  const quad = legRuin([["a1", "a2"], ["b1"], ["c1"], ["d1"]]);
  assert.equal(quad.mobility(), 1);
  quad.ruin("chassis");
  assert.equal(quad.mobility(), 1, "a piece in no leg -- the carrier -- costs no mobility");
  quad.ruin("a2");
  assert.equal(quad.mobility(), 1 - (1 - floor) / 4);
  quad.ruin("a1");
  assert.equal(quad.mobility(), 1 - (1 - floor) / 4, "a second piece of a ruined leg is not a second leg");
  for (const piece of ["b1", "c1", "d1"]) quad.ruin(piece);
  assert.ok(Math.abs(quad.mobility() - floor) < 1e-12, `every leg ruined left ${quad.mobility()}`);

  // Both directions of every channel, so a hobble that clamped rather than scaled reads red.
  const intent = { forward: -1, strafe: 0.5, turn: -0.8, posture: { crouch: 0.3 } };
  const command = locomotionCommand(intent);
  const slowed = hobble(command, 0.5);
  assert.deepEqual(slowed, { request: { localForward: -0.5, localRight: 0.25, yaw: -0.4 }, crouch: 0.3 });
  assert.equal(hobble(command, 1), command, "a whole carrier's command passes untouched");
});

test("the_biped_is_built_standing_and_every_joint_stop_admits_that_build_pose", () => {
  // Session 03 found a chain built in its own singularity and a joint stop that did not admit its
  // own build pose, and Havok cleared that violation by throwing a blade tip at 9.95 m/s from a
  // motionless stand. The legs here are built with all three angles at zero, so every stop has to
  // contain zero -- strictly, so the build pose is not sitting *on* a limit either.
  const rest = bipedPose(0, 0, 0, 0, 0);
  for (const [name, value] of Object.entries(rest)) {
    // Not exactly zero: the law of cosines at full extension puts its own argument a float ulp
    // past 1, and `acos` of that is 2e-8 rather than 0. A nanoradian is not a build-pose
    // violation, and asserting exact equality here would be asserting IEEE 754 rather than
    // geometry.
    assert.ok(Math.abs(value) < 1e-6, `${name} is ${value} in the build pose, not zero`);
  }

  for (const [name, min, max] of [
    ["hip", B.hipJointMin, B.hipJointMax],
    ["knee", B.kneeJointMin, B.kneeJointMax],
    ["ankle", B.ankleJointMin, B.ankleJointMax],
  ]) {
    assert.ok(min < 0 && max > 0, `the ${name} stop does not strictly admit the build pose`);
  }
  // And the stop stands outside the range the gait can command, on both sides, for every joint.
  assert.ok(B.hipJointMin < B.hipSwingMin && B.hipJointMax > B.hipSwingMax);
  assert.ok(B.kneeJointMin < B.kneeTargetMin && B.kneeJointMax > B.kneeTargetMax);
  assert.ok(B.ankleJointMin < B.ankleTargetMin && B.ankleJointMax > B.ankleTargetMax);
});

test("no_commanded_leg_pose_leaves_its_own_range_or_reaches_the_splits", () => {
  // A leg that can reach the splits looks broken the first time it is hit. The splits are an
  // *abduction* limit, so the number to check is what the hip's Z stop allows the stance to open
  // to -- and, separately, that the gait never commands an angle outside its own range, over the
  // whole product of stride phase, travel and crouch rather than at a few points.
  //
  // **The travel is a vector here and it used to be a scalar**, which is the shape of the
  // 2026-09-05 gait fix and the reason this sweep is a table rather than a list of speeds. The
  // pose takes normalised fractions of the carrier's own ceilings -- `forward`, `right`, `turn`,
  // each -1..1 -- so the sweep has to cross the diagonals and the over-unit commands the mind is
  // free to send, not just a forward speed in metres.
  const MOVES = [
    [0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0],
    [0.7, 0.7, 0], [-0.7, 0.7, 0], [0, 0, 1], [0, 0, -1],
    [1, 0, 1], [0, 1, 1], [0.6, -0.6, -0.8], [2, 0, 0], [0, 2, 2], [-2, -2, -2],
  ];
  for (let phase = 0; phase < Math.PI * 2; phase += Math.PI / 24) {
    for (const [forward, right, turn] of MOVES) {
      for (const crouch of [0, 0.25, 0.5, 1]) {
        const pose = bipedPose(phase, forward, right, turn, crouch);
        for (const hip of [pose.hipLeft, pose.hipRight]) {
          assert.ok(hip >= B.hipSwingMin - 1e-9 && hip <= B.hipSwingMax + 1e-9, `hip ${hip}`);
        }
        for (const knee of [pose.kneeLeft, pose.kneeRight]) {
          assert.ok(knee >= B.kneeTargetMin - 1e-9 && knee <= B.kneeTargetMax + 1e-9, `knee ${knee}`);
        }
        for (const ankle of [pose.ankleLeft, pose.ankleRight]) {
          assert.ok(ankle >= B.ankleTargetMin - 1e-9 && ankle <= B.ankleTargetMax + 1e-9,
            `ankle ${ankle}`);
        }
        // The lateral half of the stride stays inside the abduction stop it shares with the
        // splits bound below -- the axis is written now, so the stop has to be checked and not
        // merely declared.
        for (const abduct of [pose.abductLeft, pose.abductRight]) {
          assert.ok(abduct >= -B.hipAbduct - 1e-9 && abduct <= B.hipAbduct + 1e-9,
            `abduct ${abduct}`);
        }
        assert.ok(pose.hipDrop >= -1e-9 && pose.hipDrop <= B.thighLength + B.shinLength);
      }
    }
  }
  // A pure forward walk asks for no abduction at all, and a pure turn asks for none either: the
  // yaw is a fore-aft differential between the two hips and nothing else. Without this the sweep
  // above would pass on a gait that shuffled sideways while walking in a straight line.
  for (let phase = 0; phase < Math.PI * 2; phase += Math.PI / 12) {
    for (const [forward, right, turn] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
      const pose = bipedPose(phase, forward, right, turn, 0);
      assert.ok(Math.abs(pose.abductLeft) < 1e-12 && Math.abs(pose.abductRight) < 1e-12,
        `a move of (${forward}, ${right}, ${turn}) abducts by ${pose.abductLeft}`);
    }
  }
  // ...and a pure side-step asks for no hip flexion, for the same reason read the other way.
  for (let phase = 0; phase < Math.PI * 2; phase += Math.PI / 12) {
    const pose = bipedPose(phase, 0, 1, 0, 0);
    const rest = bipedPose(0, 0, 0, 0, 0);
    assert.ok(Math.abs(pose.hipLeft - rest.hipLeft) < 1e-12,
      `a pure side-step swings the hip fore-aft by ${pose.hipLeft - rest.hipLeft}`);
    // ...and abducts by exactly the stride amplitude, which is the axis this file did not write
    // at all before 2026-09-05 and the half of the fix that is visible in a single pose.
    assert.ok(Math.abs(Math.abs(pose.abductLeft) - B.strideAbduct * Math.abs(Math.sin(phase)))
      < 1e-12, `a pure side-step abducts by ${pose.abductLeft} at phase ${phase}`);
  }
  // The widest stance the hip's own abduction stop can be knocked into, measured at the sole.
  const legLength = B.thighLength + B.shinLength;
  const stanceWidthM = 2 * (B.hipSide + legLength * Math.sin(B.hipAbduct));
  assert.ok(stanceWidthM < 0.75,
    `the abduction stop opens the stance to ${stanceWidthM.toFixed(3)} m, which is a golem doing the splits`);
  // Mutation control: the assertion is about `hipAbduct` and not about the leg's length.
  const splits = 2 * (B.hipSide + legLength * Math.sin(1.2));
  assert.ok(splits > 1.3, "the control case is not a splits pose, so the bound above proves nothing");
});

test("the_stride_cadence_is_driven_by_how_fast_the_feet_go_and_not_by_the_body", () => {
  // `bipedFootSpeed` is what advances the stride phase, and it is the *feet's* speed rather than
  // the carrier's. The two are the same for a walk and they are not the same for a turn in place,
  // where the body's speed is zero and the feet are still going somewhere -- which is why a golem
  // spinning on the spot used to stand perfectly still and rotate. The claim is arithmetic:
  const max = B.carrier.maxSpeedMps;
  assert.ok(Math.abs(bipedFootSpeed({ forward: 0, right: 0, yaw: 0 })) < 1e-12,
    "a standing golem's feet are moving");
  assert.ok(Math.abs(bipedFootSpeed({ forward: 1, right: 0, yaw: 0 }) - max) < 1e-12);
  assert.ok(Math.abs(bipedFootSpeed({ forward: 0, right: -1, yaw: 0 }) - max) < 1e-12,
    "a full-speed side-step does not read as full-speed travel");
  // A turn in place: each hip sits `hipSide` off the axis, so the soles trace circles at
  // `maxYawSpeedRadS * hipSide` and both feet are equally busy.
  const spun = bipedFootSpeed({ forward: 0, right: 0, yaw: 1 });
  assert.ok(Math.abs(spun - B.carrier.maxYawSpeedRadS * B.hipSide) < 1e-12,
    `a turn in place moves the feet at ${spun.toFixed(4)} m/s`);
  assert.ok(spun > 0.2, "the turn case is too slow to prove the cadence is driven at all");
  // And it saturates rather than running away, because a stride laid over an over-unit command
  // would be a cadence the carrier never travels at.
  assert.ok(bipedFootSpeed({ forward: 4, right: 4, yaw: 4 }) <= max + 1e-12);
});

test("the_crouch_is_solved_so_the_sole_stays_on_the_floor", () => {
  // Solved through the law of cosines for the height the carrier wants, rather than animated as an
  // unrelated pelvis offset. The claim is arithmetic and it is worth checking as arithmetic: at
  // any crouch the supporting leg's vertical extension is exactly the standing extension minus the
  // requested drop, so the sole does not move.
  const extension = (hip, knee) =>
    B.thighLength * Math.cos(hip) + B.shinLength * Math.cos(hip + knee);
  for (const crouch of [0, 0.2, 0.5, 0.8, 1]) {
    const pose = bipedPose(0, 0, 0, 0, crouch);
    const wanted = B.thighLength + B.shinLength - crouch * B.crouchDepth;
    assert.ok(Math.abs(extension(pose.hipLeft, pose.kneeLeft) - wanted) < 1e-9,
      `crouch ${crouch} does not solve to its own height`);
    // And the sole stays level while it does it: hip + knee + ankle is the foot's pitch.
    assert.ok(Math.abs(pose.hipLeft + pose.kneeLeft + pose.ankleLeft) < 1e-9,
      `crouch ${crouch} tilts the sole`);
  }
  assert.ok(Math.abs(bipedModule.heightRange.standM - bipedStandHeight()) < 1e-12);
  assert.ok(Math.abs(bipedModule.heightRange.crouchM -
    (bipedStandHeight() - B.crouchDepth)) < 1e-12);
});

test("the_biped_is_registered_and_declares_exactly_the_locomotion_slot", () => {
  const option = golemModule("locomotion.biped");
  assert.ok(option, "the biped is not in GOLEM_MODULES");
  assert.equal(option.mode, "locomotion");
  assert.deepEqual([...option.slots], ["locomotion"]);
  assert.ok(Math.abs(option.massKg - (B.pelvisMass +
    2 * (B.thighMass + B.shinMass + B.footMass))) < 1e-9);
  assert.deepEqual(bipedModule.supportBindings.map(({ role }) => role), ["left-foot", "right-foot"]);
});

// --------------------------------------------------------- the built body, in a real solver

/** One built biped on a locomotion stand, with whatever fixture the cell asked for. */
async function fixture({ prepare = null, attributes = null } = {}) {
  const arena = await createHeadlessArena();
  const scene = arena.scene;
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  const world = flatSupportedWorldRegistry();
  const stand = buildGolemStand(scene, {
    side: "left", ground: Vector3.Zero(), facing: Quaternion.Identity(), slot: "locomotion",
  });
  const prepared = prepare ? prepare({ scene, world, stand }) : null;
  const module = bipedModule.build({
    scene, side: "left", name: "golem.test.locomotion", socket: stand.socket("locomotion"),
    layers: golemLayers("left"), materials: stand.materials, world,
    ...(attributes ? { attributes: resolveAttributes({ attributes }) } : {}),
  });
  plugin.setActivationControl(stand.block.body, 1);
  for (const part of module.parts) plugin.setActivationControl(part.part.body, 1);
  const control = scene.onBeforePhysicsObservable.add(() => module.step(SUBSTEP));
  return {
    arena, scene, stand, module, world, prepared,
    dispose: () => {
      scene.onBeforePhysicsObservable.remove(control);
      module.dispose();
      stand.dispose();
      arena.dispose();
    },
  };
}

const step = (scene, seconds) => {
  for (let frame = 0; frame * FRAME < seconds; frame += 1) {
    scene._renderId += 1;
    scene._advancePhysicsEngineStep(1000 * FRAME);
  }
};

const drive = (module, { forward = 0, strafe = 0, turn = 0, crouch = 0 } = {}) => {
  module.command(locomotionCommand({
    forward, strafe, turn, actingHand: "primary",
    natural: { thrust: false, guard: false },
    posture: { trunkLean: 0, trunkTwist: 0, crouch },
    primary: {
      pointerX: 0, pointerY: 0, reach: BUTTON_REACH.neutral,
      roll: 0, wristBend: 0, thrust: false, guard: false,
    },
    secondary: {
      pointerX: 0, pointerY: 0, reach: BUTTON_REACH.neutral,
      roll: 0, wristBend: 0, thrust: false, guard: false,
    },
  }));
};

const partNamed = (module, suffix) =>
  module.parts.find(({ id }) => id.endsWith(suffix)).part;

test("the_built_sole_lands_on_the_floor_the_stand_socket_implies", async () => {
  // The stand decides where a locomotion socket is and the module builds downward from it. The two
  // numbers live in different config blocks on purpose -- the stand's fixture height and the
  // biped's own segment lengths -- so this is what stops them agreeing only by coincidence.
  const f = await fixture();
  try {
    for (const suffix of ["footL", "footR"]) {
      const foot = partNamed(f.module, suffix);
      const sole = foot.mesh.position.y - B.footHeight / 2;
      assert.ok(Math.abs(sole) < 1e-6, `${suffix} sole is ${sole} m off the floor at build`);
    }
    assert.ok(Math.abs(BENCH_STAND_LOCOMOTION.socketHeight - bipedStandHeight()) < 1e-9,
      "the stand's locomotion socket height and the biped's stand height disagree");
    // The root is ANIMATED before anything moves, which is the whole design: the admitted physical
    // root follows the bodyless carrier and is released only by an authored knockdown.
    assert.equal(f.module.root.body.getMotionType(), PhysicsMotionType.ANIMATED);
    assert.equal(f.module.adapter.sample().motionType, "animated");
  } finally { f.dispose(); }
});

test("the_build_pose_is_not_a_violation_the_solver_has_to_clear", async () => {
  // The same shape of check `tests/golem-bench.test.mjs` makes for the effector chains, for the
  // same recorded reason. A joint built outside its own stop is cleared by Havok flinging the
  // limb, and the tell is a large part speed in the first tenth of a second on a body that has
  // been asked to do nothing at all.
  const f = await fixture();
  try {
    drive(f.module, {});
    step(f.scene, 0.25);
    let peak = 0;
    for (const { part } of f.module.parts) {
      peak = Math.max(peak, part.body.getLinearVelocity().length());
    }
    assert.ok(peak < 0.5, `a motionless golem's fastest part reached ${peak.toFixed(3)} m/s`);
    const evidence = f.module.postureEvidence();
    assert.ok(constructPostureIsSupported(evidence), JSON.stringify(evidence));
  } finally { f.dispose(); }
});

test("legs_never_collide_with_each_other_or_the_torso_and_feet_do_collide_with_the_world",
  async () => {
    // Two halves, and the second is the one that matters. `selfCollisionCount === 0` proves
    // nothing about pairs the filters never admitted -- so the zero below is checked *beside* a
    // positive world-contact count, which is what says the feet are on a layer that solves against
    // the floor at all rather than one that solves against nothing.
    const f = await fixture();
    try {
      drive(f.module, { forward: 1 });
      step(f.scene, 3);
      const state = f.module.readout();
      assert.equal(state.selfContacts, 0, "a golem's own parts collided with each other");
      assert.ok(state.contacts > 100,
        `only ${state.contacts} world contacts: the feet are not solving against the floor`);
      const layers = golemLayers("left");
      for (const { part } of f.module.parts) {
        assert.equal(part.shape.filterMembershipMask, layers.body);
        assert.equal(part.shape.filterCollideMask, layers.bodyCollidesWith);
        assert.ok((layers.bodyCollidesWith & LAYER.WORLD) !== 0, "a foot cannot touch the world");
        assert.equal(layers.bodyCollidesWith & layers.body, 0, "a leg can touch another leg");
      }
    } finally { f.dispose(); }
  });

// ------------------------------------------------------------------ the scripted bench run

test("the_scripted_locomotion_run_walks_crouches_falls_and_rises", async () => {
  const run = await runGolemLocomotion({ moduleId: "biped", sequence: LOCOMOTION_SEQUENCE });
  const state = run.state;

  // 1. Supported for the whole pre-shove interval, and the *first posture loss* is what says so.
  //    A contact count is sensor evidence, not a posture verdict: the first Swordbearer test
  //    accepted two live foot contacts while the body lay on its back.
  assert.ok(run.shovedAt !== null, "the scripted sequence never applied its shove");
  assert.ok(state.firstPostureLossSeconds === null || state.firstPostureLossSeconds > run.shovedAt,
    `posture was lost at ${state.firstPostureLossSeconds} s, before the shove at ${run.shovedAt} s`);
  assert.ok(state.firstFallenSeconds >= run.shovedAt - SUBSTEP,
    `the state machine fell at ${state.firstFallenSeconds} s, before the shove at ${run.shovedAt} s`);
  assert.ok(state.longestSupportGapSeconds < SUPPORTED_LOCOMOTION_V1.SUPPORT_GRACE_S,
    `support was missing for ${state.longestSupportGapSeconds} s, past the frozen grace`);

  // 2. Carrier tracking within the carrier's own limits.
  assert.ok(state.peakCarrierSpeedMps <= B.carrier.maxSpeedMps + 1e-9,
    `the carrier reached ${state.peakCarrierSpeedMps} m/s, past its own ceiling`);
  assert.ok(state.meanCarrierLagMps < 0.05,
    `the root lagged the carrier by a mean ${state.meanCarrierLagMps} m/s`);

  // 3. The crouch really moves the carrier's height between the ends of its declared range.
  //
  // **Read at the `settle` mark and not over the whole run**, because the whole run now has a
  // knockdown in it and a ragdoll leaves the floor. Before the shove the socket sits at 1.0200 m
  // to four figures, which is the declared height exactly; after it the run's maximum is 1.0467,
  // and that number is a body being thrown rather than a body standing. The old reading was the
  // maximum over everything and was right only because a 560 kg golem did not bounce. 2026-09-18.
  const settled = run.marks.find((mark) => mark.phase === "settle");
  assert.ok(settled, "the scripted sequence has no settle phase to read a standing height at");
  assert.ok(Math.abs(settled.state.maxHeightM - bipedModule.heightRange.standM) < 0.02,
    `standing height ${settled.state.maxHeightM} m against a declared `
    + `${bipedModule.heightRange.standM}`);

  // 4. The knockdown: the root goes DYNAMIC, the body tips, and the rise completes inside the
  //    budget written in the module file.
  //
  //    **It goes over and lies until it has come down.** Since physical contact session 08 stone
  //    runs the one knockdown (`KNOCKDOWN`): it lies until its centre of mass has come half way to
  //    the floor and stopped coming down, where it once rose the moment a 0.35 s dwell was up at an
  //    up-dot of 0.746. It now reaches -0.183 (Node bench), past lying on its side.
  assert.ok(state.minUpDot < 0.3, `the shove only tilted the root to an up-dot of ${state.minUpDot}`);
  assert.ok(state.recoveredSeconds !== null, "the golem never came back to supported");
  assert.ok(state.riseSeconds > 0 && state.riseSeconds <= B.riseBudgetSeconds,
    `the rise took ${state.riseSeconds} s against a budget of ${B.riseBudgetSeconds}`);
  assert.ok(state.riseSeconds >= SUPPORTED_LOCOMOTION_V1.FALLEN_DWELL_S +
    SUPPORTED_LOCOMOTION_V1.RISING_DURATION_S - 1e-9,
  "the rise was quicker than the frozen dwell plus the frozen rising duration, which is impossible");

  // 5. Nothing touched itself, at any point, including through the ragdoll.
  assert.equal(state.selfContacts, 0);
});

test("the_shove_releases_the_root_to_DYNAMIC_and_the_rise_restores_it", async () => {
  const f = await fixture();
  try {
    drive(f.module, {});
    step(f.scene, 1);
    assert.equal(f.module.root.body.getMotionType(), PhysicsMotionType.ANIMATED);
    assert.equal(f.module.port.state, "supported");

    f.module.shove();
    step(f.scene, 0.2);
    assert.equal(f.module.port.state, "fallen");
    assert.equal(f.module.root.body.getMotionType(), PhysicsMotionType.DYNAMIC,
      "a fallen golem's root was not released to the ragdoll");
    assert.equal(f.module.adapter.sample().motionType, "dynamic");

    // Recovery cannot require the support state it exists to restore: the first construct
    // controller demanded three planted contacts in its constructor, so a fallen Mind selected
    // recover for ever and the scheduler refused it for ever. Here nothing is required of the
    // command at all: the body rises once it has settled (`KnockdownSettle`), which the table's
    // 2.5 s cap bounds, and the rise after it is under a second.
    drive(f.module, { forward: 1 });
    step(f.scene, 3.6);
    assert.equal(f.module.port.state, "supported", f.module.port.diagnostic().releaseReason ?? "");
    assert.equal(f.module.root.body.getMotionType(), PhysicsMotionType.ANIMATED);
    assert.ok(constructPostureIsSupported(f.module.postureEvidence()));
  } finally { f.dispose(); }
});

test("a_shove_under_the_body_s_own_fall_line_does_not_knock_the_golem_down_and_one_over_it_does", async () => {
  // The control for the cell above, and the reason it is here rather than in a comment: an
  // assertion that a large shove knocks a body over is satisfied by a body that falls over
  // whatever you do to it. The line is the body's own geometry along the push (physical contact
  // session 08), at the mass the bench holds up; the two halves are a pair on fresh fixtures.
  for (const [at, falls] of [[0.9, false], [1.1, true]]) {
    const f = await fixture();
    try {
      drive(f.module, {});
      step(f.scene, 1);
      const { stability } = f.module.port.diagnostic();
      // To Havok's single-precision mass: the port reads 280.04999 kg where the tables sum to 280.05.
      const massKg = B.pelvisMass + 2 * (B.thighMass + B.shinMass + B.footMass) + BENCH_STAND_LOCOMOTION.mass;
      assert.ok(Math.abs(stability.supportedMassKg - massKg) < 1e-4,
        `the port reads a shove against ${stability.supportedMassKg} kg, not ${massKg}`);
      const fallAtNs = f.module.port.stabilityLinesAlong(1, 0).fallAtMps * stability.supportedMassKg;
      f.module.port.queueStabilityEvent({ horizontalShoveNs: [fallAtNs * at, 0] });
      step(f.scene, 0.2);
      assert.equal(f.module.port.state === "fallen", falls, `${at} of the fall line: ${f.module.port.state}`);
      assert.equal(f.module.root.body.getMotionType(),
        falls ? PhysicsMotionType.DYNAMIC : PhysicsMotionType.ANIMATED);
    } finally { f.dispose(); }
  }
});

test("a_planted_sole_holds_its_ground_within_the_budget_written_in_the_module_file", async () => {
  // Read over the walk alone. A gait number taken through the whole scripted sequence has a
  // knockdown in it, and one taken through the course has a leg on a step in it.
  const run = await runGolemLocomotion({ moduleId: "biped", sequence: WALK_SEQUENCE });
  const state = run.state;
  // **This was `plantedSteps === steps` until 2026-09-18, and the equality was a walking claim.**
  // A 1.9 m body at 1.2 m/s is walking and a walk has double support in it by definition; at the
  // 3.2 m/s the carrier now commands it is jogging, and the thing that makes a jog a jog is that
  // both feet leave the ground. Holding the equality would have been a test that the golem is
  // slow. What is *not* negotiable is the line below it: `longestSupportGapSeconds` is what the
  // state machine reads to decide whether it still knows where the floor is, and that stays at
  // zero, because the flight lasts a substep or two and never the frozen grace. 8 of 1919 is the
  // measured figure at the gait `config.ts` was re-solved to; 1 % is that with room, and the
  // regression it still catches is the one that was actually here -- 398 of 1919, a fifth of the
  // walk spent in the air, which is what the old gait did at the new speed.
  const flight = state.steps - state.plantedSteps;
  assert.ok(flight <= state.steps / 100,
    `${flight} substeps of the walk had no sole in contact at all, measured at 8 on 2026-09-18`);
  assert.ok(state.meanFootSlipMps <= B.meanFootSlipBudgetMps,
    `mean planted slip ${(state.meanFootSlipMps * 1000).toFixed(1)} mm/s against a budget of `
    + `${(B.meanFootSlipBudgetMps * 1000).toFixed(0)}`);
  // The swing foot really does leave the ground: a stride whose sole never lifts is a scuff.
  assert.ok(state.peakSoleLiftM > 0.10,
    `the swing sole only cleared ${(state.peakSoleLiftM * 1000).toFixed(1)} mm`);
  // ...and stays inside the support query's own step envelope, so its evidence does not go stale
  // for longer than the frozen grace.
  assert.equal(state.longestSupportGapSeconds, 0);
  assert.equal(state.firstPostureLossSeconds, null);
  assert.equal(state.minUpDot, 1);
});

/** The same six seconds, sent sideways and then spun on the spot. See the test below. */
const STRAFE_SEQUENCE = Object.freeze([
  { name: "stand", until: 1.00, forward: 0, strafe: 0, turn: 0, crouch: 0 },
  { name: "strafe", until: 7.00, forward: 0, strafe: 1, turn: 0, crouch: 0 },
  { name: "stop", until: 8.00, forward: 0, strafe: 0, turn: 0, crouch: 0 },
]);

const TURN_SEQUENCE = Object.freeze([
  { name: "stand", until: 1.00, forward: 0, strafe: 0, turn: 0, crouch: 0 },
  { name: "turn", until: 7.00, forward: 0, strafe: 0, turn: 1, crouch: 0 },
  { name: "stop", until: 8.00, forward: 0, strafe: 0, turn: 0, crouch: 0 },
]);

/**
 * A straight walk short enough for a body at x1.5 to finish inside the stand's floor: the stock
 * walk takes a 3.2 m/s biped 12.66 m, to the wall, and at 4.8 m/s it would read the wall.
 */
const SHORT_WALK = Object.freeze([
  { name: "stand", until: 1.00, forward: 0, strafe: 0, turn: 0, crouch: 0 },
  { name: "walk", until: 2.75, forward: 1, strafe: 0, turn: 0, crouch: 0 },
  { name: "stop", until: 3.75, forward: 0, strafe: 0, turn: 0, crouch: 0 },
]);

test("the_movement_stat_carries_every_body_at_its_multiple_and_the_legs_keep_up_at_both_ends", async () => {
  // Session 03's two claims, at the ends of the range the row ships (the table is its doc comment
  // in `src/golem/attributes.ts`). Top speed is the stat doing anything at all; the slip is the
  // stat's range being honest. The biped's slow end is the one with a history: scaled by the
  // carrier alone, x0.75 read 1010 mm/s -- the stepping fell under the legs' own frequency and the
  // sole was dragged -- and `bipedAtMovement` is what holds it at 199.
  const row = ATTRIBUTES.movement;
  const budgets = { biped: B.meanFootSlipBudgetMps, skeleton: B.meanFootSlipBudgetMps,
    multileg: LOCOMOTION_MULTILEG.meanFootSlipBudgetMps };
  for (const moduleId of ["biped", "skeleton", "multileg", "wheel"]) {
    const top = LOCOMOTION_MODULES[moduleId].carrier.maxSpeedMps;
    for (const level of [row.min, row.max]) {
      let reached = 0;
      let unsupported = 0;
      const run = await runGolemLocomotion({ moduleId, sequence: SHORT_WALK, attributes: { movement: level },
        watch: ({ module, phase }) => {
          if (phase !== "walk") return;
          const evidence = module.evidence();
          reached = Math.max(reached, evidence.rootSpeedMps);
          if (evidence.state !== "supported") unsupported++;
        } });
      const where = `${moduleId} at x${level}`;
      assert.ok(Math.abs(reached - top * level) < 0.01 * top,
        `${where} reached ${reached.toFixed(3)} m/s, not ${(top * level).toFixed(3)}`);
      assert.equal(unsupported, 0, `${where} left the supported state walking`);
      if (budgets[moduleId] !== undefined) {
        assert.ok(run.state.meanFootSlipMps <= budgets[moduleId],
          `${where}: mean planted slip ${(run.state.meanFootSlipMps * 1000).toFixed(1)} mm/s against `
          + `${(budgets[moduleId] * 1000).toFixed(0)}`);
      }
    }
  }
});

/** A spin long enough to reach the cap at the slow end and short enough to run eight times. */
const SHORT_SPIN = Object.freeze([
  { name: "stand", until: 1.00, forward: 0, strafe: 0, turn: 0, crouch: 0 },
  { name: "turn", until: 3.00, forward: 0, strafe: 0, turn: 1, crouch: 0 },
  { name: "stop", until: 4.00, forward: 0, strafe: 0, turn: 0, crouch: 0 },
]);

test("the_turning_stat_spins_every_body_at_its_multiple_and_a_sole_keeps_its_share_of_the_pivot", async () => {
  // Session 05's claims at the ends of the range the row ships (the table is its doc comment in
  // `src/golem/attributes.ts`). The carrier's yaw rate is the stat doing anything at all. The slip
  // is held to the pivot budget the test below uses -- a fraction of the travel the pivot asks of
  // each foot, which grows with the stat -- because a sole with no yaw joint twists on the floor in
  // proportion to the spin, and an absolute budget would only be a test that a body turns slowly.
  const row = ATTRIBUTES.turning;
  for (const moduleId of ["biped", "skeleton", "multileg", "wheel"]) {
    const table = LOCOMOTION_MODULES[moduleId];
    for (const level of [row.min, row.max]) {
      let reached = 0;
      let unsupported = 0;
      const run = await runGolemLocomotion({ moduleId, sequence: SHORT_SPIN, attributes: { turning: level },
        watch: ({ module, phase }) => {
          if (phase !== "turn") return;
          reached = Math.max(reached, Math.abs(module.port.carrier.current.yawVelocity));
          if (module.evidence().state !== "supported") unsupported++;
        } });
      const where = `${moduleId} at x${level}`;
      const cap = table.carrier.maxYawSpeedRadS * level;
      assert.ok(Math.abs(reached - cap) < 0.01 * table.carrier.maxYawSpeedRadS,
        `${where} turned at ${reached.toFixed(3)} rad/s, not ${cap.toFixed(3)}`);
      assert.equal(unsupported, 0, `${where} left the supported state turning`);
      const hipSide = { biped: B.hipSide, skeleton: SKELETON_BIPED.hipSide }[moduleId];
      if (hipSide !== undefined) {
        const budget = 0.99 * cap * hipSide;
        assert.ok(run.state.meanFootSlipMps <= budget,
          `${where}: mean planted slip ${(run.state.meanFootSlipMps * 1000).toFixed(1)} mm/s against a `
          + `pivot budget of ${(budget * 1000).toFixed(0)}`);
      }
    }
  }
});

test("the_stability_stat_moves_both_thresholds_on_every_body_and_nothing_staggers_on_its_own_gait_at_the_floor", async () => {
  // Session 06's claims at the ends of the range the row ships (the table is its doc comment in
  // `src/golem/attributes.ts`): both lines are the multiple of x1's on every body, a shove either
  // side of the moved fall line lands on the right side of it -- on the biped and on the wheel, the
  // highest and the lowest line a standing body has -- and a body at the floor still walks without
  // its own gait putting it over. Since session 08 the lines are the body's geometry along the push.
  const row = ATTRIBUTES.stability;
  const blocks = { biped: B, skeleton: SKELETON_BIPED, multileg: LOCOMOTION_MULTILEG, wheel: LOCOMOTION_WHEEL };
  const STAND = [{ name: "stand", until: 0.5, forward: 0, strafe: 0, turn: 0, crouch: 0 }];
  const read = async (moduleId, level) => {
    let stability = null;
    await runGolemLocomotion({ moduleId, sequence: STAND, attributes: level === 1 ? null : { stability: level },
      watch: ({ module }) => {
        stability = { ...module.port.stabilityLinesAlong(1, 0),
          supportedMassKg: module.port.diagnostic().stability.supportedMassKg };
      } });
    return stability;
  };
  const SHOVE = [
    { name: "stand", until: 1.0, forward: 0, strafe: 0, turn: 0, crouch: 0 },
    { name: "shove", until: 1.0 + 1 / 60, forward: 0, strafe: 0, turn: 0, crouch: 0, shove: true },
    { name: "after", until: 2.5, forward: 0, strafe: 0, turn: 0, crouch: 0 },
  ];
  const fell = async (moduleId, level, impulse) => {
    let down = false;
    await runGolemLocomotion({ moduleId, sequence: SHOVE, overrides: [[blocks[moduleId], { shoveImpulseNs: impulse }]],
      attributes: { stability: level },
      watch: ({ module, phase }) => { if (phase !== "stand" && module.evidence().state === "fallen") down = true; } });
    return down;
  };
  for (const moduleId of ["biped", "skeleton", "multileg", "wheel"]) {
    const base = await read(moduleId, 1);
    for (const level of [row.min, row.max]) {
      const where = `${moduleId} at x${level}`;
      const moved = await read(moduleId, level);
      assert.ok(Math.abs(moved.staggerAtMps - base.staggerAtMps * level) < 1e-12, `${where} staggers at ${moved.staggerAtMps}`);
      assert.ok(Math.abs(moved.fallAtMps - base.fallAtMps * level) < 1e-12, `${where} falls at ${moved.fallAtMps}`);
      if (moduleId === "biped" || moduleId === "wheel") {
        // 0.85 rather than 0.95 underneath: the bench's shove is a real impulse as well as a ledger
        // entry, and it carries the body's mass toward the edge it is pushed over, so a body falls
        // a little under the line its standing geometry gives -- at x2, 0.917 of it on the biped and
        // 0.961 on the wheel (`.review/shove-bench.mjs`, Node locomotion bench, 2026-09-24).
        const fallNs = moved.fallAtMps * moved.supportedMassKg;
        assert.equal(await fell(moduleId, level, fallNs * 0.85), false, `${where} fell under its own threshold`);
        assert.equal(await fell(moduleId, level, fallNs * 1.05), true, `${where} stood over its own threshold`);
      }
    }
    let off = 0;
    await runGolemLocomotion({ moduleId, sequence: walkSequenceFor(moduleId), attributes: { stability: row.min },
      watch: ({ module }) => { if (module.evidence().state !== "supported") off++; } });
    assert.equal(off, 0, `${moduleId} at x${row.min} left the supported state on its own walk`);
  }
});

test("a_foot_in_the_air_is_still_part_of_the_base_a_walking_body_stands_on", async () => {
  // **A body's base is its stance, lifted feet included** (physical contact session 08): a foot in
  // the air is on its way down, so a walking body is not a one-legged body half the time. Read off
  // each body's own walk (Node locomotion bench): the biped's weakest fall line is zero -- its centre
  // of mass past its whole stance, the carrier ahead of the legs -- in 3 of 360 walking samples and
  // the skeleton's in 19, and with only planted soles in the base those were 139 and 151. The
  // control is that a sole really is off the floor in about half the samples.
  for (const moduleId of ["biped", "skeleton"]) {
    let samples = 0, zero = 0, lifted = 0;
    await runGolemLocomotion({ moduleId, sequence: walkSequenceFor(moduleId), watch: ({ module, phase }) => {
      const evidence = module.evidence();
      if (phase !== "walk" || evidence.state !== "supported") return;
      samples++;
      if (module.port.diagnostic().stability.fallAtMps === 0) zero++;
      if (evidence.plantedFeet < 2) lifted++;
    } });
    assert.ok(samples > 300, `${moduleId} walked ${samples} samples`);
    assert.ok(lifted > samples / 4, `${moduleId} lifted a sole in ${lifted} of ${samples}`);
    assert.ok(zero < samples / 10, `${moduleId} read a zero fall line in ${zero} of ${samples} walking samples`);
  }
});

test("a_sole_holds_its_ground_sideways_and_in_a_spin_too_and_not_only_in_a_walk", async () => {
  // **The walk above was the only command this bench ever read a slip number over**, and the
  // owner's first playtest is what found that: "strafing and rotating doesn't look right, the
  // golem feel look like they're just floating for these motions". They were. Measured here
  // afterwards, the same instrument read **1135.9 mm/s** of mean planted-sole slip through a
  // full-speed side-step -- 95 % of the 1200 the carrier was travelling at, so the feet were
  // holding essentially nothing and the body was being dragged past them. The walk read 114.7
  // over the identical six seconds, which is why nothing was red.
  //
  // Two things were wrong and both are in `bipedPose`. The knee lift scaled on the *fore-aft*
  // part of the travel, so a strafing golem never picked a foot up at all; and the hip's
  // abduction axis was never written, so a stride had no sideways component to lay over a
  // sideways command. Fixing the lift is worth 434 mm/s and adding the axis another 166.
  //
  // The budgets below are separate from `meanFootSlipBudgetMps` and looser than it, and that is
  // honest rather than convenient: a side-step is a shuffle within a narrow abduction stop, so
  // its stride is shorter than its travel and some drag is designed in. What they catch is a
  // return to a gait that has come loose from the direction it is going.
  //
  // **They are fractions of the travel the command asks for, and were absolute metres until
  // 2026-09-18.** A slip budget is only ever a claim about a ratio -- the failure it was written
  // for was a sole holding 5 % of a 1.2 m/s side-step -- and the two absolute numbers said so only
  // as long as the carrier stayed at 1.2. When it went to 3.2 they became a test that a golem is
  // slow. 0.583 and 0.99 are the 2026-09-05 measurements' own fractions of their own travel,
  // carried across unchanged; against them the same runs now read 1163.9 mm/s of 1400 sideways
  // and 369.8 of 564 in a pivot, which are the same 0.83 and 0.66 of budget as before.
  const strafeTravelMps = B.carrier.strafeSpeedMps;
  const pivotTravelMps = B.carrier.maxYawSpeedRadS * B.hipSide;
  for (const [name, sequence, budget, measured] of [
    ["strafe", STRAFE_SEQUENCE, 0.583 * strafeTravelMps, 536.3],
    ["turn", TURN_SEQUENCE, 0.99 * pivotTravelMps, 183.8],
  ]) {
    const run = await runGolemLocomotion({ moduleId: "biped", sequence });
    const state = run.state;
    assert.equal(state.plantedSteps, state.steps,
      `${state.steps - state.plantedSteps} substeps of the ${name} had no sole in contact`);
    assert.ok(state.meanFootSlipMps <= budget,
      `${name}: mean planted slip ${(state.meanFootSlipMps * 1000).toFixed(1)} mm/s against a `
      + `budget of ${(budget * 1000).toFixed(0)}, measured at ${measured} on 2026-09-05`);
    assert.equal(state.longestSupportGapSeconds, 0);
    assert.equal(state.firstPostureLossSeconds, null);
    assert.equal(state.minUpDot, 1);
  }
});

// ------------------------------------------------- the physical obstacle corpus, real Havok

/** A static world box, built as a real body *and* handed back so a cell can measure against it. */
const worldBox = (scene, name, { x, y, z, width, height, depth }, friction = 0.9) => {
  const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
  mesh.position.set(x, y, z);
  const body = new PhysicsAggregate(mesh, PhysicsShapeType.BOX,
    { mass: 0, friction, restitution: 0.02 }, scene);
  body.shape.filterMembershipMask = LAYER.WORLD;
  body.shape.filterCollideMask = COLLIDES.WORLD;
  return { mesh, body };
};

const boxSweep = (from, to, box, radius) => {
  const halfX = box.width / 2 + radius;
  const halfZ = box.depth / 2 + radius;
  const inside = (x, z) => Math.abs(x - box.x) <= halfX && Math.abs(z - box.z) <= halfZ;
  if (inside(from.x, from.z)) return 0;
  if (!inside(to.x, to.z)) return null;
  let low = 0; let high = 1;
  for (let index = 0; index < 24; index += 1) {
    const mid = (low + high) / 2;
    if (inside(from.x + (to.x - from.x) * mid, from.z + (to.z - from.z) * mid)) high = mid;
    else low = mid;
  }
  return high;
};

test("physical_corpus_a_wall_stops_the_carrier_at_its_own_footprint_and_the_legs_do_not_jam",
  async () => {
    // The cell the deleted obstacle corpus opened with, rebuilt with a real body under it: the
    // carrier's declared footprint is what stops it, the golem stays supported while it pushes,
    // and the real Havok geometry never penetrates the wall by more than the solver's own slop.
    //
    // **And at the movement stat's ceiling too**, which is the dungeon's hazard: a hero walls stop
    // is a hero whose carrier sweeps into them, and a faster carrier covers more of the sweep per
    // substep and brings the legs in with more momentum behind them.
    for (const movement of [1, ATTRIBUTES.movement.max]) {
      const CURB = { x: 0, y: 0.4 / 2, z: 3.0, width: 4.0, height: 0.4, depth: 0.5 };
      const f = await fixture({
        attributes: movement === 1 ? null : { movement },
        prepare: ({ scene, world }) => {
          const built = worldBox(scene, "corpus.curb", CURB);
          world.register({
            id: "corpus.curb", category: "wall", ownerPartId: null, upwardNormal: [0, 1, 0],
            support: () => null,
            sweep: (from, to, footprint) => {
              const fraction = boxSweep(from, to, CURB, footprint.radiusM);
              return fraction === null ? null : Object.freeze({ colliderId: "corpus.curb", fraction,
                point: Object.freeze({ x: from.x + (to.x - from.x) * fraction, y: from.y,
                  z: from.z + (to.z - from.z) * fraction }),
                upwardNormal: Object.freeze([0, 1, 0]) });
            },
          });
          return built;
        },
      });
      try {
        assert.equal(f.module.envelope().axes.find((axis) => axis.id === "speed").max,
          B.carrier.maxSpeedMps * movement, "the body really is the fast one");
        drive(f.module, { forward: 1 });
        step(f.scene, 6);
        const ground = f.module.port.carrierGround();
        const limit = CURB.z - CURB.depth / 2 - bipedModule.footprint.radiusM;
        assert.ok(Math.abs(ground.z - limit) < 1e-6,
          `the carrier stopped at z=${ground.z.toFixed(4)} against a declared limit of ${limit.toFixed(4)}`);
        // The command is still pressed and the carrier still wants to move, which is what makes this
        // a clamp rather than a body that happened to stop.
        const diagnostic = f.module.port.diagnostic();
        assert.equal(diagnostic.requested.localForward, 1);
        assert.equal(diagnostic.blockedReason,
          "carrier motion is constrained by world or opponent footprint");
        // Real Havok, real legs: nothing is inside the wall, and the body is still standing.
        const front = CURB.z - CURB.depth / 2;
        for (const { part } of f.module.parts) {
          const penetration = part.mesh.position.z - front;
          assert.ok(penetration < 0.02,
            `${part.name} is ${penetration.toFixed(4)} m inside the wall`);
        }
        assert.equal(f.module.port.state, "supported");
        assert.ok(constructPostureIsSupported(f.module.postureEvidence()));
        assert.equal(f.module.readout().selfContacts, 0);
      } finally { f.dispose(); }
    }
  });

test("physical_corpus_a_low_step_keeps_its_support_and_a_ring_post_turns_the_carrier",
  async () => {
    // Two cells that share one run. The step is inside the footprint's own step envelope, so the
    // support query keeps answering while the legs meet it; the post is a disc the carrier has to
    // go round. Both exist as real bodies and as query colliders, which is the pairing the course
    // file exists to keep honest.
    const run = await runGolemLocomotion({
      moduleId: "biped", course: true,
      sequence: Object.freeze([
        { name: "stand", until: 1.00, forward: 0, strafe: 0, turn: 0, crouch: 0 },
        { name: "onto-the-step", until: 4.00, forward: 1, strafe: 0, turn: 0, crouch: 0 },
        { name: "into-the-post", until: 8.00, forward: 1, strafe: 0, turn: 0, crouch: 0 },
      ]),
      watch: null,
    });
    const state = run.state;
    assert.equal(state.selfContacts, 0);
    // The support evidence survives the step: no gap anywhere near the frozen grace, and the
    // posture predicate never goes false.
    assert.ok(state.longestSupportGapSeconds < SUPPORTED_LOCOMOTION_V1.SUPPORT_GRACE_S,
      `support was missing for ${state.longestSupportGapSeconds} s while crossing the step`);
    assert.equal(state.firstPostureLossSeconds, null,
      "the golem lost its posture on the course");
    assert.equal(state.firstFallenSeconds, null, "the golem fell on the course");
    // And the post stopped it: the carrier travelled past the step and not through the post row.
    const stopped = run.evidence;
    assert.ok(stopped.carrierSpeedMps < B.carrier.maxSpeedMps,
      "the carrier was still at full speed with a post in front of it");
  });

test("physical_corpus_a_ledge_removes_support_and_the_fall_waits_for_the_frozen_grace",
  async () => {
    // A ledge is the absence of standable world rather than an obstacle, so the physical half is a
    // floor that stops and the query half is a support collider that stops with it. What is being
    // pinned is that the frozen 0.35 s grace is what decides when the body goes, and not the first
    // substep at which a foot has nothing under it.
    const LEDGE_Z = 2.2;
    const f = await fixture({
      prepare: ({ world }) => {
        // The flat registry's own floor is unregistered and replaced by one that stops at the
        // ledge. The real Havok floor is left alone: a golem walking off a query ledge onto real
        // ground is exactly the disagreement this cell is about.
        world.unregister("arena-floor");
        world.register({
          id: "corpus.ledge-floor", category: "standable-world", ownerPartId: null,
          upwardNormal: [0, 1, 0], sweep: () => null,
          support: (at) => at.z > LEDGE_Z ? null : Object.freeze({
            colliderId: "corpus.ledge-floor", fraction: 1,
            point: Object.freeze({ x: at.x, y: 0, z: at.z }),
            upwardNormal: Object.freeze([0, 1, 0]) }),
        });
        return null;
      },
    });
    try {
      drive(f.module, { forward: 1 });
      // **The gap the grace measures is the last *continuous* one, not the first zero.** Two feet
      // straddle a ledge for most of a stride, so the binding count flickers 2, 1, 0, 1, 0 as the
      // trailing sole comes and goes -- measured, the first zero is 0.567 s before the fall, and
      // reading that as the grace would be reading three strides as one.
      let gapStartedAt = null;
      let lostAt = null;
      let fellAt = null;
      for (let frame = 0; frame * FRAME < 6; frame += 1) {
        step(f.scene, FRAME);
        const now = (frame + 1) * FRAME;
        if (f.module.evidence().freshBindings === 0) {
          if (gapStartedAt === null) gapStartedAt = now;
        } else {
          gapStartedAt = null;
        }
        if (fellAt === null && f.module.port.state === "fallen") {
          fellAt = now;
          lostAt = gapStartedAt;
        }
      }
      assert.ok(lostAt !== null, "the golem never walked off the declared ledge");
      assert.ok(fellAt !== null, "the golem never fell after losing every support binding");
      const grace = fellAt - lostAt;
      assert.ok(grace >= SUPPORTED_LOCOMOTION_V1.SUPPORT_GRACE_S - 3 * FRAME,
        `it fell ${grace.toFixed(3)} s after losing support, inside the frozen grace`);
      assert.ok(grace <= SUPPORTED_LOCOMOTION_V1.SUPPORT_GRACE_S + 3 * FRAME,
        `it took ${grace.toFixed(3)} s to fall, well past the frozen grace`);
    } finally { f.dispose(); }
  });

test("physical_corpus_a_slope_past_the_frozen_limit_is_not_support_and_the_carrier_refuses_it",
  async () => {
    // The slope cell, with a real ramp under it. 35 degrees is the frozen standable limit and 50
    // is the refusal; a ramp at 45 is therefore neither standable nor drivable, and the golem has
    // to stop at the foot of it while still standing on the flat.
    const RAMP_DEG = 45;
    const RAMP_Z = 3.2;
    const normal = Object.freeze([0, Math.cos(RAMP_DEG * Math.PI / 180),
      -Math.sin(RAMP_DEG * Math.PI / 180)]);
    const f = await fixture({
      prepare: ({ scene, world }) => {
        const mesh = MeshBuilder.CreateBox("corpus.ramp", { width: 6, height: 0.4, depth: 4 }, scene);
        mesh.position.set(0, 1.0, RAMP_Z + 2);
        mesh.rotationQuaternion = Quaternion.RotationAxis(new Vector3(1, 0, 0),
          -RAMP_DEG * Math.PI / 180);
        const body = new PhysicsAggregate(mesh, PhysicsShapeType.BOX,
          { mass: 0, friction: 0.9, restitution: 0.02 }, scene);
        body.shape.filterMembershipMask = LAYER.WORLD;
        body.shape.filterCollideMask = COLLIDES.WORLD;
        world.register({
          id: "corpus.ramp", category: "standable-world", ownerPartId: null, upwardNormal: normal,
          // A sweep as well as a support: a surface too steep to stand on is also a surface the
          // carrier may not walk onto, and the two halves are separate questions in the runtime.
          sweep: (from, to) => to.z <= RAMP_Z || to.z === from.z ? null : Object.freeze({
            colliderId: "corpus.ramp",
            fraction: Math.max(0, Math.min(1, (RAMP_Z - from.z) / (to.z - from.z))),
            point: Object.freeze({ x: from.x, y: from.y, z: RAMP_Z }), upwardNormal: normal }),
          support: (at) => at.z <= RAMP_Z ? null : Object.freeze({ colliderId: "corpus.ramp",
            fraction: 1, point: Object.freeze({ x: at.x, y: at.y, z: at.z }), upwardNormal: normal }),
        });
        return { mesh, body };
      },
    });
    try {
      assert.ok(RAMP_DEG > SUPPORTED_CARRIER_V1.MAX_STANDABLE_SLOPE_DEG,
        "the fixture ramp is inside the frozen standable limit and so proves nothing");
      drive(f.module, { forward: 1 });
      step(f.scene, 6);
      const ground = f.module.port.carrierGround();
      assert.ok(ground.z <= RAMP_Z + 1e-6,
        `the carrier walked ${(ground.z - RAMP_Z).toFixed(4)} m onto a ${RAMP_DEG} degree slope`);
      assert.equal(f.module.port.state, "supported");
      // The support it still has is the flat floor and not the ramp, which is the half a sweep
      // cannot say: a slope steeper than the footprint's own limit is not a foot.
      assert.deepEqual([...f.module.port.diagnostic().freshSupportBindings],
        ["left-foot", "right-foot"]);
    } finally { f.dispose(); }
  });

test("physical_corpus_two_bipeds_share_one_registry_and_a_fallen_one_rises_clear_of_the_other",
  async () => {
    // The occupied-recovery cell, and the first time a *pair* of golems has been resolved. It is
    // also the cell that proves `beginSubstep`/`endSubstep` are enough of a seam for Session 08:
    // the pair harness owns the carrier resolution and the modules own everything else.
    //
    // **Fallen is lower, not absent.** A living fallen carrier still reserves its ordinary
    // query-only footprint, and treating it as non-blocking is what let one carrier stand through
    // the other's ragdoll.
    //
    // **The lie is cut to its shortest here, and that is the fixture's one stated edit.** The pair
    // resolver separates the two carriers at about half a metre a second while one lies, so under
    // the knockdown's own lie (`KNOCKDOWN`, up to 2.5 s) they are clear long before the rise and
    // there is no retreat to test: measured (Node, this fixture), 0.897 m apart at the rise. A cap
    // under the dwell makes the rise start at the dwell, from inside the other's footprint.
    const knockdown = B.knockdown;
    B.knockdown = { ...knockdown, maxLyingSeconds: 0.1 };
    const arena = await createHeadlessArena();
    const scene = arena.scene;
    const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
    const world = flatSupportedWorldRegistry();
    const built = ["left", "right"].map((side, index) => {
      const stand = buildGolemStand(scene, {
        side, ground: new Vector3(index === 0 ? -0.25 : 0.25, 0, 0),
        facing: Quaternion.Identity(), slot: "locomotion",
      });
      const module = bipedModule.build({
        scene, side, name: `golem.pair.${side}`, socket: stand.socket("locomotion"),
        layers: golemLayers(side), materials: stand.materials, world,
      });
      plugin.setActivationControl(stand.block.body, 1);
      for (const part of module.parts) plugin.setActivationControl(part.part.body, 1);
      return { stand, module };
    });
    const [a, b] = built;
    const stop = Object.freeze({ localForward: 0, localRight: 0, yaw: 0 });
    const apart = () => Math.hypot(a.module.port.carrierGround().x - b.module.port.carrierGround().x,
      a.module.port.carrierGround().z - b.module.port.carrierGround().z);
    let lastFallenApart = null;
    const control = scene.onBeforePhysicsObservable.add(() => {
      if (a.module.port.state === "fallen") lastFallenApart = apart();
      for (const { module } of built) module.beginSubstep();
      a.module.port.beginControlStep();
      b.module.port.beginControlStep();
      a.module.port.request(stop);
      b.module.port.request(stop);
      const resolved = resolvePhysicalSupportedPair(a.module.port, b.module.port, SUBSTEP);
      assert.equal(resolved, true, "the pair did not resolve as two physical ports");
      for (const { module } of built) {
        module.gait(SUBSTEP);
        module.endSubstep(SUBSTEP);
      }
    });
    try {
      step(scene, 0.5);
      assert.equal(a.module.port.state, "supported");
      assert.equal(b.module.port.state, "supported");
      // The two footprints overlap by construction: 0.50 m apart against 0.68 m of required
      // separation, which is the "close opponent" fixture the deleted corpus used.
      const separation = Math.abs(a.module.port.carrierGround().x - b.module.port.carrierGround().x);
      assert.ok(separation < 2 * bipedModule.footprint.radiusM,
        `the pair fixture is ${separation.toFixed(3)} m apart and so cannot exhibit an occupied recovery`);

      a.module.shove();
      step(scene, 2.5);
      // It rises on its own, clear of the carrier standing over it: the rise retreats by the
      // separation the pair needs rather than lifting it into the other's footprint.
      assert.equal(a.module.port.state, "supported", "the fallen golem never rose clear of its neighbour");
      assert.equal(b.module.port.state, "supported",
        "the standing golem lost its own support because its neighbour fell");
      assert.equal(b.module.readout().selfContacts, 0);
      assert.ok(apart() >= 2 * bipedModule.footprint.radiusM - 1e-6,
        `the risen golem stands ${apart().toFixed(3)} m from its neighbour, inside both footprints`);
      // **And the retreat is what cleared it, not the fall.** The shove carries the ragdoll away
      // from its neighbour, and left alone it drifts clear and rises from there: measured (Node, this
      // fixture), with no retreat allowed the last fallen substep is 0.686 m apart, and with it
      // 0.625 m -- the body left the floor from inside the other's footprint and was carried clear.
      assert.ok(lastFallenApart !== null && lastFallenApart < 2 * bipedModule.footprint.radiusM,
        `the golem only rose once the fall had carried it ${lastFallenApart?.toFixed(3)} m clear, ` +
        "so this fixture never tested a retreat");
    } finally {
      scene.onBeforePhysicsObservable.remove(control);
      for (const { module, stand } of built) { module.dispose(); stand.dispose(); }
      arena.dispose();
      B.knockdown = knockdown;
    }
  });

test("the_course_is_registered_as_a_body_and_as_a_query_collider_for_every_piece", async () => {
  // The pairing rule the course file states, checked rather than claimed: a piece that exists only
  // as a body is one the carrier walks through while its legs jam on it, and a piece that exists
  // only in the registry is one the carrier stops in front of for no visible reason.
  const run = await runGolemLocomotion({
    moduleId: "biped", course: true,
    sequence: Object.freeze([{ name: "stand", until: 0.2, forward: 0, strafe: 0, turn: 0, crouch: 0 }]),
    watch: ({ scene, world, frame }) => {
      if (frame !== 0) return;
      const named = (name) => scene.meshes.some((mesh) => mesh.name === name);
      assert.ok(named("golem.course.step"), "the step has no body");
      assert.ok(named("golem.course.curb"), "the curb has no body");
      for (let index = 0; index < LOCOMOTION_COURSE.posts.length; index += 1) {
        assert.ok(named(`golem.course.post${index}`), `post ${index} has no body`);
      }
      // The registry has no listing API, so the check from the other side is that re-registering
      // each id throws -- which is `StandableWorldRegistry.register`'s own uniqueness rule doing
      // the work of an enumeration.
      for (const id of ["golem.course.step", "golem.course.curb", "golem.course.post0",
        "golem.course.post1", "golem.course.post2"]) {
        assert.throws(() => world.register({
          id, category: "wall", ownerPartId: null, upwardNormal: [0, 1, 0],
          sweep: () => null, support: () => null,
        }), new RegExp(id.replace(/\./g, "\\.")), `${id} is a body with no query collider`);
      }
    },
  });
  assert.equal(run.course, true);
});

// ======================================================================================
// Session 06: the wheel and the multileg.
//
// **The two assertions that matter are comparisons rather than absolutes**, and they are at the
// bottom of this file: the same shove the biped survives knocks the wheel down, and the shove that
// fells the biped does not fell the multileg. Everything above them is what makes those two
// meaningful -- that each body is built where it says it is, that each one's difference arrives
// through the `StabilityAuthority` fields rather than through a special case, and that neither is
// the biped with a different mesh.
//
// Every threshold here is **provisional** in the same sense as the biped's above: the human gate
// for this session has not been asked, and this plan set exists because three body experiments
// each cleared a scalar proxy while the owner's judgement stayed red.
// ======================================================================================

const W = LOCOMOTION_WHEEL;
const ML = LOCOMOTION_MULTILEG;

/** One built locomotion module of any kind, on a stand at that module's own socket height. */
async function moduleFixture(definition, { prepare = null, populateDefaultGeometry = true } = {}) {
  const arena = await createHeadlessArena({ populateDefaultGeometry });
  const scene = arena.scene;
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  const world = flatSupportedWorldRegistry();
  const stand = buildGolemStand(scene, {
    side: "left", ground: Vector3.Zero(), facing: Quaternion.Identity(), slot: "locomotion",
    // **The module's own height, not the fixture's.** Three options stand at three heights and a
    // module built to somebody else's would bury its contact in the block or hang it in the air.
    socketHeight: definition.heightRange.standM,
  });
  const prepared = prepare ? prepare({ scene, world, stand }) : null;
  const module = definition.build({
    scene, side: "left", name: `golem.test.${definition.id}`, socket: stand.socket("locomotion"),
    layers: golemLayers("left"), materials: stand.materials, world,
  });
  plugin.setActivationControl(stand.block.body, 1);
  for (const part of module.parts) plugin.setActivationControl(part.part.body, 1);
  const control = scene.onBeforePhysicsObservable.add(() => module.step(SUBSTEP));
  return {
    arena, scene, stand, module, world, prepared,
    dispose: () => {
      scene.onBeforePhysicsObservable.remove(control);
      module.dispose();
      stand.dispose();
      arena.dispose();
    },
  };
}

/**
 * The biped's own fall line along the bench's push, standing, in newton-seconds: its geometry's line
 * (physical contact session 08) times the mass the bench holds up. The two comparison cells at the
 * foot of this file straddle it, and they read it off a standing biped rather than a literal,
 * because a pinned newton-second goes quietly stale while still reading like a measurement.
 */
async function bipedFallNs() {
  const f = await moduleFixture(bipedModule);
  try {
    drive(f.module, {});
    step(f.scene, 1);
    return f.module.port.stabilityLinesAlong(1, 0).fallAtMps * f.module.port.diagnostic().stability.supportedMassKg;
  } finally { f.dispose(); }
}

// --------------------------------------------------------------------------- pure geometry

test("the_wheel_and_the_multileg_are_registered_and_declare_exactly_the_locomotion_slot",
  () => {
    for (const [id, definition, massKg] of [
      ["locomotion.wheel", wheelModule, W.yokeMass + W.wheelMass],
      ["locomotion.multileg", multilegModule,
        ML.chassisMass + 6 * (ML.femurMass + ML.shinMass + ML.footMass)],
    ]) {
      const option = golemModule(id);
      assert.ok(option, `${id} is not in GOLEM_MODULES`);
      assert.equal(option.mode, "locomotion");
      assert.deepEqual([...option.slots], ["locomotion"]);
      assert.ok(Math.abs(option.massKg - massKg) < 1e-9,
        `${id} publishes ${option.massKg} kg against its own parts' ${massKg}`);
      // The stand height is forwarded from the definition rather than written down in the
      // registry, so the bench cannot put the block anywhere but where the module expects it.
      assert.equal(option.standHeightM, definition.heightRange.standM);
    }
    assert.deepEqual(wheelModule.supportBindings.map(({ role }) => role), ["wheel"]);
    assert.deepEqual(multilegModule.supportBindings.map(({ role }) => role),
      MULTILEG_LEGS.map((leg) => leg.role));
    // Six bindings, and they are six *distinct* names: a duplicate role would make the support
    // query answer twice for one pad and count a body with one leg down as a body with two.
    assert.equal(new Set(multilegModule.supportBindings.map(({ role }) => role)).size, 6);
  });

test("neither_new_option_has_a_height_range_and_both_say_so_in_the_same_field", () => {
  // **Half the point of offering more than one locomotion option**, and it is stated in the
  // contract's own record rather than in a comment: `LocomotionHeightRange.crouchM` equal to
  // `standM` *is* "this carrier does not crouch". `defineLocomotion` admits it because its guard
  // is `crouchM <= standM`, and the biped's own range is what says the field means anything.
  assert.equal(wheelModule.heightRange.crouchM, wheelModule.heightRange.standM);
  assert.equal(multilegModule.heightRange.crouchM, multilegModule.heightRange.standM);
  // The control: a module that *does* crouch, so the equality above is a fact about these two
  // rather than about the field.
  assert.ok(bipedModule.heightRange.crouchM < bipedModule.heightRange.standM);
  assert.ok(Math.abs(wheelModule.heightRange.standM - wheelStandHeight()) < 1e-12);
  assert.ok(Math.abs(multilegModule.heightRange.standM - multilegStandHeight()) < 1e-12);
});

test("the_three_options_stand_at_three_heights_and_the_multileg_publishes_what_that_costs", () => {
  // **The trade, published rather than hidden.** The session plan asks for the multileg's socket
  // height and what it costs in reach and head height, and the honest place for that is a number
  // every caller can read: `heightRange.standM` is where the torso bolts on, so everything above
  // it moves with it. The bench stand puts the block's centre half its height above the socket and
  // the effector sockets `BENCH_STAND.socketHeight` above that centre.
  const socket = (module) => module.heightRange.standM;
  assert.ok(Math.abs(socket(bipedModule) - 1.020) < 1e-9);
  assert.ok(Math.abs(socket(wheelModule) - 1.160) < 1e-9);
  assert.ok(Math.abs(socket(multilegModule) - 0.640) < 1e-9);
  // What that is worth where a limb and a head actually hang, on the bench's own stand geometry.
  const effector = (module) => socket(module) + BENCH_STAND.height / 2 + BENCH_STAND.socketHeight;
  const headTop = (module) => socket(module) + BENCH_STAND.height;
  assert.ok(Math.abs(effector(bipedModule) - 1.800) < 1e-9);
  assert.ok(Math.abs(effector(multilegModule) - 1.420) < 1e-9);
  assert.ok(Math.abs(effector(wheelModule) - 1.940) < 1e-9);
  assert.ok(Math.abs(headTop(multilegModule) - (headTop(bipedModule) - 0.380)) < 1e-9,
    "the multileg's head does not sit exactly its own socket shortfall below the biped's");
  // And the third face of the same trade: a wider body reserves a bigger disc, so it stops
  // further from every wall and needs more room to pass another golem.
  assert.ok(multilegModule.footprint.radiusM > wheelModule.footprint.radiusM);
  assert.ok(wheelModule.footprint.radiusM > bipedModule.footprint.radiusM);
});

test("every_multileg_joint_stop_admits_its_own_build_pose_and_the_gait_stays_inside_it", () => {
  // Session 03 found a chain built in its own singularity and a joint stop that did not admit its
  // own build pose, and Havok cleared that violation by throwing a blade tip at 9.95 m/s from a
  // motionless stand. **Six legs is six times the opportunity**, so all eighteen angles are
  // checked -- at rest, and over the whole product of stride phase and speed.
  const rest = multilegPose(0, 0);
  for (const leg of rest.legs) {
    for (const [name, value] of Object.entries(leg)) {
      assert.ok(Math.abs(value) < 1e-9, `${name} is ${value} in the build pose, not zero`);
    }
  }
  assert.ok(Math.abs(rest.hipDrop) < 1e-9);
  for (const [name, min, max] of [
    ["hip", ML.hipJointMin, ML.hipJointMax],
    ["knee", ML.kneeJointMin, ML.kneeJointMax],
    ["ankle", ML.ankleJointMin, ML.ankleJointMax],
  ]) {
    assert.ok(min < 0 && max > 0, `the ${name} stop does not strictly admit the build pose`);
  }
  assert.ok(ML.hipJointMin < ML.hipSwingMin && ML.hipJointMax > ML.hipSwingMax);
  assert.ok(ML.kneeJointMin < ML.kneeTargetMin && ML.kneeJointMax > ML.kneeTargetMax);
  assert.ok(ML.ankleJointMin < ML.ankleTargetMin && ML.ankleJointMax > ML.ankleTargetMax);

  for (let phase = 0; phase < Math.PI * 2; phase += Math.PI / 24) {
    for (const speed of [0, 0.2, 0.5, ML.carrier.maxSpeedMps, ML.carrier.maxSpeedMps * 2]) {
      const pose = multilegPose(phase, speed);
      assert.equal(pose.legs.length, 6);
      for (const leg of pose.legs) {
        assert.ok(leg.hip >= ML.hipSwingMin - 1e-9 && leg.hip <= ML.hipSwingMax + 1e-9);
        assert.ok(leg.knee >= ML.kneeTargetMin - 1e-9 && leg.knee <= ML.kneeTargetMax + 1e-9);
        assert.ok(leg.ankle >= ML.ankleTargetMin - 1e-9 && leg.ankle <= ML.ankleTargetMax + 1e-9);
      }
      assert.ok(pose.hipDrop >= -1e-9 && pose.hipDrop <= ML.femurLength + ML.shinLength);
    }
  }
  // The splits limit, measured at the pad as the biped's is: a leg that can reach the splits looks
  // broken the first time it is hit, and this body's stance is already 0.80 m wide.
  const legLength = ML.femurLength + ML.shinLength;
  const stanceWidthM = 2 * (ML.hipSide + legLength * Math.sin(ML.hipAbduct));
  assert.ok(stanceWidthM < 0.95,
    `the abduction stop opens the stance to ${stanceWidthM.toFixed(3)} m`);
  const splits = 2 * (ML.hipSide + legLength * Math.sin(1.2));
  assert.ok(splits > 1.5, "the control case is not a splits pose, so the bound above proves nothing");
});

test("the_tripod_is_a_tripod_and_the_two_halves_are_half_a_cycle_apart", () => {
  // **The one thing about this gait a reader has to be able to check**, and no slip or lift number
  // would catch it: three legs at one phase and three at the other is a tripod, but *which* three
  // decides whether the thing walks or limps. Left-front, left-rear and right-middle together.
  const groups = new Map();
  for (const leg of MULTILEG_LEGS) {
    groups.set(leg.phase, [...(groups.get(leg.phase) ?? []), leg.role]);
  }
  assert.equal(groups.size, 2, "the gait is not two groups");
  assert.deepEqual([...groups.keys()].sort((a, b) => a - b), [0, Math.PI]);
  assert.deepEqual(groups.get(0), ["left-front-pad", "left-rear-pad", "right-middle-pad"]);
  assert.deepEqual(groups.get(Math.PI), ["left-middle-pad", "right-front-pad", "right-rear-pad"]);
  // A tripod is three legs that are not all on one side and not all at one station: an alternating
  // pair of *those* is what keeps the centre of the base under the body through the whole cycle.
  for (const group of groups.values()) {
    const members = MULTILEG_LEGS.filter((leg) => group.includes(leg.role));
    assert.equal(new Set(members.map((leg) => leg.side)).size, 2, "a tripod is all on one side");
    assert.equal(new Set(members.map((leg) => leg.station)).size, 3,
      "a tripod does not span all three stations");
  }
  // And the pose really does put them out of phase: at the moment one group's hips are at their
  // extreme, the other's are at the opposite one.
  const pose = multilegPose(Math.PI / 2, ML.carrier.maxSpeedMps);
  for (const [index, leg] of MULTILEG_LEGS.entries()) {
    const partner = MULTILEG_LEGS.findIndex((other) => other.phase !== leg.phase);
    assert.ok(Math.abs(pose.legs[index].hip + pose.legs[partner].hip) < 1e-9,
      "the two tripods are not opposed");
  }
});

// --------------------------------------------------------- the built bodies, in a real solver

test("the_built_wheel_touches_the_floor_and_its_axle_lies_across_the_fork", async () => {
  const f = await moduleFixture(wheelModule);
  try {
    const wheel = partNamed(f.module, ".wheel");
    // The tread's lowest point is on the floor the socket implies. The two numbers live in
    // different places on purpose -- the stand's socket height comes from the module and the
    // wheel's radius from its own block -- so this is what stops them agreeing by coincidence.
    assert.ok(Math.abs(wheel.mesh.position.y - W.wheelRadius) < 1e-6,
      `the axle is at ${wheel.mesh.position.y} m against a radius of ${W.wheelRadius}`);
    assert.ok(Math.abs(wheelStandHeight() - wheelModule.heightRange.standM) < 1e-12);
    // **The weld frame, which is the fling this build is shaped to avoid.** A cylinder is built
    // along its own local Y and the wheel has to lie across the body, so the mesh is turned a
    // quarter turn: local +Y must come out as the golem's own lateral, or the hinge is a violation
    // the solver clears by throwing the wheel.
    const axle = new Vector3(0, 1, 0);
    axle.rotateByQuaternionToRef(wheel.mesh.rotationQuaternion, axle);
    assert.ok(Math.abs(Math.abs(axle.x) - 1) < 1e-6,
      `the axle points (${axle.x.toFixed(4)}, ${axle.y.toFixed(4)}, ${axle.z.toFixed(4)})`);
    assert.equal(f.module.root.body.getMotionType(), PhysicsMotionType.ANIMATED);
    assert.equal(f.module.adapter.sample().motionType, "animated");
    // A motionless golem's fastest part: a joint built outside its own stop is cleared by Havok
    // flinging the limb, and the tell is a large part speed in the first tenth of a second on a
    // body that has been asked to do nothing at all.
    drive(f.module, {});
    step(f.scene, 0.25);
    let peak = 0;
    for (const { part } of f.module.parts) {
      peak = Math.max(peak, part.body.getLinearVelocity().length());
    }
    assert.ok(peak < 0.5, `a motionless wheel golem's fastest part reached ${peak.toFixed(3)} m/s`);
    assert.ok(constructPostureIsSupported(f.module.postureEvidence()),
      JSON.stringify(f.module.postureEvidence()));
  } finally { f.dispose(); }
});

test("the_built_multileg_pads_land_on_the_floor_the_stand_socket_implies", async () => {
  const f = await moduleFixture(multilegModule);
  try {
    for (const leg of MULTILEG_LEGS) {
      const pad = partNamed(f.module, `pad${leg.suffix}`);
      const sole = pad.mesh.position.y - ML.footHeight / 2;
      assert.ok(Math.abs(sole) < 1e-6, `${leg.suffix} pad is ${sole} m off the floor at build`);
    }
    assert.ok(Math.abs(multilegStandHeight() - multilegModule.heightRange.standM) < 1e-12);
    assert.equal(f.module.root.body.getMotionType(), PhysicsMotionType.ANIMATED);
    drive(f.module, {});
    step(f.scene, 0.25);
    let peak = 0;
    for (const { part } of f.module.parts) {
      peak = Math.max(peak, part.body.getLinearVelocity().length());
    }
    assert.ok(peak < 0.5, `a motionless multileg's fastest part reached ${peak.toFixed(3)} m/s`);
    assert.ok(constructPostureIsSupported(f.module.postureEvidence()));
  } finally { f.dispose(); }
});

test("neither_new_body_collides_with_itself_and_both_do_collide_with_the_world", async () => {
  // Two halves, and the second is the one that matters. `selfCollisionCount === 0` proves nothing
  // about pairs the filters never admitted -- so the zero is checked *beside* a positive world
  // contact count, which is what says the parts are on a layer that solves against the floor at
  // all rather than one that solves against nothing.
  //
  // **The floor for that count is per module and the difference is not a defect.** Babylon reports
  // a *started* collision, not one per substep of a contact that is already there -- so a walking
  // body, whose six or two pads leave the floor and come back twice a stride, logs thousands, and
  // a wheel that keeps one continuous patch logs a handful (measured: 12 over two seconds of
  // rolling, against 20 000-odd for the same two seconds of multileg). A count that is large for a
  // walker and small for a roller is the two bodies being different, and what the assertion needs
  // from it is only that it is **not zero**, because zero is what a filter pair that was never
  // admitted looks like.
  for (const [definition, floor] of [[wheelModule, 0], [multilegModule, 100]]) {
    const f = await moduleFixture(definition);
    try {
      drive(f.module, { forward: 1 });
      step(f.scene, 2);
      const state = f.module.readout();
      assert.equal(state.selfContacts, 0, `${definition.id}'s own parts collided with each other`);
      assert.ok(state.contacts > floor,
        `${definition.id}: only ${state.contacts} world contacts, so nothing is on the floor`);
      const layers = golemLayers("left");
      for (const { part } of f.module.parts) {
        // Filters go on leaves. A `PhysicsShapeContainer`'s mask is consulted by nothing and reads
        // back garbage -- a shape set to 8 returned 383476 -- so this reads the leaf back.
        assert.equal(part.shape.filterMembershipMask, layers.body);
        assert.equal(part.shape.filterCollideMask, layers.bodyCollidesWith);
      }
      assert.ok((layers.bodyCollidesWith & LAYER.WORLD) !== 0, "a pad cannot touch the world");
      assert.equal(layers.bodyCollidesWith & layers.body, 0, "a leg can touch another leg");
    } finally { f.dispose(); }
  }
});

test("a_wheel_rolls_rather_than_slides_and_a_weak_motor_is_the_control", async () => {
  // **The one claim the wheel exists to make**, and the reading is the *material* velocity of the
  // piece of tread against the floor -- `v + omega x r` -- rather than the wheel's own velocity,
  // which is the carrier's speed whether it rolls or is dragged.
  const rolling = await runGolemLocomotion({
    moduleId: "wheel", sequence: walkSequenceFor("wheel") });
  assert.equal(rolling.state.plantedSteps, rolling.state.steps,
    `${rolling.state.steps - rolling.state.plantedSteps} substeps had the tread off the floor`);
  assert.ok(rolling.state.meanFootSlipMps <= W.meanContactSlipBudgetMps,
    `mean contact slip ${(rolling.state.meanFootSlipMps * 1000).toFixed(1)} mm/s against a budget `
    + `of ${(W.meanContactSlipBudgetMps * 1000).toFixed(0)}`);
  // **The mutation control, and without it the assertion above is satisfied by a reading that is
  // structurally zero.** A slip computed wrongly -- from the axle rather than from the tread, say
  // -- would report a perfect roll for any spin at all. Starve the motor and the same instrument
  // has to report a skid: at 60 N.m the wheel cannot be turned at the rate the ground passes
  // under it and the tread drags, reading 662.6 mm/s against the 20.5 of a roll.
  //
  // **60 and not the 120 this said until 2026-09-18**, because a starve level is a torque against
  // an inertia and the wheel lost five sixths of its mass that day. 120 no longer starves it at
  // all: it reads 73.1 mm/s, which is a skid the assertion below would not accept and is also not
  // really a skid. The re-derivation is the same ratio, and it was checked downward -- 30 N.m
  // reads 1234.5 and 12 reads 2156.7, so the instrument keeps responding all the way down.
  const skidding = await runGolemLocomotion({
    moduleId: "wheel", sequence: walkSequenceFor("wheel"),
    overrides: [[W, { wheelSpinTorque: 60 }]],
  });
  assert.ok(skidding.state.meanFootSlipMps > 10 * rolling.state.meanFootSlipMps + 0.1,
    `a starved spin motor still read ${(skidding.state.meanFootSlipMps * 1000).toFixed(1)} mm/s, `
    + "so the slip reading is not about the tread");
  // And the axle stayed in its fork through both: this column is not a motor lag on a wheel, it is
  // how far the hinge has been levered out of its own frame.
  assert.ok(rolling.state.peakJointErrorRad < 0.05,
    `the axle read ${rolling.state.peakJointErrorRad.toFixed(4)} rad out of its fork`);
});

test("a_wheel_cannot_strafe_and_the_envelope_is_where_it_says_so", async () => {
  // Frozen rule 3: the module publishes what it can reach and the command is clamped into that
  // before the carrier is ever handed it. There is no refusal branch anywhere -- a sideways
  // command is simply not in the envelope.
  const f = await moduleFixture(wheelModule);
  try {
    drive(f.module, { strafe: 1 });
    step(f.scene, 1.5);
    const diagnostic = f.module.port.diagnostic();
    assert.equal(diagnostic.requested.localRight, 0,
      "a sideways command reached the carrier, so the clamp is not in the command path");
    assert.ok(Math.abs(f.module.port.carrierGround().x) < 1e-6,
      `the wheel strafed to x=${f.module.port.carrierGround().x}`);
    const axis = f.module.envelope().axes.find((entry) => entry.id === "strafe");
    assert.ok(axis, "the wheel publishes no strafe axis, so nothing says it cannot strafe");
    assert.equal(axis.min, 0);
    assert.equal(axis.max, 0);
    // The control: the same command through the same seam does move a biped sideways, so the
    // assertion above is about the wheel and not about the harness.
    const g = await fixture();
    try {
      drive(g.module, { strafe: 1 });
      step(g.scene, 1.5);
      assert.ok(Math.abs(g.module.port.carrierGround().x) > 0.5,
        "the control biped did not strafe either, so this fixture cannot show the difference");
    } finally { g.dispose(); }
  } finally { f.dispose(); }
});

test("a_multileg_tripod_always_has_three_pads_down_and_they_hold_their_ground", async () => {
  // **Foot contact does not prove a body is standing, and this body is where that bites hardest**
  // because it always has something touching the floor. So the pad count is checked *beside* the
  // posture predicate and the first-loss time, which is the trio the trap demands.
  const run = await runGolemLocomotion({ moduleId: "multileg", sequence: WALK_SEQUENCE });
  const state = run.state;
  assert.equal(state.plantedSteps, state.steps,
    `${state.steps - state.plantedSteps} substeps of the walk had no pad in contact at all`);
  assert.equal(state.firstPostureLossSeconds, null);
  assert.equal(state.minUpDot, 1);
  assert.equal(state.longestSupportGapSeconds, 0);
  assert.ok(state.meanFootSlipMps <= ML.meanFootSlipBudgetMps,
    `mean planted slip ${(state.meanFootSlipMps * 1000).toFixed(1)} mm/s against a budget of `
    + `${(ML.meanFootSlipBudgetMps * 1000).toFixed(0)}`);
  // The swing tripod really leaves the ground -- a stride whose pads never lift is a scuff -- and
  // stays inside the support query's own step envelope so its evidence never goes stale.
  assert.ok(state.peakSoleLiftM > 0.04,
    `the swing pads only cleared ${(state.peakSoleLiftM * 1000).toFixed(1)} mm`);
  assert.ok(state.peakSoleLiftM < bipedModule.footprint.stepHeightM,
    `a pad lifted ${(state.peakSoleLiftM * 1000).toFixed(1)} mm, past the step envelope`);
  assert.equal(state.selfContacts, 0);

  // Three down at every substep, watched live: the readout's planted count is a "some pad" count,
  // and "some" is not what a tripod claims.
  const f = await moduleFixture(multilegModule);
  try {
    drive(f.module, { forward: 1 });
    let worst = 6;
    for (let frame = 0; frame * FRAME < 3; frame += 1) {
      step(f.scene, FRAME);
      if (frame * FRAME > 1) worst = Math.min(worst, f.module.evidence().plantedFeet);
    }
    assert.ok(worst >= 3, `the tripod fell to ${worst} pads on the ground`);
  } finally { f.dispose(); }
});

// ------------------------------------------------------- the knockdown, per module and across

test("a_standing_wheel_stands_on_a_square_as_wide_as_its_tread", async () => {
  // The wheel's patch is a recorded choice (physical contact session 08): a line contact has no
  // fore-aft base at all, so it is given a square as wide as the wheel, centred on the contact and
  // turned with the axle. Its base therefore spans the tread's width across and along, whatever
  // the centre of mass's small offset inside it.
  const f = await moduleFixture(wheelModule);
  try {
    drive(f.module, {});
    step(f.scene, 1);
    const { tipping } = f.module.port.diagnostic().stability;
    assert.ok(tipping, "the control: a standing wheel has a tipping reading");
    for (const [x, z] of [[1, 0], [0, 1]]) {
      const span = baseReachM(tipping.hull, x, z) + baseReachM(tipping.hull, -x, -z);
      assert.ok(Math.abs(span - W.wheelWidth) < 1e-3, `the base spans ${span.toFixed(4)} m along (${x}, ${z})`);
    }
  } finally { f.dispose(); }
});

test("each_module_falls_at_the_line_its_own_geometry_gives", async () => {
  // The bracket, taken the cheap way: an authored transfer queued straight into the port, which is
  // the same mass-independent unit the state machine works in, so a whole scripted sequence is not
  // needed to find the crossing. The bench's own brackets are in the measurements doc's physical
  // contact 08 section.
  for (const [definition, supportedMassKg] of [
    [wheelModule, W.yokeMass + W.wheelMass + BENCH_STAND_LOCOMOTION.mass],
    [multilegModule, ML.chassisMass + 6 * (ML.femurMass + ML.shinMass + ML.footMass)
      + BENCH_STAND_LOCOMOTION.mass],
  ]) {
    const f = await moduleFixture(definition);
    try {
      drive(f.module, {});
      step(f.scene, 1);
      // To Havok's single-precision mass, as in the biped's cell above.
      assert.ok(Math.abs(f.module.port.diagnostic().stability.supportedMassKg - supportedMassKg) < 1e-3);
      const threshold = f.module.port.stabilityLinesAlong(1, 0).fallAtMps * supportedMassKg;
      f.module.port.queueStabilityEvent({ horizontalShoveNs: [threshold * 0.9, 0] });
      step(f.scene, 0.2);
      assert.notEqual(f.module.port.state, "fallen",
        `${definition.id} fell at 90 % of its own line`);
      // 1.2 x rather than the 0.3 that would top the first one up: **the ledger decays**, at the
      // body's own righting rate (`rockingDecayMps2`), so 0.2 s of standing there has already spent
      // more of the first shove than a small second one would replace. One transfer that crosses the
      // line on its own is what this half is about.
      f.module.port.queueStabilityEvent({ horizontalShoveNs: [threshold * 1.2, 0] });
      step(f.scene, 0.2);
      assert.equal(f.module.port.state, "fallen",
        `${definition.id} stayed up past its own line`);
      assert.equal(f.module.root.body.getMotionType(), PhysicsMotionType.DYNAMIC,
        `${definition.id}'s root was not released to the ragdoll`);
    } finally { f.dispose(); }
  }
});

test("the_same_shove_the_biped_survives_knocks_the_wheel_down", async () => {
  // **The first of the two assertions that matter**, and it is a comparison rather than a number:
  // if both options merely fell over at some impulse the locomotion contract would have carried no
  // difference at all, whatever the config blocks said. 0.85 of the biped's own line is Session 05's
  // own measured "leaves the biped standing" row -- 10 N.s against 11.76 then. The wheel's line is
  // its narrow contact: 0.30 m/s against the biped's 0.95 (Node locomotion bench, 2026-09-24).
  const SHOVE = await bipedFallNs() * 0.85;
  const biped = await runGolemLocomotion({
    moduleId: "biped", sequence: LOCOMOTION_SEQUENCE,
    overrides: [[LOCOMOTION_BIPED, { shoveImpulseNs: SHOVE }]],
  });
  const wheel = await runGolemLocomotion({
    moduleId: "wheel", sequence: LOCOMOTION_SEQUENCE,
    overrides: [[W, { shoveImpulseNs: SHOVE }]],
  });
  assert.equal(biped.state.firstFallenSeconds, null,
    `${SHOVE.toFixed(2)} N.s felled the biped, so this comparison is about the wrong impulse`);
  assert.ok(wheel.state.firstFallenSeconds !== null,
    `${SHOVE.toFixed(2)} N.s left the wheel standing: the contract carried no difference`);
  // Came back, and not inside the budget: a gentle topple takes longer to come down, and the lie
  // waits for the centre of mass to come half way to the floor -- 2.84 s from the fall to supported
  // at this shove against 1.93 at the bench's own (Node locomotion bench, 2026-09-24), which is
  // what the budget was set on.
  assert.ok(wheel.state.recoveredSeconds !== null, "the wheel never came back to supported");
  // And the mechanism is each body's own geometry rather than a special case: one formula, read
  // off each standing body (`stabilityLines`).
  assert.ok(wheel.state.selfContacts === 0 && biped.state.selfContacts === 0);
});

test("the_shove_that_fells_the_biped_does_not_fell_the_multileg", async () => {
  // **The second of the two.** 1.02 of the biped's line is Session 05's own measured "puts the biped
  // down" row -- 12 N.s against 11.76 then -- and the multileg's lower, wider body, a line of
  // 1.97 m/s against the biped's 0.95, is what stands it up under the same transfer.
  const SHOVE = await bipedFallNs() * 1.02;
  const biped = await runGolemLocomotion({
    moduleId: "biped", sequence: LOCOMOTION_SEQUENCE,
    overrides: [[LOCOMOTION_BIPED, { shoveImpulseNs: SHOVE }]],
  });
  const multileg = await runGolemLocomotion({
    moduleId: "multileg", sequence: LOCOMOTION_SEQUENCE,
    overrides: [[ML, { shoveImpulseNs: SHOVE }]],
  });
  assert.ok(biped.state.firstFallenSeconds !== null,
    `${SHOVE.toFixed(2)} N.s left the biped standing, so this comparison is about the wrong`
    + " impulse");
  assert.equal(multileg.state.firstFallenSeconds, null,
    `${SHOVE.toFixed(2)} N.s felled the multileg: the contract carried no difference`);
  assert.equal(multileg.state.firstPostureLossSeconds, null);
  assert.equal(multileg.state.minUpDot, 1);
  assert.equal(multileg.state.selfContacts, 0);
});

test("the_bench_shove_each_module_ships_with_actually_puts_that_module_over", async () => {
  // **A threshold crossed is not a body on the floor, and the two are further apart on some bodies
  // than on others.** Each module's `shoveImpulseNs` was chosen for the *drop* rather than for the
  // threshold, when the threshold was a frozen specific impulse times a brace: 51x it for the biped,
  // 225x for the wheel and 104x for the multileg. Since physical contact session 08 the line is the
  // body's own geometry and those shoves are 2.33, 7.26 and 1.92 times it (Node locomotion bench,
  // `.review/shove-bench.mjs`), and every body runs the one knockdown, so it lies until it has come
  // down: the wheel reaches an up-dot of -0.081 and the multileg -0.324.
  //
  // The floors below are each module's own measured drop with a margin, and they are **not** the
  // same fraction: a wheel falls from 1.160 m to 0.368 (0.32 of standing) and a multileg from
  // 0.640 to 0.512 (0.80), because a body that is already 0.64 m tall and 0.80 m wide has much
  // less height to lose. Quoting one fraction for both would be a threshold that is slack on one
  // body and impossible on the other.
  for (const [id, module, floor] of [
    ["wheel", wheelModule, 0.75],
    ["multileg", multilegModule, 0.98],
  ]) {
    const run = await runGolemLocomotion({ moduleId: id, sequence: LOCOMOTION_SEQUENCE });
    assert.ok(run.state.firstFallenSeconds !== null, `${id}: its own bench shove did not fell it`);
    assert.ok(run.state.minUpDot < 0.7,
      `${id}: its own bench shove only tilted the root to an up-dot of ${run.state.minUpDot}`);
    assert.ok(run.state.minHeightM < module.heightRange.standM * floor,
      `${id}: the socket only came down to ${run.state.minHeightM.toFixed(3)} m`);
    assert.ok(run.state.riseSeconds > 0 && run.state.riseSeconds <= (module === wheelModule ? W : ML).riseBudgetSeconds,
      `${id}: the rise took ${run.state.riseSeconds} s`);
    assert.ok(run.state.riseSeconds >= SUPPORTED_LOCOMOTION_V1.FALLEN_DWELL_S +
      SUPPORTED_LOCOMOTION_V1.RISING_DURATION_S - 1e-9,
    `${id}: the rise beat the frozen dwell plus the frozen rising duration, which is impossible`);
    assert.equal(run.state.selfContacts, 0);
  }
});
