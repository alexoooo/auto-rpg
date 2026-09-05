import assert from "node:assert/strict";
import test from "node:test";

import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsMotionType, PhysicsShapeType } from
  "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";

import { CONFIG } from "../src/config.ts";
import { BENCH_STAND_LOCOMOTION, LOCOMOTION_BIPED } from "../src/golem/config.ts";
import { locomotionCommand } from "../src/golem/locomotion.ts";
import { bipedModule, bipedPose, bipedStandHeight } from "../src/golem/locomotion/biped.ts";
import { LOCOMOTION_COURSE } from "../src/golem/locomotion/course.ts";
import { golemModule } from "../src/golem/registry.ts";
import { buildGolemStand, golemLayers } from "../src/golem/stand.ts";
import { COLLIDES, LAYER } from "../src/physics.ts";
import { resolvePhysicalSupportedPair } from "../src/supported-locomotion-production.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { SUPPORTED_CARRIER_V1 } from "../src/supported-locomotion-runtime.ts";
import { SUPPORTED_LOCOMOTION_V1, constructPostureIsSupported } from
  "../src/supported-locomotion-state.ts";
import { LOCOMOTION_SEQUENCE, WALK_SEQUENCE, runGolemLocomotion } from "../scripts/golem-bench.mjs";
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
