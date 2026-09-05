import { HEAD_PLAIN } from "../config.ts";
import { headModule, type HeadModuleDefinition } from "./head.ts";

/**
 * `head.plain`: the fatal carved block, on the neck, with no attack at all.
 *
 * It is the ram's control condition in the strictest sense the module contract allows: the same
 * neck, the same head block, the same mass in every part they share, and `ram: null` -- so it
 * publishes no `Striking`, offers no `thrust` stroke on its envelope, and does nothing whatever
 * with `Intent.natural.thrust`. A hand slot is inert on a body with no hands and this is the same
 * sentence pointed at the natural channel.
 *
 * What it does decide for itself is how far it ducks: `HEAD_PLAIN.guardPitch` is nearly twice the
 * ram's, because a head with nothing on its brow has nothing to present and everything to hide.
 */
export const headPlain: HeadModuleDefinition = headModule("head.plain", "plain head", {
  guardPitch: HEAD_PLAIN.guardPitch,
  ram: null,
});
