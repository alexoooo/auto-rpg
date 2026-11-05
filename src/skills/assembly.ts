import type { Aim } from "./framework/aim-part.ts";
import { SERVO_SECONDS, type Body, type LayerOptions } from "../control/body.ts";
import { skillSet } from "./framework/arbiter.ts";
import type { Skills } from "./framework/skills.ts";
import type { Ended } from "./framework/action.ts";
import type { ActionBinding, ExecutorBinding } from "./framework/action-instances.ts";
import type { Clock } from "../core/world/clock.ts";
import type { SkillKit } from "./config.ts";
import { configuredExecutors } from "./action-config.ts";
import type { PartLookup } from "../parts/lookup.ts";
import type { PartConfig } from "../parts/parts.ts";
import { navigatorOf } from "./locomotion/navigation/navigator.ts";
import { legsOf, motorOf } from "./kit.ts";

/** A kit's command layers (`commandLayers`): all action instances share its effectors' touch (`LayerOptions.feedback`) and body-local ledger; its motor `motor`, as `parts` finds it. */
export function kitBody(motor: PartConfig, parts: PartLookup): LayerOptions {
  return { servoSeconds: SERVO_SECONDS, feedback: true, motor: motorOf(parts, motor) };
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
  const legs = legsOf(parts, made, config.legs);
  const navigation = navigatorOf(parts, made.built.spec, config.navigation);
  return skillSet(made, {
    legs, navigation, clearance: navigation, guard,
    support: config.support ? parts.of("support", config.support).make(made, config.support) : null,
    executors: [...configuredExecutors(parts, made, clock, guard.posture, config.executors, config.actions, ledger, aims), ...more.executors],
    actions: [...config.actions, ...more.actions],
  });
}
