import type { MotorAndGuard } from "../../framework/motor-and-guard.ts";
import { segmentResource, poseResource, LEG_RESOURCE, TRUNK_RESOURCE, ASSIST_RESOURCE } from "../../framework/action.ts";
import type { Body, BodyView } from "../../../control/body.ts";
import { heldBody, heldCommand, heldPushes } from "./held-body.ts";
import type { Clock } from "../../../core/world/clock.ts";
import type { ActionClaim, ActionEnding, ActionRequest, Executor, LifecycleUpdate, Phase, Readiness, Resource } from "../../framework/action.ts";
import type { ActionBinding, ExecutorBinding } from "../../framework/action-instances.ts";
import type { PartConfig } from "../../../parts/parts.ts";
import { isWayUp, type TechniqueEnd, type TechniqueRun } from "./technique.ts";
import { againstSolid, type GroundReading } from "../../../control/ground-reading.ts";
import { deepFreeze } from "../../../core/state.ts";

/** An action's end as its record shows it: a technique done completes, one that failed stalls; one let go before its end is cancelled. */
const endingOf = (end: TechniqueEnd | null): ActionEnding => end === null ? { kind: "cancelled", reason: "let go" } : end === "done" ? { kind: "completed" } : { kind: "stalled", reason: end };

/**
 * **What a body's ground skills share**: the body held whole (`heldBody`), commanded in arrays of
 * their own; what an action of theirs holds (every effector's segment, the legs and the trunk); and
 * the time a ground action last ran (`carriedAt`), so one begun the step another ran carries the
 * command on, and one begun on a body no ground action ran the step before takes the muscles'
 * command as it is, every run forgetting what it had under way (`TechniqueRun.forget`).
 */
function groundBody(body: Body, runs: readonly TechniqueRun[]) {
  const n = body.muscles.channels.length;
  const state = { ...heldCommand(n), carriedAt: -Infinity };
  const held = heldBody(body, state), { own, control } = held, pushes = heldPushes(own.muscles, control.muscles);
  const needs: readonly Resource[] = Object.freeze([...[...body.built.segments.keys()].map(segmentResource), ...body.built.configurations.model.map(one => poseResource(one.segment)), LEG_RESOURCE, TRUNK_RESOURCE, ASSIST_RESOURCE]);
  return {
    state, own, control, needs, afterPhysics: held.afterPhysics,
    /** A ground action runs at `view`'s step. */
    carry(view: BodyView): void { state.carriedAt = view.time; held.reset(); },
    /** Back from another mind: nothing is carried over. */
    drop(): void { state.carriedAt = -Infinity; },
    /** Begin a ground action at `view`'s step: the command carried on where one ran this step, else the muscles' taken and every run's memory forgotten. */
    take(view: BodyView): void {
      if (state.carriedAt === view.time) return;
      held.take();
      for (const run of runs) run.forget?.();
    },
    /** What a ground action pushes: every muscle as its run commanded it, at its activation and toward its speed, asking no stance. */
    claim(): ActionClaim {
      return { pushes: pushes(), legs: null, configurations: state.configurations, ...(state.assistAsked ? { assist: state.assist } : {}) };
    },
  };
}

type GroundBody = ReturnType<typeof groundBody>;

/**
 * **When a way up is stuck against an object**: no stage it has not been in this try
 * (`TechniqueRun.stage`, else its phase) and the body no higher by `rise` of its standing height
 * than when it last moved on, for `seconds` s, while it or what it holds has touched a solid that
 * does not bear it from below (`againstSolid`) since. Its stages run a second or two and a bearing
 * one up to five, so three seconds is past a stage's own time; set by hand, not measured.
 */
export const STUCK = deepFreeze({ seconds: 3, rise: .05 });

/** A way up's watch for being stuck (`STUCK`), begun with each try; its memory plain data. */
function stuckWatch(run: TechniqueRun) {
  const state = { seen: [] as string[], high: 0, since: 0, pressed: false };
  return { state,
    begin(): void { state.seen = []; state.high = 0; state.since = 0; state.pressed = false; },
    /** Whether the try is stuck after this step of `dt` s, the body read `g`. */
    stuck(g: GroundReading, dt: number): boolean {
      const at = run.stage ?? run.phase;
      if (!state.seen.includes(at) || g.height >= state.high + STUCK.rise) {
        if (!state.seen.includes(at)) state.seen.push(at);
        state.high = g.height; state.since = 0; state.pressed = false;
      } else state.since += dt;
      state.pressed ||= againstSolid(g);
      return state.pressed && state.since + 1e-9 >= STUCK.seconds;
    } };
}

/**
 * **A ground skill's executor**, the technique `name`'s run on the body its skills share (`groundBody`):
 * one action, named as the technique, begun with the start its effector binding names where its run admits the
 * body as it lies (`TechniqueRun.admits`). Stepped to its end it stays live, its stage `ended:` and
 * its end, holding its last command until it is let go; a mode runs until it is let go. Running, it
 * is prepared while its run has yielded since it began (`TechniqueRun.yields`), committed once it
 * does not, and released once ended, a run reaching its end done committing to it first. A way up
 * (`wayUp`) stuck against an object (`STUCK`) is let go, ended `obstructed`. Its memory is the
 * action it runs, the run's, the watch's and the shared body's.
 */
function groundSkill(name: string, run: TechniqueRun, ground: GroundBody, clock: Clock, starts: ReadonlyMap<string, string>, wayUp: boolean): ExecutorBinding {
  const watch = wayUp ? stuckWatch(run) : null;
  const state = { live: null as { id: number; phase: Phase; end: TechniqueEnd | null } | null, run: run.state, body: ground.state, ...(watch ? { watch: watch.state } : {}) };
  const refused: Readiness = Object.freeze({ kind: "blocked", reason: `${name} does not admit the body as it lies` });
  const stepLive = (view: BodyView, dt: number): TechniqueEnd | null => { const g = view.ground; return g ? run.step(g, view.senses, ground.control, dt) : null; };
  const letGo = (): void => { if (state.live!.end === null) run.end(); state.live = null; };
  const executor: Executor = {
    state,
    needs: () => ground.needs,
    readiness(view, action, effector): Readiness {
      if (action !== name) return { kind: "blocked", reason: `no ground action ${action}` };
      const g = view.ground;
      const start = starts.get(effector);
      return start !== undefined && g && run.admits(g, start) ? { kind: "ready" } : refused;
    },
    update(view, continued: readonly ActionRequest[], _around, dt): readonly LifecycleUpdate[] {
      const live = state.live;
      if (!live) return [];
      ground.carry(view);
      const id = live.id;
      if (!continued.some((request) => request.id === id)) { const ending = endingOf(live.end); letGo(); return [{ id, ending }]; }
      if (live.end === null) live.end = stepLive(view, dt);
      if (live.end === null && watch && view.ground && watch.stuck(view.ground, dt)) { run.end("obstructed"); live.end = "obstructed"; }
      live.phase = live.end === null ? live.phase === "prepare" && run.yields ? "prepare" : "commit" : live.phase === "prepare" && live.end === "done" ? "commit" : "release";
      return [{ id, phase: live.phase, stage: live.end !== null ? `ended:${live.end}` : run.phase, holds: ground.needs }];
    },
    start(view, request) {
      if (state.live) throw new Error(`two ${name} actions at once`);
      ground.take(view);
      state.live = { id: request.id, phase: "prepare", end: null };
      const start = starts.get(request.effector);
      if (start === undefined) throw new Error(`unsupported ${name} effector ${request.effector}`);
      run.begin(start);
      watch?.begin();
      state.live.end = stepLive(view, clock.dt);
    },
    command: () => ground.claim(),
    interrupt(_view, id) { if (state.live?.id === id) letGo(); },
    resume() { if (state.live) letGo(); ground.drop(); },
  };
  return { name, kind: name, executor };
}

/**
 * **A body's ground skills**: an executor each of `techniques` (each a technique's config, a way up,
 * let go where it is stuck against an object, or a mode of the ground) that fits the body, run with the mind's motor and guard (`fitted`) on the
 * body they share (`groundBody`), and its action, named as the technique, asked through its declared action bindings (`TechniquePart.bindings`).
 */
export function groundSkills(body: Body, clock: Clock, fitted: MotorAndGuard, techniques: readonly PartConfig[]): { readonly executors: readonly ExecutorBinding[]; readonly actions: readonly ActionBinding[] } {
  const fitting = techniques.filter((config) => fitted.parts.of("technique", config).fits(body.built.spec, config, fitted.parts) === null);
  if (!fitting.length) return { executors: [], actions: [] };
  const runs: TechniqueRun[] = [];
  const ground = groundBody(body, runs);
  for (const config of fitting) runs.push(fitted.parts.of("technique", config).make(ground.own, body.view, clock, fitted, config, ground.afterPhysics));
  const bindings = fitting.map(config => {
    const part = fitted.parts.of("technique", config);
    const declared = part.bindings(body.built.spec, config);
    if (declared.some(one => !part.starts.includes(one.start) || !body.built.segments.has(one.segment)) || new Set(declared.map(one => one.segment)).size !== declared.length) throw new Error(`invalid action bindings for ${config.kind}`);
    return declared;
  });
  const executors = fitting.map((config, i) => groundSkill(config.kind, runs[i]!, ground, clock, new Map(bindings[i]!.map(one => [one.segment, one.start])),
    isWayUp(fitted.parts.of("technique", config))));
  return { executors, actions: executors.map((executor, i) => ({ name: executor.name, executor: executor.name, effectors: Object.freeze(bindings[i]!.map(one => one.segment)) })) };
}
