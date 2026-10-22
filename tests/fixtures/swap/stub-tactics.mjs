/**
 * **A stub planner**: the behaviour tactics over its own list, its decisions counted. Its state
 * names it, so a test can read that the tactics a config names are the tactics that ran.
 */
import { actionTactics } from "../../../src/core/mind/action-tactics.ts";
import { FIGHTING } from "../../../src/core/mind/config.ts";
import { slotList, anyBody } from "../../../src/core/mind/parts.ts";

export const STUB_TACTICS = Object.freeze({
  role: "tactics", label: "Counted behaviours (stub)", stage: "experimental", fields: [], slots: [slotList("list", "Behaviours", "behaviour")],
  defaults: Object.freeze({ ...FIGHTING, kind: "stub-tactics" }), keys: Object.freeze({ kind: true, target: true, choose: true, list: true }),
  fits: anyBody, faults: () => [],
  make(making, config) {
    const inner = actionTactics(making, { ...config, kind: "behaviours" }), state = { stub: "stub-tactics", steps: 0, inner: inner.state };
    return { name: "Counted", state, engagement: inner.engagement, decide(sight, dt) { state.steps++; return inner.decide(sight, dt); } };
  },
});
