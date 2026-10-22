import type { Body, BodyView } from "../body.ts";
import type { Pose } from "../control/motor.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Clock } from "../clock.ts";
import type { Ended, TargetRef } from "../skills/action.ts";
import type { ExecutorBinding } from "../skills/action-instances.ts";
import { actionAim } from "./action-aim.ts";
import type { ActionEstimates } from "./action-tactics.ts";
import type { ActionConfig, ExecutorEntry } from "./config.ts";
import type { PartLookup } from "./lookup.ts";
import { validOpeningTuning } from "./openings.ts";

/** How many blows `action` throws: its executor's drives where it is a combination, else one. */
export function blowsOf(executors: readonly ExecutorEntry[], action: ActionConfig): number {
  const executor = executors.find((one) => one.name === action.executor), drives = (executor as { readonly drives?: unknown } | undefined)?.drives;
  return executor?.kind === "combination" && typeof drives === "number" ? drives : 1;
}

/** Compile measured recipe values without exposing execution kinds to the selector. */
export function configuredActionEstimates(parts: PartLookup, spec: BodySpec, executors: readonly ExecutorEntry[], actions: readonly ActionConfig[]): ActionEstimates {
  const providers: Record<string, ActionEstimates[string]> = {};
  for (const action of actions) {
    const executor = executors.find(entry => entry.name === action.executor);
    if (!executor) continue;
    const part = parts.of("executor", executor), aim = actionAim(spec, action.aim, action.family, part.paths?.(executor));
    const provider = part.estimate?.(spec, executor, action, aim);
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

/** Validate named sharing, anatomical choices and settings before constructing any executor. */
export function actionConfigFaults(parts: PartLookup, spec: BodySpec, executors: readonly ExecutorEntry[], actions: readonly ActionConfig[]): readonly string[] {
  const faults: string[] = [], names = new Set<string>(), entries = new Map<string, ExecutorEntry>();
  for (const executor of executors) {
    if (!executor.name || names.has(executor.name)) faults.push(`duplicate or empty executor name ${executor.name}`);
    names.add(executor.name); entries.set(executor.name, executor);
    const part = parts.of("executor", executor);
    faults.push(...part.faults(executor, parts).map(fault => `${executor.name}: ${fault}`));
    const refused = part.fits(spec, executor, parts);
    if (refused !== null) faults.push(`${executor.name}: ${refused}`);
  }
  names.clear();
  for (const action of actions) {
    const executor = entries.get(action.executor);
    if (!action.name || names.has(action.name)) faults.push(`duplicate or empty action name ${action.name}`);
    names.add(action.name);
    if (!executor) { faults.push(`${action.name}: missing executor ${action.executor}`); continue; }
    if (!action.effectors.length || new Set(action.effectors).size !== action.effectors.length) faults.push(`${action.name}: distinct effectors required`);
    for (const effector of action.effectors) {
      if (!spec.effectors?.some(e => e.segment === effector)) faults.push(`${action.name}: no effector ${effector}`);
      const supported = parts.of("executor", executor).effectors.includes(effector);
      if (!supported) faults.push(`${action.name}: executor cannot use ${effector}`);
    }
    if (!action.regions.length) faults.push(`${action.name}: at least one target region required`);
    for (const region of action.regions) switch (region.kind) {
      case "segment": if (!region.segment) faults.push(`${action.name}: empty target segment`); break;
      case "mark": if (!["high", "middle", "legs", "any"].includes(region.mark)) faults.push(`${action.name}: invalid target mark`); break;
      default: { const never: never = region; throw new Error(`unknown region ${JSON.stringify(never)}`); }
    }
    switch (action.aim.kind) {
      case "centre": if (!Number.isFinite(action.aim.lead) || action.aim.lead < 0) faults.push(`${action.name}: invalid prediction`); break;
      case "surface": if (!validOpeningTuning(action.aim.tuning)) faults.push(`${action.name}: unsupported surface aim`); break;
      case "leg-height": if (!Number.isFinite(action.aim.height)) faults.push(`${action.name}: invalid aim height`); break;
      default: { const never: never = action.aim; throw new Error(`unknown aim ${JSON.stringify(never)}`); }
    }
    faults.push(...parts.of("executor", executor).actionFaults(action).map(fault => `${action.name}: ${fault}`));
  }
  return faults;
}

/** Build each named motion state once and resolve every action through its own shared aiming rule. */
export function configuredExecutors(parts: PartLookup, body: Body, clock: Clock, guard: Pose, executors: readonly ExecutorEntry[], actions: readonly ActionConfig[], ledger: () => readonly Ended[] = () => []): readonly ExecutorBinding[] {
  const faults = actionConfigFaults(parts, body.built.spec, executors, actions);
  if (faults.length) throw new Error(faults.join("; "));
  const aims = new Map(actions.map(action => {
    const config = executors.find(executor => executor.name === action.executor)!;
    return [action.name, actionAim(body.built.spec, action.aim, action.family, parts.of("executor", config).paths?.(config))] as const;
  }));
  const making = { body, clock, guard,
    resolve: (view: BodyView, target: TargetRef, action: string, effector: string) => aims.get(action)?.(view, target, effector, ledger())?.at ?? null,
    direction: (view: BodyView, target: TargetRef, action: string, effector: string) => aims.get(action)?.(view, target, effector, ledger())?.direction ?? null };
  return executors.map(config => ({ name: config.name, executor: parts.of("executor", config).make(making, config, actions.filter(action => action.executor === config.name)) }));
}
