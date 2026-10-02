import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import type { BodyView } from "../../body.ts";
import type { BuiltSegment } from "../../build/build-body.ts";
import { turnOfToRef } from "../../control/support.ts";
import type { OwnBody } from "../mind.ts";
import type { SubMind } from "../sub-mind.ts";
import { RISE, stageFaults, stagesOf, type Lie, type PoseStage, type Recipe, type Stage } from "./stages.ts";

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
 * still down is followed by another, from the body as it is, as often as it takes.
 *
 * `view` is its host's, read this step before it is asked (`hosting`): whether the body is down
 * and how its centre of mass moves are the host's readings, so a body its host holds low on
 * purpose is not taken from it. What only a rise needs it reads itself: how it lies. It asks its
 * assist nothing, so the assist gives nothing.
 */
export function stagedRise(own: OwnBody, view: BodyView, recipe: Recipe = RISE): SubMind {
  const faults = stageFaults(recipe, own.spec);
  if (faults.length > 0) throw new Error(`${own.spec.model} cannot play this rise: ${faults.join("; ")}`);
  const muscles = own.muscles, root = muscles.dynamics.root.segment;
  /** A pose stage's goal by channel, from the reference pose, as the muscles read their angles. */
  const goalsOf = new Map<PoseStage, Float64Array>();
  for (const stage of stagesOf(recipe)) {
    goalsOf.set(stage, Float64Array.from(muscles.channels, (channel) => (stage.posture[channel.name] ?? 0) - channel.dof.spec.bind.value));
  }

  const state = {
    /** What it is doing: nothing (the body is not its own, or its rise is over), lying slack, rolling, or rising. */
    phase: "idle" as "idle" | "settle" | "roll" | "rise",
    lie: "front" as Lie,
    /** The stage under way, in the roll or the rise; the time in it, s; how long it has lain still, s. */
    stage: 0, time: 0, still: 0,
    /** How many attempts this fall has had, and the furthest stage of the rise any reached, -1 for none. */
    tries: 0, furthest: -1,
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
    if (phase === "rise" && index > state.furthest) state.furthest = index;
  };
  const pose = (stage: PoseStage): void => {
    const goals = goalsOf.get(stage)!;
    for (let i = 0; i < goals.length; i++) {
      muscles.velocity[i] = Math.max(-POSE_SPEED, Math.min(POSE_SPEED, (goals[i]! - muscles.angle(i)) / POSE_SECONDS));
      muscles.activation[i] = 1;
    }
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
          pose(stage);
          state.time += dt;
          // To the nearest step: a time summed from steps falls a rounding short of a whole number of them.
          if (state.time + dt / 2 >= stage.seconds) enter(state.phase, state.stage + 1);
          return;
        }
        default: unknownPhase(state.phase);
      }
    },
  };
}

function unknownPhase(phase: never): never {
  throw new Error(`no phase ${JSON.stringify(phase)}`);
}
