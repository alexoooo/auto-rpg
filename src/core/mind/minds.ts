import type { BuiltBody } from "../build/build-body.ts";
import type { ContactIdentity } from "../control/effector-feedback.ts";
import type { AssistCeiling } from "../control/assist.ts";
import { poseAngles } from "../control/kinematics.ts";
import type { Skills } from "../skills/skills.ts";
import type { BodySpec } from "../spec/body.ts";
import type { World } from "../world.ts";
import type { MindConfig } from "./config.ts";
import type { Tactics } from "./tactics.ts";
import { treeFaults } from "./catalog.ts";
import { controllerOf } from "./controllers.ts";
import { bodyHost } from "./host.ts";
import type { Orders } from "./orders.ts";
import type { Senses } from "./senses.ts";
import type { PhysicalBody } from "../physical-body.ts";
import type { SheetLog } from "./sheets.ts";

/** **What a fight gives the mind it makes**, beside the body and the config. */
export interface MindWiring {
  readonly name: string;
  /** Trusted body adapter for permitted contact labels. */
  readonly contactIdentity?: ContactIdentity;
  /** Its orders this step, or null when it is left to itself. `senses` are its own, this step's. */
  orders(senses: Senses): Orders | null;
  /** What it senses (`SensesHub.add`); the clock alone unless given. */
  readonly senses?: () => Senses;
  /** The most its assist gives it; none unless given. */
  readonly assist?: AssistCeiling;
  /** The screen's script, which tactics of kind `script` carry out: the Lab's scenario. None unless given. */
  readonly script?: Tactics;
}

/** **A mind as its controller makes it** (`Controller.create`): what every kind gives the fight that made it, but the body, which the fight holds from its host (`bodyHost`). */
export interface MindMade {
  /** The mind's memory above its body's (`src/core/state.ts`), saved and loaded with it. */
  readonly state: object;
  /**
   * Its skills, where it runs the game's (`Skills`): their report is what a screen or a test reads
   * of what it is doing and what holds each part of the body, and the rules never read it.
   */
  readonly skills?: Skills;
}

/**
 * **A body under a mind.** A fight holds one and reads what every kind gives, the body and the
 * memory, and never which kind it is: `kind` is its config's (`MindConfig.kind`), or `replay`
 * for a body played from its order sheets with no mind (`replayedBody`), for a screen to name.
 */
export interface Minded extends MindMade {
  readonly kind: string;
  readonly body: PhysicalBody;
}

/** The posture a body of `spec` is built in under the mind `config` names (`Controller.builtIn`), as a placement's angles (`poseAngles`). */
export function builtAngles(spec: BodySpec, config: MindConfig): Record<string, number[]> {
  return poseAngles(spec, controllerOf(config).builtIn(spec, config));
}

/**
 * `built` under the mind `config` names, wired to its fight, made by its controller
 * (`CONTROLLERS`) through a host of the body (`bodyHost`); a config with a fault anywhere in its
 * tree (`treeFaults`, with the script if the wiring gives one) is refused. Given a `log`, its order
 * sheets are written in it (`SheetLog`).
 */
export function createMind(built: BuiltBody, world: World, config: MindConfig, wiring: MindWiring, log?: SheetLog): Minded {
  const fault = treeFaults(config, wiring.script ? ["script"] : [])[0];
  if (fault) throw new Error(fault);
  const { host, made } = bodyHost(built, world, wiring, log);
  const mind = controllerOf(config).create(host, config, wiring);
  return { ...mind, kind: config.kind, body: made() };
}
