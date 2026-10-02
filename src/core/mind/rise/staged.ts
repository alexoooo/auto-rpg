import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import type { BodyView } from "../../body.ts";
import type { BuiltSegment } from "../../build/build-body.ts";
import { bearLimbs, carryRoot, limbMotion, makeBearing } from "../../control/bearing.ts";
import { patchCorners } from "../../control/contact-wrench.ts";
import { uprightness } from "../../control/ground.ts";
import { servoAsk, servoSolve } from "../../control/servo.ts";
import { turnOfToRef, withinSupport } from "../../control/support.ts";
import { atan2 } from "../../math/real.ts";
import { spinBetweenToRef, turnAboutToRef } from "../../math/turn.ts";
import type { OwnBody } from "../mind.ts";
import type { SubMind } from "../sub-mind.ts";
import { riseLimbs } from "./limbs.ts";
import { RISE, stageFaults, stagesOf, type BearStage, type Lie, type PoseStage, type Recipe, type Stage } from "./stages.ts";

/**
 * The pose drive: a freedom is asked the speed that would close its error in `POSE_SECONDS`, no
 * faster than `POSE_SPEED`, rad/s, at full activation (`docs/reference/rising.md#stages`: the two
 * drives read on the stand).
 */
const POSE_SECONDS = 0.2, POSE_SPEED = 3;
/**
 * Lying still: the centre of mass under `SLOW`, m/s, for `STILL_SECONDS`
 * (`docs/reference/rising.md#stages`).
 */
const SLOW = 0.1, STILL_SECONDS = 0.5;
/**
 * How far the pelvis's forward points up, or down, for the body to be on its back, or its front:
 * its y, of 1 (`docs/reference/rising.md#stages`). Between, it is on a side.
 */
const LIE_UP = 0.5;
/**
 * How near its aim the centre of mass is, m, for a bearing stage to be done, once it is slower
 * than `SLOW` (`docs/reference/rising.md#stages`).
 */
const NEAR = 0.05;
/**
 * How near its aim the pelvis's turn is, rad, for a bearing stage to be done
 * (`docs/reference/rising.md#stages`).
 */
const TURNED = 0.15;
/**
 * A limb a stage leaves, while it still bears: its part of the load against the limbs the stage
 * bears on, whose shares sum to 1. Small, so it bears what they cannot
 * (`docs/reference/rising.md#stages`).
 */
const LEFT = 0.01;

const scratch = { turn: new Quaternion(), way: new Vector3() };

/**
 * How a body lies, by its root segment `root`: its forward (the reference pose's +z) against up
 * says back or front, and between them the side its left (the reference pose's -x) is under.
 */
export function lieOf(root: BuiltSegment): Lie {
  const turn = turnOfToRef(root, scratch.turn), way = scratch.way;
  const forward = way.set(0, 0, 1).applyRotationQuaternionToRef(turn, way).y;
  if (forward > LIE_UP) return "back";
  if (forward < -LIE_UP) return "front";
  return way.set(-1, 0, 0).applyRotationQuaternionToRef(turn, way).y < 0 ? "left" : "right";
}

/**
 * **Rising by stages.** It wants the body from the step it is down until it stands or is taken
 * from it. It lies slack until it is still; reads how it lies; if not on its front, plays that
 * lie's roll and lies slack again; on its front, plays the rise. A rise that ends with the body
 * still down, or a bearing stage that runs out of time, is followed by another attempt, from the
 * body as it is, as often as it takes.
 *
 * A pose stage drives every freedom toward its posture for its time. A bearing stage is a step of
 * motor control's shape on the recipe's limbs (`riseLimbs`): the centre of mass asked toward the
 * place over the limbs it bears on, the pelvis toward its pitch, the bearing solve
 * (`src/core/control/bearing.ts`) for the root's acceleration and those limbs' torques, and the
 * servo for the rest of the body toward the stage's posture. A limb bears once it is down, where
 * it is, and until then is the servo's, which brings it down. The place is the middle of where
 * the body is held over the limbs that bear (`RiseLimbs.over`), weighed by their shares, and the
 * same shares weigh how the ground's wrench is split among them, so the load each is asked is
 * the one that holds the body there. A limb the stage leaves bears too, a small part (`LEFT`),
 * until the centre of mass is over the others. The stage is done when every limb it bears on is
 * down, those it leaves are let go, the centre of mass is at the place and slow, and the pelvis
 * is at its pitch. What its patches cannot give it asks of its assist, within the body's ceiling.
 *
 * `view` is its host's, read this step before it is asked (`hosting`): whether the body is down
 * and how its centre of mass moves are the host's readings, so a body its host holds low on
 * purpose is not taken from it. What only a rise needs it reads itself: how it lies, the ground's
 * level, and where its limbs are.
 */
export function stagedRise(own: OwnBody, view: BodyView, recipe: Recipe = RISE): SubMind {
  const faults = stageFaults(recipe, own.spec);
  if (faults.length > 0) throw new Error(`${own.spec.model} cannot play this rise: ${faults.join("; ")}`);
  const muscles = own.muscles, root = muscles.dynamics.root.segment, count = muscles.channels.length;
  const upright = uprightness(own.built), made = riseLimbs(own, recipe);
  /** A stage's goal by channel, from the reference pose, as the muscles read their angles. */
  const goalsOf = new Map<Stage, Float64Array>();
  /**
   * For a bearing stage, by the recipe's limb: whether it bears, and its share; and whether the
   * stage leaves it. `keeps`: it leaves none.
   */
  const bearsOf = new Map<BearStage, { readonly on: readonly boolean[]; readonly share: readonly number[]; readonly leaves: readonly boolean[]; readonly keeps: boolean }>();
  for (const stage of stagesOf(recipe)) {
    const posture = stage.posture;
    goalsOf.set(stage, Float64Array.from(muscles.channels, (channel) => (posture === "reference" ? 0 : (posture[channel.name] ?? 0) - channel.dof.spec.bind.value)));
    if (stage.kind !== "bear") continue;
    const shares = recipe.limbs.map((limb) => stage.on.find((on) => on.limb === limb.name)), leaves = recipe.limbs.map((limb) => stage.leave.includes(limb.name));
    bearsOf.set(stage, { on: shares.map((share) => share !== undefined), share: shares.map((share) => share?.share ?? 0), leaves, keeps: stage.leave.length === 0 });
  }

  const state = {
    /** What it is doing: nothing (the body is not its own, or its rise is over), lying slack, rolling, or rising. */
    phase: "idle" as "idle" | "settle" | "roll" | "rise",
    lie: "front" as Lie,
    /** The stage under way, in the roll or the rise; the time in it, s; how long it has lain still, s. */
    stage: 0, time: 0, still: 0,
    /** How many attempts this fall has had, and the furthest stage of the rise any reached, -1 for none. */
    tries: 0, furthest: -1,
    /** Whether the bearing stage under way has let go the limbs it leaves: the centre of mass has been over the others. */
    lifted: false,
    /**
     * A bearing stage's records, each written by a step before it reads it: each limb's task, the
     * aims and the root's acceleration found for them, what the assist is asked, the freedoms held
     * at a torque, and what of the ground's wrench the patches could not give.
     */
    bear: {
      tasks: made.tasks,
      aim: { spin: new Vector3(), centre: new Vector3(), root: new Float64Array(6) },
      helped: { force: new Vector3(), moment: new Vector3() },
      held: { channels: [] as number[], z0: [] as number[], Z: [] as number[][] },
      shortfall: { force: new Vector3(), moment: new Vector3() },
    },
  };
  const solve = makeBearing(own.assist, made.limbs, { root: state.bear.aim.root, helped: state.bear.helped, held: state.bear.held, shortfall: state.bear.shortfall });
  /** What a bearing step works in: each written by the step before it reads it. */
  const work = {
    place: new Vector3(), target: new Vector3(), across: new Vector3(), spin: new Vector3(), rootSpin: new Vector3(),
    turn: new Quaternion(), yaw: new Quaternion(), pitch: new Quaternion(), moved: new Uint8Array(count),
  };

  const slack = (): void => {
    muscles.activation.fill(0);
    muscles.velocity.fill(0);
  };
  const settle = (): void => {
    state.phase = "settle";
    state.still = 0;
  };
  /** The stages the phase plays. */
  const playing = (phase: "roll" | "rise"): readonly Stage[] => (phase === "rise" ? recipe.rise : state.lie === "front" ? [] : recipe.roll[state.lie]);
  /** Begin stage `index` of `phase`, or what follows its last: after a roll it lies slack and reads again, after the rise it is done. */
  const enter = (phase: "roll" | "rise", index: number): void => {
    if (index >= playing(phase).length) {
      if (phase === "roll") settle();
      else state.phase = "idle";
      return;
    }
    state.phase = phase;
    state.stage = index;
    state.time = 0;
    state.lifted = false;
    if (phase === "rise" && index > state.furthest) state.furthest = index;
  };
  const pose = (stage: PoseStage): void => {
    const goals = goalsOf.get(stage)!;
    for (let i = 0; i < goals.length; i++) {
      muscles.velocity[i] = Math.max(-POSE_SPEED, Math.min(POSE_SPEED, (goals[i]! - muscles.angle(i)) / POSE_SECONDS));
      muscles.activation[i] = 1;
    }
  };
  /** A step of `stage`; whether its limbs are down, those it leaves let go, the centre of mass at its aim and slow, and the pelvis turned to its. */
  const bear = (stage: BearStage, dt: number): boolean => {
    const { aim } = state.bear, { place, target, across, spin, rootSpin, turn, yaw, pitch, moved } = work;
    const n = 1 / stage.seconds, goals = goalsOf.get(stage)!, { on, share, leaves, keeps } = bearsOf.get(stage)!;
    const ground = upright.lowest(), standing = upright.standing;
    // The way the pelvis faces, about up: its left-to-right axis says it however far forward it is pitched.
    across.set(1, 0, 0).applyRotationQuaternionToRef(turnOfToRef(root, turn), across);
    turnAboutToRef(Vector3.UpReadOnly, atan2(-across.z, across.x), yaw);
    // The limbs: those the stage names bear where they are once they are down, and are the
    // servo's until then; the place is the middle of where the body is held over those that
    // bear, by their shares, and with none down, where the centre of mass is.
    const c = view.stance.centre, v = view.stance.velocity;
    made.read(ground);
    place.setAll(0);
    let borne = 0, down = true;
    made.over.forEach((over, l) => {
      if (!on[l]) return;
      if (!made.bear(l, goals, n, ground, share[l]!)) { down = false; return; }
      place.addInPlaceFromFloats(share[l]! * over.x, 0, share[l]! * over.z);
      borne += share[l]!;
    });
    if (borne > 0) place.scaleInPlace(1 / borne);
    else place.set(c.x, 0, c.z);
    // Those it leaves bear where they are, while they are down, until the centre of mass is over
    // the others (within the outline of where they bear, drawn in as a stance's is); the rest
    // are the servo's.
    if (!state.lifted && borne > 0) {
      const [x, z] = withinSupport(made.limbs.filter((limb, l) => on[l] && limb.task.on).map((limb) => ({ corners: patchCorners(limb.work.patch!) })), c.x, c.z);
      state.lifted = x === c.x && z === c.z;
    }
    made.limbs.forEach((_, l) => {
      if (!on[l] && !(leaves[l] && !state.lifted && made.bear(l, goals, n, ground, LEFT))) made.rest(l);
    });
    // The centre of mass: toward the place, at the stage's height over the ground if it has one, critically damped.
    target.set(place.x, stage.height === null ? c.y : ground + stage.height * standing, place.z);
    aim.centre.set(n * n * (target.x - c.x) - 2 * n * v.x, n * n * (target.y - c.y) - 2 * n * v.y, n * n * (target.z - c.z) - 2 * n * v.z);
    // The pelvis: toward its reference turn pitched forward, then turned about up to the way it faces now.
    turnAboutToRef(across.set(1, 0, 0), stage.pitch, pitch);
    yaw.multiplyToRef(pitch, turn).multiplyInPlace(root.rest);
    spinBetweenToRef(root.node.rotationQuaternion!, turn, stage.seconds, spin);
    root.body.angularVelocityToRef(rootSpin);
    aim.spin.copyFrom(spin).scaleInPlace(n).subtractInPlace(rootSpin.scaleInPlace(2 * n));
    // Motor control's order: the servo's asks, the root's acceleration, the servo's solve around
    // the limbs' motion, and the limbs' torques. Every freedom is asked toward the posture: a
    // bearing limb's are then the solve's, and its stem moves as the servo asked.
    const asked = servoAsk(muscles, (i) => goals[i], stage.seconds, dt);
    // A moment the patches miss is weighed as a force missed at the root's height over the ground.
    const lever = muscles.dynamics.root.centre[1] - ground;
    const carried = carryRoot(solve, muscles, asked, aim, lever);
    limbMotion(solve, asked, moved);
    servoSolve(muscles, asked, carried, moved);
    bearLimbs(solve, muscles, asked, lever, true);
    const dx = target.x - c.x, dy = target.y - c.y, dz = target.z - c.z;
    // `spin` closes the pelvis's turn in the stage's time constant: the turn left is the two's product.
    const turned = (spin.x * spin.x + spin.y * spin.y + spin.z * spin.z) * stage.seconds * stage.seconds < TURNED * TURNED;
    return down && (keeps || state.lifted) && turned && v.x * v.x + v.y * v.y + v.z * v.z < SLOW * SLOW && dx * dx + dy * dy + dz * dz < NEAR * NEAR;
  };

  return {
    name: "staged-rise", state,
    wants: () => state.phase !== "idle" || view.down,
    begin() {
      settle();
      state.tries = 0;
      state.furthest = -1;
    },
    end() { state.phase = "idle"; },
    step(_senses, dt) {
      switch (state.phase) {
        case "idle":
          // Its rise is over and the body is still down: it lies slack and begins another.
          settle();
          slack();
          return;
        case "settle": {
          slack();
          const v = view.stance.velocity;
          state.still = v.x * v.x + v.y * v.y + v.z * v.z < SLOW * SLOW ? state.still + dt : 0;
          if (state.still + dt / 2 < STILL_SECONDS) return;
          state.lie = lieOf(root);
          state.tries++;
          enter(state.lie === "front" ? "rise" : "roll", 0);
          return;
        }
        case "roll":
        case "rise": {
          const stage = playing(state.phase)[state.stage]!;
          // A time summed from steps falls a rounding short of a whole number of them: to the nearest step.
          switch (stage.kind) {
            case "pose":
              pose(stage);
              state.time += dt;
              if (state.time + dt / 2 >= stage.seconds) enter(state.phase, state.stage + 1);
              return;
            case "bear": {
              const there = bear(stage, dt);
              state.time += dt;
              if (there) enter(state.phase, state.stage + 1);
              else if (state.time + dt / 2 >= stage.limit) settle();
              return;
            }
            default: return unknownStage(stage);
          }
        }
        default: unknownPhase(state.phase);
      }
    },
  };
}

function unknownPhase(phase: never): never {
  throw new Error(`no phase ${JSON.stringify(phase)}`);
}

function unknownStage(stage: never): never {
  throw new Error(`a stage of no known kind: ${JSON.stringify(stage)}`);
}
