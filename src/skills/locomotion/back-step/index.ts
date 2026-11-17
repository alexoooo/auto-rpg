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
 * How far behind the rear sole's middle the back step asks the centre, m: past where the stance
 * holds it (within its support), so it goes as far back as the stance lets it.
 */
const BEYOND = .1;

/**
 * **The back step's config**: the carriage it stands in (`Carriage`), which should be the one the
 * body's other gaits hold, so that taking it up places no foot; the square stance where none.
 */
interface BackStepConfig {
  readonly kind: "back-step";
  readonly carriage?: Carriage;
}

/**
 * **The back step**: a gait that sways the body back over its rear foot, the walk in the stance's
 * (`STANCE_WALK_PART`) in the same carriage but for one field of the legs goal. Each time the legs
 * take it up (`Locomotion.resume`, as Move changes to it), once the stance stands on both feet taking
 * no step (`squared`), it asks the stance's centre (`LegsGoal.centre`) `BEYOND` behind the sole
 * further back along its heading, and no walk, as long as it is asked: the stance carries the whole
 * body back over that foot, the head and trunk with the centre. Let go, the walk Move changes to
 * holds the centre in its carriage's middle again, and the body sways back in.
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
  /** Where the centre is asked, world (x, z), m, once the sway has begun; whether it waits for the stance to stand square. */
  const state = { aim: null as readonly [number, number] | null, armed: false, walk: walk.state };
  /** Whether the stance stands on both feet, taking no step. */
  const squared = (view: BodyView): boolean => { const s = view.stance; return s.phase === "stand" && !s.own && Object.values(s.ends).every((end) => end.touching); };
  /** `BEYOND` behind the middle of the sole of `view`'s stance furthest back along the legs' heading. */
  const behind = (view: BodyView): readonly [number, number] => {
    const h = walk.heading, fx = sin(h), fz = cos(h);
    let rear = null as { readonly x: number; readonly z: number } | null, least = Infinity;
    for (const end of Object.values(view.stance.ends)) { const along = end.middle.x * fx + end.middle.z * fz; if (along < least) { least = along; rear = end.middle; } }
    return [rear!.x - BEYOND * fx, rear!.z - BEYOND * fz];
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
      state.armed = true; state.aim = null;
    },
    goal(view: BodyView, goal: LegsAsked, dt: number, context) {
      if (state.armed && squared(view)) { state.armed = false; state.aim = behind(view); }
      return walk.goal(view, state.armed ? { ...goal, walk: null } : state.aim ? { ...goal, walk: null, centre: state.aim } : goal, dt, context);
    },
    ...(walk.arms ? { arms: (view: BodyView) => walk.arms?.(view) ?? null } : {}),
  };
}

/** **The back step** (`backStep`): a gait part, ordered by name where a body's Move has it among its gaits (`MoveConfig.gaits`). */
export const BACK_STEP_PART = deepFreeze<GaitPart<BackStepConfig>>({
  role: "gait", requires: [SUPPORT_REFERENCE], label: "Back step", stage: "experimental", fields: [], slots: [], defaults: { kind: "back-step" },
  keys: { kind: true, carriage: true },
  fits: fitsAll(fitsSoles),
  faults: (config) => config.carriage === undefined || validCarriage(config.carriage) ? [] : ["a carriage needs a positive width or none, and a finite stagger and lowering"],
  make: backStep,
  skillGroup: "Travel",
});

declare module "../../config.ts" {
  interface GaitConfigs {
    readonly "back-step": BackStepConfig;
  }
}
