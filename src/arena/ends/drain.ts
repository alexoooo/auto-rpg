import type { EndRule, EndRuleConfig } from "../end-rule.ts";

/** The drain's settings: from `from` s into the bout each side loses its full life over `over` s, steadily. */
interface DrainConfig extends EndRuleConfig { readonly kind: "drain"; readonly from: number; readonly over: number }

/** The owner's verdict: from the first minute, a sixtieth of a side's full life a second (`docs/reference/play.md#the-bout`). */
const DRAIN: DrainConfig = Object.freeze({ kind: "drain", from: 60, over: 60 });

/**
 * **Out by the drain**: a side whose life (its bar less what the drain has taken, `EndContestant.life`)
 * has reached none is out. By `from + over` s every side's has, so the drain ends every bout.
 */
export const DRAIN_END = Object.freeze<EndRule<DrainConfig>>({
  label: "Drain", defaults: DRAIN,
  drained: (seconds, config) => {
    if (!(config.over > 0) || !Number.isFinite(config.from)) throw new Error(`a drain runs over a positive time from a finite one, not ${config.over} s from ${config.from} s`);
    return seconds > config.from ? (seconds - config.from) / config.over : 0;
  },
  drainedBy: (config) => config.from + config.over,
  out: (one) => one.life <= 0 ? "drained" : null,
  endings: Object.freeze({ drained: "by the clock" }),
});
