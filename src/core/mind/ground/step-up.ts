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
    settle: { speed: .372, seconds: .05337 }, climb: .614,
    stages: {
      "roll wind": { scale: .1809 },
      "roll swing": { scale: .8712 },
      "roll over": { scale: 1.107 },
      "roll flat": { scale: .8898 },
      "fold": { scale: .2467 },
      "tuck": { scale: .2144 },
      "prop": { scale: .1271 },
      "fours": { scale: .5909, progress: { speed: .17, near: .05486, turn: .531 } },
      "sit": { scale: 1.492 },
      "kneel 0": { scale: .7367 },
      "kneel 1": { scale: 1.392 },
      "kneel 2": { scale: .16 },
      "arms": { scale: .2216 },
      "hold": { scale: .1655 },
      "tall 0": { scale: .22 },
      "tall 1": { scale: .983 },
      "tall 2": { scale: .1726 },
      "tall": { scale: .2026 },
      "shift": { scale: .5538 },
      "lift": { scale: .408 },
      "swing": { scale: .8013 },
      "reach": { scale: .3797 },
      "half kneel": { scale: 1.191, progress: { speed: .2234, near: .161, turn: .2199 } },
      "onto the toes": { scale: .9522, progress: { speed: .3333, near: .05398, turn: .1675 } },
      "lunge 0": { scale: .867, progress: { speed: .5266, near: .1677, turn: .1118 } },
      "lunge 1": { scale: .8092, progress: { speed: .2455, near: .08638, turn: .1486 } },
      "lunge 2": { scale: .8463, progress: { speed: .4328, near: .2012, turn: .1099 } },
      "lunge 3": { scale: .4512, progress: { speed: .1212, near: .2286, turn: .13 } },
      "even": { scale: .497, progress: { speed: .612, near: .08728, turn: .1333 } },
    },
  },
  "workshop-rogue": {
    settle: { speed: .06004, seconds: .05 }, climb: 1.159,
    stages: {
      "roll wind": { scale: .923 },
      "roll swing": { scale: 1.605 },
      "roll over": { scale: .9005 },
      "roll flat": { scale: 1.514 },
      "fold": { scale: .1159 },
      "tuck": { scale: .3375 },
      "prop": { scale: 1 },
      "fours": { scale: .4367, progress: { speed: .07216, near: .05769, turn: .4826 } },
      "sit": { scale: .3438 },
      "kneel 0": { scale: 1.384 },
      "kneel 1": { scale: 1.973 },
      "kneel 2": { scale: .1985 },
      "arms": { scale: .8101 },
      "hold": { scale: .2351 },
      "tall 0": { scale: .245 },
      "tall 1": { scale: .2293 },
      "tall 2": { scale: .1909 },
      "tall": { scale: .2909 },
      "shift": { scale: .458 },
      "lift": { scale: .3509 },
      "swing": { scale: .8147 },
      "reach": { scale: .1908 },
      "half kneel": { scale: 1.072, progress: { speed: .417, near: .1917, turn: .09824 } },
      "onto the toes": { scale: .7601, progress: { speed: .1586, near: .03883, turn: .1178 } },
      "lunge 0": { scale: .6562, progress: { speed: .6775, near: .1093, turn: .2658 } },
      "lunge 1": { scale: .7861, progress: { speed: .3806, near: .06896, turn: .1322 } },
      "lunge 2": { scale: .479, progress: { speed: .2848, near: .1259, turn: .08817 } },
      "lunge 3": { scale: .8628, progress: { speed: .177, near: .2051, turn: .1741 } },
      "even": { scale: .7697, progress: { speed: .1495, near: .08575, turn: .1282 } },
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
