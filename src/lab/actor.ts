import { createBody, SERVO_SECONDS, type Body } from "../core/body.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { AssistCeiling } from "../core/control/assist.ts";
import type { Hand } from "../core/control/motor.ts";
import type { StanceTuning } from "../core/control/stance-tuning.ts";
import { FIGHTER, type SubMindConfig } from "../core/mind/config.ts";
import { GUARD_ACTION } from "../core/mind/intent.ts";
import { subMindsOf } from "../core/mind/sub-minds.ts";
import { driveBy, type Sight, type Tactics } from "../core/mind/tactics.ts";
import type { SkillOptions, Skills } from "../core/skills/skills.ts";
import { heldIn } from "../core/skills/strikes.ts";
import type { World } from "../core/world.ts";
import { deciding } from "./minds.ts";

/** A mode's instrument: it reads what the mind sees, before the mind decides, and changes nothing. */
type Watch = (sight: Sight, dt: number) => void;

/** What a mode drives its body with, beside its script. */
interface Driving {
  /** What its skills are made with, in place of their defaults. */
  readonly skills?: SkillOptions;
  /** Read each step, whatever the mind is. */
  readonly watch?: Watch;
}

/**
 * **A lab body and what drives it.** Every mode stands its body through an actor, so what a page
 * or an experiment gives a body is given here, and a mode knows none of it. Its tactics are a
 * mode's script; its sub-minds are the ones every body in a fight has (`FIGHTER`) unless it is
 * given others. A mode takes its actor over: it disposes it with itself.
 */
export interface Actor {
  readonly body: Body;
  readonly world: World;
  /** Whether each hand may attack: what it holds is not barred (`ActorOptions.allows`). A mode asks no strike of a hand that may not. */
  readonly strikes: Readonly<Record<Hand, boolean>>;
  /** Hand the body to its mind, which makes its tactics of `script`, a mode's. Returns the skills, for their report. */
  drive(script: Tactics, driving?: Driving): Skills;
  dispose(): void;
}

interface ActorOptions {
  /** The most its assist gives it (`balanceCeiling`); none unless given. */
  readonly assist?: AssistCeiling;
  /** An experiment's stance tuning in place of the stance's constants. */
  readonly stance?: StanceTuning;
  /**
   * What its mind may strike with, by what a hand holds (`heldIn`); anything unless given. A hand
   * that holds what is barred guards, whatever its mind asks of it.
   */
  readonly allows?: (held: string) => boolean;
  /** Its mind: the tactics that drive it, made of the mode's script; the script itself unless given. */
  readonly mind?: (script: Tactics) => Tactics;
  /** The sub-minds its mind hands its body to, in rank order; the game's (`FIGHTER`) unless given. */
  readonly subs?: readonly SubMindConfig[];
}

/** `tactics`, read by `watch` each step before they decide. */
function watched(tactics: Tactics, watch: Watch): Tactics {
  return deciding(tactics, (sight, dt) => { watch(sight, dt); return tactics.decide(sight, dt); });
}

/** `tactics`, each hand that may not strike (`strikes`) guarding where they have it attack. */
function barred(tactics: Tactics, strikes: Readonly<Record<Hand, boolean>>): Tactics {
  if (strikes.left && strikes.right) return tactics;
  return deciding(tactics, (sight, dt) => {
    const intent = tactics.decide(sight, dt), { left, right } = intent.hands;
    return { ...intent, hands: { left: strikes.left ? left : GUARD_ACTION, right: strikes.right ? right : GUARD_ACTION } };
  });
}

/** `built`, a human in its reference pose on the ground of `world`, as a mode's actor. */
export function labActor(built: BuiltBody, world: World, { assist, stance, allows = () => true, mind = (script) => script, subs = FIGHTER.subs }: ActorOptions = {}): Actor {
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS, assist, stance, subs: subMindsOf(subs) });
  const strikes = { left: allows(heldIn(built.spec, "left")), right: allows(heldIn(built.spec, "right")) };
  return {
    body, world, strikes,
    drive(script, { skills, watch } = {}) {
      const tactics = barred(mind(script), strikes);
      return driveBy(body, watch ? watched(tactics, watch) : tactics, skills);
    },
    dispose: () => body.dispose(),
  };
}
