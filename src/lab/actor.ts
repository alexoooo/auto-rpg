import { createBody, type BodyOptions, type HostedBody } from "../core/body.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { AssistCeiling } from "../core/control/assist.ts";
import type { StanceTuning } from "../core/control/stance-tuning.ts";
import { partLookup, partOf, scriptedBy, treeFaults, GAME } from "../entrants/game.ts";
import type { FighterConfig, MindConfig } from "../core/mind/config.ts";
import { createMind, type MindWiring } from "../core/mind/minds.ts";
import { clockSenses } from "../core/mind/senses.ts";
import type { Sight, Tactics } from "../core/mind/tactics.ts";
import type { Skills } from "../core/skills/skills.ts";
import { heldIn } from "../core/skills/strikes.ts";
import type { World } from "../core/world.ts";
import type { Side } from "../core/spec/body.ts";
import { LAB_PRESETS } from "./scenarios.ts";
import { strikeAllowed } from "./loadout.ts";

/** A mode's instrument: it reads what the mind sees, before the mind decides, and changes nothing. */
type Watch = (sight: Sight, dt: number) => void;

/** A mode's orders and senses, or its script, and optional instruments. */
interface Driving {
  readonly orders?: MindWiring["orders"];
  readonly senses?: MindWiring["senses"];
  readonly contactIdentity?: MindWiring["contactIdentity"];
  /** Read each step, whatever the mind is. */
  readonly watch?: Watch;
}

/**
 * **A lab body and what drives it.** Every mode stands its body through an actor, so what a page
 * or an experiment gives a body is given here, and a mode knows none of it. Its mind is one that
 * takes a script (`ActorOptions.mind`, `Controller.scripted`), carrying out game orders or a mode's
 * script; or one of its own, made as a fight makes it (`createMind`), carrying out the mode's orders
 * and given no script. A mode takes its actor over: it disposes it with itself.
 */
export interface Actor {
  readonly body: HostedBody;
  readonly world: World;
  /** Whether each hand may attack: what it holds is not barred (`ActorOptions.allows`). A mode asks no strike of a hand that may not. */
  readonly strikes: Readonly<Record<Side, boolean>>;
  /**
   * Hand the body to its mind with orders and senses, or a scenario script. Returns the skills for
   * their report. A mind of its own takes the orders and senses, and no script, instrument or log.
   */
  drive(script?: Tactics, driving?: Driving): Skills;
  /** Whether its mind gets up by its own skills, no sub-mind taking the body: a mind of its own. */
  readonly risesItself: boolean;
  /** The skills its mind last drove it with (`drive`), for their report; null before it is driven. */
  readonly skills: Skills | null;
  dispose(): void;
}

interface ActorOptions {
  /** An explicit experiment's pre-created sub-minds, in place of the selected mind's. */
  readonly subs?: BodyOptions["subs"];
  /** Its mind: the script on the blade fighter's skills, lying still once down (`LAB_PRESETS.script`), unless given. */
  readonly mind?: MindConfig;
  /** The most its assist gives it (`balanceCeiling`); none unless given. */
  readonly assist?: AssistCeiling;
  /** An experiment's stance tuning in place of the stance's constants. */
  readonly stance?: StanceTuning;
  /** A body being measured (`BodyOptions.measuring`): no envelope caps its walk or turn. */
  readonly measuring?: boolean;
  /**
   * What its mind may strike with, by what a hand holds (`heldIn`); anything unless given. A hand
   * that holds what is barred guards, whatever its mind asks of it.
   */
  readonly allows?: (held: string) => boolean;
  /** What reads the mind's tactics as they decide, in their place: a page's log (`logged`, `mind-log.ts`). */
  readonly around?: (tactics: Tactics) => Tactics;
}

/**
 * `tactics` in all but what they decide, which is `decide`'s to say. Everything else of theirs is
 * read through to them, and none of it is the result's own: a spread of it copies nothing.
 */
export function deciding<T extends Tactics>(tactics: T, decide: Tactics["decide"]): T {
  return Object.create(tactics, { decide: { value: decide } }) as T;
}

/** `tactics`, read by `watch` each step before they decide. */
function watched(tactics: Tactics, watch: Watch): Tactics {
  return deciding(tactics, (sight, dt) => { watch(sight, dt); return tactics.decide(sight, dt); });
}

/** `tactics`, each hand that may not strike (`strikes`) holding the guard's pose, and attacking nothing. */
function barred(tactics: Tactics, strikes: Readonly<Record<Side, boolean>>): Tactics {
  if (strikes.left && strikes.right) return tactics;
  return deciding(tactics, (sight, dt) => {
    const intent = tactics.decide(sight, dt), { guard, actions } = intent;
    return { ...intent, guard: { "hand.left": strikes.left ? guard["hand.left"] ?? null : null, "hand.right": strikes.right ? guard["hand.right"] ?? null : null },
      actions: actions.filter(action => strikeAllowed(action.effector, strikes)) };
  });
}

/**
 * `built`, a human in its reference pose on the ground of `world`, as a mode's actor. A mind that
 * takes no script (`scriptedBy`) is made as a fight makes it (`createMind`), refused where it runs
 * no skills or `subs` would replace its sub-minds; one with a fault in its tree (`treeFaults`, given
 * a script) is refused.
 */
export function labActor(built: BuiltBody, world: World, { mind = LAB_PRESETS.script.config, assist, stance, measuring, allows = () => true, around = (tactics) => tactics, subs }: ActorOptions = {}): Actor {
  let input: Driving = {};
  const clock = clockSenses(world);
  const wiring: MindWiring = { name: "lab", orders: (senses) => input.orders?.(senses) ?? null, assist,
    senses: () => (input.senses ?? clock)(), contactIdentity: (other) => input.contactIdentity?.(other) ?? null };
  const strikes = { left: allows(heldIn(built.spec, "left")), right: allows(heldIn(built.spec, "right")) };
  const scripted = scriptedBy(mind);
  if (!scripted) {
    if (subs) throw new Error(`${partOf(mind).label} takes no script, so the Lab cannot replace its sub-minds`);
    const own = createMind(GAME, built, world, mind, wiring), skills = own.skills;
    if (!skills || !("view" in own.body)) throw new Error(`${partOf(mind).label} runs no skills the Lab can read`);
    return {
      body: own.body as HostedBody, world, strikes, risesItself: true,
      drive(_script, driving = {}) { input = driving; return skills; },
      get skills() { return skills; },
      dispose: () => own.body.dispose(),
    };
  }
  const fighter = mind as FighterConfig;
  const fault = treeFaults(fighter, ["script"])[0];
  if (fault) throw new Error(fault);
  const body = createBody(built, world, { ...scripted.body(fighter, wiring, partLookup), stance, measuring,
    ...(subs ? { subs } : {}) });
  let driven: Skills | null = null;
  return {
    body, world, strikes, risesItself: false,
    drive(script, driving = {}) {
      input = driving;
      const { watch } = driving;
      return driven = scripted.drive(body.driver, world, partLookup, fighter, { ...wiring, script }, (tactics) => {
        const made = barred(around(tactics), strikes);
        return watch ? watched(made, watch) : made;
      });
    },
    get skills() { return driven; },
    dispose: () => body.dispose(),
  };
}
