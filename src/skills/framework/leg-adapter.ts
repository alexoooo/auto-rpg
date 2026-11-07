import type { Locomotion } from "./locomotion-part.ts";
import type { Body } from "../../control/body.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { KeysOf, Part, PartConfig } from "../../parts/parts.ts";

/** A registered capability that extends the goals a body's legs can carry out. */
export interface LegAdapterPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "leg-adapter";
  readonly keys: KeysOf<C>;
  make(body: Body, legs: Locomotion, config: C): Locomotion;
}

/** Apply the catalog's leg capabilities in registration order. */
export function adaptLegs(parts: PartLookup, body: Body, legs: Locomotion): Locomotion {
  for (const config of parts.game("leg-adapter")) {
    const part = parts.of("leg-adapter", config);
    if (part.fits(body.built.spec, config, parts) === null) legs = part.make(body, legs, config);
  }
  return legs;
}

declare module "../../parts/lookup.ts" {
  interface RoleParts { readonly "leg-adapter": LegAdapterPart }
}
