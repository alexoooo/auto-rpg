import { createBody, SERVO_SECONDS, type Body } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import type { ContactIdentity } from "../control/hand-feedback.ts";
import type { AssistCeiling } from "../control/assist.ts";
import type { Skills } from "../skills/skills.ts";
import type { World } from "../world.ts";
import type { FighterMindConfig, MindConfig } from "./config.ts";
import { fighterTactics, seekFoe, STRAFE } from "./fighter.ts";
import type { Orders } from "./orders.ts";
import type { Senses } from "./senses.ts";
import { subMindsOf } from "./sub-minds.ts";
import { driveBy } from "./tactics.ts";
import type { PhysicalBody } from "../physical-body.ts";
import { arenaFighter } from "./arena-fighter.ts";
import { pointFighter } from "./point-fighter.ts";
import { createDirectBody } from "./direct.ts";
import { createQuadrupedMind } from "../reptile/mind.ts";

/** **What a fight gives the mind it makes**, beside the body and the config. */
interface MindWiring {
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
  readonly kind: "fighter" | "point-fighter" | "arena-fighter";
  readonly body: Body;
  readonly skills: Skills;
}

/**
 * **A body under a mind, by the mind's kind.** A fight holds one and reads what every kind gives,
 * the body and the memory; a reader that needs a kind's own narrows on `kind`.
 */
export type Minded = FighterMind | (MindedBody & { readonly kind: "direct" }) | (MindedBody & { readonly kind: "quadruped" });

/** `built` under the mind `config` names, wired to its fight. */
export function createMind(built: BuiltBody, world: World, config: MindConfig, wiring: MindWiring): Minded {
  switch (config.kind) {
    case "quadruped": return createQuadrupedMind(built, world, wiring.orders, wiring.senses, wiring.assist);
    case "arena-fighter": return arenaFighter(built, world, config, wiring);
    case "point-fighter": return pointFighter(built, world, config, wiring);
    case "fighter": return createFighter(built, world, config, wiring);
    case "direct": {
      const body = createDirectBody(built, world, config, wiring);
      return { kind: "direct", body, state: {} };
    }
    default: return unknownKind(config);
  }
}

/** A fighter left to itself seeks its foe (`seekFoe`): the one conduct there is. */
function createFighter(built: BuiltBody, world: World, config: FighterMindConfig, wiring: MindWiring): FighterMind {
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS, senses: wiring.senses, assist: wiring.assist, subs: subMindsOf(config.subs) });
  const skills = driveBy(body, fighterTactics(wiring.name, (sight) => wiring.orders(sight.view.senses) ?? seekFoe(sight, config.aim, config.range, config.edge), STRAFE, config.guard, config.threat),
    { cover: config.covering });
  return { kind: "fighter", body, skills, state: skills.state };
}

/** A config's kind no maker knows: a compile error where the union is known, and a thrown one for a config read from a save or a link. */
function unknownKind(config: never): never {
  throw new Error(`no mind of kind ${JSON.stringify((config as { kind?: unknown }).kind)}`);
}
