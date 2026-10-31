import { BRACE_OPTION, COVER_OPTION, GUARD_OPTION, HOLD_OPTION, ORDERS_OPTION, PLACE_WALK, PRESSURE_WALK, RISE_OPTION, STRIKE_OPTION, WINDOWS_WALK } from "./kinds.ts";

/**
 * **Every kind of option, by its kind** (`OptionPart`), in the order a picker offers them: a line here
 * registers one. This module holds its imports and this list and nothing else: a case's code
 * reads it as where each kind's own code begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const OPTION_KINDS = {
  orders: ORDERS_OPTION, strikes: STRIKE_OPTION, "walk-into-windows": WINDOWS_WALK, "walk-out-of-pressure": PRESSURE_WALK, "walk-to-place": PLACE_WALK, rise: RISE_OPTION, covers: COVER_OPTION,
  "hold-position": HOLD_OPTION, "hands-at-guard": GUARD_OPTION, brace: BRACE_OPTION,
};
