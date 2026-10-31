/**
 * **A stub planner**: the behaviour tactics over its own list, its decisions counted. Its state
 * names it, so a test can read that the tactics a config names are the tactics that ran; its report
 * adds its own detail, the count (`Engagement.details`).
 */
import { actionTactics, BEHAVIOUR_TACTICS } from "../../../src/core/tactics/action-tactics.ts";
import { FIGHTING } from "../../../src/core/tactics/config.ts";
import { slotList, anyBody } from "../../../src/core/parts/parts.ts";

export const STUB_TACTICS = Object.freeze({
  role: "tactics", label: "Counted behaviours (stub)", stage: "experimental", fields: [], slots: [slotList("list", "Behaviours", "behaviour")],
  defaults: Object.freeze({ ...FIGHTING, kind: "swap:stub-tactics" }), keys: Object.freeze({ kind: true, target: true, choose: true, list: true }),
  fits: anyBody, faults: () => [],
  decisionCapabilities: BEHAVIOUR_TACTICS.decisionCapabilities,
  prepareSkills(_making, _config, skills, decider) {
    const state = skills.state.preparation ??= { built: 0, steps: 0, focus: null };
    state.built++;
    return { ...skills, get envelope() { return skills.envelope; }, command(view, intent, dt) {
      state.steps++; state.focus = decider.decision?.focus ?? null;
      return skills.command(view, intent, dt);
    } };
  },
  make(making, config) {
    const inner = actionTactics(making, { ...config, kind: "behaviours" }), state = { stub: "swap:stub-tactics", steps: 0, inner: inner.state };
    const engagement = { get phase() { return inner.engagement.phase; }, get focus() { return inner.engagement.focus; }, get lost() { return inner.engagement.lost; },
      get candidates() { return inner.engagement.candidates; }, get pending() { return inner.engagement.pending; },
      get details() { return [{ label: "Decided", value: `${state.steps} steps` }]; } };
    return { name: "Counted", state, engagement, get decision() { return inner.decision; }, decide(sight, dt) { state.steps++; return inner.decide(sight, dt); } };
  },
});
