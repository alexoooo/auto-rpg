import type { ConfigFor, PartLookup } from "../../parts/lookup.ts";
import type { PartConfig } from "../../parts/parts.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { ReadBody } from "../../core/bodies/read-body.ts";
import type { Pose } from "../../core/bodies/spec/pose.ts";
import type { GuardSkill } from "../framework/guard.ts";
import { skillName, type Varied } from "../framework/variations.ts";

/** The enabled guards, or an experiment's explicitly configured guard. */
export const guardConfigs = (parts: PartLookup, spec: BodySpec, given?: ConfigFor<"guard">): readonly ConfigFor<"guard">[] =>
  given && parts.of("guard", given).variations === undefined ? [given] : parts.selected("guard", spec).filter(config => !given || config.kind === given.kind
    && ((given as Varied).variation === undefined || (given as Varied).variation === (config as Varied).variation))
    .map(config => given ? { ...config, ...given } : config);

/** A single guard's initial pose; several choices start in the body's reference pose until the mind chooses. */
export const initialGuardPosture = (parts: PartLookup, spec: BodySpec, configs: readonly PartConfig[]): Pose =>
  configs.length === 1 ? parts.of("guard", configs[0]!).posture(spec, configs[0]!) : {};

/** All enabled guards, made once, with the mind's current choice and every guard's memory saved together. */
export function guardRepertoire(parts: PartLookup, built: ReadBody, configs: readonly PartConfig[]): GuardSkill {
  const guards = configs.map(config => parts.of("guard", config).make(built, config)), names = configs.map(skillName);
  const channels = [...new Set(guards.flatMap(guard => Object.keys(guard.posture)))];
  const state = { selected: configs.length === 1 ? 0 : -1, guards: guards.map(guard => guard.state ?? null),
    posture: { ...initialGuardPosture(parts, built.spec, configs) } as Record<string, number> };
  const current = () => guards[state.selected];
  return {
    state, channels, posture: state.posture, effectors: [...new Set(guards.flatMap(guard => guard.effectors))],
    select(name, view) {
      if (name === undefined) return;
      const index = names.indexOf(name);
      if (index < 0) throw new Error(`guard ${name} is not selected`);
      if (index === state.selected) return;
      current()?.resume(view); state.selected = index; current()!.resume(view);
      for (const channel of channels) delete state.posture[channel];
      Object.assign(state.posture, current()!.posture);
    },
    hold: effector => current()?.hold?.(effector) ?? null,
    configuration: effector => current()?.configuration?.(effector) ?? null,
    command: (view, cover) => current()?.command(view, cover) ?? {},
    resume: view => { for (const guard of guards) guard.resume(view); },
  };
}
