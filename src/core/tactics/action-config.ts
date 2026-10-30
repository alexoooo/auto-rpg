import type { Body, BodyView } from "../body.ts";
import type { Pose } from "../spec/pose.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Clock } from "../clock.ts";
import type { Ended, TargetRef } from "../skills/framework/action.ts";
import type { ExecutorBinding } from "../skills/framework/action-instances.ts";
import type { Aim, AimPart } from "../skills/framework/aim-part.ts";
import type { ActionEstimates } from "./tactics-part.ts";
import type { ActionConfig, ExecutorEntry } from "../mind/config.ts";
import { ACTION_KEYS, type ExecutorPart } from "../skills/framework/executor-part.ts";
import type { PartLookup } from "../parts/lookup.ts";

/** How many blows `action` throws: its executor's count (`ExecutorPart.blows`), else one. */
export function blowsOf(parts: PartLookup, executors: readonly ExecutorEntry[], action: ActionConfig): number {
  const executor = executors.find((one) => one.name === action.executor);
  return executor ? parts.of("executor", executor).blows?.(executor) ?? 1 : 1;
}

/**
 * **`action`'s aim** on a body of `spec`, made by its aim's part (`AimPart.make`) for the blow its
 * executor names (`ExecutorPart.blow`); null for an action that names no aim.
 */
export function aimOf(parts: PartLookup, spec: BodySpec, executors: readonly ExecutorEntry[], action: ActionConfig): Aim | null {
  if (!action.aim) return null;
  const executor = executors.find((one) => one.name === action.executor);
  const blow = executor ? parts.of("executor", executor).blow?.(executor, action) ?? null : null;
  return parts.of("aim", action.aim).make(spec, action.aim, blow);
}

/** **Each aiming action's aim**, by the action's name (`aimOf`): what its executor and its tactics ask where it strikes. */
export function configuredAims(parts: PartLookup, spec: BodySpec, executors: readonly ExecutorEntry[], actions: readonly ActionConfig[]): ReadonlyMap<string, Aim> {
  return new Map(actions.flatMap((action) => {
    const aim = aimOf(parts, spec, executors, action);
    return aim ? [[action.name, aim] as const] : [];
  }));
}

/** Compile the executors' measured estimates without exposing execution kinds to the selector. */
export function configuredActionEstimates(parts: PartLookup, spec: BodySpec, executors: readonly ExecutorEntry[], actions: readonly ActionConfig[]): ActionEstimates {
  const providers: Record<string, ActionEstimates[string]> = {};
  for (const action of actions) {
    const executor = executors.find(entry => entry.name === action.executor), aim = aimOf(parts, spec, executors, action);
    if (!executor || !aim) continue;
    const provider = parts.of("executor", executor).estimate?.(spec, executor, action, aim, parts.of("aim", action.aim!).unit);
    if (provider) providers[action.name] = provider;
  }
  return providers;
}

/**
 * **The blows of `actions` a body of `spec` throws**, as it holds what it holds: each on the
 * effectors its executor strikes with there (`ExecutorPart.strikesWith`), and one with none left
 * out. A mind declares these effectors as the equipment its actions support.
 */
export function armedActions(parts: PartLookup, spec: BodySpec, executors: readonly ExecutorEntry[], actions: readonly ActionConfig[]): readonly ActionConfig[] {
  return actions.flatMap((action) => {
    const executor = executors.find((entry) => entry.name === action.executor);
    if (!executor) return [action];
    const part = parts.of("executor", executor), effectors = action.effectors.filter((effector) => part.strikesWith?.(spec, executor, effector) ?? true);
    return effectors.length === action.effectors.length ? [action] : effectors.length > 0 ? [{ ...action, effectors }] : [];
  });
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

/** Validate named sharing, anatomical choices and settings before constructing any executor. */
export function actionConfigFaults(parts: PartLookup, spec: BodySpec, executors: readonly ExecutorEntry[], actions: readonly ActionConfig[]): readonly string[] {
  const faults: string[] = [], names = new Set<string>();
  for (const executor of executors) {
    if (!executor.name || names.has(executor.name)) faults.push(`duplicate or empty executor name ${executor.name}`);
    names.add(executor.name);
    const part = parts.of("executor", executor);
    faults.push(...part.faults(executor, parts).map(fault => `${executor.name}: ${fault}`));
    const refused = part.fits(spec, executor, parts);
    if (refused !== null) faults.push(`${executor.name}: ${refused}`);
  }
  faults.push(...actionFaults(parts, executors, actions));
  for (const action of Array.isArray(actions) ? actions : []) for (const effector of Array.isArray(action?.effectors) ? action.effectors : [])
    if (!spec.effectors?.some(e => e.segment === effector)) faults.push(`${action.name}: no effector ${effector}`);
  return faults;
}

/** Build each named motion state once and resolve every action through its own aim (`configuredAims`). */
export function configuredExecutors(parts: PartLookup, body: Body, clock: Clock, guard: Pose, executors: readonly ExecutorEntry[], actions: readonly ActionConfig[], ledger: () => readonly Ended[] = () => []): readonly ExecutorBinding[] {
  const faults = actionConfigFaults(parts, body.built.spec, executors, actions);
  if (faults.length) throw new Error(faults.join("; "));
  const aims = configuredAims(parts, body.built.spec, executors, actions);
  const making = { body, clock, guard, aim: (view: BodyView, target: TargetRef, action: string, effector: string) => aims.get(action)?.(view, target, effector, ledger()) ?? null };
  return executors.map(config => ({ name: config.name, kind: config.kind, executor: parts.of("executor", config).make(making, config, actions.filter(action => action.executor === config.name)) }));
}
