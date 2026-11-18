import { fitsAll } from "../../../parts/parts.ts";
import type { Body, BodyView } from "../../../control/body.ts";
import type { BearingEnd } from "../../../core/bodies/spec/body.ts";
import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import { fitsSoles } from "../../../control/support.ts";
import { deepFreeze } from "../../../core/state.ts";
import { cos, sin } from "../../../core/math/real.ts";
import { wrap } from "../../../core/math/turn.ts";
import type { GaitPart, Locomotion } from "../../framework/locomotion-part.ts";
import type { LegsAsked } from "../../framework/skill.ts";
import { validCarriage, type Carriage } from "../shared/locomotion.ts";
import { STANCE_WALK_PART } from "../stance-walk/index.ts";

/**
 * How far behind the rear sole's middle the back step asks the centre, m, unless its config says:
 * past where the stance holds it (within its support), so it goes as far back as the stance lets it.
 */
const BEYOND = .1;

/** How long the back step holds the body back, and takes to bring it back over the middle of its feet, s, unless its config says. */
const SWAY = deepFreeze({ out: .7, back: .5 });

/** The step in's swing: its time, s, and lift, m; the most it is waited for, s, before the sway goes on without it; how fast the centre comes in before it lifts, m/s; the walk forward a shuffle steps on, m/s. */
const STEP = deepFreeze({ seconds: .3, lift: .05, most: 1, coming: .05, asked: .05 });

/**
 * **The back step's config**: the carriage it stands in (`Carriage`), which should be the one the
 * body's other gaits hold, so that taking it up places no foot; the square stance where none. Its
 * sway's times, s (`SWAY`), and how far behind the rear sole's middle it asks the centre, m
 * (`BEYOND`; below 0, short of it).
 */
interface BackStepConfig {
  readonly kind: "back-step";
  readonly carriage?: Carriage;
  readonly out?: number;
  readonly back?: number;
  readonly beyond?: number;
  /** How far the lead foot steps in once the body is back, m, and the centre is brought in past where it began; none where it only sways. */
  readonly stepIn?: number;
  /**
   * How far each foot steps, m, where this back step does not sway but shuffles in: asked a walk
   * forward, it steps the lead foot in and then the rear foot up, one at a time, each a swing of
   * the stance's (`STEP`), with no walk's start; asked none, it stands.
   */
  readonly shuffle?: number;
  /** How far each foot steps, m, where, once the sway is over, it shuffles in as `shuffle` does, asked a walk forward, and stands its feet where they are asked none; the walk where none. */
  readonly follow?: number;
  /**
   * How fast the legs turn toward the face asked while it sways, rad/s: the stance walk turns only
   * while it walks, and a sway asks no walk, so without it the body ends a sway facing as it began
   * however the line to its foe swung. Its heading is the walk's from the sway's end, the walk
   * standing the carriage's feet about it. None where it holds the heading it began with.
   */
  readonly turn?: number;
}

/**
 * **The back step**: a gait that sways the body back over its rear foot, the walk in the stance's
 * (`STANCE_WALK_PART`) in the same carriage but for one field of the legs goal. Each time the legs
 * take it up (`Locomotion.resume`, as Move changes to it), once the stance stands on both feet taking
 * no step (`squared`), it asks the stance's centre (`LegsGoal.centre`) `BEYOND` behind the sole
 * further back along its heading for `out` s, and then where the centre began for `back` s, with
 * no walk and no step: the stance carries the whole body back over that foot, the head and trunk
 * with the centre, and in again; with a `stepIn`, once the body comes forward again, the lead foot
 * steps that far in (`STEP`) and the centre is brought in as far past where it began. Then it is the walk. It ends with the centre where it began, since
 * a walk taken up stands its carriage's feet about the centre (`footingOf`) and, taken up with the
 * body back, steps them there.
 *
 * What it does from the stand of the back step's drill (`back-step-drill.mjs`): from a square
 * stand there is no foot behind to sway over; with the lead foot 0.45 m ahead, the head, upper and
 * middle trunk have gone 0.06 m back at 0.225 s, 0.14 m at 0.4 s and 0.22 m at 0.6 s, the body on
 * its feet taking no step. A push of the legs with the stance let go moved the centre faster but
 * left the trunk behind it (at most 0.025 m by 0.225 s over 1,728 pushes), and one that drew the
 * drilled punch early leaned the head toward the attacker.
 */
function backStep(body: Body, config: BackStepConfig): Locomotion {
  const walk = STANCE_WALK_PART.make(body, { kind: "stance-walk", variation: "stance-walk", ...(config.carriage ? { carriage: config.carriage } : {}) });
  const out = config.out ?? SWAY.out, back = config.back ?? SWAY.back, beyond = config.beyond ?? BEYOND;
  /** Where the centre is asked out and back, world (x, z), m, and how long since the sway began, s; whether it waits for the stance to stand square. */
  const state = { aim: null as readonly [number, number] | null, from: null as readonly [number, number] | null, seconds: 0, armed: false, walk: walk.state,
    step: null as { readonly foot: BearingEnd; readonly bearing: BearingEnd; readonly to: readonly [number, number]; lifted: boolean; seconds: number } | null, stepped: false, waited: 0,
    shuffle: null as { readonly foot: BearingEnd; readonly bearing: BearingEnd; readonly to: readonly [number, number]; lifted: boolean; seconds: number } | null,
    facing: null as number | null };
  const stepIn = config.stepIn ?? 0;
  const stagger = config.carriage?.stagger ?? 0;
  /** The stance's ends from the furthest ahead along the legs' heading to the furthest back, with how far ahead each is, m. */
  const alongOf = (view: BodyView) => {
    const h = walk.heading, fx = sin(h), fz = cos(h);
    return Object.entries(view.stance.ends).map(([name, end]) => ({ name: name as BearingEnd, middle: end.middle, along: end.middle.x * fx + end.middle.z * fz })).sort((a, b) => b.along - a.along);
  };
  /** The shuffle's legs goal (`BackStepConfig.shuffle`), steps of `length` m: the step under way, else the next where a walk forward is asked and the stance stands, else a stand. */
  const shuffled = (view: BodyView, goal: LegsAsked, dt: number, context: Parameters<Locomotion["goal"]>[3], length: number) => {
    const going = state.shuffle;
    if (going) {
      if (view.stance.phase === "swing") going.lifted = true;
      going.seconds += dt;
      if (!(going.lifted && view.stance.phase === "stand") && going.seconds <= STEP.most) return walk.goal(view, { ...goal, walk: null, feet: [going.bearing], centre: null, swing: { foot: going.foot, to: going.to, seconds: STEP.seconds, lift: STEP.lift } }, dt, context);
      state.shuffle = null;
    }
    if ((goal.walk?.[0] ?? 0) > STEP.asked && squared(view)) {
      const ends = alongOf(view), lead = ends[0]!, rear = ends[ends.length - 1]!, h = walk.heading;
      const [moving, bearing] = lead.along - rear.along < stagger + length / 2 ? [lead, rear] : [rear, lead];
      state.shuffle = { foot: moving.name, bearing: bearing.name, to: [moving.middle.x + length * sin(h), moving.middle.z + length * cos(h)], lifted: false, seconds: 0 };
      return walk.goal(view, { ...goal, walk: null, feet: [bearing.name], centre: null, swing: { foot: moving.name, to: state.shuffle.to, seconds: STEP.seconds, lift: STEP.lift } }, dt, context);
    }
    // Standing where the shuffle left the feet: the walk's own footing would step them back into the carriage.
    const footing = Object.fromEntries(Object.entries(view.stance.ends).map(([name, end]) => [name, [end.middle.x, end.middle.z]])) as Record<BearingEnd, readonly [number, number]>;
    return walk.goal(view, { ...goal, walk: null, footing }, dt, context);
  };
  /** Whether the stance stands on both feet, taking no step. */
  const squared = (view: BodyView): boolean => { const s = view.stance; return s.phase === "stand" && !s.own && Object.values(s.ends).every((end) => end.touching); };
  /** `beyond` behind the middle of the sole of `view`'s stance furthest back along the legs' heading. */
  const behind = (view: BodyView): readonly [number, number] => {
    const h = walk.heading, fx = sin(h), fz = cos(h);
    let rear = null as { readonly x: number; readonly z: number } | null, least = Infinity;
    for (const end of Object.values(view.stance.ends)) { const along = end.middle.x * fx + end.middle.z * fz; if (along < least) { least = along; rear = end.middle; } }
    return [rear!.x - beyond * fx, rear!.z - beyond * fz];
  };
  return {
    state,
    supports: walk.supports,
    get lower() { return walk.lower; },
    get envelope() { return walk.envelope; },
    get stopping() { return walk.stopping; },
    get lag() { return walk.lag; },
    // While it turns in a sway, the heading it has turned to: what a strike's window reads.
    get heading() { return state.facing ?? walk.heading; },
    get pace() { return walk.pace; },
    get reference() { return walk.reference; },
    get placed() { return walk.placed; },
    get unmet() { return walk.unmet; },
    resume(view: BodyView, heading?: number) {
      walk.resume(view, heading);
      state.armed = true; state.aim = null; state.from = null; state.seconds = 0; state.step = null; state.stepped = false; state.waited = 0; state.shuffle = null; state.facing = null;
    },
    goal: legsGoal,
    ...(walk.arms ? { arms: (view: BodyView) => walk.arms?.(view) ?? null } : {}),
  };
  /** `goal` asked of the walk while it sways, facing the heading it has turned to (`BackStepConfig.turn`); itself where it turns none. */
  function swaying(goal: LegsAsked, dt: number): LegsAsked {
    if (!config.turn) return goal;
    const was = state.facing ?? walk.heading, rate = config.turn * dt;
    state.facing = was + Math.max(-rate, Math.min(rate, wrap(goal.face - was)));
    return { ...goal, heading: state.facing };
  }
  /** The back step's legs goal. */
  function legsGoal(view: BodyView, goal: LegsAsked, dt: number, context: Parameters<Locomotion["goal"]>[3]) {
      if (config.shuffle) return shuffled(view, goal, dt, context, config.shuffle);
      // The sway over, the walk takes up the heading it turned to.
      if (state.facing !== null && state.aim && state.seconds >= out + back) { const facing = state.facing; state.facing = null; walk.resume(view, facing); }
      if (state.armed && squared(view)) { state.armed = false; state.aim = behind(view); state.from = [view.stance.centre.x, view.stance.centre.z]; }
      if (state.armed) return walk.goal(view, { ...goal, walk: null }, dt, context);
      if (state.aim && state.seconds >= out + back && config.follow) return shuffled(view, goal, dt, context, config.follow);
      if (!state.aim || state.seconds >= out + back) return walk.goal(view, goal, dt, context);
      if (stepIn > 0 && state.seconds >= out && !state.stepped) {
        const h = walk.heading, fx = sin(h), fz = cos(h);
        if (!state.step && view.stance.velocity.x * fx + view.stance.velocity.z * fz < STEP.coming) {
          state.waited += dt;
          if (state.waited < STEP.most) return walk.goal(view, swaying({ ...goal, walk: null, swing: null, centre: [state.from![0] + stepIn * fx, state.from![1] + stepIn * fz] }, dt), dt, context);
          state.stepped = true;
        }
        if (!state.stepped && !state.step) {
          const ends = Object.entries(view.stance.ends).sort(([, a], [, b]) => (b.middle.x * fx + b.middle.z * fz) - (a.middle.x * fx + a.middle.z * fz));
          const lead = ends[0]!, rear = ends[ends.length - 1]!;
          state.step = { foot: lead[0] as BearingEnd, bearing: rear[0] as BearingEnd, to: [lead[1].middle.x + stepIn * fx, lead[1].middle.z + stepIn * fz], lifted: false, seconds: 0 };
          state.from = [state.from![0] + stepIn * fx, state.from![1] + stepIn * fz];
        }
      }
      if (stepIn > 0 && state.step && !state.stepped) {
        const step = state.step, phase = view.stance.phase;
        if (phase === "swing") step.lifted = true;
        step.seconds += dt;
        if (step.lifted && phase === "stand" || step.seconds > STEP.most) state.stepped = true;
        else return walk.goal(view, swaying({ ...goal, walk: null, feet: [step.bearing], centre: null, swing: { foot: step.foot, to: step.to, seconds: STEP.seconds, lift: STEP.lift } }, dt), dt, context);
      }
      const centre = state.seconds < out ? state.aim : state.from!;
      state.seconds += dt;
      return walk.goal(view, swaying({ ...goal, walk: null, swing: null, centre }, dt), dt, context);
  }
}

/** **The back step** (`backStep`): a gait part, ordered by name where a body's Move has it among its gaits (`MoveConfig.gaits`). */
export const BACK_STEP_PART = deepFreeze<GaitPart<BackStepConfig>>({
  role: "gait", requires: [SUPPORT_REFERENCE], label: "Back step", stage: "experimental", fields: [], slots: [], defaults: { kind: "back-step" }, travels: false,
  keys: { kind: true, carriage: true, out: true, back: true, beyond: true, stepIn: true, shuffle: true, follow: true, turn: true },
  fits: fitsAll(fitsSoles),
  faults: (config) => [
    ...(config.carriage === undefined || validCarriage(config.carriage) ? [] : ["a carriage needs a positive width or none, and a finite stagger and lowering"]),
    ...(["shuffle", "follow"] as const).flatMap((key) => config[key] === undefined || Number.isFinite(config[key]) && config[key]! > 0 && config[key]! <= .4 ? [] : [`back step: ${key} from 0 to 0.4 m`]),
    ...(config.turn === undefined || Number.isFinite(config.turn) && config.turn > 0 && config.turn <= 10 ? [] : ["back step: turn from 0 to 10 rad/s"]),
    ...(config.stepIn === undefined || Number.isFinite(config.stepIn) && config.stepIn >= 0 && config.stepIn <= .5 ? [] : ["back step: stepIn from 0 to 0.5 m"]),
    ...(config.beyond === undefined || Number.isFinite(config.beyond) && Math.abs(config.beyond) <= .5 ? [] : ["back step: beyond from -0.5 to 0.5 m"]),
    ...(["out", "back"] as const).flatMap((key) => config[key] === undefined || Number.isFinite(config[key]) && config[key]! > 0 && config[key]! <= 3 ? [] : [`back step: ${key} from 0 to 3 s`]),
  ],
  make: backStep,
  skillGroup: "Travel",
});

declare module "../../config.ts" {
  interface GaitConfigs {
    readonly "back-step": BackStepConfig;
  }
}
