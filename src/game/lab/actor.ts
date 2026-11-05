import type { HostedBody } from "../../minds/hosted-body.ts";
import type { BuiltBody } from "../../core/bodies/build/build-body.ts";
import type { AssistCeiling } from "../../core/bodies/assist.ts";
import type { Experiment } from "../../minds/mind.ts";
import type { GameContext } from "../arena/context.ts";
import type { MindConfig } from "../../minds/config.ts";
import { createMind, type MindMade, type MindWiring } from "../../minds/minds.ts";
import { clockSenses } from "../../core/world/senses.ts";
import type { Script, Sight } from "../../minds/decider.ts";
import type { World } from "../../core/world/world.ts";
import type { Intent } from "../../skills/intent/intent.ts";
import type { Orders } from "../../skills/intent/orders.ts";
import { directMovement } from "../../skills/intent/movement.ts";
import { cos, hypot, sin } from "../../core/math/real.ts";

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
 * or an experiment gives a body is given here, and a mode knows none of it. Its mind is made as a
 * fight makes it (`createMind`) and carries out the mode's orders, or its script made orders
 * (`scriptOrders`). A mode takes its actor over: it disposes it with itself.
 */
export interface Actor {
  readonly body: HostedBody;
  readonly world: World;
  /** Hand the body to its mind with orders and senses, or a scenario script made orders (`scriptOrders`). Returns the mind so driven. */
  drive(script?: Script, driving?: Driving): LabMind;
  /** Its mind, for its skills' and its own report. */
  readonly mind: LabMind;
  dispose(): void;
}

interface ActorOptions {
  /** Its mind. */
  readonly mind: MindConfig;
  /** The most its assist gives it (`balanceCeiling`); none unless given. */
  readonly assist?: AssistCeiling;
  /** An experiment's settings of its command layers (`Experiment`): a stance's tuning, the envelope measured; none unless given. */
  readonly experiment?: Experiment;
}

/**
 * **A script's intent as orders**: its walk as a direct one across the ground (turned from the
 * body's `heading` into the world's frame) at no more than its speed, its facing, its gait, its
 * walking and its height, all held to before the mind's own judgement (`Orders.firm`). What orders
 * do not say, its actions and how far it has to go, is not given.
 */
function intentOrders({ move, face, gait, walk, lower }: Intent, heading: number): Orders {
  const kept = { face: { x: sin(face), z: cos(face) }, firm: true as const, ...(gait === undefined ? {} : { gait }), ...(walk ? { walk } : {}),
    ...(lower === undefined ? {} : { lower }) };
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
 * `built`, a human in its reference pose on the ground of `world`, as a mode's actor: its mind made
 * as a fight makes it (`createMind`), refused where it runs no skills the Lab can read, and given a
 * script only where it carries out orders (`treeObeys`).
 */
export function labActor(context: GameContext, built: BuiltBody, world: World, { mind, assist, experiment }: ActorOptions): Actor {
  const GAME = context.catalog, { partOf, treeObeys } = GAME;
  let input: Driving = {};
  const clock = clockSenses(world);
  const wiring: MindWiring = { name: "lab", orders: (senses) => input.orders?.(senses) ?? null, assist, ...(experiment ? { experiment } : {}),
    senses: () => (input.senses ?? clock)(), contactIdentity: (other) => input.contactIdentity?.(other) ?? null };
  const own = createMind(GAME, built, world, mind, wiring), skills = own.skills, report = own.report;
  if (!skills || !report || !("view" in own.body)) throw new Error(`${partOf(mind).label} runs no skills the Lab can read`);
  const made: LabMind = { state: own.state, skills, report }, body = own.body as HostedBody;
  return {
    body, world,
    drive(script, driving = {}) {
      if (!script) { input = driving; return made; }
      if (!treeObeys(mind)) throw new Error(`${partOf(mind).label} carries out no orders, so the Lab cannot give it a script`);
      input = { ...driving, orders: scriptOrders(script, driving.watch, body, world, skills) };
      return made;
    },
    get mind() { return made; },
    dispose: () => own.body.dispose(),
  };
}
