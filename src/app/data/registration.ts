import { STRAIGHT_PUNCH_DATA } from "../../skills/strikes/straight-punch/data/registration.ts";
import { STOMP_DATA } from "../../skills/strikes/stomp/data/registration.ts";
import { SWING_DATA } from "../../skills/strikes/swing/data/registration.ts";
import { BONK_DATA } from "../../skills/strikes/bonk/data/registration.ts";
import { HELD_BLOW_DATA } from "../../skills/strikes/held-blow/data/registration.ts";
import { STRIKE_PROFILES_DATA } from "../../skills/strikes/data/registration.ts";

/** The application's strike data, in catalog registration order. */
export const STRIKE_DATA = {
  ...STRAIGHT_PUNCH_DATA,
  ...STOMP_DATA,
  ...SWING_DATA,
  ...BONK_DATA,
  ...HELD_BLOW_DATA,
  ...STRIKE_PROFILES_DATA,
};
