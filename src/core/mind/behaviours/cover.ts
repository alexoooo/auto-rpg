import { deepFreeze } from "../../state.ts";
import { cos, sin } from "../../math/real.ts";
import type { BehaviourPart } from "../behaviour-part.ts";
import { coveringHand } from "../cover-hand.ts";
import { choice } from "../../parts/fields.ts";
import type { Cover } from "../intent.ts";
import { anyBody } from "../../parts/parts.ts";
import { READINGS, threatReader } from "../threat.ts";

/** What the hands cover against: nothing beyond the pose, the threat, its predicted contact on the head or the body, or the weapon, warded off. */
type CoverPolicy = "pose" | "cover" | "predictive" | "body" | "ward";
const POLICIES: readonly string[] = ["pose", "cover", "predictive", "body", "ward"] satisfies readonly CoverPolicy[];

/** **Guard**: the hands cover as `guard` says; with a shield, the hand that holds it covers its side. */
interface CoverConfig { readonly kind: "cover"; readonly guard: CoverPolicy }

export const COVER: BehaviourPart<CoverConfig> = deepFreeze({
  role: "behaviour", label: "Guard", stage: "game", slots: [], defaults: { kind: "cover", guard: "cover" },
  fields: [choice<CoverConfig, "guard">("guard", "Guard", [["cover", "Cover threat"], ["predictive", "Predict contact"], ["body", "Predict contact on the body"], ["ward", "Ward off the weapon"], ["pose", "Hold pose"]])],
  keys: { kind: true, guard: true }, fits: anyBody,
  faults: (config) => POLICIES.includes(config.guard) ? [] : ["guard must name a cover policy"],
  make({ spec }, config) {
    const threat = threatReader(), shield = spec.held?.some(({ item }) => item.coverNormal !== undefined);
    return { decide(turn) {
      const view = turn.sight.view;
      let cover: Cover | null;
      switch (config.guard) {
        case "pose": cover = null; break;
        case "cover": cover = threat.threatOf(view, READINGS.threat); break;
        case "predictive": cover = threat.threatOf(view, READINGS.predicted); break;
        case "body": cover = threat.threatOf(view, READINGS.body); break;
        case "ward": cover = threat.threatOf(view, READINGS.ward); break;
        default: { const never: never = config.guard; throw new Error(`unknown cover ${never}`); }
      }
      if (cover && shield) {
        const dx = cover.threat[0] - cover.guarded[0], dz = cover.threat[2] - cover.guarded[2], h = turn.sight.report.heading;
        const hand = coveringHand(spec, dx * cos(h) - dz * sin(h) >= 0 ? "right" : "left");
        if (hand === "left" && turn.left === undefined) turn.left = cover;
        if (hand === "right" && turn.right === undefined) turn.right = cover;
      } else { if (turn.left === undefined) turn.left = cover; if (turn.right === undefined) turn.right = cover; }
    } };
  },
});
