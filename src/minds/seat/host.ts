import type { BodyOptions, CommandedBody, HostedBody } from "./hosted-body.ts";
import type { Body } from "../../control/body.ts";
import type { BuiltBody } from "../../core/bodies/build/build-body.ts";
import { clockOf } from "../../core/world/clock.ts";
import { physicalBody, type PhysicalBody } from "./physical-body.ts";
import type { World } from "../../core/world/world.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import { embody, type Embodying } from "./embodiment.ts";
import type { BodyHost, MindConstruction } from "../mind.ts";
import type { MindWiring } from "../catalog/controller.ts";
import { type OwnBody } from "../../core/bodies/own-body.ts";
import type { Senses } from "../../core/bodies/senses.ts";
import { commandedMind, type SubMindMaker } from "../scripted-mind.ts";


/** The golden ratio's fraction, (sqrt 5 - 1) / 2: successive multiples of it fall evenly over [0, 1). */
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/** **The phase of the `order`th body a fight builds** (`MindWiring.phase`): `order` times the golden ratio's fraction, less its whole part, so that any run of bodies built in order falls evenly over the period. */
export function phaseOf(order: number): number {
  const turns = order * GOLDEN;
  return turns - Math.floor(turns);
}

/**
 * **`built` in `world` under the mind `make` makes**, given `given` (`Embodying`): the one way a
 * body takes a mind, in a fight or out of one. The fight's `PhysicalBody` is built the same way for
 * every mind: who has the body is the mind's (`MindConstruction.has`, its name where it hands nothing over).
 */
function seated<M extends MindConstruction>(built: BuiltBody, world: World, given: Embodying, make: (own: OwnBody) => M): { readonly construction: M; readonly physical: PhysicalBody } {
  const { held, construction, state, dispose } = embody(built, world, make, given);
  return { construction, physical: physicalBody(built, held, world, () => construction.has(), state, dispose) };
}

/** `physical` showing the command layers' view of it (`commanded`, the body under them), as a body under a commanding Mind does. */
const commandedOver = (physical: PhysicalBody, commanded: Body): CommandedBody =>
  Object.assign(physical, { view: commanded.view, envelope: commanded.envelope, afterPhysics: commanded.afterPhysics, commanded });

/** A scripted body: explicitly configured command layers under a driver registered through its `drive`, and ranked sub-minds. */
export function commandedBody(built: BuiltBody, world: World, options: BodyOptions, subs: readonly SubMindMaker[] = []): HostedBody {
  const { senses, assist, contactIdentity, log, ...layers } = options;
  const { construction, physical } = seated(built, world, { senses, assist, contactIdentity, log }, own => commandedMind(own, layers, clockOf(world), subs));
  return Object.assign(commandedOver(physical, construction.body), { drive: construction.drive });
}

/**
 * A host for `built` in `world` as the fight wires it (`wiring`), its parts looked up in `parts`, its sheets written in
 * `log` and `answered` called with each answer (`Embodying`) where given, and the body its mind
 * took through it (`taken`), which the fight holds.
 */
export function bodyHost(built: BuiltBody, world: World, wiring: MindWiring, parts: PartLookup, { log, answered }: Pick<Embodying, "log" | "answered"> = {}): { readonly host: BodyHost; taken(): PhysicalBody; dispose(): void } {
  let physical: PhysicalBody | null = null;
  const given: Embodying = { senses: wiring.senses, assist: wiring.assist, contactIdentity: wiring.contactIdentity, log,
    ...(answered ? { answered } : {}) };
  const host: BodyHost = Object.freeze({
    spec: built.spec, clock: clockOf(world), parts, seed: wiring.seed ?? 0, phase: wiring.phase ?? 0, rules: wiring.rules,
    orders: (senses: Senses) => wiring.orders(senses), ...(wiring.experiment ? { experiment: wiring.experiment } : {}),
    take<M extends MindConstruction>(make: (own: OwnBody) => M): M {
      if (physical) throw new Error("a mind takes its body once");
      const took = seated(built, world, given, make);
      // A Mind that commands its body through the command layers hands back the body under them.
      const made: MindConstruction & { readonly body?: Body } = took.construction;
      physical = made.body ? commandedOver(took.physical, made.body) : took.physical;
      return took.construction;
    },
  });
  return { host, dispose: () => physical?.dispose(), taken() {
    if (!physical) throw new Error("the mind took no body");
    return physical;
  } };
}
