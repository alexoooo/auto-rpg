import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../../body.ts";
import { motorControl } from "../../control/motor.ts";
import { turnOfToRef } from "../../control/support.ts";
import { atan2 } from "../../math/real.ts";
import { guardPosture } from "../../skills/guard.ts";
import { deepFreeze } from "../../state.ts";
import type { HumanoidModel } from "../../human/spec.ts";
import type { World } from "../../world.ts";
import type { OwnBody } from "../mind.ts";
import { stagedRise } from "../rise/staged.ts";
import { RISE, type BearStage, type Recipe, type Stage } from "../rise/stages.ts";
import { standReady, type GroundReading, type Position } from "./reading.ts";
import { REACHED_SECONDS, type TechniqueEnd, type TechniqueRun } from "./techniques.ts";

/** How one of the recipe's stages is played: its time scaled, and a bearing stage's completion. */
interface StageTiming { readonly scale: number; readonly progress?: NonNullable<BearStage["progress"]> }
/**
 * **Step up's settings**, searched (`research/rising-step-search.mjs`): how still a body lies
 * before it reads its lie, the stance's climb from where the rise leaves the body to standing
 * height, s, and each of the recipe's stages by name, a roll's stages as `roll <name>`.
 */
interface StepUpTuning {
  readonly settle: { readonly speed: number; readonly seconds: number };
  readonly climb: number;
  readonly stages: Readonly<Record<string, StageTiming>>;
}

/**
 * Each humanoid's settings, searched on its own target falls (`research/rising-step-search.mjs`,
 * Node stand, Rapier, 120 Hz, Balance 0): eight shove directions offset from the target's, empty
 * and with the club, a fall's score its verified standing and how soon.
 */
export const STEP_UP: Readonly<Record<HumanoidModel, StepUpTuning>> = deepFreeze({
  "workshop-fighter": {
    settle: { speed: .2495, seconds: .0603 }, climb: 1.758,
    stages: {
      "roll wind": { scale: .3323 },
      "roll swing": { scale: 1.084 },
      "roll over": { scale: 1.975 },
      "roll flat": { scale: .5676 },
      "fold": { scale: .1309 },
      "tuck": { scale: .2166 },
      "prop": { scale: .143 },
      "fours": { scale: .4994, progress: { speed: .5301, near: .03691, turn: .5004 } },
      "sit": { scale: 1.626 },
      "kneel 0": { scale: 1.169 },
      "kneel 1": { scale: 1.101 },
      "kneel 2": { scale: .1375 },
      "arms": { scale: .3775 },
      "hold": { scale: .1186 },
      "tall 0": { scale: .1333 },
      "tall 1": { scale: .735 },
      "tall 2": { scale: .1935 },
      "tall": { scale: .1826 },
      "shift": { scale: .5234 },
      "lift": { scale: .1651 },
      "swing": { scale: 1.008 },
      "reach": { scale: .2925 },
      "half kneel": { scale: .4654, progress: { speed: .2103, near: .2036, turn: .1325 } },
      "onto the toes": { scale: .7794, progress: { speed: .2332, near: .06534, turn: .1148 } },
      "lunge 0": { scale: .7703, progress: { speed: .2698, near: .1402, turn: .1132 } },
      "lunge 1": { scale: 1.269, progress: { speed: .3084, near: .05577, turn: .1049 } },
      "lunge 2": { scale: .7541, progress: { speed: .8, near: .1939, turn: .08 } },
      "lunge 3": { scale: 1.047, progress: { speed: .1085, near: .2359, turn: .2365 } },
      "even": { scale: .5602, progress: { speed: .2151, near: .1071, turn: .1096 } },
    },
  },
  "workshop-rogue": {
    settle: { speed: .0569, seconds: .07164 }, climb: 1.771,
    stages: {
      "roll wind": { scale: 1.393 },
      "roll swing": { scale: 1.13 },
      "roll over": { scale: .8196 },
      "roll flat": { scale: 1.481 },
      "fold": { scale: .516 },
      "tuck": { scale: .5347 },
      "prop": { scale: 1.213 },
      "fours": { scale: .5834, progress: { speed: .05774, near: .05814, turn: .3941 } },
      "sit": { scale: .2993 },
      "kneel 0": { scale: 1.671 },
      "kneel 1": { scale: .8611 },
      "kneel 2": { scale: .2118 },
      "arms": { scale: 1.754 },
      "hold": { scale: .2412 },
      "tall 0": { scale: .1628 },
      "tall 1": { scale: .2473 },
      "tall 2": { scale: .2697 },
      "tall": { scale: .3216 },
      "shift": { scale: .5837 },
      "lift": { scale: .2835 },
      "swing": { scale: .6596 },
      "reach": { scale: .4561 },
      "half kneel": { scale: 1.266, progress: { speed: .1709, near: .1957, turn: .1131 } },
      "onto the toes": { scale: .834, progress: { speed: .1948, near: .04959, turn: .177 } },
      "lunge 0": { scale: .8194, progress: { speed: .1428, near: .04741, turn: .1445 } },
      "lunge 1": { scale: .6428, progress: { speed: .3647, near: .1036, turn: .1079 } },
      "lunge 2": { scale: .7356, progress: { speed: .1432, near: .08546, turn: .0883 } },
      "lunge 3": { scale: .8873, progress: { speed: .1451, near: .25, turn: .107 } },
      "even": { scale: .4, progress: { speed: .1005, near: .06566, turn: .1426 } },
    },
  },
  "crypt-skeleton": {
    settle: { speed: .1881, seconds: .05626 }, climb: 1.82,
    stages: {
      "roll wind": { scale: 2 },
      "roll swing": { scale: 1.694 },
      "roll over": { scale: 2 },
      "roll flat": { scale: .7876 },
      "fold": { scale: .2594 },
      "tuck": { scale: .1618 },
      "prop": { scale: .6194 },
      "fours": { scale: .5009, progress: { speed: .6359, near: .1422, turn: .2654 } },
      "sit": { scale: 1.447 },
      "kneel 0": { scale: .8964 },
      "kneel 1": { scale: .3324 },
      "kneel 2": { scale: .2436 },
      "arms": { scale: .1 },
      "hold": { scale: .2277 },
      "tall 0": { scale: .1728 },
      "tall 1": { scale: 1.138 },
      "tall 2": { scale: .1523 },
      "tall": { scale: .1462 },
      "shift": { scale: .4499 },
      "lift": { scale: .1713 },
      "swing": { scale: .5783 },
      "reach": { scale: .166 },
      "half kneel": { scale: .4378, progress: { speed: .7257, near: .1478, turn: .1643 } },
      "onto the toes": { scale: .6301, progress: { speed: .5705, near: .09171, turn: .135 } },
      "lunge 0": { scale: .648, progress: { speed: .4866, near: .06807, turn: .1505 } },
      "lunge 1": { scale: 1.672, progress: { speed: .1627, near: .03906, turn: .1152 } },
      "lunge 2": { scale: .4692, progress: { speed: .3038, near: .1747, turn: .09124 } },
      "lunge 3": { scale: .4, progress: { speed: .1609, near: .25, turn: .1354 } },
      "even": { scale: .6327, progress: { speed: .05685, near: .0998, turn: .1247 } },
    },
  },
});

/** RISE, its stages played as `tuning` says. */
export function stepUpRecipe(tuning: StepUpTuning): Recipe {
  const timed = (prefix: string) => <S extends Stage>(stage: S): S => {
    const timing = tuning.stages[`${prefix}${stage.name}`];
    if (!timing) return stage;
    return stage.kind === "bear" ? { ...stage, seconds: stage.seconds * timing.scale, ...(timing.progress ? { progress: timing.progress } : {}) }
      : { ...stage, seconds: stage.seconds * timing.scale };
  };
  return deepFreeze({ ...RISE, progress: { settleSpeed: tuning.settle.speed, settleSeconds: tuning.settle.seconds },
    roll: { back: RISE.roll.back.map(timed("roll ")), left: RISE.roll.left.map(timed("roll ")), right: RISE.roll.right.map(timed("roll ")) },
    rise: RISE.rise.map(timed("")) });
}

/** Where the rise may be joined part-way, by the position the body is read in, and the stage it joins at. */
const JOINS = { fours: "fours", "half-kneel": "half kneel" } as const;
/** The longest a whole attempt may take, s, and the stance's steadying after it. */
const LIMIT = 16, STEADY_LIMIT = 3;
/** Under this height, m, a body on its back is lying on it. */
const LOW = .5;
/** How long a body read between positions waits for its reading to settle before taking the whole route, s. */
const JOIN_WAIT = .25;
/** How long the steadying stance may be read off its two feet, s (a foot unloaded as the body sways), before the attempt has failed. */
const STEADY_OFF = .3;
type Entry = "whole" | keyof typeof JOINS;
type Phase = "rise" | "steady";

/**
 * **Step up**: the staged recipe's route, its stages searched for speed. It lies still and reads its
 * lie, rolls onto its front, comes up onto hands and knees, kneels up, steps the left foot through
 * and lunges up onto both feet; then the stance climbs to standing height and steadies. A body read
 * on its hands and knees, or half kneeling, joins the route there when its supports bear. An
 * attempt the rise gives up, or one that falls from the stance, fails back to the supervisor.
 */
export function stepUp(own: OwnBody, view: BodyView, _world: World, tuning: StepUpTuning = STEP_UP[own.spec.model as HumanoidModel]): TechniqueRun {
  const whole = stepUpRecipe(tuning), from = (stage: string): Recipe => ({ ...whole, rise: whole.rise.slice(whole.rise.findIndex(s => s.name === stage)) });
  const rises = { whole: stagedRise(own, view, whole), fours: stagedRise(own, view, from(JOINS.fours)), "half-kneel": stagedRise(own, view, from(JOINS["half-kneel"])) };
  const motor = motorControl(own.built, .1, guardPosture(own.spec));
  const state = { phase: "rise" as Phase, entry: "whole" as Entry, begun: false, rose: false, ended: null as TechniqueEnd | null,
    elapsed: 0, steady: 0, off: 0, reached: 0, height: 0, heading: 0,
    rises: { whole: rises.whole.state, fours: rises.fours.state, "half-kneel": rises["half-kneel"].state }, motor: motor.state };
  const work = { turn: new Quaternion(), across: new Vector3() };
  const finish = (end: TechniqueEnd) => { state.ended = end; return end; };
  const reached = (g: GroundReading, to: Position) => to === "standing" && standReady({ down: view.down, ground: g });
  const join = (g: GroundReading): void => {
    const position = g.position;
    if (position === "fours" || position === "half-kneel") {
      try { rises[position].beginSupported(); state.entry = position; return; } catch { /* its supports do not all bear: the whole route */ }
    }
    rises.whole.begin(); state.entry = "whole";
  };
  return {
    state, get phase() { return state.phase === "steady" ? "steady" : `${rises[state.entry].state.phase}`; },
    get yields() { return state.ended !== null || state.phase === "steady" || rises[state.entry].state.phase === "settle"; },
    admits(g, side) { return side === "left" && g.spin < 8 && g.velocity.lengthSquared() < 9 && g.position !== "standing" && g.position !== "crouch"; },
    reached,
    begin() { state.phase = "rise"; state.entry = "whole"; state.begun = false; state.rose = false; state.ended = null; state.elapsed = 0; state.steady = 0; state.reached = 0; motor.reset(); },
    end() { if (state.ended === null) { rises[state.entry].end(); finish("interrupted"); } },
    step(g, senses, dt) {
      if (state.ended !== null) return state.ended;
      state.elapsed += dt;
      if (!state.begun) {
        if (g.position === "between" && state.elapsed < JOIN_WAIT) return null;
        join(g); state.begun = true;
      }
      const rise = rises[state.entry];
      if (state.phase === "rise") {
        // The rise lies slack again once an attempt has failed; after a roll it lies slack too, and goes on.
        if (rise.state.phase === "rise") state.rose = true;
        else if (state.rose && rise.state.phase === "settle") { rise.end(); return finish("failed"); }
        // The rise is from the front: a body that has turned onto its back has failed it.
        if (rise.state.phase === "rise" && g.lie === "back" && g.height < LOW) { rise.end(); return finish("failed"); }
        if (state.elapsed > LIMIT) { rise.end(); return finish("timed-out"); }
        if (rise.state.phase !== "idle") { rise.step(senses, dt); return null; }
        // The rise is over: the stance takes the body from the height it was left at.
        turnOfToRef(own.built.segments.get("lowerTrunk")!, work.turn);
        work.across.set(1, 0, 0).applyRotationQuaternionToRef(work.turn, work.across);
        state.heading = atan2(-work.across.z, work.across.x);
        motor.reset(); motor.stance.read();
        const soles = motor.stance.reading.soles;
        state.height = g.centre.y - Math.min(soles.left.y, soles.right.y);
        state.phase = "steady"; state.steady = 0; state.off = 0;
      }
      state.steady += dt;
      state.off = g.position !== "standing" && g.position !== "crouch" ? state.off + dt : 0;
      if (state.off > STEADY_OFF && state.steady > .5) return finish("failed");
      if (state.steady > STEADY_LIMIT) return finish("timed-out");
      const w = Math.min(1, state.steady / tuning.climb), smooth = w * w * (3 - 2 * w), top = view.standing - .03;
      motor.stance.read();
      motor.setStance({ feet: ["left", "right"], centre: null, height: state.height + (top - state.height) * smooth, heading: state.heading });
      motor.control(own.muscles, dt);
      state.reached = reached(g, "standing") ? state.reached + dt : 0;
      return state.reached + 1e-9 >= REACHED_SECONDS ? finish("done") : null;
    },
  };
}
