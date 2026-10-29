import { atan2 } from "../math/real.ts";
import type { ActionAround, ActionRequest } from "../skills/action.ts";
import type { GaitName } from "../skills/gaits.ts";
import { STANCE_LOWER } from "../skills/locomotion.ts";
import { deepFreeze } from "../state.ts";
import { approachActionWindow, withinActionWindow } from "./action-window.ts";
import { NO_COVER, type Intent } from "./intent.ts";
import { anyBody } from "./parts.ts";
import type { BodySense } from "./senses.ts";
import type { Sight, Tactics } from "./tactics.ts";
import type { TacticsPart } from "./tactics-part.ts";

/**
 * **The Gait drill's tactics**: one action with one effector at one mark of the nearest foe, asked
 * from a gait at a speed: it goes at `speed` m/s straight at the foe by `gait`, until it stands where
 * its action's window would admit it but for its speed (its readiness `ready`, or a window it is
 * within at any speed); there it stops (`stopping`), asking no walk, and asks the action the first
 * step it is ready, walking back into the window where it stopped out of it (`approachActionWindow`),
 * by the same gait; once the action is under way it asks it to its end, then nothing.
 */
export interface GaitDrillConfig {
  readonly kind: "drill-gait";
  /** The action, by the name the mind's actions give it. */
  readonly action: string;
  readonly effector: string;
  readonly mark: "high" | "middle" | "legs";
  readonly gait: GaitName;
  /** How fast it goes at the foe, m/s: a ceiling, under what the gait holds. */
  readonly speed: number;
}

/** Where the drill is: going at its speed, stopped and waiting to be ready, with its action under way, or after it. */
export type GaitDrillPhase = "going" | "stopping" | "striking" | "done";

function gaitDrill(config: GaitDrillConfig): Tactics<Sight, Intent> {
  const state = { phase: "going" as GaitDrillPhase, focus: null as string | null, request: null as ActionRequest | null };
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
    name: "drill-gait", state,
    engagement: { get phase() { return state.phase; }, get focus() { return state.focus; } },
    decide(sight) {
      const { view, report } = sight, foe = nearest(sight), gait = config.gait;
      const still = (face: number): Intent => ({ move: null, face, guard: NO_COVER, actions: [], gait });
      state.focus = foe?.id ?? null;
      if (state.request) {
        const id = state.request.id;
        if (report.actions.some((action) => action.id === id)) return { ...still(report.heading), actions: [state.request] };
        state.request = null;
        state.phase = "done";
      }
      if (!foe || state.phase === "done") return still(report.heading);
      const face = atan2(foe.centre.x - view.stance.centre.x, foe.centre.z - view.stance.centre.z), h = report.heading;
      const target = { kind: "body" as const, body: foe.id, region: { kind: "mark" as const, mark: config.mark } };
      const around: ActionAround = { heading: h, placed: view.stance.phase === "stand", support: report.support ?? null, walk: null, lower: STANCE_LOWER };
      const readiness = sight.readiness(view, config.action, config.effector, target, around);
      if (state.phase === "going") {
        const arrived = readiness.kind === "ready" || readiness.kind === "position" && withinActionWindow(view, { ...readiness.window, speed: Infinity }, h);
        if (!arrived) return { move: [config.speed, 0], face, guard: NO_COVER, actions: [], gait };
        state.phase = "stopping";
      }
      if (readiness.kind === "ready") {
        state.request = { id: sight.instance(), action: config.action, effector: config.effector, target };
        state.phase = "striking";
        return { ...still(face), actions: [state.request] };
      }
      if (readiness.kind === "position") return { ...approachActionWindow(view, readiness.window, h, Infinity), guard: NO_COVER, actions: [], gait };
      return still(face);
    },
  };
}

export const GAIT_DRILL_TACTICS: TacticsPart<GaitDrillConfig> = deepFreeze({
  role: "tactics", label: "Drill: a gait, stopped to strike", stage: "experimental", fields: [], slots: [],
  defaults: { kind: "drill-gait", action: "strike", effector: "hand.right", mark: "middle", gait: "braced", speed: 1 },
  keys: { kind: true, action: true, effector: true, mark: true, gait: true, speed: true }, fits: anyBody,
  phases: { going: "Going", stopping: "Stopping", striking: null, done: "Done" },
  faults: (config: GaitDrillConfig) => [
    ...typeof config.action === "string" && config.action ? [] : ["action: a drill names one action"],
    ...typeof config.effector === "string" && config.effector ? [] : ["effector: a drill names one effector"],
    ...["high", "middle", "legs"].includes(config.mark) ? [] : ["mark: high, middle or legs"],
    ...typeof config.gait === "string" && config.gait ? [] : ["gait: a drill names one of its legs' gaits"],
    ...Number.isFinite(config.speed) && config.speed > 0 ? [] : ["speed: a finite speed, m/s, over nothing"],
  ],
  actionFaults: (config, actions) => actions.includes(config.action) ? [] : [`action: no action ${config.action}`],
  make: (_making, config) => gaitDrill(config),
});
