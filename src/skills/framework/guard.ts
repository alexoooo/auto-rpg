import type { BodyView } from "../../control/body.ts";
import type { EffectorGoal, PointTask } from "../../control/motor.ts";
import type { Pose } from "../../core/bodies/spec/pose.ts";
import type { BodySpec, ConfigurationName } from "../../core/bodies/spec/body.ts";
import type { ReadBody } from "../../core/bodies/read-body.ts";
import type { Intent } from "../intent/intent.ts";
import type { Skill } from "./skill.ts";
import type { KeysOf, Part, PartConfig } from "../../parts/parts.ts";

/** A guard service declares the effectors it covers with and the goals it writes for free effectors. */
export interface GuardSkill extends Skill {
  /** The declared effector segments it guards with; the arbiter asks about each free effector. */
  readonly effectors: readonly string[];
  /** What it remembers, plain data saved and loaded with the mind (`src/core/state.ts`); none where it remembers nothing. */
  readonly state?: object;
  /** The reference posture of channels left free by discrete actions. */
  readonly posture: Pose;
  /** A point task for a free effector, or null to retain the reference posture. */
  readonly hold: ((effector: string) => PointTask | null) | null;
  /** The configuration requested for a free segment; absent or null retains its previous request. */
  configuration?(effector: string): ConfigurationName | null;
  /** The goals it writes this step, by declared effector segment. */
  command(view: BodyView, guard: Intent["guard"]): Readonly<Record<string, EffectorGoal | null>>;
}

/**
 * **A kind of guard**: a part of role `guard` that owns a reference posture and makes the skill that
 * covers. Its posture is the one source of where a body of it is built (`Controller.builtIn`), where
 * the arbiter rests channels no action holds and where a blow returns (`ExecutorMaking.guard`).
 */
export interface GuardPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "guard";
  readonly keys: KeysOf<C>;
  /** The arms' rest a body of `spec` holds under `config`, before any skill is made: what it is built in. */
  posture(spec: BodySpec, config: C): Pose;
  /** The guard skill of `config` for the body `built`; its `posture` is `posture`'s for the body's spec. */
  make(built: ReadBody, config: C): GuardSkill;
}

declare module "../../parts/lookup.ts" {
  interface RoleParts {
    readonly guard: GuardPart;
  }
}
