import { fitsAll } from "../../../parts/parts.ts";
import type { Body, BodyView } from "../../../control/body.ts";
import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import { fitsSoles } from "../../../control/support.ts";
import { deepFreeze } from "../../../core/state.ts";
import { cos, sin } from "../../../core/math/real.ts";
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
const SWAY = deepFreeze({ out: .4, back: .5 });

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
}

/**
 * **The back step**: a gait that sways the body back over its rear foot, the walk in the stance's
 * (`STANCE_WALK_PART`) in the same carriage but for one field of the legs goal. Each time the legs
 * take it up (`Locomotion.resume`, as Move changes to it), once the stance stands on both feet taking
 * no step (`squared`), it asks the stance's centre (`LegsGoal.centre`) `BEYOND` behind the sole
 * further back along its heading for `out` s, and then where the centre began for `back` s, with
 * no walk and no step: the stance carries the whole body back over that foot, the head and trunk
 * with the centre, and in again. Then it is the walk. It ends with the centre where it began, since
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
  const state = { aim: null as readonly [number, number] | null, from: null as readonly [number, number] | null, seconds: 0, armed: false, walk: walk.state };
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
    get heading() { return walk.heading; },
    get pace() { return walk.pace; },
    get reference() { return walk.reference; },
    get placed() { return walk.placed; },
    get unmet() { return walk.unmet; },
    resume(view: BodyView, heading?: number) {
      walk.resume(view, heading);
      state.armed = true; state.aim = null; state.from = null; state.seconds = 0;
    },
    goal(view: BodyView, goal: LegsAsked, dt: number, context) {
      if (state.armed && squared(view)) { state.armed = false; state.aim = behind(view); state.from = [view.stance.centre.x, view.stance.centre.z]; }
      if (state.armed) return walk.goal(view, { ...goal, walk: null }, dt, context);
      if (!state.aim || state.seconds >= out + back) return walk.goal(view, goal, dt, context);
      const centre = state.seconds < out ? state.aim : state.from!;
      state.seconds += dt;
      return walk.goal(view, { ...goal, walk: null, swing: null, centre }, dt, context);
    },
    ...(walk.arms ? { arms: (view: BodyView) => walk.arms?.(view) ?? null } : {}),
  };
}

/** **The back step** (`backStep`): a gait part, ordered by name where a body's Move has it among its gaits (`MoveConfig.gaits`). */
export const BACK_STEP_PART = deepFreeze<GaitPart<BackStepConfig>>({
  role: "gait", requires: [SUPPORT_REFERENCE], label: "Back step", stage: "experimental", fields: [], slots: [], defaults: { kind: "back-step" },
  keys: { kind: true, carriage: true, out: true, back: true, beyond: true },
  fits: fitsAll(fitsSoles),
  faults: (config) => [
    ...(config.carriage === undefined || validCarriage(config.carriage) ? [] : ["a carriage needs a positive width or none, and a finite stagger and lowering"]),
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
