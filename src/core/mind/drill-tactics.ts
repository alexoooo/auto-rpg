import { atan2 } from "../math/real.ts";
import type { ActionAround, ActionRequest, Readiness } from "../skills/action.ts";
import { STANCE_LOWER } from "../skills/locomotion.ts";
import { deepFreeze } from "../state.ts";
import { approachActionWindow } from "./action-window.ts";
import { NO_COVER, type Intent } from "./intent.ts";
import { anyBody } from "./parts.ts";
import type { BodySense } from "./senses.ts";
import type { Sight, Tactics } from "./tactics.ts";
import type { TacticsPart } from "./tactics-part.ts";

/**
 * **A drill's tactics**: one action with one effector at one mark of the nearest foe, asked once.
 * The body never walks: it turns to the target, or to the middle of the action's window where its
 * readiness names one, and requests the action the first step it is ready; a request the skills
 * refuse at its start is asked again. Once an action it asked has run and ended it asks nothing
 * more. A drill reads the action's own motion from where the body stands.
 */
export interface DrillTacticsConfig {
  readonly kind: "drill";
  /** The action, by the name the mind's actions give it. */
  readonly action: string;
  readonly effector: string;
  readonly mark: "high" | "middle" | "legs";
  /** How long it stands in guard from its first decision before it asks anything, s: the settle a trial starts from. */
  readonly after: number;
}

/** Where the drill is: before its action (the readiness last read), with it under way, or after it. */
export type DrillPhase = "lost" | Readiness["kind"] | "striking" | "done";

function drillTactics(config: DrillTacticsConfig): Tactics<Sight, Intent> {
  const state = { phase: "lost" as DrillPhase, reason: "", focus: null as string | null, request: null as ActionRequest | null, started: false, since: null as number | null };
  const nearest = (sight: Sight): BodySense | null => {
    const { view } = sight;
    let best: BodySense | null = null, distance = Infinity;
    for (const other of view.senses.others) {
      if (other.out || other.side === view.senses.side) continue;
      const dx = other.centre.x - view.stance.centre.x, dz = other.centre.z - view.stance.centre.z, apart = dx * dx + dz * dz;
      if (apart < distance) { best = other; distance = apart; }
    }
    return best;
  };
  return {
    name: "drill",
    state,
    engagement: {
      get phase() { return state.phase; },
      get focus() { return state.focus; },
      get details() { return state.reason ? [{ label: "readiness", value: state.reason }] : []; },
    },
    decide(sight) {
      const { view, report } = sight, foe = nearest(sight);
      state.focus = foe?.id ?? null;
      state.since ??= view.time;
      if (state.request) {
        const id = state.request.id;
        if (report.actions.some((action) => action.id === id)) {
          state.started = true;
          return { move: null, face: report.heading, guard: NO_COVER, actions: [state.request] };
        }
        // A request the skills refused at its start is asked again, with a new id, once ready.
        state.request = null;
        if (state.started) { state.phase = "done"; state.reason = ""; }
      }
      if (view.time < state.since + config.after) { state.phase = "lost"; state.reason = "settling"; return { move: null, face: report.heading, guard: NO_COVER, actions: [] }; }
      if (!foe || state.phase === "done") {
        if (!foe && state.phase !== "done") { state.phase = "lost"; state.reason = ""; }
        return { move: null, face: report.heading, guard: NO_COVER, actions: [] };
      }
      const target = { kind: "body" as const, body: foe.id, region: { kind: "mark" as const, mark: config.mark } };
      const around: ActionAround = { heading: report.heading, placed: view.stance.phase === "stand", support: report.support ?? null, walk: null, lower: STANCE_LOWER };
      const readiness = sight.readiness(view, config.action, config.effector, target, around);
      state.phase = readiness.kind;
      state.reason = readiness.kind === "blocked" || readiness.kind === "waiting" ? readiness.reason : "";
      const face = readiness.kind === "position" ? approachActionWindow(view, readiness.window, report.heading, 0).face
        : atan2(foe.centre.x - view.stance.centre.x, foe.centre.z - view.stance.centre.z);
      if (readiness.kind !== "ready") return { move: null, face, guard: NO_COVER, actions: [] };
      state.request = { id: sight.instance(), action: config.action, effector: config.effector, target };
      state.phase = "striking";
      return { move: null, face, guard: NO_COVER, actions: [state.request] };
    },
  };
}

export const DRILL_TACTICS: TacticsPart<DrillTacticsConfig> = deepFreeze({
  role: "tactics", label: "Drill one action", stage: "experimental", fields: [], slots: [],
  defaults: { kind: "drill", action: "strike", effector: "hand.right", mark: "high", after: .5 },
  keys: { kind: true, action: true, effector: true, mark: true, after: true }, fits: anyBody,
  phases: { lost: "Finding the target", position: "Out of its window", waiting: "Waiting", blocked: "Refused", ready: "Ready", striking: null, done: "Done" },
  faults: (config: DrillTacticsConfig) => [
    ...typeof config.action === "string" && config.action ? [] : ["action: a drill names one action"],
    ...typeof config.effector === "string" && config.effector ? [] : ["effector: a drill names one effector"],
    ...["high", "middle", "legs"].includes(config.mark) ? [] : ["mark: high, middle or legs"],
    ...Number.isFinite(config.after) && config.after >= 0 ? [] : ["after: a finite time, s, not negative"],
  ],
  actionFaults: (config: DrillTacticsConfig, actions: readonly string[]) => actions.includes(config.action) ? [] : [`action: no action ${config.action}`],
  make: (_making, config) => drillTactics(config),
});
