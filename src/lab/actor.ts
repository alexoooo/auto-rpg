import { createBody, SERVO_SECONDS, type Body } from "../core/body.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { AssistCeiling } from "../core/control/assist.ts";
import type { StanceTuning } from "../core/control/stance-tuning.ts";
import { driveBy, type Tactics } from "../core/mind/tactics.ts";
import type { SkillOptions, Skills } from "../core/skills/skills.ts";
import type { World } from "../core/world.ts";

/**
 * **A lab body and what drives it.** Every mode stands its body through an actor, so what a page
 * or an experiment gives a body is given here, and a mode knows none of it. A mode takes its
 * actor over: it disposes it with itself.
 */
export interface Actor {
  readonly body: Body;
  readonly world: World;
  /** Hand the body to `script`, a mode's tactics, under the mode's `options`; returns the skills, for their report. */
  drive(script: Tactics, options?: SkillOptions): Skills;
  dispose(): void;
}

interface ActorOptions {
  /** The most its assist gives it (`balanceCeiling`); none unless given. */
  readonly assist?: AssistCeiling;
  /** An experiment's stance tuning in place of the stance's constants. */
  readonly stance?: StanceTuning;
}

/** `built`, a human in its reference pose on the ground of `world`, as a mode's actor. */
export function labActor(built: BuiltBody, world: World, { assist, stance }: ActorOptions = {}): Actor {
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS, assist, stance });
  return { body, world, drive: (script, options) => driveBy(body, script, options), dispose: () => body.dispose() };
}
