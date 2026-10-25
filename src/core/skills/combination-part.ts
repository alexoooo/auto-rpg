import { strikesWithOneOf, fitsAll, fitsWhen } from "../mind/parts.ts";
import { text } from "../mind/fields.ts";
import { aimedPoint, AIMED_ACTIONS, type ExecutorPart } from "../mind/executor-part.ts";
import { COMBINATION, combinationExecutor, combinationFits, validCombination, type Combination } from "./combination.ts";
import { holdsNothing } from "./strikes.ts";
import { missingTimedChannels } from "./straight-punch.ts";

/** **The combination** (`combinationExecutor`): two straight punches, one hand then the other, its settings these. */
interface Config extends Combination {
  readonly kind: "combination";
  readonly name: string;
}

/** A combination owns its body fit and its two straight drives' settings. */
export const COMBINATION_PART: ExecutorPart<Config> = {
  role: "executor", label: "Combination", stage: "game", defaults: { kind: "combination", name: "combination", ...COMBINATION },
  keys: {
    kind: true, name: true, pace: true, reach: true, band: true, settle: true, through: true, hips: true, turn: true,
    lean: true, chamber: true, lead: true, elbow: true, brake: true, follow: true, longest: true,
    recover: true, landed: true, fire: true, driven: true, timed: true, drives: true, gap: true, poise: true, wait: true,
  },
  fields: [text("name", "Name")], slots: [], fits: fitsAll(strikesWithOneOf("hand.left", "hand.right"), fitsWhen(combinationFits, "needs both arms on the upper trunk and a thoracic joint"),
    (spec, config) => { const missing = missingTimedChannels(spec, config); return missing.length ? `has no ${missing.join(", ")} to push` : null; }),
  faults: config => validCombination(config) ? [] : ["invalid combination settings"], effectors: ["hand.left", "hand.right"], ...AIMED_ACTIONS,
  blows: config => config.drives,
  // Its punches are thrown by hands that hold nothing: of two drives, the hand asked for and the other.
  strikesWith: (spec, config, effector) => config.drives === 2 ? holdsNothing(spec, "hand.left") && holdsNothing(spec, "hand.right") : holdsNothing(spec, effector),
  make({ body, guard, aim }, config, actions) {
    const { kind: _, name: __, ...settings } = config;
    return combinationExecutor(body, guard, actions.map(a => a.name), settings, aimedPoint(aim));
  },
};
