import type { Body } from "../body.ts";
import type { World } from "../world.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Executor } from "../skills/action.ts";
import type { AttackTuning } from "../skills/attack-path.ts";
import type { ActionConfig, ExecutorConfig } from "./config.ts";
import type { Part } from "./parts.ts";
import type { actionAim } from "./action-aim.ts";
import type { ActionEstimates } from "./action-tactics.ts";
import type { kickExecutor } from "../skills/kick.ts";
import type { pathExecutor } from "../skills/combat.ts";

/** Every execution kind supplies its construction, anatomy and config rules together. */
export interface ExecutorPart<C extends ExecutorConfig = ExecutorConfig> extends Part<C> {
  readonly effectors: readonly string[];
  actionFaults(action: ActionConfig): readonly string[];
  paths?(config: C): AttackTuning;
  estimate?(spec: BodySpec, config: C, action: ActionConfig, aim: ReturnType<typeof actionAim>): ActionEstimates[string] | null;
  make(body: Body, world: World, config: C, actions: readonly ActionConfig[],
    resolve: NonNullable<Parameters<typeof kickExecutor>[3]>, direction: NonNullable<Parameters<typeof pathExecutor>[2]>["direction"]): Executor;
}

/** Fields belonging to path execution cannot silently affect another kind. */
export function noPathSettings(action: ActionConfig): readonly string[] {
  return action.family !== undefined || action.armExtension !== undefined || action.lower !== undefined ? ["settings belong to a path executor"] : [];
}
