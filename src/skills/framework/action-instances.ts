import { copyActionTarget, sameActionIdentity, hasResource, segmentResource, LEG_RESOURCE } from "./action.ts";
import type { BodyView } from "../../control/body.ts";
import type { ContactTarget } from "../../core/bodies/contact-identity.ts";
import type { ActionAround, ActionEnding, ActionRequest, ActionStatus, ContactKind, Ended, Executor, LifecycleUpdate, Observation, Phase, Readiness, Region, Resource, TargetRef } from "./action.ts";
import type { ResourceMap } from "./action-resources.ts";
import { deepFreeze } from "../../core/state.ts";

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

/** An action's named executor, permitted anatomical endpoints and the regions it aims at (none: it acts on the body itself). */
export interface ActionBinding { readonly name: string; readonly executor: string; readonly effectors: readonly string[]; readonly regions?: readonly Region[] }
/** An executor is registered once, even when several actions share it; its kind says what skill it is (`straight-punch`, `stomp`), alike across minds, and its variation which way of it it runs, where the skill has variations. */
export interface ExecutorBinding { readonly name: string; readonly kind: string; readonly variation?: string; readonly executor: Executor }

const counts = () => ({ target: 0, block: 0, incidental: 0, world: 0 });
const summary = (): ActionStatus["contacts"] => ({ counts: { prepare: counts(), commit: counts(), release: counts() }, loadedInCommit: false, blockedSegments: [], lastTarget: null });
/**
 * A live action: what it publishes (`status`), a value replaced whenever a field of it changes and
 * never written in place, so a report that holds it holds what it said; and what only the
 * instances read.
 */
interface Live {
  status: ActionStatus;
  /** Its executor's request, as the executor is handed it each step: replaced with the target. */
  request: ActionRequest;
  observed: number;
  began: number;
  executor: number;
  withdrawn: boolean;
  committed: boolean;
  targetSegments: string[];
}

/** Whether two targets name the same thing at the same place, numbers compared as `Object.is` compares them. */
function sameTarget(a: TargetRef, b: TargetRef): boolean {
  if (a.kind === "body" || b.kind === "body") {
    if (a.kind !== "body" || b.kind !== "body" || a.body !== b.body) return false;
    const left = a.region, right = b.region;
    return left.kind === "mark" ? right.kind === "mark" && left.mark === right.mark : right.kind === "segment" && left.segment === right.segment;
  }
  return a.body === b.body && "body" in a === "body" in b && sameNumbers(a.at, b.at) && "direction" in a === "direction" in b
    && (a.direction === undefined ? b.direction === undefined : b.direction !== undefined && sameNumbers(a.direction, b.direction));
}
const sameNumbers = (a: readonly number[], b: readonly number[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
};
const sameHolds = (a: readonly Resource[], b: readonly Resource[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i]!.kind !== b[i]!.kind || a[i]!.name !== b[i]!.name) return false;
  return true;
};
/** What an executor is handed of `status`: its request, frozen. */
const requestOf = (status: ActionStatus): ActionRequest => deepFreeze({ id: status.id, action: status.action, effector: status.effector, target: copyActionTarget(status.target) });

/** The body's sampler supplies presence and onset across all ownership changes. */
export interface ActionContact {
  readonly effector: string;
  readonly target: ContactTarget;
  readonly loaded: boolean;
  readonly onset: boolean;
}

/** The legs alone, as a list of resources. */
const LEGS: readonly Resource[] = Object.freeze([LEG_RESOURCE]);

/**
 * Protocol state belongs to the body; executors only own their motion and shared timing. An action
 * whose effector is off the body (`attached`, all on unless given) is refused.
 */
export function actionInstances(executors: readonly ExecutorBinding[], actions: readonly ActionBinding[], resources: ResourceMap,
  options: { readonly observations?: number; readonly ledger?: number; readonly attached?: (effector: string) => boolean } = {}) {
  const history = options.observations ?? OBSERVATIONS, length = options.ledger ?? LEDGER_LENGTH, attached = options.attached ?? (() => true);
  if (!Number.isSafeInteger(history) || history < 0 || !Number.isSafeInteger(length) || length < 1) throw new Error("invalid action history bounds");
  const registered = new Map<string, number>(), bindings = new Map<string, ActionBinding>();
  executors.forEach((entry, i) => {
    if (!entry.name || registered.has(entry.name)) throw new Error(`duplicate executor ${entry.name}`);
    registered.set(entry.name, i);
  });
  /** What `action` holds with `effector` (`Executor.needs`): a thrown error where it names a resource the body has not, leaves out its effector, or moves a support effector without the legs. */
  const needsOf = (executor: Executor, action: string, effector: string): readonly Resource[] => {
    const needs = executor.needs(action, effector);
    resources.check(needs);
    if (!hasResource(needs, segmentResource(effector))) throw new Error(`action ${action} does not reserve its effector`);
    if (resources.holds(LEGS, resources.effector.get(effector) ?? -1) && !hasResource(needs, LEG_RESOURCE)) throw new Error(`action ${action} needs legs for its support effector`);
    return needs;
  };
  for (const action of actions) {
    if (!action.name || bindings.has(action.name) || !registered.has(action.executor)) throw new Error(`invalid action ${action.name}`);
    // Every resource an action may hold is checked as the skill set is built, before any motion.
    for (const effector of action.effectors) { resources.check([segmentResource(effector)]); needsOf(executors[registered.get(action.executor)!]!.executor, action.name, effector); }
    bindings.set(action.name, deepFreeze({ ...action, effectors: [...action.effectors] }));
  }
  // `statuses` is what `live` publishes, a new array whenever a status in it is replaced; `ledger` is replaced at each ending.
  const state = { issued: 0, seen: 0, sequence: 0, observedStep: -1, observedTime: 0, live: [] as Live[], statuses: [] as readonly ActionStatus[], ledger: [] as readonly Ended[],
    attribution: [] as { id: number; phase: Phase; effector: string; target: TargetRef }[], executors: executors.map(e => e.executor.state) };
  const continued = executors.map(() => [] as ActionRequest[]);
  const find = (id: number): Live | undefined => state.live.find(item => item.status.id === id);
  // A status's values are never written in place, so its record shares them.
  const record = (item: Live, ending: ActionEnding, time: number): void => {
    const status = item.status, ended: Ended = { id: status.id, action: status.action, effector: status.effector, target: status.target, sequence: ++state.sequence,
      began: item.began, ended: time, ending: { ...ending }, committed: item.committed, contacts: status.contacts, observations: status.observations, observed: item.observed };
    const ledger = state.ledger, from = ledger.length >= length ? ledger.length - length + 1 : 0;
    state.ledger = [...ledger.slice(from), ended];
  };
  /** The statuses `live` publishes: a new array where a status was replaced, added or removed since it was made. */
  const published = (): readonly ActionStatus[] => {
    const live = state.live, was = state.statuses;
    let same = was.length === live.length;
    for (let i = 0; same && i < live.length; i++) same = was[i] === live[i]!.status;
    if (!same) state.statuses = live.map(item => item.status);
    return state.statuses;
  };
  const end = (item: Live, ending: ActionEnding, time: number): void => {
    if (ending.kind === "completed" && item.withdrawn && !item.committed) ending = { kind: "cancelled" };
    record(item, ending, time);
    state.live.splice(state.live.indexOf(item), 1);
  };
  const readiness = (view: BodyView, action: string, effector: string, target: TargetRef, around: ActionAround): Readiness => {
    const binding = bindings.get(action);
    if (!binding || !binding.effectors.includes(effector)) return { kind: "blocked", reason: "unknown action or effector" };
    if (!attached(effector)) return { kind: "blocked", reason: "effector cut off" };
    const executor = executors[registered.get(binding.executor)!]!.executor, needs = needsOf(executor, action, effector);
    const own = executor.readiness(view, action, effector, target, around);
    if (own.kind === "blocked") return own;
    if (state.live.some(item => resources.overlap(needs, item.status.holds))) return { kind: "waiting", reason: "resources held" };
    return own;
  };
  const update = (change: LifecycleUpdate, owner: number, time: number): void => {
    const item = find(change.id);
    if (!item || item.executor !== owner) throw new Error(`unknown executor instance ${change.id}`);
    if ("ending" in change) { end(item, change.ending, time); return; }
    const status = item.status;
    if ((status.phase === "release" && change.phase !== "release") || (status.phase === "commit" && change.phase === "prepare")) throw new Error("action phase reversed");
    if (item.withdrawn && !item.committed && change.phase === "commit") throw new Error("withdrawn preparation cannot commit");
    if (change.holds.some(resource => !hasResource(status.holds, resource))) throw new Error("action acquired a resource after admission");
    resources.check(change.holds);
    const holds = sameHolds(status.holds, change.holds) ? status.holds : [...change.holds];
    const aim = !change.aim || (status.aim && sameNumbers(status.aim, change.aim)) ? status.aim : [change.aim[0], change.aim[1], change.aim[2]] as const;
    if (status.phase !== change.phase || status.stage !== change.stage || holds !== status.holds || aim !== status.aim) item.status = { ...status, phase: change.phase, stage: change.stage, holds, aim };
    item.committed ||= change.phase === "commit";
  };
  return {
    state,
    /** The live actions' statuses, in the order they began: values replaced as they change, never written in place. */
    get live(): readonly ActionStatus[] { return published(); },
    /** The last endings, oldest first: a new array at each ending. */
    get ledger(): readonly Ended[] { return state.ledger; },
    instance(): number { if (!Number.isSafeInteger(state.issued + 1)) throw new Error("action ids exhausted"); return ++state.issued; },
    readiness,
    /** What `action` holds with `effector` (`Executor.needs`): none for an action or effector it does not bind. */
    needs(action: string, effector: string): readonly Resource[] {
      const binding = bindings.get(action);
      return binding?.effectors.includes(effector) ? needsOf(executors[registered.get(binding.executor)!]!.executor, action, effector) : [];
    },
    executor(id: number): Executor { const item = find(id); if (!item) throw new Error(`no live instance ${id}`); return executors[item.executor]!.executor; },
    step(view: BodyView, requests: readonly ActionRequest[], around: ActionAround, dt: number): void {
      const ids = new Set<number>(); let latest = state.seen;
      for (const request of requests) {
        if (!Number.isSafeInteger(request.id) || request.id <= 0 || request.id > state.issued) throw new Error("unissued action id");
        if (ids.has(request.id)) throw new Error("duplicate action id");
        ids.add(request.id);
        if (request.id > state.seen) { if (request.id <= latest) throw new Error("new action ids out of order"); latest = request.id; }
        const item = find(request.id);
        if (item && !sameActionIdentity(item.status, request)) throw new Error("changed action request");
      }
      for (const list of continued) list.length = 0;
      for (const item of state.live) {
        const request = requests.find(r => r.id === item.status.id);
        if (!request) item.withdrawn = true;
        if (request && !item.withdrawn) {
          if (!sameTarget(item.status.target, request.target)) {
            item.status = { ...item.status, target: copyActionTarget(request.target) };
            item.request = requestOf(item.status);
          }
          // A loaded state's request is a copy, frozen again as it is handed on.
          continued[item.executor]!.push(deepFreeze(item.request));
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
        const status: ActionStatus = { ...request, target: copyActionTarget(request.target), phase: "prepare", stage: "admitting",
          holds: ready.kind === "ready" ? [...executors[owner]!.executor.needs(request.action, request.effector)] : [], aim: null, observations: [], contacts: summary() };
        const item: Live = { status, request: requestOf(status), observed: 0, began: view.time, executor: owner, withdrawn: false, committed: false,
          targetSegments: view.senses?.others.find(other => other.id === request.target.body)?.spec.segments.map(segment => segment.name) ?? [] };
        if (ready.kind !== "ready") { record(item, { kind: "refused", reason: ready.kind === "position" ? "outside entry window" : ready.reason }, view.time); continue; }
        state.live.push(item);
        executors[owner]!.executor.start(view, item.request, around);
      }
    },
    snapshot(): void {
      state.attribution.length = 0;
      for (const { status } of state.live) if (resources.holds(status.holds, resources.effector.get(status.effector) ?? -1))
        state.attribution.push({ id: status.id, phase: status.phase, effector: status.effector, target: copyActionTarget(status.target) });
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
        if (contact.loaded && snapshot.phase === "commit" && !item.status.contacts.loadedInCommit) item.status = { ...item.status, contacts: { ...item.status.contacts, loadedInCommit: true } };
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
        const status = item.status, was = status.contacts, tally = was.counts[snapshot.phase];
        const blocks = snapshot.phase === "commit" && kind === "block" && target.kind === "body" && item.targetSegments.includes(target.segment)
          && !was.blockedSegments.includes(target.segment) ? target.segment : null;
        const contacts = { ...was, counts: { ...was.counts, [snapshot.phase]: { ...tally, [kind]: tally[kind] + 1 } },
          blockedSegments: blocks === null ? was.blockedSegments : [...was.blockedSegments, blocks].sort((a, b) => item.targetSegments.indexOf(a) - item.targetSegments.indexOf(b)),
          lastTarget: snapshot.phase === "commit" && kind === "target" ? time : was.lastTarget };
        item.status = { ...status, observations: status.observations.length < history ? [...status.observations, observation] : status.observations, contacts };
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
