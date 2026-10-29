import type { Body, BodyView } from "../../body.ts";
import { heldBody } from "../held-body.ts";
import type { Clock } from "../../clock.ts";
import { bodyEffectors } from "../../control/effectors.ts";
import type { MusclePush } from "../../control/motor.ts";
import type { ActionClaim, ActionEnding, ActionRequest, Executor, LifecycleUpdate, Phase, Readiness, Resource } from "../../skills/action.ts";
import type { ActionBinding, ExecutorBinding } from "../../skills/action-instances.ts";
import type { Side } from "../../spec/body.ts";
import type { MindKit } from "../kit.ts";
import { flatten } from "./flatten.ts";
import { brace, steadying } from "./steady.ts";
import { poseDrive, type TechniqueEnd, type TechniquePart, type TechniqueRun } from "./technique.ts";

/**
 * **The ground's modes**, the actions beside the techniques that no edge names: `brace` (falling,
 * `brace`), `land` (the commands carried on while the body lands) and `steady` (on its feet,
 * `steadying`).
 */
const GROUND_MODES = Object.freeze(["brace", "land", "steady"] as const);
type GroundMode = (typeof GROUND_MODES)[number];

/** The ground executor's name among a body's executors. */
export const GROUND = "ground";

/** A side's effector: what a ground action names the side it is begun on by. */
export const sideEffector = (side: Side): string => `foot.${side}`;

/** What the ground executor gives the options that run it (`groundOptions`): the runs of its techniques by name, and its actions. */
export interface GroundExecutor {
  readonly binding: ExecutorBinding;
  readonly actions: readonly ActionBinding[];
  /** Each technique's run, by name: the registry's, and `flatten`. */
  readonly runs: Readonly<Record<string, TechniqueRun>>;
  /** The steady's memory (`steadying`): whether it climbs. */
  readonly steady: { readonly climb: { readonly on: boolean } };
}

/** An action's end as its record shows it: a technique done completes, one that failed stalls; one let go before its end is cancelled. */
const endingOf = (end: TechniqueEnd | null): ActionEnding => end === null ? { kind: "cancelled", reason: "let go" } : end === "done" ? { kind: "completed" } : { kind: "stalled", reason: end };

/**
 * **The ground executor** (`GROUND`): each technique of `registry` that fits the body, `flatten`,
 * and the ground's modes (`GROUND_MODES`), an action each, run on the body held whole (`heldBody`)
 * with the mind's motor and guard (`kit`). An action holds every resource of the body and asks no
 * stance (`ActionClaim.legs` null): its claim pushes every muscle as its run commanded it, at its
 * activation and toward its speed. It is begun on the side its effector names (`sideEffector`),
 * where its technique admits the body as it lies (`TechniqueRun.admits`; a mode, anywhere); begun
 * when no ground action ran the step before, it takes the muscles' command as it is and its steady
 * forgets what it had under way. A technique stepped to its end stays live, its stage `ended:` and
 * its end, holding its last command until it is let go; a mode runs until it is let go. Running, an
 * action is committed, and ended, released. Its memory is the instance it runs, the command, and
 * each run's.
 */
export function groundExecutor(body: Body, clock: Clock, kit: MindKit, registry: Readonly<Record<string, TechniquePart>>): GroundExecutor {
  const n = body.muscles.channels.length;
  const command = { activation: new Float64Array(n), velocity: new Float64Array(n) };
  const own = heldBody(body, command.activation, command.velocity);
  const runs: Record<string, TechniqueRun> = {};
  for (const [name, part] of Object.entries(registry)) if (part.fits(own.spec, part.defaults, kit.parts) === null) runs[name] = part.make(own, body.view, clock, kit);
  runs.flatten = flatten(own, body.view);
  const steady = steadying(own, body.view, kit), drive = poseDrive(own.muscles);
  const needs: readonly Resource[] = Object.freeze([...bodyEffectors(body.built).map((effector) => effector.model.segment), "legs", "trunk"]);
  const names = [...Object.keys(runs), ...GROUND_MODES];
  const state = {
    live: null as { id: number; action: string; side: Side; end: TechniqueEnd | null } | null,
    /** Whether a ground action ran the step before. */
    carried: false,
    command, steady: steady.state, runs: Object.fromEntries(Object.entries(runs).map(([name, run]) => [name, run.state])),
  };
  const sideOf = (effector: string): Side => effector === sideEffector("right") ? "right" : "left";
  const isMode = (action: string): action is GroundMode => (GROUND_MODES as readonly string[]).includes(action);
  /** Step the live action once: its technique's end where it ends. */
  const stepLive = (view: BodyView, dt: number): TechniqueEnd | null => {
    const live = state.live!;
    if (isMode(live.action)) {
      switch (live.action) {
        case "brace": brace(drive, "falling"); return null;
        case "land": return null;
        case "steady": steady.step(dt); return null;
        default: { const never: never = live.action; throw new Error(`unknown ground mode ${never}`); }
      }
    }
    const g = view.ground;
    return g ? runs[live.action]!.step(g, view.senses, dt) : null;
  };
  const status = (id: number): LifecycleUpdate => {
    const live = state.live!, phase: Phase = live.end !== null ? "release" : "commit";
    return { id, phase, stage: live.end !== null ? `ended:${live.end}` : isMode(live.action) ? live.action : runs[live.action]!.phase, holds: needs };
  };
  const letGo = (): void => {
    const live = state.live!;
    if (live.end === null && !isMode(live.action)) runs[live.action]!.end();
    state.live = null;
  };
  const executor: Executor = {
    state,
    needs: () => needs,
    readiness(view, action, effector): Readiness {
      if (!names.includes(action)) return { kind: "blocked", reason: `no ground action ${action}` };
      if (isMode(action)) return { kind: "ready" };
      const g = view.ground;
      return g && runs[action]!.admits(g, sideOf(effector)) ? { kind: "ready" } : { kind: "blocked", reason: `${action} does not admit the body as it lies` };
    },
    update(view, continued: readonly ActionRequest[], _around, dt) {
      state.carried = state.live !== null;
      if (!state.live) return [];
      const id = state.live.id;
      if (!continued.some((request) => request.id === id)) { const ending = endingOf(state.live.end); letGo(); return [{ id, ending }]; }
      if (state.live.end === null) state.live.end = stepLive(view, dt);
      return [status(id)];
    },
    start(view, request) {
      if (state.live) throw new Error("two ground actions at once");
      if (!state.carried) { command.activation.set(body.muscles.activation); command.velocity.set(body.muscles.velocity); steady.reset(); }
      const side = sideOf(request.effector);
      state.live = { id: request.id, action: request.action, side, end: null };
      if (request.action === "steady") steady.begin();
      else if (!isMode(request.action)) runs[request.action]!.begin(side);
      state.live.end = stepLive(view, clock.dt);
    },
    command(): ActionClaim {
      const pushes: MusclePush[] = [];
      for (let i = 0; i < n; i++) pushes.push({ channel: own.muscles.channels[i]!.name, sense: command.velocity[i]! < 0 ? -1 : 1, level: command.activation[i]!, speed: command.velocity[i]! });
      return { pushes, legs: null };
    },
    interrupt(_view, id) { if (state.live?.id === id) letGo(); },
    resume() { if (state.live) letGo(); state.carried = false; },
  };
  return { binding: { name: GROUND, executor }, actions: names.map((name) => ({ name, executor: GROUND, effectors: [sideEffector("left"), sideEffector("right")] })), runs, steady: steady.state };
}
