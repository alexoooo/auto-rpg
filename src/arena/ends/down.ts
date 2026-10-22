import type { EndRule, EndRuleConfig } from "../end-rule.ts";

/**
 * **Out by a fall**: a side down for its recipe's recovery window (`DuelRecipe.recoverySeconds`)
 * is out, at once where the window is none (zero, the reference fall rule), and never where it
 * is null.
 */
export const DOWN_END = Object.freeze<EndRule<EndRuleConfig>>({
  label: "Down", defaults: Object.freeze({ kind: "down" }),
  out: (one, _config, recipe) => {
    const window = recipe.recoverySeconds === undefined ? 0 : recipe.recoverySeconds;
    return one.body.down && window !== null && one.downFor >= window ? "fallen" : null;
  },
  endings: Object.freeze({ fallen: "by a fall" }),
});
