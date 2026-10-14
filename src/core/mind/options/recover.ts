import type { SubMind } from "../sub-mind.ts";
import type { DownOption } from "./option.ts";

/**
 * **Recover**: get up, by `rise`, the sub-mind that stands the body up (`standUp`). On offer while
 * `rise` would have the body: while it is down, or rising; it yields when `rise` may be
 * interrupted, and is over when it has stood. Its sub-mind is begun and ended by whoever hands it
 * the body (`optionsFighter`'s down half), not here.
 */
export function recover(rise: SubMind): DownOption {
  return {
    name: "recover", posture: "down", mind: rise, state: {},
    available: (now) => rise.wants(now.sight.view.senses),
    yields: () => !(rise.holds?.() ?? false),
    ended: () => false,
    begin() {},
    end() {},
  };
}
