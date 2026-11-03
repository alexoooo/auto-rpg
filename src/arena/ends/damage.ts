import type { EndRule, EndRuleConfig } from "../end-rule.ts";

/** **Out by wounds**: a side whose pool has ended (`Pool.ending`) is out, as its pool says. */
export const DAMAGE_END = Object.freeze<EndRule<EndRuleConfig>>({
  label: "Damage", defaults: Object.freeze({ kind: "damage" }),
  out: (one) => one.pool.ending(),
  endings: Object.freeze({ slain: "by wounds", beheaded: "by a beheading", maimed: "by a lost leg" }),
});
