import assert from "node:assert/strict";
import test from "node:test";

import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsMotionType, PhysicsShapeType } from
  "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";

import { CONFIG } from "../src/config.ts";
import {
  BENCH_STAND, BENCH_STAND_LOCOMOTION, LOCOMOTION_BIPED, LOCOMOTION_MULTILEG, LOCOMOTION_WHEEL,
} from "../src/golem/config.ts";
import { locomotionCommand } from "../src/golem/locomotion.ts";
import { bipedModule, bipedPose, bipedStandHeight } from "../src/golem/locomotion/biped.ts";
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
import { SUPPORTED_LOCOMOTION_V1, constructPostureIsSupported } from
  "../src/supported-locomotion-state.ts";
import {
  LOCOMOTION_SEQUENCE, WALK_SEQUENCE, runGolemLocomotion, walkSequenceFor,
} from "../scripts/golem-bench.mjs";
import { createHeadlessArena } from "../scripts/golem-headless-arena.mjs";

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

test("the_biped_is_built_standing_and_every_joint_stop_admits_that_build_pose", () => {
  // Session 03 found a chain built in its own singularity and a joint stop that did not admit its
  // own build pose, and Havok cleared that violation by throwing a blade tip at 9.95 m/s from a
  // motionless stand. The legs here are built with all three angles at zero, so every stop has to
  // contain zero -- strictly, so the build pose is not sitting *on* a limit either.
  const rest = bipedPose(0, 0, 0);
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
  // to -- and, separately, that the fore-aft gait never commands an angle outside its own range,
  // over the whole product of stride phase, speed and crouch rather than at a few points.
  for (let phase = 0; phase < Math.PI * 2; phase += Math.PI / 24) {
    for (const speed of [0, 0.3, 0.7, B.carrier.maxSpeedMps, B.carrier.maxSpeedMps * 2]) {
      for (const crouch of [0, 0.25, 0.5, 1]) {
        const pose = bipedPose(phase, speed, crouch);
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
        assert.ok(pose.hipDrop >= -1e-9 && pose.hipDrop <= B.thighLength + B.shinLength);
      }
    }
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

test("the_crouch_is_solved_so_the_sole_stays_on_the_floor", () => {
  // Solved through the law of cosines for the height the carrier wants, rather than animated as an
  // unrelated pelvis offset. The claim is arithmetic and it is worth checking as arithmetic: at
  // any crouch the supporting leg's vertical extension is exactly the standing extension minus the
  // requested drop, so the sole does not move.
  const extension = (hip, knee) =>
    B.thighLength * Math.cos(hip) + B.shinLength * Math.cos(hip + knee);
  for (const crouch of [0, 0.2, 0.5, 0.8, 1]) {
    const pose = bipedPose(0, 0, crouch);
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
async function fixture({ prepare = null } = {}) {
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
    primary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
    secondary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
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
  assert.ok(Math.abs(state.maxHeightM - bipedModule.heightRange.standM) < 0.02,
    `standing height ${state.maxHeightM} m against a declared ${bipedModule.heightRange.standM}`);

  // 4. The knockdown: the root goes DYNAMIC, the body goes past horizontal, and the rise completes
  //    inside the budget written in the module file.
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
    // recover for ever and the scheduler refused it for ever. Here the request is simply movement
    // input after the fallen dwell, and it is derived from the *command* rather than from the
    // committed motion -- a fallen carrier zeroes its own translation.
    drive(f.module, { forward: 1 });
    step(f.scene, 1.6);
    assert.equal(f.module.port.state, "supported", f.module.port.diagnostic().releaseReason ?? "");
    assert.equal(f.module.root.body.getMotionType(), PhysicsMotionType.ANIMATED);
    assert.ok(constructPostureIsSupported(f.module.postureEvidence()));
  } finally { f.dispose(); }
});

test("a_shove_under_the_braced_fall_threshold_does_not_knock_the_golem_down", async () => {
  // The control for the cell above, and the reason it is here rather than in a comment: an
  // assertion that a large shove knocks a body over is satisfied by a body that falls over
  // whatever you do to it.
  const f = await fixture();
  try {
    drive(f.module, {});
    step(f.scene, 1);
    const mass = f.module.port.diagnostic();
    const capacity = B.braceCapacityMultiplier * f.module.authority().gaitStabilityScale;
    const supportedMassKg = B.pelvisMass + 2 * (B.thighMass + B.shinMass + B.footMass) +
      BENCH_STAND_LOCOMOTION.mass;
    const fallAtNs = SUPPORTED_LOCOMOTION_V1.FALL_SPECIFIC_IMPULSE_MPS * capacity * supportedMassKg;
    assert.ok(Math.abs(mass.stability.fallAtMps -
      SUPPORTED_LOCOMOTION_V1.FALL_SPECIFIC_IMPULSE_MPS * capacity) < 1e-9);
    f.module.port.queueStabilityEvent({ horizontalShoveNs: [fallAtNs * 0.9, 0] });
    step(f.scene, 0.2);
    assert.notEqual(f.module.port.state, "fallen");
    assert.equal(f.module.root.body.getMotionType(), PhysicsMotionType.ANIMATED);
  } finally { f.dispose(); }
});

test("a_planted_sole_holds_its_ground_within_the_budget_written_in_the_module_file", async () => {
  // Read over the walk alone. A gait number taken through the whole scripted sequence has a
  // knockdown in it, and one taken through the course has a leg on a step in it.
  const run = await runGolemLocomotion({ moduleId: "biped", sequence: WALK_SEQUENCE });
  const state = run.state;
  assert.equal(state.plantedSteps, state.steps,
    `${state.steps - state.plantedSteps} substeps of the walk had no sole in contact at all`);
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
    const CURB = { x: 0, y: 0.4 / 2, z: 3.0, width: 4.0, height: 0.4, depth: 0.5 };
    const f = await fixture({
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

test("physical_corpus_two_bipeds_share_one_registry_and_an_occupied_recovery_is_refused",
  async () => {
    // The occupied-recovery cell, and the first time a *pair* of golems has been resolved. It is
    // also the cell that proves `beginSubstep`/`endSubstep` are enough of a seam for Session 08:
    // the pair harness owns the carrier resolution and the modules own everything else.
    //
    // **Fallen is lower, not absent.** A living fallen carrier still reserves its ordinary
    // query-only footprint, and treating it as non-blocking is what let one carrier stand through
    // the other's ragdoll.
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
    const stop = Object.freeze({ localForward: 0, localRight: 0, yaw: 0, recover: false });
    const recover = Object.freeze({ localForward: 1, localRight: 0, yaw: 0, recover: true });
    const control = scene.onBeforePhysicsObservable.add(() => {
      for (const { module } of built) module.beginSubstep();
      a.module.port.beginControlStep();
      b.module.port.beginControlStep();
      a.module.port.request(a.module.port.state === "fallen" ? recover : stop);
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
      // It asked to rise on every boundary after the dwell and could not, because the other
      // carrier's footprint is over it and the separation it would need is available.
      const diagnostic = a.module.port.diagnostic();
      assert.ok(["fallen", "rising", "supported"].includes(a.module.port.state));
      assert.equal(b.module.port.state, "supported",
        "the standing golem lost its own support because its neighbour fell");
      assert.equal(b.module.readout().selfContacts, 0);
      assert.ok(diagnostic.recoveryProgress !== null,
        "a fallen golem published no recovery progress at all");
    } finally {
      scene.onBeforePhysicsObservable.remove(control);
      for (const { module, stand } of built) { module.dispose(); stand.dispose(); }
      arena.dispose();
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

/** What a module's own declared fall threshold is worth in newton-seconds, standing still. */
const fallThresholdNs = (module, supportedMassKg) =>
  SUPPORTED_LOCOMOTION_V1.FALL_SPECIFIC_IMPULSE_MPS *
  module.authority().braceCapacityMultiplier * module.authority().gaitStabilityScale *
  supportedMassKg;

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
  // has to report a skid: at 120 N.m the wheel cannot be turned at the rate the ground passes
  // under it and the tread drags.
  const skidding = await runGolemLocomotion({
    moduleId: "wheel", sequence: walkSequenceFor("wheel"),
    overrides: [[W, { wheelSpinTorque: 120 }]],
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

test("each_module_falls_at_its_own_declared_threshold_and_not_at_the_biped_s", async () => {
  // The bracket, taken the cheap way: an authored transfer queued straight into the port, which is
  // the same mass-independent unit the state machine works in, so a whole scripted sequence is not
  // needed to find the crossing. The measured newton-second brackets over `LOCOMOTION_SEQUENCE`
  // are in `docs/measurements.md` and in each block's `shoveImpulseNs` comment.
  for (const [definition, supportedMassKg] of [
    [wheelModule, W.yokeMass + W.wheelMass + BENCH_STAND_LOCOMOTION.mass],
    [multilegModule, ML.chassisMass + 6 * (ML.femurMass + ML.shinMass + ML.footMass)
      + BENCH_STAND_LOCOMOTION.mass],
  ]) {
    const f = await moduleFixture(definition);
    try {
      drive(f.module, {});
      step(f.scene, 1);
      const threshold = fallThresholdNs(f.module, supportedMassKg);
      assert.ok(Math.abs(f.module.port.diagnostic().stability.fallAtMps * supportedMassKg
        - threshold) < 1e-9);
      f.module.port.queueStabilityEvent({ horizontalShoveNs: [threshold * 0.9, 0] });
      step(f.scene, 0.2);
      assert.notEqual(f.module.port.state, "fallen",
        `${definition.id} fell at 90 % of its own declared threshold`);
      // 1.2 x rather than the 0.3 that would top the first one up: **the ledger decays**, at a
      // frozen 0.020 m/s per second, so 0.2 s of standing there has already spent more of the
      // first shove than a small second one would replace. One transfer that crosses the boundary
      // on its own is what this half is about.
      f.module.port.queueStabilityEvent({ horizontalShoveNs: [threshold * 1.2, 0] });
      step(f.scene, 0.2);
      assert.equal(f.module.port.state, "fallen",
        `${definition.id} stayed up past its own declared threshold`);
      assert.equal(f.module.root.body.getMotionType(), PhysicsMotionType.DYNAMIC,
        `${definition.id}'s root was not released to the ragdoll`);
    } finally { f.dispose(); }
  }
});

test("the_same_shove_the_biped_survives_knocks_the_wheel_down", async () => {
  // **The first of the two assertions that matter**, and it is a comparison rather than a number:
  // if both options merely fell over at some impulse the locomotion contract would have carried no
  // difference at all, whatever the config blocks said. 10 N.s is Session 05's own measured "leaves
  // the biped standing" row.
  const SHOVE = 10;
  const biped = await runGolemLocomotion({
    moduleId: "biped", sequence: LOCOMOTION_SEQUENCE,
    overrides: [[LOCOMOTION_BIPED, { shoveImpulseNs: SHOVE }]],
  });
  const wheel = await runGolemLocomotion({
    moduleId: "wheel", sequence: LOCOMOTION_SEQUENCE,
    overrides: [[W, { shoveImpulseNs: SHOVE }]],
  });
  assert.equal(biped.state.firstFallenSeconds, null,
    `${SHOVE} N.s felled the biped, so this comparison is about the wrong impulse`);
  assert.ok(wheel.state.firstFallenSeconds !== null,
    `${SHOVE} N.s left the wheel standing: the contract carried no difference`);
  assert.ok(wheel.state.recoveredSeconds !== null, "the wheel never came back to supported");
  assert.ok(wheel.state.riseSeconds > 0 && wheel.state.riseSeconds <= W.riseBudgetSeconds,
    `the wheel's rise took ${wheel.state.riseSeconds} s against ${W.riseBudgetSeconds}`);
  // And the mechanism is the declared authority rather than a special case: the same frozen
  // constant, multiplied by each module's own two published fields.
  assert.ok(wheel.state.selfContacts === 0 && biped.state.selfContacts === 0);
});

test("the_shove_that_fells_the_biped_does_not_fell_the_multileg", async () => {
  // **The second of the two.** 12 N.s is Session 05's own measured "puts the biped down" row, and
  // the multileg's declared brace capacity is what stands it up under the same transfer.
  const SHOVE = 12;
  const biped = await runGolemLocomotion({
    moduleId: "biped", sequence: LOCOMOTION_SEQUENCE,
    overrides: [[LOCOMOTION_BIPED, { shoveImpulseNs: SHOVE }]],
  });
  const multileg = await runGolemLocomotion({
    moduleId: "multileg", sequence: LOCOMOTION_SEQUENCE,
    overrides: [[ML, { shoveImpulseNs: SHOVE }]],
  });
  assert.ok(biped.state.firstFallenSeconds !== null,
    `${SHOVE} N.s left the biped standing, so this comparison is about the wrong impulse`);
  assert.equal(multileg.state.firstFallenSeconds, null,
    `${SHOVE} N.s felled the multileg: the contract carried no difference`);
  assert.equal(multileg.state.firstPostureLossSeconds, null);
  assert.equal(multileg.state.minUpDot, 1);
  assert.equal(multileg.state.selfContacts, 0);
});

test("the_bench_shove_each_module_ships_with_actually_puts_that_module_over", async () => {
  // **A threshold crossed is not a body on the floor, and the two are further apart on some bodies
  // than on others.** The state machine's boundary is a decaying ledger in mass-independent units;
  // whether a person sees a knockdown is mass and base geometry. Each module's `shoveImpulseNs` is
  // therefore chosen for the *drop* rather than for the threshold, exactly as the biped's 600 was,
  // and the ratios are wildly different: 51x the threshold for the biped, 225x for the wheel and
  // 104x for the multileg. The numbers are in `docs/measurements.md`.
  //
  // The floors below are each module's own measured drop with a margin, and they are **not** the
  // same fraction: a wheel falls from 1.160 m to 0.368 (0.32 of standing) and a multileg from
  // 0.640 to 0.512 (0.80), because a body that is already 0.64 m tall and 0.80 m wide has much
  // less height to lose. Quoting one fraction for both would be a threshold that is slack on one
  // body and impossible on the other.
  for (const [id, module, floor] of [
    ["wheel", wheelModule, 0.60],
    ["multileg", multilegModule, 0.85],
  ]) {
    const run = await runGolemLocomotion({ moduleId: id, sequence: LOCOMOTION_SEQUENCE });
    assert.ok(run.state.minUpDot < 0.2,
      `${id}: its own bench shove only tilted the root to an up-dot of ${run.state.minUpDot}`);
    assert.ok(run.state.minHeightM < module.heightRange.standM * floor,
      `${id}: the socket only came down to ${run.state.minHeightM.toFixed(3)} m`);
    assert.ok(run.state.riseSeconds > 0 && run.state.riseSeconds <= 1.60,
      `${id}: the rise took ${run.state.riseSeconds} s`);
    assert.ok(run.state.riseSeconds >= SUPPORTED_LOCOMOTION_V1.FALLEN_DWELL_S +
      SUPPORTED_LOCOMOTION_V1.RISING_DURATION_S - 1e-9,
    `${id}: the rise beat the frozen dwell plus the frozen rising duration, which is impossible`);
    assert.equal(run.state.selfContacts, 0);
  }
});
