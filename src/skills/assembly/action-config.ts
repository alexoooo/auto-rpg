import type { ExecutorPart } from "../framework/executor-part.ts";
import type { Body, BodyView } from "../../control/body.ts";
import type { Pose } from "../../core/bodies/spec/pose.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { Clock } from "../../core/world/clock.ts";
import type { Ended, TargetRef } from "../framework/action.ts";
import type { ExecutorBinding } from "../framework/action-instances.ts";
import type { Aim, AimAsking, Aims } from "../framework/aim-part.ts";
import type { ActionConfig, ExecutorEntry } from "../config.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import { chosenVariation } from "../framework/variations.ts";

/** **`action`'s aim** on a body of `spec`, made by its aim's part (`AimPart.make`) to be asked as `asking` says; null for an action that names no aim. */
function aimOf(parts: PartLookup, spec: BodySpec, action: ActionConfig, asking: AimAsking): Aim | null {
  return action.aim ? parts.of("aim", action.aim).make(spec, action.aim, asking) : null;
}

/** **Each aiming action's aim**, by the action's name (`aimOf`): what its executor and its mind ask where it strikes, asked by the mind's own work until a reading says otherwise (`keepingNothing`). */
export function configuredAims(parts: PartLookup, spec: BodySpec, actions: readonly ActionConfig[]): Aims {
  const asking: AimAsking = { keeps: true };
  return { asking, of: new Map(actions.flatMap((action) => {
    const aim = aimOf(parts, spec, action, asking);
    return aim ? [[action.name, aim] as const] : [];
  })) };
}

/** **The executors `executors` made on `body`**, each carrying out its actions of `actions`, each action aimed by its own aim, `aims`' (the body's one, `configuredAims`), reading the body's `ledger`. */
export function configuredExecutors(parts: PartLookup, body: Body, clock: Clock, guard: Pose, executors: readonly ExecutorEntry[], actions: readonly ActionConfig[], ledger: () => readonly Ended[] = () => [],
  aims: Aims = configuredAims(parts, body.built.spec, actions)): readonly ExecutorBinding[] {
  const making = { body, clock, guard, aim: (view: BodyView, target: TargetRef, action: string, effector: string) => aims.of.get(action)?.(view, target, effector, ledger()) ?? null };
  return executors.map(config => {
    const part: ExecutorPart = parts.of("executor", config);
    const variation = part.variations === undefined ? undefined : chosenVariation(body.built.spec, config.kind, config);
    return { name: config.name, kind: config.kind, ...variation === undefined ? {} : { variation }, executor: part.make(making, config, actions.filter(action => action.executor === config.name)) };
  });
}
