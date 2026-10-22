import { createBody, type Body, type BodyOptions } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { clockOf, type Clock } from "../clock.ts";
import type { PhysicalBody } from "../physical-body.ts";
import type { BodySpec } from "../spec/body.ts";
import type { World } from "../world.ts";
import { createPolicyBody, type ActuatorModel, type Policy } from "./direct.ts";
import { hostedBody, type Hosted } from "./hosted.ts";
import type { OwnBody } from "./mind.ts";
import type { PartLookup } from "./lookup.ts";
import type { MindWiring } from "./minds.ts";
import type { Senses } from "./senses.ts";
import type { SheetLog } from "./sheets.ts";

/** What a fight grants a body, read from its wiring and never from the mind it makes: its senses, its assist's ceiling, how it labels a contact. */
type Grants = Partial<Pick<MindWiring, "senses" | "assist" | "contactIdentity">>;

/** What a fight's own adapters take beside the grants, which no maker names: where the body's order sheets are written. */
type Trusted = { readonly log?: SheetLog };

/**
 * **What a mind's maker is given in place of the world and the built body**: the body's
 * description, the world's clock, the parts its config may name (`parts`), and the ways to take the body, one of which it uses once:
 * under the command layers (`command`, which gives back the body its drivers have), under a host
 * of its own and its sub-minds (`hosted`), or under a policy of observations and checked actions
 * (`policy`). Each takes the fight's grants as the wiring gives them.
 */
export interface BodyHost {
  readonly spec: BodySpec;
  readonly clock: Clock;
  readonly parts: PartLookup;
  command(options: Omit<BodyOptions, keyof Grants | keyof Trusted>): Body;
  hosted(make: (own: OwnBody, senses: () => Senses) => Hosted): void;
  policy(make: (model: ActuatorModel) => Policy): void;
}

/**
 * A host for `built` in `world` under `grants`, its parts looked up in `parts`, its sheets written in
 * `log` if given, and the body its mind took through it (`made`), which the fight holds.
 */
export function bodyHost(built: BuiltBody, world: World, grants: Grants, parts: PartLookup, log?: SheetLog): { readonly host: BodyHost; made(): PhysicalBody } {
  let body: PhysicalBody | null = null;
  const take = () => { if (body) throw new Error("a mind takes its body once"); };
  const given = { senses: grants.senses, assist: grants.assist, log };
  const host: BodyHost = Object.freeze({
    spec: built.spec, clock: clockOf(world), parts,
    command(options: Omit<BodyOptions, keyof Grants | keyof Trusted>) {
      take();
      const commanded = createBody(built, world, { ...options, ...given, contactIdentity: grants.contactIdentity });
      body = commanded;
      return commanded.driver;
    },
    hosted(make: (own: OwnBody, senses: () => Senses) => Hosted) { take(); body = hostedBody(built, world, given, make); },
    policy(make: (model: ActuatorModel) => Policy) { take(); body = createPolicyBody(built, world, make, given); },
  });
  return { host, made() {
    if (!body) throw new Error("the mind took no body");
    return body;
  } };
}

/** What a fight grants a body (`Grants`): what a mind made apart from a fight is given (`hostedMind`). */
export type HostGrants = Grants;
