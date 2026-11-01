import type { Aim } from "./framework/aim-part.ts";
import { SERVO_SECONDS, type Body, type LayerOptions } from "../body.ts";
import { skillSet } from "./framework/arbiter.ts";
import type { Skills } from "./framework/skills.ts";
import type { Ended } from "./framework/action.ts";
import type { ActionBinding, ExecutorBinding } from "./framework/action-instances.ts";
import type { Clock } from "../clock.ts";
import type { SkillKit } from "./config.ts";
import { actionConfigFaults, configuredExecutors } from "./action-config.ts";
import type { PartLookup } from "../parts/lookup.ts";
import type { PartConfig } from "../parts/parts.ts";
import { navigatorOf } from "../navigation/navigator.ts";
import { legsOf, motorOf } from "../mind/kit.ts";

/** What is wrong with how a kit's actions name its executors and their own settings, each a sentence (`actionFaults`). */
export function kitFaults(config: SkillKit, parts: PartLookup): readonly string[] {
  if (!Array.isArray(config.actions)) return ["actions must be a list"];
  return actionConfigFaults(parts, config.executors, config.actions);
}

/** A kit's command layers (`commandLayers`): all action instances share its effectors' touch (`LayerOptions.feedback`) and body-local ledger; its motor is the one `parts` finds. */
export function kitBody(config: { readonly motor?: PartConfig | null }, parts: PartLookup): LayerOptions {
  return { servoSeconds: SERVO_SECONDS, feedback: true, motor: motorOf(parts, config.motor) };
}

/** Executors a mind makes itself beside those its config names, and their actions (`kitSkills`). */
interface MoreSkills {
  readonly executors: readonly ExecutorBinding[];
  readonly actions: readonly ActionBinding[];
}

/** No executor beyond the config's. */
const NO_MORE: MoreSkills = Object.freeze({ executors: Object.freeze([]), actions: Object.freeze([]) });

/** The skills `config` names, each part the one `parts` finds, a mind's own included, and `more` beside them; action aims are `aims` (the body's one, `configuredAims`) and read the body's `ledger`. */
export function kitSkills(made: Body, clock: Clock, parts: PartLookup, config: SkillKit, ledger: () => readonly Ended[],
  more: MoreSkills = NO_MORE, aims?: ReadonlyMap<string, Aim>): Skills {
  const guard = parts.of("guard", config.guard).make(made.built, config.guard);
  return skillSet(made, {
    legs: legsOf(parts, made, config.locomotion), navigation: navigatorOf(parts, made.built.spec, config.navigation), guard,
    support: config.support ? parts.of("support", config.support).make(made, config.support) : null,
    executors: [...configuredExecutors(parts, made, clock, guard.posture, config.executors, config.actions, ledger, aims), ...more.executors],
    actions: [...config.actions, ...more.actions],
  });
}
