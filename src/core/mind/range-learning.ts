import type { HandFeedback } from "../control/hand-feedback.ts";
import type { Hand } from "../control/motor.ts";
import type { StrikeReport } from "../skills/strike.ts";

/** Range adaptation only consumes positive spacing; omitted or zero steps preserve fixed spacing. */
export function validRangeLearning(spacing = 0, step = 0): boolean {
  return Number.isFinite(spacing) && Number.isFinite(step) && step >= 0 && (step === 0 || spacing >= 0);
}

/** A clean miss with a verified return reduces optional extra spacing: `docs/reference/combat-range-learning.md`. */
export function rangeLearning(spacing: number, step: number) {
  if (!validRangeLearning(spacing, step)) throw new Error("range learning needs finite spacing and a nonnegative step; active learning needs nonnegative spacing");
  const state = { offset: spacing, hand: null as Hand | null, launched: false, touched: false, returned: 0, misses: 0, adjustments: 0 };
  const cancel = () => { state.hand = null; state.launched = false; state.touched = false; state.returned = 0; };
  return { state, cancel, restart() { cancel(); state.offset = spacing; state.misses = 0; state.adjustments = 0; },
    observe(report: StrikeReport, feedback: Readonly<Record<Hand, HandFeedback>> | undefined) {
      if (state.hand && !report.hand) {
        if (state.launched && !state.touched && (report.pointCycle?.returned[state.hand] ?? 0) > state.returned) {
          state.misses++;
          const offset = Math.max(0, state.offset - step);
          if (offset < state.offset) { state.offset = offset; state.adjustments++; }
        }
        cancel();
      }
      if (state.hand && report.hand !== state.hand) cancel();
      if (!state.hand && report.hand && report.phase === "chamber") {
        state.hand = report.hand; state.returned = report.pointCycle?.returned[report.hand] ?? 0;
      }
      if (state.hand && report.hand === state.hand) {
        state.launched ||= report.phase === "swing";
        state.touched ||= (feedback?.[state.hand].impulse ?? 0) > 0;
      }
    } };
}
