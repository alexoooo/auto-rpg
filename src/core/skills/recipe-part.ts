import { takesCommands } from "../mind/parts.ts";
import { text } from "../mind/fields.ts";
import { noPathSettings, type ExecutorPart } from "../mind/executor-part.ts";
import { recipeExecutor, type Placed } from "./strike.ts";
import { REPERTOIRE, recipeAt, recipesFor, strikesWithBlunt, type Repertoire } from "./strikes.ts";

/** **The recipe strike**: the searched recipe blows for what a hand holds (`recipeExecutor`, `skills/strike.ts`). */
interface Config {
  readonly kind: "recipe-strike";
  readonly name: string;
  readonly tuning?: {
    /** Strikes in place of the searched repertoire (`REPERTOIRE`): a search's candidate. */
    readonly repertoire?: Repertoire;
    /** The placed blow in place of `PLACED`: a sweep's cell. */
    readonly placed?: Placed;
    /** The most a blow turns the pelvis in place of `STEER`: a sweep's cell. */
    readonly steer?: number;
  };
}

/** Recipe construction and measured net estimates share one registration. */
export const RECIPE_PART: ExecutorPart<Config> = {
  role: "executor", label: "Recipe strike", stage: "game", defaults: { kind: "recipe-strike", name: "recipe" }, keys: { kind: true, name: true, tuning: true },
  fields: [text("name", "Name")], slots: [], tuning: ["repertoire", "placed", "steer"], fits: takesCommands,
  faults: () => [], effectors: ["hand.left", "hand.right"], actionFaults: noPathSettings,
  // A hand strikes with a blunt item by placement, and with anything its repertoire holds a recipe for.
  strikesWith: (spec, config, effector) => strikesWithBlunt(spec, effector)
    || (effector === "hand.left" || effector === "hand.right") && recipesFor(config.tuning?.repertoire ?? REPERTOIRE, spec, effector === "hand.left" ? "left" : "right").length > 0,
  make: (body, _world, config, actions, resolve) => recipeExecutor(body.built.spec, actions.map(a => a.name), { ...config.tuning, resolve }),
  estimate(spec, config, action, aim) {
    if (action.aim.kind === "surface") return null;
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
