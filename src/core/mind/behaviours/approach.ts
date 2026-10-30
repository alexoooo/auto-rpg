import { deepFreeze } from "../../state.ts";
import { cleanMiss } from "../../skills/action-instances.ts";
import { approachActionWindow } from "../action-window.ts";
import { nonnegative, type BehaviourPart } from "../behaviour-part.ts";
import { number } from "../../parts/fields.ts";
import { anyBody } from "../../parts/parts.ts";

/**
 * **Approach**: walk into the chosen candidate's window, `spacing` m further out than it asks, the
 * spacing closing by `spacingStep` m at each clean miss; `travel` caps the walk's speed.
 */
interface ApproachConfig { readonly kind: "approach"; readonly spacing?: number; readonly spacingStep?: number; readonly travel?: number }

export const APPROACH: BehaviourPart<ApproachConfig> = deepFreeze({
  role: "behaviour", label: "Approach action", stage: "game", phases: { approach: "Approaching" }, slots: [], defaults: { kind: "approach", spacing: 0, spacingStep: 0 },
  fields: [
    number<ApproachConfig, "spacing">("spacing", "Spacing", 0, 1, .05, "m"),
    number<ApproachConfig, "spacingStep">("spacingStep", "Miss adjustment", 0, .2, .01, "m"),
  ],
  keys: { kind: true, spacing: true, spacingStep: true, travel: true }, fits: anyBody, faults: nonnegative,
  make(_making, config) {
    const state = { spacing: config.spacing ?? 0 };
    return { state,
      ended(record) { if (cleanMiss(record)) state.spacing = Math.max(0, state.spacing - (config.spacingStep ?? 0)); },
      decide(turn) {
        if (turn.legs || turn.pending?.readiness.kind !== "position") return;
        const window = turn.pending.readiness.window, spacing = state.spacing;
        turn.legs = approachActionWindow(turn.sight.view, { ...window, along: [window.along[0] + spacing, window.along[1] + spacing] }, turn.sight.report.heading, turn.pace ?? Infinity, config.travel);
        turn.approach = window;
        turn.phase = "approach";
      } };
  },
});
