import type { Body, BodyView } from "../../body.ts";
import { heldBody } from "../../mind/held-body.ts";
import type { Clock } from "../../clock.ts";
import { bodyEffectors } from "../../control/effectors.ts";
import type { MusclePush } from "../../control/motor.ts";
import type { ActionClaim, ActionEnding, ActionRequest, Executor, LifecycleUpdate, Phase, Readiness, Resource } from "../../skills/framework/action.ts";
import type { ActionBinding, ExecutorBinding } from "../../skills/framework/action-instances.ts";
import type { Side } from "../../spec/body.ts";
import type { MindKit } from "../../mind/kit.ts";
import type { OwnBody } from "../../mind/mind.ts";
import { TECHNIQUES } from "./techniques.ts";
import type { TechniqueEnd, TechniquePart, TechniqueRun } from "./technique.ts";

/** A side's effector: what a ground action names the side it is begun on by. */
export const sideEffector = (side: Side): string => `foot.${side}`;

/** The effectors a ground action may be asked with: a side each. */
const SIDES: readonly string[] = Object.freeze([sideEffector("left"), sideEffector("right")]);

/** The side `effector` names (`sideEffector`). */
const sideOf = (effector: string): Side => effector === sideEffector("right") ? "right" : "left";

/** Whether an executor of `kind` is a ground skill: a technique's, a way up or a mode of the ground (`TECHNIQUES`). */
export const isGroundSkill = (kind: string): boolean => Object.hasOwn(TECHNIQUES, kind);

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
  const state = { activation: new Float64Array(n), velocity: new Float64Array(n), carriedAt: -Infinity };
  const own: OwnBody = heldBody(body, state.activation, state.velocity);
  const needs: readonly Resource[] = Object.freeze([...bodyEffectors(body.built).map((effector) => effector.model.segment), "legs", "trunk"]);
  return {
    state, own, needs,
    /** A ground action runs at `view`'s step. */
    carry(view: BodyView): void { state.carriedAt = view.time; },
    /** Back from another mind: nothing is carried over. */
    drop(): void { state.carriedAt = -Infinity; },
    /** Begin a ground action at `view`'s step: the command carried on where one ran this step, else the muscles' taken and every run's memory forgotten. */
    take(view: BodyView): void {
      if (state.carriedAt === view.time) return;
      state.activation.set(body.muscles.activation); state.velocity.set(body.muscles.velocity);
      for (const run of runs) run.forget?.();
    },
    /** What a ground action pushes: every muscle as its run commanded it, at its activation and toward its speed, asking no stance. */
    claim(): ActionClaim {
      const pushes: MusclePush[] = [];
      for (let i = 0; i < n; i++) pushes.push({ channel: own.muscles.channels[i]!.name, sense: state.velocity[i]! < 0 ? -1 : 1, level: state.activation[i]!, speed: state.velocity[i]! });
      return { pushes, legs: null };
    },
  };
}

type GroundBody = ReturnType<typeof groundBody>;

/**
 * **A ground skill's executor**, the technique `name`'s run on the body its skills share (`groundBody`):
 * one action, named as the technique, begun on the side its effector names where its run admits the
 * body as it lies (`TechniqueRun.admits`). Stepped to its end it stays live, its stage `ended:` and
 * its end, holding its last command until it is let go; a mode runs until it is let go. Running, it
 * is prepared while its run has yielded since it began (`TechniqueRun.yields`), committed once it
 * does not, and released once ended, a run reaching its end done committing to it first. Its memory
 * is the action it runs, the run's and the shared body's.
 */
function groundSkill(name: string, run: TechniqueRun, ground: GroundBody, clock: Clock): ExecutorBinding {
  const state = { live: null as { id: number; phase: Phase; end: TechniqueEnd | null } | null, run: run.state, body: ground.state };
  const refused: Readiness = Object.freeze({ kind: "blocked", reason: `${name} does not admit the body as it lies` });
  const stepLive = (view: BodyView, dt: number): TechniqueEnd | null => { const g = view.ground; return g ? run.step(g, view.senses, dt) : null; };
  const letGo = (): void => { if (state.live!.end === null) run.end(); state.live = null; };
  const executor: Executor = {
    state,
    needs: () => ground.needs,
    readiness(view, action, effector): Readiness {
      if (action !== name) return { kind: "blocked", reason: `no ground action ${action}` };
      const g = view.ground;
      return g && run.admits(g, sideOf(effector)) ? { kind: "ready" } : refused;
    },
    update(view, continued: readonly ActionRequest[], _around, dt): readonly LifecycleUpdate[] {
      const live = state.live;
      if (!live) return [];
      ground.carry(view);
      const id = live.id;
      if (!continued.some((request) => request.id === id)) { const ending = endingOf(live.end); letGo(); return [{ id, ending }]; }
      if (live.end === null) live.end = stepLive(view, dt);
      live.phase = live.end === null ? live.phase === "prepare" && run.yields ? "prepare" : "commit" : live.phase === "prepare" && live.end === "done" ? "commit" : "release";
      return [{ id, phase: live.phase, stage: live.end !== null ? `ended:${live.end}` : run.phase, holds: ground.needs }];
    },
    start(view, request) {
      if (state.live) throw new Error(`two ${name} actions at once`);
      ground.take(view);
      state.live = { id: request.id, phase: "prepare", end: null };
      run.begin(sideOf(request.effector));
      state.live.end = stepLive(view, clock.dt);
    },
    command: () => ground.claim(),
    interrupt(_view, id) { if (state.live?.id === id) letGo(); },
    resume() { if (state.live) letGo(); ground.drop(); },
  };
  return { name, kind: name, executor };
}

/**
 * **A body's ground skills**: an executor each of `techniques` (by kind, each a way up or a mode of
 * the ground) that fits the body, run with the mind's motor and guard (`kit`) on the body they share
 * (`groundBody`), and its action, named as the technique, asked on either side (`sideEffector`).
 */
export function groundSkills(body: Body, clock: Clock, kit: MindKit, techniques: readonly TechniquePart[]): { readonly executors: readonly ExecutorBinding[]; readonly actions: readonly ActionBinding[] } {
  const fitting = techniques.filter((part) => part.fits(body.built.spec, part.defaults, kit.parts) === null);
  const runs: TechniqueRun[] = [];
  const ground = groundBody(body, runs);
  for (const part of fitting) runs.push(part.make(ground.own, body.view, clock, kit));
  const executors = fitting.map((part, i) => groundSkill(part.defaults.kind, runs[i]!, ground, clock));
  return { executors, actions: executors.map((executor) => ({ name: executor.name, executor: executor.name, effectors: SIDES })) };
}
