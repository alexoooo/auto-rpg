import type { Body } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import type { ContactIdentity } from "../control/effector-feedback.ts";
import type { AssistCeiling } from "../control/assist.ts";
import type { Skills } from "../skills/skills.ts";
import type { World } from "../world.ts";
import type { MindConfig } from "./config.ts";
import { controllerOf } from "./controllers.ts";
import type { Orders } from "./orders.ts";
import type { Senses } from "./senses.ts";
import type { PhysicalBody } from "../physical-body.ts";

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
}

/** What every kind of mind gives the fight that made it. */
interface MindedBody {
  readonly body: PhysicalBody;
  /** The mind's memory above its body's (`src/core/state.ts`), saved and loaded with it. */
  readonly state: object;
}

/** A body under a fighter's mind: its skills, for whoever knows it is a fighter and reads their report. */
interface FighterMind extends MindedBody {
  readonly kind: "recipe-fighter" | "path-fighter";
  readonly body: Body;
  readonly skills: Skills;
}

/**
 * **A body under a mind, by the mind's kind.** A fight holds one and reads what every kind gives,
 * the body and the memory; a reader that needs a kind's own narrows on `kind`.
 */
export type Minded = FighterMind | (MindedBody & { readonly kind: "direct" }) | (MindedBody & { readonly kind: "quadruped" });

/** `built` under the mind `config` names, wired to its fight, made by its controller (`CONTROLLERS`); a config with a fault is refused. */
export function createMind(built: BuiltBody, world: World, config: MindConfig, wiring: MindWiring): Minded {
  const controller = controllerOf(config), fault = controller.faults(config)[0];
  if (fault) throw new Error(fault);
  return controller.create(built, world, config, wiring);
}
