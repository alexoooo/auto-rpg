import { atan2, cos, hypot, sin } from "../math/real.ts";
import type { ActionAround, ActionRequest, Readiness, Window } from "../skills/action.ts";
import { STANCE_LOWER } from "../skills/locomotion.ts";
import { deepFreeze } from "../state.ts";
import { approachActionWindow, withinActionWindow } from "./action-window.ts";
import { NO_COVER, type Intent } from "./intent.ts";
import { anyBody, slotOne, type PartConfig } from "./parts.ts";
import type { BodySense } from "./senses.ts";
import type { Sight, Tactics } from "./tactics.ts";
import { prepareTacticsSkills, tacticsOf, type TacticsPart } from "./tactics-part.ts";

/**
 * **A drill's tactics**: one action with one effector at one mark of the nearest foe, asked once.
 * It turns to the target, or to the middle of the action's window where its readiness names one,
 * walking there no faster than its `pace` (with none, it never walks), and requests the action the
 * first step it is ready. A body that walked goes on to the window's middle, as it will see the
 * window standing, stops there facing the target, and asks once it stands settled (`SETTLED`): an
 * action is not thrown off a walk's last steps. A request the skills
 * refuse at its start is asked again. Once an action it asked has run and ended it asks nothing
 * more. A drill reads the action's own motion from where the body stands. With `fight`, it fights
 * by those tactics until they ask their `moment`th action, and asks its own in that one's place
 * from that step: a moment of a fight handed to the drill.
 */
export interface DrillTacticsConfig {
  readonly kind: "drill";
  /** The action, by the name the mind's actions give it. */
  readonly action: string;
  readonly effector: string;
  readonly mark: "high" | "middle" | "legs";
  /** How long it stands in guard from its first decision before it asks anything, s: the settle a trial starts from. */
  readonly after: number;
  /** The most speed it walks at to bring its target into the action's window, m/s; absent, it stands where it is. */
  readonly pace?: number;
  /** The tactics it fights by until they ask their `moment`th action (from 1), in place of standing; absent, it stands. */
  readonly fight?: PartConfig;
  readonly moment?: number;
}

/** Where the drill is: fighting by its `fight`, before its action (the readiness last read), with it under way, or after it. */
export type DrillPhase = "fighting" | "lost" | Readiness["kind"] | "striking" | "done";

/** How near the middle of an action's window the drill walks to, m: a body stopped at the window's edge is admitted where the action reaches least. */
const MIDDLE = .01;

/** `window` narrowed to `MIDDLE` about its middle. */
function middleOf(window: Window): Window {
  const along = (window.along[0] + window.along[1]) / 2, across = (window.across[0] + window.across[1]) / 2;
  return { ...window, along: [along - MIDDLE, along + MIDDLE], across: [across - MIDDLE, across + MIDDLE] };
}

/**
 * How far past an action's window a body that stopped inside it may sway and still stand there, m:
 * the window moves with the head, which bobs that much as a walk's last steps land.
 */
const SWAY = .03;

/** The most speed over the ground a standing body has once a walk's sway has died out, m/s. */
const SETTLED = .06;

/** `window` widened by `by` m along and across. */
function widened(window: Window, by: number): Window {
  return { ...window, along: [window.along[0] - by, window.along[1] + by], across: [window.across[0] - by, window.across[1] + by] };
}

/** `window` as a body standing where it is would have it: less `lean`, the head's lead over the centre of mass along the heading while it walks. */
function standing(window: Window, lean: number): Window {
  return { ...window, along: [window.along[0] - lean, window.along[1] - lean] };
}

function drillTactics(config: DrillTacticsConfig, fight: Tactics | null): Tactics<Sight, Intent> {
  const state = { phase: (fight ? "fighting" : "lost") as DrillPhase, reason: "", focus: null as string | null, request: null as ActionRequest | null, started: false, since: null as number | null,
    /**
     * The action's window its readiness last named, and whether it has walked toward it: a body that
     * walked is brought to the window's middle and settled there before it asks, though it reads
     * ready on the way.
     */
    window: null as Window | null, walked: false,
    /** Whether it stands where its walk stopped, for the body to settle there; and, once it has, the way it faces, which it keeps until it asks. */
    held: false, set: null as number | null,
    /** The actions its fight asked, by id, and how many. */
    asked: [] as number[], fight: fight?.state ?? null };
  /** The fight's intent this step, or null from the step it asks its `moment`th action. */
  const fighting = (sight: Sight, dt: number): Intent | null => {
    const intent = fight!.decide(sight, dt);
    for (const request of intent.actions) {
      if (state.asked.includes(request.id)) continue;
      state.asked.push(request.id);
      if (state.asked.length >= (config.moment ?? 1)) { state.phase = "lost"; return null; }
    }
    return intent;
  };
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
      get focus() { return state.phase === "fighting" ? fight!.engagement?.focus ?? null : state.focus; },
      get details() { return state.reason ? [{ label: "readiness", value: state.reason }] : []; },
    },
    get decision() { return state.phase === "fighting" ? fight!.decision : undefined; },
    decide(sight, dt) {
      if (state.phase === "fighting") {
        const intent = fighting(sight, dt);
        if (intent) return intent;
        state.since = sight.view.time - config.after;
      }
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
      const h = report.heading, toward = atan2(foe.centre.x - view.stance.centre.x, foe.centre.z - view.stance.centre.z);
      const settled = view.stance.phase === "stand" && hypot(view.stance.velocity.x, view.stance.velocity.z) <= SETTLED;
      if (readiness.kind === "position") state.window = { ...readiness.window, at: [...readiness.window.at] as Window["at"] };
      const window = state.window;
      if (window && (readiness.kind === "position" || readiness.kind === "ready" && state.walked && !state.held)) {
        const lean = (view.head.x - view.stance.centre.x) * sin(h) + (view.head.z - view.stance.centre.z) * cos(h), middle = middleOf(standing(window, lean));
        state.held = state.held ? withinActionWindow(view, widened(window, SWAY), h) && !(settled && !withinActionWindow(view, window, h))
          : withinActionWindow(view, middle, h);
        if (state.held) state.set ??= toward;
        const legs = approachActionWindow(view, middle, h, config.pace ?? 0, Infinity, MIDDLE);
        if (config.pace === undefined || state.held || !legs.movement) return { move: null, face: state.set ?? legs.face, guard: NO_COVER, actions: [] };
        state.walked = true;
        return { ...legs, guard: NO_COVER, actions: [] };
      }
      const face = state.set ?? toward;
      if (readiness.kind !== "ready" || state.walked && !settled) return { move: null, face, guard: NO_COVER, actions: [] };
      state.request = { id: sight.instance(), action: config.action, effector: config.effector, target };
      state.phase = "striking";
      return { move: null, face, guard: NO_COVER, actions: [state.request] };
    },
  };
}

export const DRILL_TACTICS: TacticsPart<DrillTacticsConfig> = deepFreeze({
  role: "tactics", label: "Drill one action", stage: "experimental", fields: [], slots: [slotOne("fight", "Fight until the moment", "tactics", true)],
  defaults: { kind: "drill", action: "strike", effector: "hand.right", mark: "high", after: .5 },
  keys: { kind: true, action: true, effector: true, mark: true, after: true, pace: true, fight: true, moment: true }, fits: anyBody,
  phases: { fighting: "Fighting", lost: "Finding the target", position: "Out of its window", waiting: "Waiting", blocked: "Refused", ready: "Ready", striking: null, done: "Done" },
  faults: (config: DrillTacticsConfig) => [
    ...typeof config.action === "string" && config.action ? [] : ["action: a drill names one action"],
    ...typeof config.effector === "string" && config.effector ? [] : ["effector: a drill names one effector"],
    ...["high", "middle", "legs"].includes(config.mark) ? [] : ["mark: high, middle or legs"],
    ...Number.isFinite(config.after) && config.after >= 0 ? [] : ["after: a finite time, s, not negative"],
    ...config.pace === undefined || Number.isFinite(config.pace) && config.pace >= 0 ? [] : ["pace: a finite speed, m/s, not negative"],
    ...config.moment === undefined || config.fight !== undefined && Number.isSafeInteger(config.moment) && config.moment >= 1 ? [] : ["moment: a count from 1, of a fight's actions"],
  ],
  actionFaults: (config, actions, parts) => [...actions.includes(config.action) ? [] : [`action: no action ${config.action}`],
    ...config.fight ? (parts.of("tactics", config.fight).actionFaults?.(config.fight, actions, parts) ?? []).map((fault) => `fight: ${fault}`) : []],
  kitFaults: (config, kit, parts) => config.fight ? (parts.of("tactics", config.fight).kitFaults?.(config.fight, kit, parts) ?? []).map((fault) => `fight: ${fault}`) : [],
  decisionCapabilities: (config, parts) => config.fight ? parts.of("tactics", config.fight).decisionCapabilities?.(config.fight, parts) ?? [] : [],
  prepareSkills: (making, config, skills, decision) => config.fight ? prepareTacticsSkills(making, config.fight, skills, decision) : skills,
  make: (making, config) => drillTactics(config, config.fight ? tacticsOf(making, config.fight) : null),
});
