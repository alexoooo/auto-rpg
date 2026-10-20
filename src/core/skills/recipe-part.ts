import { commandable } from "../body.ts";
import type { ExecutorConfig } from "../mind/config.ts";
import { text } from "../mind/fields.ts";
import { noPathSettings, type ExecutorPart } from "../mind/executor-part.ts";
import { recipeExecutor } from "./strike.ts";
import { REPERTOIRE, recipeAt, recipesFor, strikesWithBlunt } from "./strikes.ts";

type Config = Extract<ExecutorConfig, { kind: "recipe-strike" }>;
/** Recipe construction and measured net estimates share one registration. */
export const RECIPE_PART: ExecutorPart<Config> = {
  role: "executor", label: "Recipe strike", stage: "game", defaults: { kind: "recipe-strike", name: "recipe" },
  fields: [text("name", "Name")], slots: [], tuning: ["repertoire", "placed", "steer"], fits: commandable,
  strikesWith: (spec, _config, effector) => strikesWithBlunt(spec, effector),
  faults: () => [], effectors: ["hand.left", "hand.right"], actionFaults: noPathSettings,
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
