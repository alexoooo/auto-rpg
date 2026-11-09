import type { MindMade, MindWiring } from "../../minds/catalog/controller.ts";
import type { Refused } from "../../core/refusal.ts";
import type { Rulebook } from "../../combat/rulebook.ts";
import type { HostedBody } from "../../minds/seat/hosted-body.ts";
import type { BuiltBody } from "../../core/bodies/build/build-body.ts";
import type { AssistCeiling } from "../../core/bodies/assist.ts";
import type { Experiment } from "../../control/body.ts";
import type { GameContext } from "../arena/context.ts";
import type { MindConfig } from "../../minds/catalog/config.ts";
import { createMind } from "../../minds/seat/create-mind.ts";
import { clockSenses } from "../../core/world/senses.ts";
import type { Script, Sight } from "../../minds/decider.ts";
import type { World } from "../../core/world/world.ts";
import type { Intent } from "../../skills/framework/intent.ts";
import type { Orders } from "../../minds/orders.ts";
import { directMovement } from "../../skills/framework/movement.ts";
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
  /** The body, the active script's memory and its once-per-step order cache. */
  readonly state: { readonly body: object; readonly mind: object; script: ScriptOrdersState | null };
  readonly body: HostedBody;
  readonly world: World;
  /** Hand the body to its mind with orders and senses, or a scenario script made orders (`scriptOrders`). Returns the mind so driven. */
  drive(script?: Script, driving?: Driving): LabMind | Refused;
  /** Its mind, for its skills' and its own report. */
  readonly mind: LabMind;
  dispose(): void;
}

interface ActorOptions {
  readonly rules: Rulebook;
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

interface ScriptOrdersState { memory: object | null; time: number | null; orders: Orders | null }

/**
 * `script`'s orders for `made`'s mind on `body` (`intentOrders`): it decides, `watch` reading first,
 * once a step, on the step's first ask, from what the mind's skills see; any later ask that step is
 * given the same.
 */
function scriptOrders(state: ScriptOrdersState, script: Script, watch: Watch | undefined, body: HostedBody, world: World, skills: LabMind["skills"]): () => Orders {
  const sight: Sight = { get context() { return skills.context; }, view: body.view, report: skills.report, get envelope() { return skills.envelope; }, limitsOf: skills.limitsOf,
    instance: skills.instance, readiness: skills.readiness, needs: skills.needs, clearance: skills.clearance };
  return () => {
    if (state.orders === null || state.time !== body.view.time) {
      const dt = state.time === null ? world.dt : body.view.time - state.time;
      state.time = body.view.time;
      watch?.(sight, dt);
      state.orders = intentOrders(script.decide(sight, dt), skills.report.heading);
    }
    return state.orders;
  };
}

/**
 * `built`, a human in its reference pose on the ground of `world`, as a mode's actor: its mind made
 * as a fight makes it (`createMind`), refused where it runs no skills the Lab can read, and given a
 * script only where it carries out orders (`treeObeys`).
 */
export function labActor(context: GameContext, built: BuiltBody, world: World, { mind, assist, experiment, rules }: ActorOptions): Actor | Refused {
  const GAME = context.catalog, { partOf, treeObeys } = GAME;
  let input: Driving = {};
  const clock = clockSenses(world);
  const wiring: MindWiring = { name: "lab", rules, orders: (senses) => input.orders?.(senses) ?? null, assist, ...(experiment ? { experiment } : {}),
    senses: () => (input.senses ?? clock)(), contactIdentity: (other) => input.contactIdentity?.(other) ?? null };
  const own = createMind(GAME, built, world, mind, wiring), skills = own.skills, report = own.report;
  if (!skills || !report || !("view" in own.body)) {
    own.body.dispose();
    return { refused: `${partOf(mind).label} runs no skills the Lab can read` };
  }
  const made: LabMind = { state: own.state, skills, report }, body = own.body as HostedBody;
  const state: Actor["state"] = { body: body.state, mind: made.state, script: null };
  return {
    state, body, world,
    drive(script, driving = {}) {
      if (!script) { state.script = null; input = driving; return made; }
      if (!treeObeys(mind)) return { refused: `${partOf(mind).label} carries out no orders, so the Lab cannot give it a script` };
      state.script = { memory: script.state ?? null, time: null, orders: null };
      input = { ...driving, orders: scriptOrders(state.script, script, driving.watch, body, world, skills) };
      return made;
    },
    get mind() { return made; },
    dispose: () => own.body.dispose(),
  };
}
