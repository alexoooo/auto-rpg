import type { Body, BodyView } from "../body.ts";
import type { Pose } from "../spec/pose.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Clock } from "../clock.ts";
import type { Ended, TargetRef } from "./framework/action.ts";
import type { ExecutorBinding } from "./framework/action-instances.ts";
import type { Aim, AimPart } from "./framework/aim-part.ts";
import type { ActionConfig, ExecutorEntry } from "./config.ts";
import { ACTION_KEYS, type ExecutorPart } from "./framework/executor-part.ts";
import type { PartLookup } from "../parts/lookup.ts";

/** How many blows `action` throws: its executor's count (`ExecutorPart.blows`), else one. */
export function blowsOf(parts: PartLookup, executors: readonly ExecutorEntry[], action: ActionConfig): number {
  const executor = executors.find((one) => one.name === action.executor);
  return executor ? parts.of("executor", executor).blows?.(executor) ?? 1 : 1;
}

/** **`action`'s aim** on a body of `spec`, made by its aim's part (`AimPart.make`); null for an action that names no aim. */
function aimOf(parts: PartLookup, spec: BodySpec, action: ActionConfig): Aim | null {
  return action.aim ? parts.of("aim", action.aim).make(spec, action.aim) : null;
}

/** **Each aiming action's aim**, by the action's name (`aimOf`): what its executor and its mind ask where it strikes. */
export function configuredAims(parts: PartLookup, spec: BodySpec, actions: readonly ActionConfig[]): ReadonlyMap<string, Aim> {
  return new Map(actions.flatMap((action) => {
    const aim = aimOf(parts, spec, action);
    return aim ? [[action.name, aim] as const] : [];
  }));
}

/** What the aims of `aims` hold between steps (`Aim.state`): what a mind hangs on its state. */
export const aimsState = (aims: ReadonlyMap<string, Aim>): readonly object[] => [...aims.values()].flatMap((aim) => aim.state ? [aim.state] : []);

/**
 * **The skills of a kit a body of `spec` can use**: the executors whose part fits it
 * (`ExecutorPart.fits`: tuned for it, say), and the actions they carry out on the effectors it has,
 * one with none left out. A kit's skill the body cannot use is not a fault of the mind: the mind
 * runs with the rest, and says which (`unusableSkills`).
 */
export function usableSkills(parts: PartLookup, spec: BodySpec, executors: readonly ExecutorEntry[], actions: readonly ActionConfig[]): { readonly executors: readonly ExecutorEntry[]; readonly actions: readonly ActionConfig[] } {
  const kept = executors.filter((executor) => parts.of("executor", executor).fits(spec, executor, parts) === null);
  const has = (effector: string): boolean => spec.effectors?.some((one) => one.segment === effector) ?? false;
  return { executors: kept, actions: actions.flatMap((action) => {
    if (!kept.some((executor) => executor.name === action.executor)) return [];
    const effectors = action.effectors.filter(has);
    return effectors.length === action.effectors.length ? [action] : effectors.length > 0 ? [{ ...action, effectors }] : [];
  }) };
}

/** **Why each of a kit's executors a body of `spec` cannot use is left out** (`usableSkills`), a sentence each, named. */
export function unusableSkills(parts: PartLookup, spec: BodySpec, executors: readonly ExecutorEntry[]): readonly string[] {
  return executors.flatMap((executor) => {
    const refused = parts.of("executor", executor).fits(spec, executor, parts);
    return refused === null ? [] : [`${executor.name}: ${refused}`];
  });
}

/**
 * **The blows of `actions` a body of `spec` throws**, as it holds what it holds: those of its
 * skills it can use (`usableSkills`), each on the effectors its executor strikes with there
 * (`ExecutorPart.strikesWith`), and one with none left out. A mind declares these effectors as the
 * equipment its actions support.
 */
export function armedActions(parts: PartLookup, spec: BodySpec, given: readonly ExecutorEntry[], actions: readonly ActionConfig[]): readonly ActionConfig[] {
  const { executors, actions: usable } = usableSkills(parts, spec, given, actions);
  return usable.flatMap((action) => {
    const executor = executors.find((entry) => entry.name === action.executor);
    if (!executor) return [action];
    const part = parts.of("executor", executor), effectors = action.effectors.filter((effector) => part.strikesWith?.(spec, executor, effector) ?? true);
    return effectors.length === action.effectors.length ? [action] : effectors.length > 0 ? [narrowed(action, effectors)] : [];
  });
}

/** Each action narrowed to some of its effectors (`narrowed`), by them: configs are data, so a narrowing is made once and is the same config at every make. */
const NARROWED = new WeakMap<ActionConfig, Map<string, ActionConfig>>();

/** `action` striking with `effectors` alone. */
function narrowed(action: ActionConfig, effectors: readonly string[]): ActionConfig {
  let by = NARROWED.get(action);
  if (!by) NARROWED.set(action, by = new Map());
  const key = effectors.join(" ");
  let made = by.get(key);
  if (!made) by.set(key, made = Object.freeze({ ...action, effectors }));
  return made;
}

/** The part `config` names in `role`, or why there is none, a sentence. */
function partOr<R extends "executor" | "aim">(parts: PartLookup, role: R, config: unknown): (R extends "aim" ? AimPart : ExecutorPart) | string {
  try { return parts.of(role, config as { kind: string }) as unknown as R extends "aim" ? AimPart : ExecutorPart; }
  catch (error) { return `${role}: ${error instanceof Error ? error.message : String(error)}`; }
}

/** What is wrong with where an aiming action strikes, each a sentence: its regions, and its aim's kind, settings and effectors. */
function aimingFaults(parts: PartLookup, action: ActionConfig): readonly string[] {
  const faults: string[] = [], regions: readonly unknown[] = Array.isArray(action.regions) ? action.regions : [];
  if (!regions.length) faults.push("at least one target region required");
  for (const region of regions as ActionConfig["regions"] & object) {
    if (!region || typeof region !== "object") { faults.push("valid target regions required"); continue; }
    switch (region.kind) {
      case "segment": if (typeof region.segment !== "string" || !region.segment) faults.push("empty target segment"); break;
      case "mark": if (!["high", "middle", "legs", "any"].includes(region.mark)) faults.push("invalid target mark"); break;
      default: faults.push("valid target regions required");
    }
  }
  if (!action.aim || typeof action.aim !== "object") return [...faults, "an aim required"];
  const aim = partOr(parts, "aim", action.aim);
  if (typeof aim === "string") return [...faults, aim];
  for (const key of Object.keys(action.aim)) if (!Object.hasOwn(aim.keys, key)) faults.push(`no ${aim.label} aim setting ${key}`);
  faults.push(...aim.faults(action.aim, parts));
  if (aim.aimsWith && Array.isArray(action.effectors)) for (const effector of action.effectors) if (!aim.aimsWith(effector)) faults.push(`${aim.label} cannot aim ${effector}`);
  return faults;
}

/**
 * **What is wrong with `actions` as `executors` carry them out**, whatever the body, each a
 * sentence: a name, its effectors, a key neither every action's (`ACTION_KEYS`) nor its executor's
 * (`ExecutorPart.actionKeys`), where it strikes and its aim where its executor aims and neither
 * where not (`ExecutorPart.aims`), and its executor's own settings (`ExecutorPart.actionFaults`).
 */
export function actionFaults(parts: PartLookup, executors: readonly ExecutorEntry[], actions: readonly ActionConfig[]): readonly string[] {
  if (!Array.isArray(actions)) return ["actions must be a list"];
  const faults: string[] = [], names = new Set<string>();
  for (const action of actions) {
    if (!action || typeof action !== "object") { faults.push("action must be an object"); continue; }
    const fault = (said: string) => faults.push(`${action.name}: ${said}`);
    if (!action.name || names.has(action.name)) faults.push(`duplicate or empty action name ${action.name}`);
    names.add(action.name);
    const effectors: readonly unknown[] = Array.isArray(action.effectors) ? action.effectors : [];
    if (!effectors.length || effectors.some((e) => typeof e !== "string") || new Set(effectors).size !== effectors.length) fault("distinct effectors required");
    const entry = Array.isArray(executors) ? executors.find((one) => one?.name === action.executor) : undefined;
    if (!entry) { fault(`missing executor ${action.executor}`); continue; }
    const executor = partOr(parts, "executor", entry);
    if (typeof executor === "string") { fault(executor); continue; }
    for (const key of Object.keys(action)) if (!ACTION_KEYS.includes(key) && !executor.actionKeys.includes(key)) fault(`no ${executor.label} action setting ${key}`);
    for (const effector of effectors) if (!executor.effectors.includes(effector as string)) fault(`executor cannot use ${String(effector)}`);
    if (executor.aims) aimingFaults(parts, action).forEach(fault);
    else if (action.regions !== undefined || action.aim !== undefined) fault(`${executor.label} aims at nothing: no regions or aim`);
    executor.actionFaults(action).forEach(fault);
  }
  return faults;
}

/**
 * **What is wrong with a kit, whatever the body**, each a sentence: its executors' names and their
 * settings (`ExecutorPart.faults`), and its actions (`actionFaults`). What a body cannot use of it
 * is no fault (`usableSkills`).
 */
export function actionConfigFaults(parts: PartLookup, executors: readonly ExecutorEntry[], actions: readonly ActionConfig[]): readonly string[] {
  if (!Array.isArray(executors)) return ["executors must be a list"];
  const faults: string[] = [], names = new Set<string>();
  for (const executor of executors) {
    if (!executor?.name || names.has(executor.name)) faults.push(`duplicate or empty executor name ${executor?.name}`);
    names.add(executor?.name);
    const part = partOr(parts, "executor", executor);
    if (typeof part === "string") { faults.push(`${executor?.name}: ${part}`); continue; }
    faults.push(...part.faults(executor, parts).map(fault => `${executor.name}: ${fault}`));
  }
  faults.push(...actionFaults(parts, executors, actions));
  return faults;
}

/** Build each named motion state the body can use (`usableSkills`) once and resolve every action through its own aim, `aims`' (the body's one, `configuredAims`). */
export function configuredExecutors(parts: PartLookup, body: Body, clock: Clock, guard: Pose, executors: readonly ExecutorEntry[], actions: readonly ActionConfig[], ledger: () => readonly Ended[] = () => [],
  aims: ReadonlyMap<string, Aim> = configuredAims(parts, body.built.spec, actions)): readonly ExecutorBinding[] {
  const faults = actionConfigFaults(parts, executors, actions);
  if (faults.length) throw new Error(faults.join("; "));
  const usable = usableSkills(parts, body.built.spec, executors, actions);
  const making = { body, clock, guard, aim: (view: BodyView, target: TargetRef, action: string, effector: string) => aims.get(action)?.(view, target, effector, ledger()) ?? null };
  return usable.executors.map(config => ({ name: config.name, kind: config.kind,
    executor: parts.of("executor", config).make(making, config, usable.actions.filter(action => action.executor === config.name)) }));
}
