import type { BodyOptions, HostedBody } from "./hosted-body.ts";
import type { BuiltBody } from "../../core/bodies/build/build-body.ts";
import { clockOf } from "../../core/world/clock.ts";
import { physicalBody, type PhysicalBody } from "./physical-body.ts";
import type { World } from "../../core/world/world.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import { embody, type Embodying } from "./embodiment.ts";
import type { BodyHost, HostGrants, MindConstruction } from "../mind.ts";
import { type OwnBody } from "../../core/bodies/own-body.ts";
import { commandedMind, type CommandedMind, type SubMindMaker } from "../sub-mind.ts";


/** The golden ratio's fraction, (sqrt 5 - 1) / 2: successive multiples of it fall evenly over [0, 1). */
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/** **The phase of the `order`th body a fight builds** (`HostGrants.phase`): `order` times the golden ratio's fraction, less its whole part, so that any run of bodies built in order falls evenly over the period. */
export function phaseOf(order: number): number {
  const turns = order * GOLDEN;
  return turns - Math.floor(turns);
}


type HostedConstruction = MindConstruction & Partial<Pick<CommandedMind, "body">>;

/**
 * **`built` in `world` under the mind `make` makes**, given `given` (`Embodying`): the one way a
 * body takes a mind, in a fight or out of one. The fight's `PhysicalBody` is built the same way for
 * every mind: who has the body is the mind's (`MindConstruction.has`, its name where it hands nothing over),
 * and where the mind drives it through the command layers (`CommandedMind.body`) it shows their view and
 * drive as a `HostedBody` does.
 */
function takeBody<M extends HostedConstruction>(built: BuiltBody, world: World, given: Embodying, make: (own: OwnBody) => M): { readonly mind: M; readonly body: PhysicalBody } {
  const { held, mind, state, dispose } = embody(built, world, make, given);
  const body = physicalBody(built, held, world, () => mind.has(), state, dispose), driver = mind.body;
  return { mind, body: driver ? Object.assign(body, { view: driver.view, envelope: driver.envelope, drive: driver.drive, afterPhysics: driver.afterPhysics, driver }) : body };
}

/** A body under explicitly configured command layers and ranked sub-minds. */
export function commandedBody(built: BuiltBody, world: World, options: BodyOptions, subs: readonly SubMindMaker[] = []): HostedBody {
  const { senses, assist, contactIdentity, log, ...layers } = options;
  return takeBody(built, world, { senses, assist, contactIdentity, log }, own => commandedMind(own, layers, clockOf(world), subs)).body as HostedBody;
}

/**
 * A host for `built` in `world` under `grants`, its parts looked up in `parts`, its sheets written in
 * `log` and `answered` called with each answer (`Embodying`) where given, and the body its mind
 * took through it (`made`), which the fight holds.
 */
export function bodyHost(built: BuiltBody, world: World, grants: HostGrants, parts: PartLookup, { log, answered }: Pick<Embodying, "log" | "answered"> = {}): { readonly host: BodyHost; made(): PhysicalBody; dispose(): void } {
  let body: PhysicalBody | null = null;
  const given: Embodying = { senses: grants.senses, assist: grants.assist, contactIdentity: grants.contactIdentity, log,
    ...(answered ? { answered } : {}) };
  const host: BodyHost = Object.freeze({
    spec: built.spec, clock: clockOf(world), parts, seed: grants.seed ?? 0, phase: grants.phase ?? 0, rules: grants.rules,
    take<M extends MindConstruction>(make: (own: OwnBody) => M): M {
      if (body) throw new Error("a mind takes its body once");
      const taken = takeBody(built, world, given, make);
      body = taken.body;
      return taken.mind;
    },
  });
  return { host, dispose: () => body?.dispose(), made() {
    if (!body) throw new Error("the mind took no body");
    return body;
  } };
}
