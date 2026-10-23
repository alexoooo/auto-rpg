import { regionSegments, sensedActionTarget } from "../../mind/action-aim.ts";
import { engagementWithDetails, type Tactics } from "../../mind/tactics.ts";

/** Each policy gets six seconds of combat before its observed contact score is compared. */
const PERIOD = 6;
/** A policy's latest complete period and its earlier score have equal weight. */
const RECENCY = .5;
/** Revisit the other policy after four consecutive complete periods, including an earlier quiet trial. */
const REVISIT = 4;

/** Compare target-impact scores from two ordinary policies, switching only between strokes: with none under way, or every one recovering and holding nothing. */
export function adaptiveGuard(attacking: Tactics, defensive: Tactics, revisit = false): Tactics {
  const policies = [attacking, defensive];
  const state = { attacking: attacking.state ?? null, defensive: defensive.state ?? null, mode: 0,
    since: null as number | null, score: 0, rates: [0, 0], samples: [0, 0], streak: 0,
    time: 0, between: true, reason: "initial policy",
    motion: { left: [0, 0, 0], right: [0, 0, 0] }, sampled: { left: -1, right: -1 } };
  const chosen = () => policies[state.mode]!;
  const engagement = engagementWithDetails(() => chosen().engagement, () => [
    { label: "Evasion policy", value: state.mode === 0 ? "attack only" : "evasion allowed" },
    { label: "Policy selection", value: state.reason },
    ...["Attack-only contacts", "Evasion-allowed contacts"].map((label, mode) => ({ label,
      value: state.samples[mode] === 0 ? "untried" : `${state.rates[mode]!.toFixed(3)} score/s · ${state.samples[mode]} periods` })),
    { label: "Policy trial", value: state.since === null ? "waiting for a committed stroke"
      : `${(state.time - state.since).toFixed(2)} s · ${state.score.toFixed(3)} contact score${!state.between ? " · waiting for stroke release" : ""}` },
  ]);
  return { name: attacking.name, state, engagement, get decision() { return chosen().decision; },
    decide(sight, dt) {
      const view = sight.view;
      state.time = view.time;
      for (const hand of ["left", "right"] as const) {
        const effector = `hand.${hand}`, feedback = view.effectors[effector]?.feedback, before = state.motion[hand];
        const action = sight.report.actions.find(action => action.effector === effector && action.phase === "commit");
        if (action) state.since ??= view.time;
        if (feedback && feedback.completedStep !== undefined && feedback.completedStep !== state.sampled[hand]) {
          const foe = action && sensedActionTarget(view, action.target);
          const targets = foe && action?.target.kind === "body" ? regionSegments(foe.spec, action.target.region) : [];
          if (foe) for (const pair of feedback.pairs ?? []) {
            if (!pair.onset || !pair.loaded || pair.target.kind !== "body" || pair.target.body !== foe.id
              || pair.target.guard || !targets.includes(pair.target.segment)) continue;
            const part = foe.segments.get(pair.target.segment);
            if (!part) continue;
            const dx = pair.point[0] - part.centre.x, dy = pair.point[1] - part.centre.y, dz = pair.point[2] - part.centre.z;
            const vx = part.velocity.x + part.spin.y * dz - part.spin.z * dy;
            const vy = part.velocity.y + part.spin.z * dx - part.spin.x * dz;
            const vz = part.velocity.z + part.spin.x * dy - part.spin.y * dx;
            // Normal impulse times preceding relative normal speed ranks the observed impacts.
            state.score += pair.impulse * Math.abs((before[0]! - vx) * pair.normal[0]
              + (before[1]! - vy) * pair.normal[1] + (before[2]! - vz) * pair.normal[2]);
          }
          state.sampled[hand] = feedback.completedStep;
          before[0] = feedback.velocity[0]; before[1] = feedback.velocity[1]; before[2] = feedback.velocity[2];
        }
      }
      const between = !sight.report.actions.length
        || sight.report.actions.every(action => action.phase === "release" && action.holds.length === 0);
      state.between = between;
      if (state.since !== null && view.time - state.since >= PERIOD && between) {
        const mode = state.mode, other = 1 - mode, rate = state.score / (view.time - state.since);
        state.rates[mode] = state.samples[mode] === 0 ? rate : state.rates[mode]! * RECENCY + rate * (1 - RECENCY);
        state.samples[mode]!++;
        const preferred = state.samples[other] === 0 ? other : state.rates[0]! >= state.rates[1]! ? 0 : 1;
        state.reason = state.samples[other] === 0 ? "sample the other policy"
          : state.rates[0] === state.rates[1] ? "equal scores prefer attack only" : "higher observed contact score";
        if (revisit) {
          state.streak = preferred === mode ? state.streak + 1 : 0;
          state.mode = state.streak >= REVISIT ? other : preferred;
          if (state.streak >= REVISIT) state.reason = "scheduled revisit";
          if (state.mode !== mode) state.streak = 0;
        } else state.mode = preferred;
        state.score = 0; state.since = view.time;
      }
      return chosen().decide(sight, dt);
    },
  };
}
