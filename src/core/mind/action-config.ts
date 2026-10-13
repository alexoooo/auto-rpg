import type { Body } from "../body.ts";
import type { BodySpec } from "../spec/body.ts";
import type { World } from "../world.ts";
import { pathExecutor, validCombatExecution, validDrivenStrike } from "../skills/combat.ts";
import { ATTACK_PATH, validAttackTuning } from "../skills/attack-path.ts";
import { kickExecutor, KICK_PATH, validKickTuning } from "../skills/kick.ts";
import { recipeExecutor } from "../skills/strike.ts";
import { REPERTOIRE, recipeAt, recipesFor } from "../skills/strikes.ts";
import { straightPunchExecutor, straightPunchFits, validStraightPunch } from "../skills/straight-punch.ts";
import { wholeBodyExecutor, wholeBodyFits } from "../skills/whole-body-strike.ts";
import type { Ended, Executor } from "../skills/action.ts";
import type { ExecutorBinding } from "../skills/action-instances.ts";
import { actionAim } from "./action-aim.ts";
import type { ActionEstimates } from "./action-tactics.ts";
import type { ActionConfig, ExecutorConfig } from "./config.ts";
import { validArmExtension } from "./intent.ts";
import { validOpeningTuning } from "./openings.ts";

/** Compile measured recipe values without exposing execution kinds to the selector. */
export function configuredActionEstimates(spec: BodySpec, executors: readonly ExecutorConfig[], actions: readonly ActionConfig[]): ActionEstimates {
  const providers: Record<string, ActionEstimates[string]> = {};
  for (const action of actions) {
    const executor = executors.find(entry => entry.name === action.executor);
    if (!executor || executor.kind !== "recipe-strike" || action.aim.kind === "surface") continue;
    const repertoire = executor.tuning?.repertoire ?? REPERTOIRE;
    const known = { left: recipesFor(repertoire, spec, "left"), right: recipesFor(repertoire, spec, "right") };
    const aim = actionAim(spec, action.aim);
    providers[action.name] = { unit: "net", read(view, target, effector) {
      const side = effector === "hand.left" ? "left" : effector === "hand.right" ? "right" : null;
      if (!side) return null;
      const at = aim(view, target, effector);
      if (!at) return null;
      const index = recipeAt(known[side], at.at[1] - view.head.y);
      return index < 0 ? null : known[side][index]!.recipe.net;
    } };
  }
  return providers;
}

/** Validate named sharing, anatomical choices and settings before constructing any executor. */
export function actionConfigFaults(spec: BodySpec, executors: readonly ExecutorConfig[], actions: readonly ActionConfig[]): readonly string[] {
  const faults: string[] = [], names = new Set<string>(), entries = new Map<string, ExecutorConfig>();
  for (const executor of executors) {
    if (!executor.name || names.has(executor.name)) faults.push(`duplicate or empty executor name ${executor.name}`);
    names.add(executor.name); entries.set(executor.name, executor);
    switch (executor.kind) {
      case "recipe-strike": break;
      case "path-strike": case "driven-strike":
        if (!validAttackTuning({ ...ATTACK_PATH, ...executor.tuning?.paths })) faults.push(`${executor.name}: invalid path settings`);
        if (executor.kind === "driven-strike" && !validDrivenStrike(executor)) faults.push(`${executor.name}: invalid driven strike settings`);
        if (executor.tuning?.execution && !validCombatExecution(executor.tuning.execution)) faults.push(`${executor.name}: invalid execution settings`);
        break;
      case "front-kick": if (!validKickTuning({ ...KICK_PATH, ...executor.tuning })) faults.push(`${executor.name}: invalid kick settings`); break;
      case "straight-punch": if (!validStraightPunch(executor) || !straightPunchFits(spec)) faults.push(`${executor.name}: invalid straight punch or unsupported body`); break;
      case "whole-body-strike":
        if (!wholeBodyFits(spec)) faults.push(`${executor.name}: unsupported whole-body strike body`);
        if (executor.drive !== "timed" && executor.drive !== "flat-out") faults.push(`${executor.name}: invalid whole-body drive`);
        break;
      default: { const never: never = executor; throw new Error(`unknown executor ${JSON.stringify(never)}`); }
    }
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
      const supported = executor.kind === "front-kick" ? effector === "foot.left" || effector === "foot.right" : effector === "hand.left" || effector === "hand.right";
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
      case "surface": if (!validOpeningTuning(action.aim.tuning) || executor.kind === "front-kick") faults.push(`${action.name}: unsupported surface aim`); break;
      case "leg-height": if (!Number.isFinite(action.aim.height)) faults.push(`${action.name}: invalid aim height`); break;
      default: { const never: never = action.aim; throw new Error(`unknown aim ${JSON.stringify(never)}`); }
    }
    const path = executor.kind === "path-strike" || executor.kind === "driven-strike";
    if (path) {
      if (!action.family || !["straight", "cross", "hook", "downward", "overhand", "uppercut"].includes(action.family)) faults.push(`${action.name}: invalid path family`);
      if (!validArmExtension(action.armExtension)) faults.push(`${action.name}: invalid arm extension`);
      if (action.lower !== undefined && (!Number.isFinite(action.lower) || action.lower < 0)) faults.push(`${action.name}: invalid support height`);
    } else if (action.family !== undefined || action.armExtension !== undefined || action.lower !== undefined) faults.push(`${action.name}: settings belong to a path executor`);
  }
  return faults;
}

/** Build each named motion state once and resolve every action through its own shared aiming rule. */
export function configuredExecutors(body: Body, world: World, executors: readonly ExecutorConfig[], actions: readonly ActionConfig[], ledger: () => readonly Ended[] = () => []): readonly ExecutorBinding[] {
  const faults = actionConfigFaults(body.built.spec, executors, actions);
  if (faults.length) throw new Error(faults.join("; "));
  const aims = new Map(actions.map(action => {
    const config = executors.find(executor => executor.name === action.executor)!;
    const paths = config.kind === "path-strike" || config.kind === "driven-strike" ? { ...ATTACK_PATH, ...config.tuning?.paths } : ATTACK_PATH;
    return [action.name, actionAim(body.built.spec, action.aim, action.family, paths)] as const;
  }));
  const resolve: Parameters<typeof kickExecutor>[3] = (view, target, action, effector) => aims.get(action)?.(view, target, effector, ledger())?.at ?? null;
  const direction: NonNullable<Parameters<typeof pathExecutor>[2]>["direction"] = (view, target, action, effector) => aims.get(action)?.(view, target, effector, ledger())?.direction ?? null;
  return executors.map(config => {
    const assigned = actions.filter(action => action.executor === config.name), names = assigned.map(action => action.name);
    let executor: Executor;
    switch (config.kind) {
      case "recipe-strike": executor = recipeExecutor(body.built.spec, names, { ...config.tuning, resolve }); break;
      case "path-strike": executor = pathExecutor(body, assigned.map(action => ({ ...action, family: action.family! })), { ...config.tuning, paths: { ...ATTACK_PATH, ...config.tuning?.paths }, overlap: config.overlap, resolve, direction }); break;
      case "driven-strike": {
        const { kind: _, name: __, tuning, ...driven } = config;
        executor = pathExecutor(body, assigned.map(action => ({ ...action, family: action.family! })), { ...tuning, paths: { ...ATTACK_PATH, ...tuning?.paths }, driven, resolve, direction }); break;
      }
      case "front-kick": executor = kickExecutor(body, names, { ...KICK_PATH, ...config.tuning }, resolve); break;
      case "straight-punch": { const { kind: _, name: __, ...settings } = config; executor = straightPunchExecutor(body, names, settings, resolve); break; }
      case "whole-body-strike": executor = wholeBodyExecutor(body, world, names, config.drive, resolve); break;
      default: { const never: never = config; throw new Error(`unknown executor ${JSON.stringify(never)}`); }
    }
    return { name: config.name, executor };
  });
}
