import type { BodyOptions, HostedBody } from "./hosted-body.ts";
import type { BuiltBody } from "../core/bodies/build/build-body.ts";
import { clockOf, type Clock } from "../core/world/clock.ts";
import type { AssistCeiling } from "../core/bodies/assist.ts";
import type { ContactIdentity } from "../core/bodies/contact-identity.ts";
import { physicalBody, type PhysicalBody } from "./physical-body.ts";
import type { Rulebook } from "../combat/rulebook.ts";
import type { BodySpec } from "../core/bodies/spec/body.ts";
import type { World } from "../core/world/world.ts";
import type { PartLookup } from "../parts/lookup.ts";
import { embody, type Embodying } from "./embodiment.ts";
import type { MindConstruction } from "./mind.ts";
import { type OwnBody } from "../core/bodies/own-body.ts";
import type { Senses } from "../core/bodies/senses.ts";
import { commandedMind, type CommandedMind, type SubMindMaker } from "./sub-mind.ts";

/**
 * **What a fight grants a body**, read from its wiring and never from the mind it makes: its
 * senses, its assist's ceiling, how it labels a contact, the seed of its chances, the rules it is
 * played by. What a mind made apart from a fight is given too (`hostedMind`).
 */
export interface HostGrants {
  /** What it senses (`SensesHub.add`); the clock alone unless given. */
  readonly senses?: () => Senses;
  /** The most its assist gives it; none unless given. */
  readonly assist?: AssistCeiling;
  /** Trusted body adapter for permitted contact labels (`OwnBody.contactIdentity`). */
  readonly contactIdentity?: ContactIdentity;
  /** The seed its mind's chances are drawn from (`BodyHost.seed`): the fight's for this body (`seedOf`); 0 unless given. */
  readonly seed?: number;
  /** Where in each period its periodic work falls (`BodyHost.phase`): the fight's for this body (`phaseOf`); 0 unless given. */
  readonly phase?: number;
  /** The rules its fight is played by (`BodyHost.rules`); supplied by the scenario. */
  readonly rules: Rulebook;
}

/** The golden ratio's fraction, (sqrt 5 - 1) / 2: successive multiples of it fall evenly over [0, 1). */
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/** **The phase of the `order`th body a fight builds** (`HostGrants.phase`): `order` times the golden ratio's fraction, less its whole part, so that any run of bodies built in order falls evenly over the period. */
export function phaseOf(order: number): number {
  const turns = order * GOLDEN;
  return turns - Math.floor(turns);
}

/**
 * **What a mind's maker is given in place of the world and the built body**: the body's
 * description, the world's clock, the parts its config may name (`parts`), the seed of its
 * chances (`seed`: the only source a mind draws from), the rules the fight is played by (`rules`,
 * whose arithmetic prices a blow), and the one way to take the body (`take`), which it uses once.
 */
export interface BodyHost {
  readonly spec: BodySpec;
  readonly clock: Clock;
  readonly parts: PartLookup;
  /** A 32-bit word, the fight's for this body (`seedOf`); 0 unless the fight gives one. A mind draws from it alone (`randomStream`), its stream's word in its `state`. */
  readonly seed: number;
  /**
   * Where in each period its periodic work falls, a fraction in [0, 1): the fight's for this body
   * (`phaseOf`); 0 unless the fight gives one. A decision made every so often is made on its
   * phase's steps (`Deciding.phase`), so bodies built together do not all decide on one step.
   */
  readonly phase: number;
  /** The fight's rulebook (`Rulebook`); the arena's unless the fight gives one. */
  readonly rules: Rulebook;
  /**
   * Take the body under the mind `make` makes of it (`OwnBody`: the body as the fight grants it,
   * its senses, assist and contact labels among it), once; returns that mind. Whatever the mind
   * builds on its body (the command layers, sub-minds, a policy) is its own.
   */
  take<M extends MindConstruction>(make: (own: OwnBody) => M): M;
}

type HostedConstruction = MindConstruction & Partial<Pick<CommandedMind, "body">>;

/**
 * **`built` in `world` under the mind `make` makes**, given `given` (`Embodying`): the one way a
 * body takes a mind, in a fight or out of one. The fight's `PhysicalBody` is built the same way for
 * every mind: who has the body is the mind's (`MindConstruction.has`, its name where it hands nothing over),
 * and where the mind drives it through the command layers (`CommandedMind.body`) it shows their view and
 * drive as a `HostedBody` does.
 */
export function hostBody<M extends HostedConstruction>(built: BuiltBody, world: World, given: Embodying, make: (own: OwnBody) => M): { readonly mind: M; readonly body: PhysicalBody } {
  const { held, mind, state, dispose } = embody(built, world, make, given);
  const body = physicalBody(built, held, world, () => mind.has(), state, dispose), driver = mind.body;
  return { mind, body: driver ? Object.assign(body, { view: driver.view, envelope: driver.envelope, drive: driver.drive, afterPhysics: driver.afterPhysics, driver }) : body };
}

/** A body under explicitly configured command layers and ranked sub-minds. */
export function commandedBody(built: BuiltBody, world: World, options: BodyOptions, subs: readonly SubMindMaker[] = []): HostedBody {
  const { senses, assist, contactIdentity, log, ...layers } = options;
  return hostBody(built, world, { senses, assist, contactIdentity, log }, own => commandedMind(own, layers, clockOf(world), subs)).body as HostedBody;
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
      const taken = hostBody(built, world, given, make);
      body = taken.body;
      return taken.mind;
    },
  });
  return { host, dispose: () => body?.dispose(), made() {
    if (!body) throw new Error("the mind took no body");
    return body;
  } };
}
