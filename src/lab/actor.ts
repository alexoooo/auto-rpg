import { createBody, type BodyOptions, type HostedBody } from "../core/body.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { AssistCeiling } from "../core/control/assist.ts";
import type { StanceTuning } from "../core/control/stance-tuning.ts";
import { partLookup, partOf, scriptedBy, treeFaults, GAME } from "../entrants/game.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { createMind, type MindMade, type MindWiring } from "../core/mind/minds.ts";
import { clockSenses } from "../core/mind/senses.ts";
import type { AroundDecider, Decider, Script, Sight } from "../core/mind/decider.ts";
import { heldIn } from "../core/skills/strikes/held-strike.ts";
import type { World } from "../core/world.ts";
import type { Side } from "../core/spec/body.ts";
import { LAB_PRESETS } from "./scenarios.ts";
import { strikeAllowed } from "./loadout.ts";

/** A mode's instrument: it reads what the mind sees, before the mind decides, and changes nothing. */
type Watch = (sight: Sight, dt: number) => void;

/** A mind the Lab drives: its skills, for their report, its memory and what it reports doing. */
type LabMind = Required<MindMade>;

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
   * Hand the body to its mind with orders and senses, or a scenario script. Returns the mind so
   * driven. A mind of its own takes the orders and senses, and no script, instrument or log.
   */
  drive(script?: Script, driving?: Driving): LabMind;
  /** Whether its mind gets up by its own skills, no sub-mind taking the body: a mind of its own. */
  readonly risesItself: boolean;
  /** The mind last driven (`drive`), for its skills' and its own report; null before it is driven. */
  readonly mind: LabMind | null;
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
  /** What reads the mind's decider as it decides, in its place: a page's log (`logged`, `mind-log.ts`). */
  readonly around?: AroundDecider;
}

/**
 * `decider` in all but what it decides, which is `decide`'s to say. Everything else of its is
 * read through to it, and none of it is the result's own: a spread of it copies nothing.
 */
export function deciding<T extends Decider>(decider: T, decide: Decider["decide"]): T {
  return Object.create(decider, { decide: { value: decide } }) as T;
}

/** `decider`, read by `watch` each step before it decides. */
function watched<T extends Decider>(decider: T, watch: Watch): T {
  return deciding(decider, (sight, dt) => { watch(sight, dt); return decider.decide(sight, dt); });
}

/** `decider`, each hand that may not strike (`strikes`) holding the guard's pose, and attacking nothing. */
function barred<T extends Decider>(decider: T, strikes: Readonly<Record<Side, boolean>>): T {
  if (strikes.left && strikes.right) return decider;
  return deciding(decider, (sight, dt) => {
    const intent = decider.decide(sight, dt), { guard, actions } = intent;
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
export function labActor(built: BuiltBody, world: World, { mind = LAB_PRESETS.script.config, assist, stance, measuring, allows = () => true, around = (decider) => decider, subs }: ActorOptions = {}): Actor {
  let input: Driving = {};
  const clock = clockSenses(world);
  const wiring: MindWiring = { name: "lab", orders: (senses) => input.orders?.(senses) ?? null, assist,
    senses: () => (input.senses ?? clock)(), contactIdentity: (other) => input.contactIdentity?.(other) ?? null };
  const strikes = { left: allows(heldIn(built.spec, "left")), right: allows(heldIn(built.spec, "right")) };
  const scripted = scriptedBy(mind);
  if (!scripted) {
    if (subs) throw new Error(`${partOf(mind).label} takes no script, so the Lab cannot replace its sub-minds`);
    const own = createMind(GAME, built, world, mind, wiring), skills = own.skills, report = own.report;
    if (!skills || !report || !("view" in own.body)) throw new Error(`${partOf(mind).label} runs no skills the Lab can read`);
    const made: LabMind = { state: own.state, skills, report };
    return {
      body: own.body as HostedBody, world, strikes, risesItself: true,
      drive(_script, driving = {}) { input = driving; return made; },
      get mind() { return made; },
      dispose: () => own.body.dispose(),
    };
  }
  const fault = treeFaults(mind, ["script"])[0];
  if (fault) throw new Error(fault);
  const body = createBody(built, world, { ...scripted.body(mind, wiring, partLookup), stance, measuring,
    ...(subs ? { subs } : {}) });
  let driven: LabMind | null = null;
  return {
    body, world, strikes, risesItself: false,
    drive(script, driving = {}) {
      input = driving;
      const { watch } = driving;
      return driven = scripted.drive(body.driver, world, partLookup, mind, { ...wiring, script }, (decider) => {
        const made = barred(around(decider), strikes);
        return watch ? watched(made, watch) : made;
      });
    },
    get mind() { return driven; },
    dispose: () => body.dispose(),
  };
}
