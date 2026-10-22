/**
 * **A stub navigation**: straight at the goal, round nothing. Its state names it and counts the
 * steps it was asked, so a test can read that the part a config names is the part that ran.
 */
import { atan2, cos, hypot, sin } from "../../../src/core/math/real.ts";
import { anyBody } from "../../../src/core/mind/parts.ts";

/** The pace it walks at, m/s, under the asker's ceiling. */
const PACE = .6;

export const STRAIGHT_NAVIGATION = Object.freeze({
  role: "navigation", label: "Straight (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "straight-navigation" }), keys: Object.freeze({ kind: true }),
  fits: anyBody, faults: () => [],
  make() {
    const state = { stub: "straight-navigation", steps: 0, request: null, status: "stopped", remaining: null, goal: null };
    const report = { get request() { return state.request; }, get status() { return state.status; }, get remaining() { return state.remaining; },
      get goal() { return state.goal; }, get route() { return state.goal ? [state.goal] : []; } };
    return {
      state, report,
      steer: (_view, _heading, move) => move,
      resume() { state.status = "unavailable"; state.goal = null; state.remaining = null; },
      step(sight, request, _gait, ceiling, _dt, available = true) {
        state.steps++;
        state.request = request && JSON.parse(JSON.stringify(request));
        const here = sight.view.stance.centre, h = sight.report.heading;
        let goal = null, near = 0;
        if (request?.kind === "place") { goal = request.points[request.points.length - 1]; near = request.near; }
        if (request?.kind === "range") {
          const foe = sight.view.senses.others.find((other) => other.id === request.focus && !other.out);
          if (foe) { goal = { x: foe.centre.x, z: foe.centre.z }; near = (request.near + request.far) / 2; }
        }
        const x = request?.kind === "direct" ? request.direction.x : goal ? goal.x - here.x : 0;
        const z = request?.kind === "direct" ? request.direction.z : goal ? goal.z - here.z : 0;
        const distance = hypot(x, z), left = goal ? distance - near : distance;
        state.goal = goal && { x: goal.x, z: goal.z }; state.remaining = goal ? Math.max(0, left) : null;
        if (!available || !request || distance === 0 || left <= 0) { state.status = request && left <= 0 ? "arrived" : "stopped"; return { move: null, face: null }; }
        state.status = "moving";
        const speed = Math.min(PACE, ceiling);
        return { move: [(x * sin(h) + z * cos(h)) * speed / distance, (x * cos(h) - z * sin(h)) * speed / distance], face: atan2(x, z), destination: left };
      },
    };
  },
});
