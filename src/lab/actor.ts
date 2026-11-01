import type { HostedBody } from "../core/body.ts";
import type { SubMindMaker } from "../core/mind/sub-mind.ts";
import { commandedBody } from "../core/mind/host.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { AssistCeiling } from "../core/control/assist.ts";
import type { StanceTuning } from "../core/control/stance-tuning.ts";
import { partLookup, partOf, scriptedBy, treeFaults, treeObeys, GAME } from "../entrants/game.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { createMind, type MindMade, type MindWiring } from "../core/mind/minds.ts";
import { clockSenses } from "../core/mind/senses.ts";
import type { AroundDecider, Decider, Script, Sight } from "../core/mind/decider.ts";
import { heldIn } from "../core/skills/strikes/held-strike.ts";
import type { World } from "../core/world.ts";
import type { Side } from "../core/spec/body.ts";
import { LAB_PRESETS } from "./scenarios.ts";
import { strikeAllowed } from "./loadout.ts";
import type { Intent } from "../core/intent/intent.ts";
import type { Orders } from "../core/intent/orders.ts";
import { directMovement } from "../core/intent/movement.ts";
import { cos, hypot, sin } from "../core/math/real.ts";

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
 * script; or one of its own, made as a fight makes it (`createMind`), carrying out the mode's orders,
 * or its script made orders (`scriptOrders`). A mode takes its actor over: it disposes it with itself.
 */
export interface Actor {
  readonly body: HostedBody;
  readonly world: World;
  /** Whether each hand may attack: what it holds is not barred (`ActorOptions.allows`). A mode asks no strike of a hand that may not. */
  readonly strikes: Readonly<Record<Side, boolean>>;
  /**
   * Hand the body to its mind with orders and senses, or a scenario script. Returns the mind so
   * driven. A mind of its own takes the orders and senses, or the script as orders where it carries
   * them out (`treeObeys`), and no log.
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
  readonly subs?: readonly SubMindMaker[];
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
 * **A script's intent as orders**, for a mind that carries out orders and takes no script: its walk
 * as a direct one across the ground (turned from the body's `heading` into the world's frame) at no
 * more than its speed, its facing, its gait and its walking, all held to before the mind's own
 * judgement (`Orders.firm`). What orders do not say, its actions, its height and how far it has to
 * go, is not given.
 */
function intentOrders({ move, face, gait, walk }: Intent, heading: number): Orders {
  const kept = { face: { x: sin(face), z: cos(face) }, firm: true as const, ...(gait === undefined ? {} : { gait }), ...(walk ? { walk } : {}) };
  if (move === null || move[0] === 0 && move[1] === 0) return { move: null, ...kept };
  const [forward, right] = move, s = sin(heading), c = cos(heading);
  return { move: directMovement(forward * s + right * c, forward * c - right * s), pace: hypot(forward, right), ...kept };
}

/**
 * `script`'s orders for `made`'s mind on `body` (`intentOrders`): it decides, `watch` reading first,
 * once a step, on the step's first ask, from what the mind's skills see; any later ask that step is
 * given the same.
 */
function scriptOrders(script: Script, watch: Watch | undefined, body: HostedBody, world: World, skills: LabMind["skills"]): () => Orders {
  const sight: Sight = { view: body.view, report: skills.report, get envelope() { return skills.envelope; }, envelopeOf: skills.envelopeOf,
    instance: skills.instance, readiness: skills.readiness, needs: skills.needs, clearance: skills.clearance };
  let time: number | null = null, orders: Orders | null = null;
  return () => {
    if (orders === null || time !== body.view.time) {
      const dt = time === null ? world.dt : body.view.time - time;
      time = body.view.time;
      watch?.(sight, dt);
      orders = intentOrders(script.decide(sight, dt), skills.report.heading);
    }
    return orders;
  };
}

/**
 * `built`, a human in its reference pose on the ground of `world`, as a mode's actor. A mind that
 * takes no script (`scriptedBy`) is made as a fight makes it (`createMind`), refused where it runs
 * no skills or `subs` would replace its sub-minds, and given a script where it carries out no orders;
 * one that takes a script with a fault in its tree (`treeFaults`, given a script) is refused.
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
      drive(script, driving = {}) {
        if (!script) { input = driving; return made; }
        if (!treeObeys(mind)) throw new Error(`${partOf(mind).label} carries out no orders, so the Lab cannot give it a script`);
        const ordered = scriptOrders(script, driving.watch, own.body as HostedBody, world, skills);
        input = { ...driving, orders: ordered };
        return made;
      },
      get mind() { return made; },
      dispose: () => own.body.dispose(),
    };
  }
  const fault = treeFaults(mind, ["script"])[0];
  if (fault) throw new Error(fault);
  const body = commandedBody(built, world, { ...scripted.body(mind, partLookup), senses: wiring.senses, assist: wiring.assist, contactIdentity: wiring.contactIdentity,
    stance, measuring }, subs ?? scripted.subs(mind, partLookup));
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
