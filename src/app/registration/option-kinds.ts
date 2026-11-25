import { BACK_STEP_OPTION, COVER_OPTION, GUARD_OPTION, HOLD_AT_OPTION, HOLD_OPTION, ORDERS_OPTION, WALK_OPTION } from "../../minds/option/options/kinds.ts";
import { BITE_OPTION, BONK_OPTION, CLUB_BLOW_OPTION, KICK_OPTION, STOMP_OPTION, STRAIGHT_PUNCH_OPTION, SWORD_THRUST_OPTION } from "../../minds/option/options/strike-kinds.ts";
import { BRACE_OPTION, BRACE_TUMBLING_OPTION, FLATTEN_OPTION, LAND_OPTION, REPOSITION_OPTION, REGAIN_OPTION, WAY_UP_OPTION } from "../../minds/option/options/rise.ts";

/**
 * **Every kind of option, by its kind** (`OptionPart`), in the order a picker offers them: a line here
 * registers one.
 */
export const OPTION_KINDS = {
  orders: ORDERS_OPTION, "strike-straight-punch": STRAIGHT_PUNCH_OPTION, "strike-club-blow": CLUB_BLOW_OPTION, "strike-sword-thrust": SWORD_THRUST_OPTION,
  "strike-bonk": BONK_OPTION,
  "strike-stomp": STOMP_OPTION, "strike-kick": KICK_OPTION, "strike-bite": BITE_OPTION,
  walk: WALK_OPTION, "steps-back": BACK_STEP_OPTION,
  "brace-tumbling": BRACE_TUMBLING_OPTION, regaining: REGAIN_OPTION, "way-up": WAY_UP_OPTION, reposition: REPOSITION_OPTION, flattening: FLATTEN_OPTION, landing: LAND_OPTION,
  covers: COVER_OPTION, "hold-position": HOLD_OPTION, "hold-at-place": HOLD_AT_OPTION, "hands-at-guard": GUARD_OPTION, "brace-down": BRACE_OPTION,
};
