import type { Body, BodyView } from "../../../control/body.ts";
import type { BearingEnd } from "../../../core/bodies/spec/body.ts";
import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import { soleRefusal } from "../../../control/support.ts";
import { deepFreeze } from "../../../core/state.ts";
import { cos, sin } from "../../../core/math/real.ts";
import { wrap } from "../../../core/math/turn.ts";
import type { Gait, GaitPart, Locomotion } from "../../framework/locomotion-part.ts";
import { varied, type Varied } from "../../framework/variations.ts";
import type { LegsAsked } from "../../framework/skill.ts";
import { STAGGERED, validCarriage, type Carriage } from "../shared/locomotion.ts";
import { stanceWalk } from "../shared/stance-walk.ts";

/** How far behind the rear sole's middle the back step asks the centre, m: past where the stance holds it (within its support), so it goes as far back as the stance lets it. */
const BEYOND = .1;

/** How long the back step holds the body back, and takes to bring it back over the middle of its feet, s, unless its config says. */
const SWAY = deepFreeze({ out: .7, back: .5 });

/** A foot's step: its time, s, and lift, m; the most it is waited for, s, before the back step goes on without it; how fast the centre comes in before the step in lifts, m/s; the walk forward a follow steps on, m/s. */
const STEP = deepFreeze({ seconds: .3, lift: .05, most: 1, coming: .05, asked: .05 });

/**
 * **The back step's config**: the carriage it stands in (`Carriage`), which should be the one the
 * body's other gaits hold, so that taking it up places no foot; the square stance where none. Its
 * sway's times, s (`SWAY`).
 */
interface BackStepConfig extends Varied {
  readonly kind: "back-step";
  readonly carriage?: Carriage;
  readonly out?: number;
  readonly back?: number;
  /** How far the lead foot steps in once the body is back, m, and the centre is brought in past where it began; none where it only sways. */
  readonly stepIn?: number;
  /**
   * How far each foot steps, m, once the sway is over: asked a walk forward, it steps the lead foot
   * in and then the rear foot up, one at a time (`STEP`), with no walk's start; asked none, it
   * stands its feet where they are. The walk where none.
   */
  readonly follow?: number;
  /**
   * How fast the legs turn toward the face asked while it sways, rad/s: the stance walk turns only
   * while it walks, and a sway asks no walk, so without it the body ends a sway facing as it began
   * however the line to its foe swung. Its heading is the walk's from the sway's end, the walk
   * standing the carriage's feet about it. None where it holds the heading it began with.
   */
  readonly turn?: number;
}

/** One foot's step under way: the foot, the one it bears on, where it goes (world x, z, m), whether it has lifted, and how long it has gone, s. */
interface FootStep { readonly foot: BearingEnd; readonly bearing: BearingEnd; readonly to: readonly [number, number]; lifted: boolean; seconds: number }

/** The stance's ends from the furthest ahead along `heading` to the furthest back, with how far ahead each is, m. */
function endsAlong(view: BodyView, heading: number) {
  const fx = sin(heading), fz = cos(heading);
  return Object.entries(view.stance.ends).map(([name, end]) => ({ name: name as BearingEnd, middle: end.middle, along: end.middle.x * fx + end.middle.z * fz }))
    .sort((a, b) => b.along - a.along);
}

/** Whether the stance stands on both feet, taking no step. */
const squared = (view: BodyView): boolean => { const s = view.stance; return s.phase === "stand" && !s.own && Object.values(s.ends).every((end) => end.touching); };

/** `goal` as the legs goal that swings `step`'s foot to its place, bearing on the other, with no walk. */
const stepping = (goal: LegsAsked, step: FootStep): LegsAsked =>
  ({ ...goal, walk: null, feet: [step.bearing], centre: null, swing: { foot: step.foot, to: step.to, seconds: STEP.seconds, lift: STEP.lift } });

/** Whether `step` is over, `dt` s on: landed once lifted, or gone longer than `STEP.most`. */
function stepOver(step: FootStep, view: BodyView, dt: number): boolean {
  if (view.stance.phase === "swing") step.lifted = true;
  step.seconds += dt;
  return step.lifted && view.stance.phase === "stand" || step.seconds > STEP.most;
}

/**
 * **The back step**: a gait that sways the body back over its rear foot, the walk in the stance
 * (`stanceWalk`) in the same carriage but for one field of the legs goal. Each time the legs take
 * it up (`Locomotion.resume`, as Move changes to it), once the stance stands on both feet taking no
 * step (`squared`), it asks the stance's centre (`LegsGoal.centre`) `BEYOND` behind the sole
 * further back along its heading for `out` s, and then where the centre began for `back` s, with no
 * walk and no step: the stance carries the whole body back over that foot, the head and trunk with
 * the centre, and in again; with a `stepIn`, once the body comes forward again, the lead foot steps
 * that far in (`STEP`) and the centre is brought in as far past where it began. Then it follows
 * (`follow`), or is the walk. It ends with the centre where it began, since a walk taken up stands
 * its carriage's feet about the centre (`footingOf`) and, taken up with the body back, steps them
 * there. From a square stand there is no foot behind to sway over. A goal that sets the footing
 * itself is another skill's (a stomp's), and goes to the walk as asked.
 */
function backStep(body: Body, config: BackStepConfig): Locomotion {
  const walk = stanceWalk(body, { carriage: config.carriage });
  const out = config.out ?? SWAY.out, back = config.back ?? SWAY.back, stepIn = config.stepIn ?? 0, stagger = config.carriage?.stagger ?? 0;
  /** Where the centre is asked out and back, world (x, z), m, and how long since the sway began, s; whether it waits for the stance to stand square; its step in and its follow's step under way; the heading it has turned to. */
  const state = { aim: null as readonly [number, number] | null, from: null as readonly [number, number] | null, seconds: 0, armed: false, walk: walk.state,
    step: null as FootStep | null, stepped: false, waited: 0, follow: null as FootStep | null, facing: null as number | null };
  /** `goal` asked of the walk while it sways, facing the heading it has turned to (`BackStepConfig.turn`); itself where it turns none. */
  const swaying = (goal: LegsAsked, dt: number): LegsAsked => {
    if (!config.turn) return goal;
    const was = state.facing ?? walk.heading, rate = config.turn * dt;
    state.facing = was + Math.max(-rate, Math.min(rate, wrap(goal.face - was)));
    return { ...goal, heading: state.facing };
  };
  /** The follow's legs goal, steps of `length` m (`BackStepConfig.follow`): the step under way, else the next where a walk forward is asked and the stance stands, else a stand where the feet are. */
  const following = (view: BodyView, goal: LegsAsked, dt: number, length: number) => {
    const going = state.follow;
    if (going) {
      if (!stepOver(going, view, dt)) return walk.goal(view, stepping(goal, going), dt);
      state.follow = null;
    }
    if ((goal.walk?.[0] ?? 0) > STEP.asked && squared(view)) {
      const h = walk.heading, ends = endsAlong(view, h), lead = ends[0]!, rear = ends[ends.length - 1]!;
      const [moving, bearing] = lead.along - rear.along < stagger + length / 2 ? [lead, rear] : [rear, lead];
      state.follow = { foot: moving.name, bearing: bearing.name, to: [moving.middle.x + length * sin(h), moving.middle.z + length * cos(h)], lifted: false, seconds: 0 };
      return walk.goal(view, stepping(goal, state.follow), dt);
    }
    // Standing where the follow left the feet: the walk's own footing would step them back into the carriage.
    const footing = Object.fromEntries(Object.entries(view.stance.ends).map(([name, end]) => [name, [end.middle.x, end.middle.z]])) as Record<BearingEnd, readonly [number, number]>;
    return walk.goal(view, { ...goal, walk: null, footing }, dt);
  };
  /**
   * The step in's legs goal once the body is back (`BackStepConfig.stepIn`): the centre brought in
   * until the body comes forward (at most `STEP.most`), then the lead foot's step; null once it has
   * stepped, or where it steps none.
   */
  const steppingIn = (view: BodyView, goal: LegsAsked, dt: number): LegsAsked | null => {
    if (!(stepIn > 0) || state.seconds < out || state.stepped) return null;
    const h = walk.heading, fx = sin(h), fz = cos(h);
    if (!state.step && view.stance.velocity.x * fx + view.stance.velocity.z * fz < STEP.coming) {
      state.waited += dt;
      if (state.waited < STEP.most) return swaying({ ...goal, walk: null, swing: null, centre: [state.from![0] + stepIn * fx, state.from![1] + stepIn * fz] }, dt);
      state.stepped = true;
      return null;
    }
    if (!state.step) {
      const ends = endsAlong(view, h), lead = ends[0]!, rear = ends[ends.length - 1]!;
      state.step = { foot: lead.name, bearing: rear.name, to: [lead.middle.x + stepIn * fx, lead.middle.z + stepIn * fz], lifted: false, seconds: 0 };
      state.from = [state.from![0] + stepIn * fx, state.from![1] + stepIn * fz];
    }
    if (stepOver(state.step, view, dt)) { state.stepped = true; return null; }
    return swaying(stepping(goal, state.step), dt);
  };
  /** The back step's legs goal. */
  const legsGoal = (view: BodyView, goal: LegsAsked, dt: number) => {
    // A skill that sets the footing itself (the bearing feet, a root pose or a step) holds the legs: its goal goes to the walk as asked.
    if (goal.feet !== undefined || goal.pose !== undefined || goal.swing !== undefined) return walk.goal(view, goal, dt);
    const over = state.aim !== null && state.seconds >= out + back;
    // The sway over, the walk takes up the heading it turned to.
    if (state.facing !== null && over) { const facing = state.facing; state.facing = null; walk.resume(view, facing); }
    if (state.armed && squared(view)) {
      state.armed = false;
      const rear = endsAlong(view, walk.heading).at(-1)!.middle, h = walk.heading;
      state.aim = [rear.x - BEYOND * sin(h), rear.z - BEYOND * cos(h)]; state.from = [view.stance.centre.x, view.stance.centre.z];
    }
    if (state.armed) return walk.goal(view, { ...goal, walk: null }, dt);
    if (over && config.follow) return following(view, goal, dt, config.follow);
    if (!state.aim || over) return walk.goal(view, goal, dt);
    const stepped = steppingIn(view, goal, dt);
    if (stepped) return walk.goal(view, stepped, dt);
    const centre = state.seconds < out ? state.aim : state.from!;
    state.seconds += dt;
    return walk.goal(view, swaying({ ...goal, walk: null, swing: null, centre }, dt), dt);
  };
  return {
    state,
    supports: walk.supports,
    get lower() { return walk.lower; },
    get envelope() { return walk.envelope; },
    get stops() { return walk.stops; },
    // While it turns in a sway, the heading it has turned to: what a strike's window reads.
    get heading() { return state.facing ?? walk.heading; },
    get pace() { return walk.pace; },
    get reference() { return walk.reference; },
    get placed() { return walk.placed; },
    get unmet() { return walk.unmet; },
    resume(view: BodyView, heading?: number) {
      walk.resume(view, heading);
      state.armed = true; state.aim = null; state.from = null; state.seconds = 0; state.step = null; state.stepped = false; state.waited = 0; state.follow = null; state.facing = null;
    },
    goal: legsGoal,
    ...(walk.arms ? { arms: (view: BodyView) => walk.arms?.(view) ?? null } : {}),
  };
}

/**
 * **The back step** as a gait (`Gait`): the body swayed back in the staggered carriage
 * (`STAGGERED`) and in again, as the back step's evaluation reads best (out 0.7 s, back 0.5 s, the
 * lead foot stepping 0.1 m in, its follow 0.15 m). A gait no walk goes by (`GaitPart.travels`),
 * which its Option orders (`backStepping`); its part's one gait (`GaitPart.gaits`).
 */
export const BACK_STEP_GAIT: Gait = deepFreeze({ name: "back-step", label: "Back step",
  legs: { kind: "back-step", carriage: STAGGERED, out: SWAY.out, back: SWAY.back, stepIn: .1, follow: .15, turn: 2 } satisfies BackStepConfig });

/** **The walk whose stance the back step sways from** (`gaitStance`): the stance's walk in its carriage, staggered. */
export const SWAYS_FROM = deepFreeze({ kind: "stance-walk", variation: "staggered" } as const);

/**
 * **How long the back step's gait is ordered**, s: held through its sway out and back (`swayed`), so
 * the stance is not let go with the body over its rear foot; and at most `held`, its step in and
 * follow, as the back step's evaluation reads best.
 */
export const BACK_STEP_SECONDS = deepFreeze({ swayed: SWAY.out + SWAY.back, held: 1.65 });

/** The back step's one variation, itself. */
const VARIATIONS = { "back-step": backStep };

/** **The back step** (`backStep`): a gait part, ordered by name where a body's Move has it among its gaits (`MoveConfig.gaits`), on a body whose character holds it. */
export const BACK_STEP_PART = deepFreeze<GaitPart<BackStepConfig>>({
  // A footprint, and an arrow back.
  icon: "M8 3.3a2.8 4.2 0 0 1 0 8.4a2.8 4.2 0 0 1 0-8.4ZM8 12.6a1.9 1.9 0 0 1 0 3.8a1.9 1.9 0 0 1 0-3.8ZM15 5h3v9h3l-4.5 6.5L12 14h3Z",
  role: "gait", requires: [SUPPORT_REFERENCE], label: "Back step", fields: [], slots: [], defaults: { kind: "back-step" }, travels: false, gaits: [BACK_STEP_GAIT],
  keys: { kind: true, variation: true, carriage: true, out: true, back: true, stepIn: true, follow: true, turn: true },
  ...varied({ skill: "back-step", label: "back step", variations: VARIATIONS, of: (body, config) => [body.built.spec, config], fits: [soleRefusal] }),
  faults: (config) => [
    ...(config.carriage === undefined || validCarriage(config.carriage) ? [] : ["a carriage needs a positive width or none, and a finite stagger and lowering"]),
    ...(config.follow === undefined || Number.isFinite(config.follow) && config.follow > 0 && config.follow <= .4 ? [] : ["back step: follow from 0 to 0.4 m"]),
    ...(config.turn === undefined || Number.isFinite(config.turn) && config.turn > 0 && config.turn <= 10 ? [] : ["back step: turn from 0 to 10 rad/s"]),
    ...(config.stepIn === undefined || Number.isFinite(config.stepIn) && config.stepIn >= 0 && config.stepIn <= .5 ? [] : ["back step: stepIn from 0 to 0.5 m"]),
    ...(["out", "back"] as const).flatMap((key) => config[key] === undefined || Number.isFinite(config[key]) && config[key]! > 0 && config[key]! <= 3 ? [] : [`back step: ${key} from 0 to 3 s`]),
  ],
  asSkill: { group: "Travel", ends: ["standing"] },
});

declare module "../../config.ts" {
  interface GaitConfigs {
    readonly "back-step": BackStepConfig;
  }
}
