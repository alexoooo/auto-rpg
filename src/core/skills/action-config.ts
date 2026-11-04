import type { Body, BodyView } from "../body.ts";
import type { Pose } from "../spec/pose.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Clock } from "../clock.ts";
import type { Ended, TargetRef } from "./framework/action.ts";
import type { ExecutorBinding } from "./framework/action-instances.ts";
import type { Aim } from "./framework/aim-part.ts";
import type { ActionConfig, ExecutorEntry } from "./config.ts";
import type { PartLookup } from "../parts/lookup.ts";

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

/** **The executors `executors` made on `body`**, each carrying out its actions of `actions`, each action aimed by its own aim, `aims`' (the body's one, `configuredAims`), reading the body's `ledger`. */
export function configuredExecutors(parts: PartLookup, body: Body, clock: Clock, guard: Pose, executors: readonly ExecutorEntry[], actions: readonly ActionConfig[], ledger: () => readonly Ended[] = () => [],
  aims: ReadonlyMap<string, Aim> = configuredAims(parts, body.built.spec, actions)): readonly ExecutorBinding[] {
  const making = { body, clock, guard, aim: (view: BodyView, target: TargetRef, action: string, effector: string) => aims.get(action)?.(view, target, effector, ledger()) ?? null };
  return executors.map(config => ({ name: config.name, kind: config.kind,
    executor: parts.of("executor", config).make(making, config, actions.filter(action => action.executor === config.name)) }));
}
