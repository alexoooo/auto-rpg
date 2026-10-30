import { strikesWithOneOf } from "../mind/parts.ts";
import { text } from "../mind/fields.ts";
import { aimedPoint, AIMED_ACTIONS, type ExecutorPart } from "../mind/executor-part.ts";
import { recipeExecutor, type Placed, type Slack } from "./strike.ts";
import { holdsNothing, REPERTOIRE, recipeAt, recipesFor, strikesWithBlunt, type Repertoire } from "./strikes.ts";

/** How the recipe strike throws, beside its research tuning. */
interface Settings {
  /** Seconds stood still before a blow in place of `STAND`. */
  readonly stand?: number;
  /** How far outside a recipe's window its target may stand and the blow be thrown from where the body stands. */
  readonly slack?: Slack;
  /** Whether it strikes only with a hand that holds an item: a weapon's blow, which an empty hand does not throw. */
  readonly armed?: boolean;
}

/**
 * **The recipe strike**: the searched recipe blows for what a hand holds (`recipeExecutor`,
 * `skills/strike.ts`): its settings, and over them a research `tuning`, which a link does not carry.
 */
interface Config extends Settings {
  readonly kind: "recipe-strike";
  readonly name: string;
  readonly tuning?: Settings & {
    /** Strikes in place of the searched repertoire (`REPERTOIRE`): a search's candidate. */
    readonly repertoire?: Repertoire;
    /** The placed blow in place of `PLACED`: a sweep's cell. */
    readonly placed?: Placed;
    /** The most a blow turns the pelvis in place of `STEER`: a sweep's cell. */
    readonly steer?: number;
  };
}

/** The settings `config` gives its executor: its own, and its research tuning over them. */
function settingsOf(config: Config): NonNullable<Config["tuning"]> {
  const { kind: _, name: __, tuning, ...own } = config;
  return { ...own, ...tuning };
}

/** Recipe construction and measured net estimates share one registration. */
export const RECIPE_PART: ExecutorPart<Config> = {
  role: "executor", label: "Recipe strike", stage: "game", defaults: { kind: "recipe-strike", name: "recipe" }, keys: { kind: true, name: true, tuning: true, stand: true, slack: true, armed: true },
  fields: [text("name", "Name")], slots: [], tuning: ["repertoire", "placed", "steer", "stand", "slack", "armed"], fits: strikesWithOneOf("hand.left", "hand.right"),
  faults: () => [], effectors: ["hand.left", "hand.right"], ...AIMED_ACTIONS,
  // A hand strikes with a blunt item by placement, and with anything its repertoire holds a recipe for; armed, never empty.
  strikesWith: (spec, config, effector) => !(settingsOf(config).armed === true && holdsNothing(spec, effector)) && (strikesWithBlunt(spec, effector)
    || (effector === "hand.left" || effector === "hand.right") && recipesFor(config.tuning?.repertoire ?? REPERTOIRE, spec, effector === "hand.left" ? "left" : "right").length > 0),
  make: ({ body, guard, aim }, config, actions) => recipeExecutor(body.built.spec, actions.map(a => a.name), { ...settingsOf(config), guard, resolve: aimedPoint(aim) }),
  estimate(spec, config, _action, aim, unit) {
    if (unit !== null) return null;
    const repertoire = config.tuning?.repertoire ?? REPERTOIRE;
    const known = { left: recipesFor(repertoire, spec, "left"), right: recipesFor(repertoire, spec, "right") };
    return { unit: "net", read(view, target, effector) {
      const side = effector === "hand.left" ? "left" : effector === "hand.right" ? "right" : null;
      if (!side) return null;
      const at = aim(view, target, effector);
      if (!at) return null;
      const index = recipeAt(known[side], at.at[1] - view.head.y);
      return index < 0 ? null : known[side][index]!.recipe.net;
    } };
  },
};
