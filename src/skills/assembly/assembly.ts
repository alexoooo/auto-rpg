import { windowSpotFinder } from "../intent/action-window.ts";
import type { Aims } from "../framework/aim-part.ts";
import { SERVO_SECONDS, type Body, type LayerOptions } from "../../control/body.ts";
import { skillSet } from "../framework/arbiter.ts";
import type { Skills } from "../framework/skills.ts";
import type { Ended } from "../framework/action.ts";
import type { ActionBinding, ExecutorBinding } from "../framework/action-instances.ts";
import type { Clock } from "../../core/world/clock.ts";
import type { SkillParts } from "../config.ts";
import { configuredAims, configuredExecutors } from "./action-config.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { PartConfig } from "../../parts/parts.ts";
import { navigatorOf } from "../framework/navigation.ts";
import { legsOf, motorOf } from "./filled.ts";

/** The options of the command layers (`commandLayers`) a body's skills run on: all action instances share its effectors' touch (`LayerOptions.feedback`) and body-local ledger; its motor `motor`, as `parts` finds it. */
export function motorLayerOptions(motor: PartConfig, parts: PartLookup): LayerOptions {
  return { servoSeconds: SERVO_SECONDS, feedback: true, motor: motorOf(parts, motor) };
}

/** Executors a mind makes itself beside those its config names, and their actions (`makeSkills`). */
interface MoreSkills {
  readonly executors: readonly ExecutorBinding[];
  readonly actions: readonly ActionBinding[];
}

/** No executor beyond the config's. */
const NO_MORE: MoreSkills = Object.freeze({ executors: Object.freeze([]), actions: Object.freeze([]) });

/** The skills `config` names, each part the one `parts` finds, a mind's own included, and `more` beside them; action aims are `aims` (the body's one, `configuredAims`) and read these skills' ledger of actions ended. */
export function makeSkills(made: Body, clock: Clock, parts: PartLookup, config: SkillParts, more: MoreSkills = NO_MORE, aims?: Aims): Skills {
  const guard = parts.of("guard", config.guard).make(made.built, config.guard);
  const legs = legsOf(parts, made, config.legs);
  const navigation = navigatorOf(parts, made.built.spec, config.navigation);
  const configured = aims ?? configuredAims(parts, made.built.spec, config.actions);
  // Read each time an action aims, which is after the skills are made.
  const ledger = (): readonly Ended[] => skills.report.ledger;
  const skills: Skills = skillSet(made, {
    legs, navigation, clearance: navigation, guard, spot: windowSpotFinder,
    support: config.support ? parts.of("support", config.support).make(made, config.support) : null,
    aims: configured,
    executors: [...configuredExecutors(parts, made, clock, guard.posture, config.executors, config.actions, ledger, configured), ...more.executors],
    actions: [...config.actions, ...more.actions],
  });
  return skills;
}
