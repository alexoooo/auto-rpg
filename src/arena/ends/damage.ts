import type { EndRule, EndRuleConfig } from "../end-rule.ts";

/** **Out by damage**: a side whose pool has ended (`Pool.ending`) is out, as its pool says. */
export const DAMAGE_END = Object.freeze<EndRule<EndRuleConfig>>({
  label: "Damage", defaults: Object.freeze({ kind: "damage" }),
  out: (one) => { const ending = one.pool.ending(); return ending === null || ending === "time" ? null : ending; },
  endings: Object.freeze({ fatal: "by a fatal wound", severed: "by a severing wound", exhausted: "by exhaustion" }),
});
