import { heldVariation, varied, type Fits, type VariedConfig, type Variations } from "./variations.ts";
import type { BodyView } from "../../control/body.ts";
import type { EffectorGoal, PointTask } from "../../control/motor.ts";
import type { Pose } from "../../core/bodies/spec/pose.ts";
import type { BodySpec, ConfigurationName } from "../../core/bodies/spec/body.ts";
import type { ReadBody } from "../../core/bodies/read-body.ts";
import type { Intent } from "./intent.ts";
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
  /** All channels this service can write, for guards selected during combat. */
  readonly channels?: readonly string[];
  /** The config of the guard selected now, null with none yet; absent, a guard that does not say. */
  readonly selected?: PartConfig | null;
  /** Select an enabled guard by its `skill/variation` name; absent, this is one fixed guard. */
  select?(name: string | undefined, view: BodyView): void;
  /** A point task for a free effector over a step of `dt` s, or null to retain the reference posture. */
  readonly hold: ((effector: string, dt: number) => PointTask | null) | null;
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
  /** The hands of a body of `spec` it covers a blow with where its mind asks it (`Intent.guard`); none where absent. */
  covers?(spec: BodySpec, config: C): readonly string[];
  /** The segments of `spec` whose held item it covers with: a declared use of what they hold (`Controller.supportedEquipment`). */
  supportedEquipment?(spec: BodySpec, config: C): readonly string[];
  /** The arms' rest a body of `spec` holds under `config`, before any skill is made: what it is built in. */
  posture(spec: BodySpec, config: C): Pose;
  /** The guard skill of `config` for the body `built`; its `posture` is `posture`'s for the body's spec. */
  make(built: ReadBody, config: C): GuardSkill;
}

/** **A guard's variation** (`Variations`): the arms' rest it holds and the guard skill it makes. */
export type GuardVariation<C extends PartConfig> = Pick<GuardPart<C>, "posture" | "make">;

/**
 * **A guard's part over its `variations`** (`varied`): their names, its `fits` and its `make`, and
 * its `posture`, the posture of the variation its body runs (`heldVariation`).
 */
export function guardVariations<C extends VariedConfig>({ skill, label, variations, fits }: {
  readonly skill: string; readonly label: string; readonly variations: Variations<GuardVariation<C>>; readonly fits: readonly Fits<C>[];
}): Pick<GuardPart<C>, "fits" | "posture" | "make" | "variations"> {
  const makers = Object.fromEntries(Object.entries(variations).map(([name, one]) => [name, one.make]));
  return {
    ...varied({ skill, label, variations: makers, of: (built: ReadBody, config: C) => [built.spec, config], fits }),
    posture: (spec, config) => heldVariation(spec, skill, config, variations).posture(spec, config),
  };
}

declare module "../../parts/lookup.ts" {
  interface RoleParts {
    readonly guard: GuardPart;
  }
}
