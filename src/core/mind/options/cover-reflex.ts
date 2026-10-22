import { cos, sin } from "../../math/real.ts";
import type { BodySpec } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";
import { coveringHand } from "../cover-hand.ts";
import { anyBody } from "../parts.ts";
import type { Reflex, ReflexPart } from "./reflex.ts";

/** The longest its cover holds a hand up against one run of blows, s. */
const COVER_LONGEST = 1;

/**
 * **Cover**: the hand on the side a foe's blow closes on the head from (`Situation.threat`), where
 * it is free, between the two, for at most `longest` s at a time.
 */
export function cover(longest: number, spec?: BodySpec): Reflex {
  return {
    name: "cover", limbs: ["hand.left", "hand.right"], seizes: false, longest,
    trigger(now) {
      const threat = now.threat;
      if (!threat) return null;
      const h = now.sight.report.heading, dx = threat.threat[0] - threat.guarded[0], dz = threat.threat[2] - threat.guarded[2];
      const preferred = dx * cos(h) - dz * sin(h) >= 0 ? "right" : "left", hand = spec ? coveringHand(spec, preferred) : preferred;
      return { guard: { [`hand.${hand}`]: threat } };
    },
  };
}

/** The cover reflex's config. */
interface CoverReflexConfig { readonly kind: "cover-reflex" }

export const COVER_REFLEX: ReflexPart<CoverReflexConfig> = deepFreeze({
  role: "reflex", label: "Cover", stage: "game", fields: [], slots: [], defaults: { kind: "cover-reflex" },
  keys: { kind: true }, fits: anyBody, faults: () => [],
  make: (_config, spec) => cover(COVER_LONGEST, spec),
});
