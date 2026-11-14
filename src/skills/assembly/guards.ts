import type { ConfigFor, PartLookup } from "../../parts/lookup.ts";
import type { PartConfig } from "../../parts/parts.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { ReadBody } from "../../core/bodies/read-body.ts";
import type { Pose } from "../../core/bodies/spec/pose.ts";
import type { GuardSkill } from "../framework/guard.ts";
import { selectsVariation } from "../framework/variations.ts";
import type { BodyView } from "../../control/body.ts";
import { controllerSelection } from "./selection.ts";

/** The enabled guards, or an experiment's explicitly configured guard. */
export function guardConfigs(parts: PartLookup, spec: BodySpec, given?: ConfigFor<"guard">): readonly ConfigFor<"guard">[] {
  if (!given) return parts.selected("guard", spec);
  if (parts.of("guard", given).variations === undefined) return [given];
  return parts.selected("guard", spec).filter(config => selectsVariation(given, config)).map(config => ({ ...config, ...given }));
}

/** A single guard's initial pose; several choices start in the body's reference pose until the mind chooses. */
export const initialGuardPosture = (parts: PartLookup, spec: BodySpec, configs: readonly PartConfig[]): Pose =>
  configs.length === 1 ? parts.of("guard", configs[0]!).posture(spec, configs[0]!) : {};

/** All enabled guards, made once, with the mind's current choice and every guard's memory saved together. */
export function guardRepertoire(parts: PartLookup, built: ReadBody, configs: readonly PartConfig[]): GuardSkill {
  const guards = configs.map(config => parts.of("guard", config).make(built, config));
  const channels = [...new Set(guards.flatMap(guard => Object.keys(guard.posture)))];
  const state = { selected: configs.length === 1 ? 0 : -1, guards: guards.map(guard => guard.state ?? null),
    posture: { ...initialGuardPosture(parts, built.spec, configs) } as Record<string, number> };
  const { current, select } = controllerSelection({ role: "guard", configs, controllers: guards, state,
    resume: (guard, view: BodyView) => guard.resume(view),
    enter(guard) {
      for (const channel of channels) delete state.posture[channel];
      Object.assign(state.posture, guard.posture);
    },
  });
  return {
    state, channels, posture: state.posture, effectors: [...new Set(guards.flatMap(guard => guard.effectors))],
    select,
    hold: effector => current()?.hold?.(effector) ?? null,
    configuration: effector => current()?.configuration?.(effector) ?? null,
    command: (view, cover) => current()?.command(view, cover) ?? {},
    resume: view => { for (const guard of guards) guard.resume(view); },
  };
}
