import type { BodySpec } from "../core/bodies/spec/body.ts";
import { deepFreeze } from "../core/world/state.ts";
import type { BalancePart } from "./balance-part.ts";
import { stanceControl } from "./stance.ts";
import { soleRefusal, standingHeight } from "./support.ts";
import type { StanceEnvelope } from "./stance-envelope.ts";

/** **The stance** (`stanceControl`): the centre of mass carried over two feet, stepping to catch it. */
interface StanceBalanceConfig { readonly kind: "stance" }

/** A part's `fits` for a body the stance stands: a left and a right foot, each with a box sole (`soleRefusal`). */
export function fitsSoles(spec: BodySpec): string | null {
  return soleRefusal(spec);
}

/** **The stance** as a balance: the game's. */
export const stanceBalance = (envelope: (spec: BodySpec) => StanceEnvelope | null): BalancePart<StanceBalanceConfig> => deepFreeze({
  role: "balance", label: "Stance", stage: "game", fields: [], slots: [], defaults: { kind: "stance" }, keys: { kind: true },
  reference: { fits: fitsSoles, read: standingHeight },
  fits: fitsSoles, faults: () => [],
  make: () => stanceControl,
  envelope: (spec, _config, experiment) => !experiment.measuring && Object.keys(experiment.stance ?? {}).length === 0 ? envelope(spec) : null,
});
