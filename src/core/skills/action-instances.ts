import { copyActionTarget, sameActionIdentity } from "./action.ts";
import type { BodyView } from "../body.ts";
import type { ContactTarget } from "../control/effector-feedback.ts";
import type { ActionAround, ActionEnding, ActionRequest, ActionStatus, ContactKind, Ended, Executor, LifecycleUpdate, Observation, Phase, Readiness, Resource, TargetRef } from "./action.ts";
import type { ResourceMap } from "./action-resources.ts";
import { deepFreeze } from "../state.ts";

/** Inspection retains a short history; exact contact totals have no observation limit. */
const OBSERVATIONS = 16;
/** Recent endings are enough for display; sequence numbers expose any reader's missed records. */
const LEDGER_LENGTH = 64;

/** A target load counts as landed only in the interval committed to the action. */
export const landed = (record: Pick<ActionStatus, "contacts">): boolean => record.contacts.counts.commit.target > 0;
/** A committed guard contact is recorded independently of later target contacts. */
export const blocked = (record: Pick<ActionStatus, "contacts">): boolean => record.contacts.counts.commit.block > 0;
/** A completed commitment with no loaded committed interval is a clean miss. */
export const cleanMiss = (record: Ended): boolean => record.ending.kind === "completed" && record.committed && !record.contacts.loadedInCommit;

/** An action's named executor and permitted anatomical endpoints. */
export interface ActionBinding { readonly name: string; readonly executor: string; readonly effectors: readonly string[] }
/** An executor is registered once, even when several actions share it. */
export interface ExecutorBinding { readonly name: string; readonly executor: Executor }

const counts = () => ({ target: 0, block: 0, incidental: 0, world: 0 });
const summary = () => ({ counts: { prepare: counts(), commit: counts(), release: counts() }, loadedInCommit: false, blockedSegments: [] as string[], lastTarget: null as number | null });
interface Live extends Omit<ActionRequest, "target"> {
  target: TargetRef;
  phase: Phase;
  stage: string;
  holds: Resource[];
  observations: Observation[];
  contacts: ReturnType<typeof summary>;
  observed: number;
  began: number;
  executor: number;
  withdrawn: boolean;
  committed: boolean;
  targetSegments: string[];
}

/** The body's sampler supplies presence and onset across all ownership changes. */
export interface ActionContact {
  readonly effector: string;
  readonly target: ContactTarget;
  readonly loaded: boolean;
  readonly onset: boolean;
}

/** Protocol state belongs to the body; executors only own their motion and shared timing. */
export function actionInstances(executors: readonly ExecutorBinding[], actions: readonly ActionBinding[], resources: ResourceMap,
  limits: { readonly observations?: number; readonly ledger?: number } = {}) {
  const history = limits.observations ?? OBSERVATIONS, length = limits.ledger ?? LEDGER_LENGTH;
  if (!Number.isSafeInteger(history) || history < 0 || !Number.isSafeInteger(length) || length < 1) throw new Error("invalid action history bounds");
  const registered = new Map<string, number>(), bindings = new Map<string, ActionBinding>();
  executors.forEach((entry, i) => {
    if (!entry.name || registered.has(entry.name)) throw new Error(`duplicate executor ${entry.name}`);
    registered.set(entry.name, i);
  });
  /** What `action` holds with `effector` (`Executor.needs`): a thrown error where it names a resource the body has not, leaves out its effector, or moves a support effector without the legs. */
  const needsOf = (executor: Executor, action: string, effector: string): readonly Resource[] => {
    const needs = executor.needs(action, effector);
    resources.controls(needs);
    if (!needs.includes(effector)) throw new Error(`action ${action} does not reserve its effector`);
    if (resources.controls(["legs"]).includes(`effector:${effector}`) && !needs.includes("legs")) throw new Error(`action ${action} needs legs for its support effector`);
    return needs;
  };
  for (const action of actions) {
    if (!action.name || bindings.has(action.name) || !registered.has(action.executor)) throw new Error(`invalid action ${action.name}`);
    // Every resource an action may hold is checked as the skill set is built, before any motion.
    for (const effector of action.effectors) { resources.controls([effector]); needsOf(executors[registered.get(action.executor)!]!.executor, action.name, effector); }
    bindings.set(action.name, deepFreeze({ ...action, effectors: [...action.effectors] }));
  }
  const state = { issued: 0, seen: 0, sequence: 0, observedStep: -1, observedTime: 0, live: [] as Live[], ledger: [] as Ended[],
    attribution: [] as { id: number; phase: Phase; effector: string; target: TargetRef }[], executors: executors.map(e => e.executor.state) };
  const continued = executors.map(() => [] as ActionRequest[]);
  const find = (id: number): Live | undefined => state.live.find(item => item.id === id);
  const record = (item: Live, ending: ActionEnding, time: number): void => {
    state.ledger.push({ id: item.id, action: item.action, effector: item.effector, target: copyActionTarget(item.target), sequence: ++state.sequence,
      began: item.began, ended: time, ending: { ...ending }, committed: item.committed,
      contacts: { ...item.contacts, counts: { prepare: { ...item.contacts.counts.prepare }, commit: { ...item.contacts.counts.commit }, release: { ...item.contacts.counts.release } },
        blockedSegments: [...item.contacts.blockedSegments] },
      observations: item.observations.map(observation => ({ ...observation, struck: observation.struck ? { ...observation.struck } : null })), observed: item.observed });
    if (state.ledger.length > length) state.ledger.shift();
  };
  const end = (item: Live, ending: ActionEnding, time: number): void => {
    if (ending.kind === "completed" && item.withdrawn && !item.committed) ending = { kind: "cancelled" };
    record(item, ending, time);
    state.live.splice(state.live.indexOf(item), 1);
  };
  const readiness = (view: BodyView, action: string, effector: string, target: TargetRef, around: ActionAround): Readiness => {
    const binding = bindings.get(action);
    if (!binding || !binding.effectors.includes(effector)) return { kind: "blocked", reason: "unknown action or effector" };
    const executor = executors[registered.get(binding.executor)!]!.executor, needs = needsOf(executor, action, effector);
    const own = executor.readiness(view, action, effector, target, around);
    if (own.kind === "blocked") return own;
    if (state.live.some(item => resources.overlap(needs, item.holds))) return { kind: "waiting", reason: "resources held" };
    return own;
  };
  const update = (change: LifecycleUpdate, owner: number, time: number): void => {
    const item = find(change.id);
    if (!item || item.executor !== owner) throw new Error(`unknown executor instance ${change.id}`);
    if ("ending" in change) { end(item, change.ending, time); return; }
    if ((item.phase === "release" && change.phase !== "release") || (item.phase === "commit" && change.phase === "prepare")) throw new Error("action phase reversed");
    if (item.withdrawn && !item.committed && change.phase === "commit") throw new Error("withdrawn preparation cannot commit");
    if (change.holds.some(resource => !item.holds.includes(resource))) throw new Error("action acquired a resource after admission");
    resources.controls(change.holds);
    item.phase = change.phase; item.stage = change.stage; item.holds = [...change.holds];
    item.committed ||= change.phase === "commit";
  };
  return {
    state,
    get live(): readonly ActionStatus[] { return state.live; },
    get ledger(): readonly Ended[] { return state.ledger; },
    instance(): number { if (!Number.isSafeInteger(state.issued + 1)) throw new Error("action ids exhausted"); return ++state.issued; },
    readiness,
    executor(id: number): Executor { const item = find(id); if (!item) throw new Error(`no live instance ${id}`); return executors[item.executor]!.executor; },
    step(view: BodyView, requests: readonly ActionRequest[], around: ActionAround, dt: number): void {
      const ids = new Set<number>(); let latest = state.seen;
      for (const request of requests) {
        if (!Number.isSafeInteger(request.id) || request.id <= 0 || request.id > state.issued) throw new Error("unissued action id");
        if (ids.has(request.id)) throw new Error("duplicate action id");
        ids.add(request.id);
        if (request.id > state.seen) { if (request.id <= latest) throw new Error("new action ids out of order"); latest = request.id; }
        const item = find(request.id);
        if (item && (!sameActionIdentity(item, request))) throw new Error("changed action request");
      }
      for (const list of continued) list.length = 0;
      for (const item of state.live) {
        const request = requests.find(r => r.id === item.id);
        if (!request) item.withdrawn = true;
        if (request && !item.withdrawn) {
          item.target = copyActionTarget(request.target);
          continued[item.executor]!.push(deepFreeze({ id: item.id, action: item.action, effector: item.effector, target: copyActionTarget(item.target) }));
        }
      }
      executors.forEach((entry, index) => {
        for (const change of entry.executor.update(view, continued[index]!, around, dt)) update(change, index, view.time);
      });
      for (const request of requests) {
        if (request.id <= state.seen) continue;
        state.seen = request.id;
        const ready = readiness(view, request.action, request.effector, request.target, around);
        const binding = bindings.get(request.action), owner = binding ? registered.get(binding.executor)! : -1;
        const item: Live = { ...request, target: copyActionTarget(request.target), phase: "prepare", stage: "admitting", holds: [],
          observations: [], contacts: summary(), observed: 0, began: view.time, executor: owner, withdrawn: false, committed: false,
          targetSegments: view.senses?.others.find(other => other.id === request.target.body)?.spec.segments.map(segment => segment.name) ?? [] };
        if (ready.kind !== "ready") { record(item, { kind: "refused", reason: ready.kind === "position" ? "outside entry window" : ready.reason }, view.time); continue; }
        const executor = executors[owner]!.executor;
        item.holds = [...executor.needs(request.action, request.effector)];
        state.live.push(item);
        executor.start(view, deepFreeze({ id: item.id, action: item.action, effector: item.effector, target: copyActionTarget(item.target) }), around);
      }
    },
    snapshot(): void {
      state.attribution.length = 0;
      for (const item of state.live) if (resources.controls(item.holds).includes(`effector:${item.effector}`))
        state.attribution.push({ id: item.id, phase: item.phase, effector: item.effector, target: copyActionTarget(item.target) });
    },
    observe(step: number, time: number, contacts: readonly ActionContact[]): void {
      if (step <= state.observedStep) return;
      state.observedStep = step;
      state.observedTime = time;
      for (const contact of contacts) {
        const snapshot = state.attribution.find(a => a.effector === contact.effector);
        if (!snapshot) continue;
        const item = find(snapshot.id);
        if (!item) continue;
        if (contact.loaded && snapshot.phase === "commit") item.contacts.loadedInCommit = true;
        if (!contact.onset) continue;
        const target = contact.target;
        let kind: ContactKind;
        switch (target.kind) {
          case "world": kind = "world"; break;
          case "object": kind = snapshot.target.body === target.id ? "target" : "incidental"; break;
          case "body": kind = snapshot.target.body !== target.body ? "incidental" : target.guard ? "block" : "target"; break;
          default: { const never: never = target; throw new Error(`unknown contact ${JSON.stringify(never)}`); }
        }
        const observation: Observation = { step, time, phase: snapshot.phase, kind, by: contact.effector,
          struck: target.kind === "body" ? { body: target.body, segment: target.segment } : null };
        item.observed++;
        item.contacts.counts[snapshot.phase][kind]++;
        if (item.observations.length < history) item.observations.push(observation);
        if (snapshot.phase === "commit" && kind === "target") item.contacts.lastTarget = time;
        if (snapshot.phase === "commit" && kind === "block" && target.kind === "body" && item.targetSegments.includes(target.segment)
          && !item.contacts.blockedSegments.includes(target.segment)) {
          item.contacts.blockedSegments.push(target.segment);
          item.contacts.blockedSegments.sort((a, b) => item.targetSegments.indexOf(a) - item.targetSegments.indexOf(b));
        }
      }
    },
    /** End each of `ids` that is live and whose executor can forget it at once (`Executor.interrupt`), as interrupted for `reason`. */
    stop(view: BodyView, ids: readonly number[], reason: string): void {
      for (const id of ids) {
        const item = find(id), executor = item ? executors[item.executor]!.executor : null;
        if (!item || !executor?.interrupt) continue;
        executor.interrupt(view, id);
        end(item, { kind: "interrupted", reason }, Math.max(view.time, state.observedTime));
        const attributed = state.attribution.findIndex(a => a.id === id);
        if (attributed >= 0) state.attribution.splice(attributed, 1);
      }
    },
    interrupt(view: BodyView, reason: string): void {
      while (state.live.length) end(state.live[0]!, { kind: "interrupted", reason }, Math.max(view.time, state.observedTime));
      state.attribution.length = 0;
      for (const entry of executors) entry.executor.resume(view);
    },
    resume(view: BodyView): void { for (const entry of executors) entry.executor.resume(view); },
  };
}
