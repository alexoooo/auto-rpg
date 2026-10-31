import type { BodyOptions, HostedBody } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { clockOf, type Clock } from "../clock.ts";
import type { AssistCeiling } from "../control/assist.ts";
import type { ContactIdentity } from "../control/effector-feedback.ts";
import { physicalBody, type PhysicalBody } from "../physical-body.ts";
import { rulebook, type Rulebook } from "../rules/rulebook.ts";
import type { BodySpec } from "../spec/body.ts";
import type { World } from "../world.ts";
import type { PartLookup } from "../parts/lookup.ts";
import { embody, type Embodying, type Mind, type OwnBody } from "./mind.ts";
import type { Senses } from "./senses.ts";
import { commandedMind, type SubMindMaker } from "./sub-mind.ts";
import type { SheetLog } from "./sheets.ts";

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
  /** The rules its fight is played by (`BodyHost.rules`); the arena's unless given. */
  readonly rules?: Rulebook;
}

/** The rules a body is played by where its fight names none. */
const ARENA = rulebook("arena");

/** The rules a body is played by: its fight's (`HostGrants.rules`), else the arena's. */
export const rulesOf = (grants: Pick<HostGrants, "rules">): Rulebook => grants.rules ?? ARENA;

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
  /** The fight's rulebook (`Rulebook`); the arena's unless the fight gives one. */
  readonly rules: Rulebook;
  /**
   * Take the body under the mind `make` makes of it (`OwnBody`: the body as the fight grants it,
   * its senses, assist and contact labels among it), once; returns that mind. Whatever the mind
   * builds on its body (the command layers, sub-minds, a policy) is its own.
   */
  take<M extends Mind>(make: (own: OwnBody) => M): M;
}

/**
 * **`built` in `world` under the mind `make` makes**, given `given` (`Embodying`): the one way a
 * body takes a mind, in a fight or out of one. The fight's `PhysicalBody` is built the same way for
 * every mind: who has the body is the mind's (`Mind.has`, its name where it hands nothing over),
 * and where the mind drives it through the command layers (`Mind.body`) it shows their view and
 * drive as a `HostedBody` does.
 */
export function hostBody<M extends Mind>(built: BuiltBody, world: World, given: Embodying, make: (own: OwnBody) => M): { readonly mind: M; readonly body: PhysicalBody } {
  const { own, mind, state, dispose } = embody(built, world, make, given);
  const body = physicalBody(built, own, world, () => mind.has ?? mind.name, state, dispose), driver = mind.body;
  return { mind, body: driver ? Object.assign(body, { view: driver.view, envelope: driver.envelope, drive: driver.drive, afterPhysics: driver.afterPhysics, driver }) : body };
}

/**
 * **`built` in `world` under the command layers**, built outside a fight (a test, a study, a task)
 * the one way a body takes a mind (`hostBody`): the layers `options` make, handed over to the
 * sub-minds of `subs` in rank order where one wants the body (`commandedMind`), none unless given,
 * holding the reference pose until something drives them (`HostedBody.drive`).
 */
export function commandedBody(built: BuiltBody, world: World, options: BodyOptions, subs: readonly SubMindMaker[] = []): HostedBody {
  const { senses, assist, contactIdentity, log, ...layers } = options;
  return hostBody(built, world, { senses, assist, contactIdentity, log }, (own) => commandedMind(own, layers, clockOf(world), subs)).body as HostedBody;
}

/**
 * A host for `built` in `world` under `grants`, its parts looked up in `parts`, its sheets written in
 * `log` if given, and the body its mind took through it (`made`), which the fight holds.
 */
export function bodyHost(built: BuiltBody, world: World, grants: HostGrants, parts: PartLookup, log?: SheetLog): { readonly host: BodyHost; made(): PhysicalBody } {
  let body: PhysicalBody | null = null;
  const given: Embodying = { senses: grants.senses, assist: grants.assist, contactIdentity: grants.contactIdentity, log };
  const host: BodyHost = Object.freeze({
    spec: built.spec, clock: clockOf(world), parts, seed: grants.seed ?? 0, rules: rulesOf(grants),
    take<M extends Mind>(make: (own: OwnBody) => M): M {
      if (body) throw new Error("a mind takes its body once");
      const taken = hostBody(built, world, given, make);
      body = taken.body;
      return taken.mind;
    },
  });
  return { host, made() {
    if (!body) throw new Error("the mind took no body");
    return body;
  } };
}
