import data from "../../../../assets/entrants/option-skeleton/guard.json" with { type: "json" };
import type { Pose } from "../../control/motor.ts";
import { number, toggle } from "../../mind/fields.ts";
import { fitsWhen } from "../../mind/parts.ts";
import { guardPosture, guardSkill } from "../../skills/guard.ts";
import type { GuardPart } from "../../skills/guard-part.ts";
import { deepFreeze } from "../../state.ts";
import { hasBlade } from "./weapon.ts";

interface Config {
  readonly kind: "skeleton-guard";
  readonly shoulder: number;
  readonly abduction: number;
  readonly elbow: number;
  readonly againstBlades?: boolean;
}

/** The empty hands' symmetric rest, also used at construction and after a punch. */
function posture(config: Config): Pose {
  return Object.fromEntries(["left", "right"].flatMap(side => [
    [`shoulder.${side} flexion`, config.shoulder], [`shoulder.${side} abduction`, config.abduction], [`elbow.${side} flexion`, config.elbow],
  ]));
}

/** A raised rest against sensed blades retains the toolkit's ordinary cover goals. */
export const SKELETON_GUARD: GuardPart<Config> = deepFreeze({
  role: "guard", label: "Skeleton guard", stage: "experimental", slots: [],
  defaults: { kind: "skeleton-guard", ...data, againstBlades: true },
  keys: { kind: true, shoulder: true, abduction: true, elbow: true, againstBlades: true },
  fields: [number("shoulder", "Arm elevation", 0, 1.6, .05, "rad"), number("abduction", "Arm width", 0, .6, .05, "rad"), number("elbow", "Elbow bend", 0, 1.6, .05, "rad"),
    toggle("againstBlades", "Raise only against blades")],
  fits: fitsWhen(spec => spec.model === "crypt-skeleton" && !spec.held?.length, "needs an empty-handed Skeleton"),
  faults: config => [config.shoulder, config.abduction, config.elbow].every(value => Number.isFinite(value) && value >= 0) ? [] : ["guard angles must be finite and nonnegative"],
  posture: (spec, config) => config.againstBlades ? guardPosture(spec) : posture(config),
  make(built, config) {
    const base = guardSkill(built.spec), raised = posture(config), ordinary = guardPosture(built.spec);
    const state = { raised: !config.againstBlades, pose: { ...(config.againstBlades ? ordinary : raised) } };
    return { ...base, state, posture: state.pose,
      command(view, covers) {
        const lift = !config.againstBlades || view.senses.others.some(foe => !foe.out && foe.side !== view.senses.side && hasBlade(foe.spec));
        if (lift !== state.raised) {
          state.raised = lift;
          Object.assign(state.pose, lift ? raised : ordinary);
        }
        return base.command(view, covers);
      },
    };
  },
});
