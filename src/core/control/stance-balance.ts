import type { BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import type { BalancePart } from "./balance-part.ts";
import { stanceControl } from "./stance.ts";

/** **The stance** (`stanceControl`): the centre of mass carried over two feet, stepping to catch it. */
interface StanceBalanceConfig { readonly kind: "stance" }

/** Whether a body of `spec` has what the stance stands on: a left and a right foot, each with a box sole. */
export function standsOnSoles(spec: BodySpec): boolean {
  return (["left", "right"] as const).every((side) => spec.segments.find((s) => s.name === `foot.${side}`)?.shape.kind === "box");
}

/** A part's `fits` for a body the stance stands (`standsOnSoles`). */
export function fitsSoles(spec: BodySpec): string | null {
  return standsOnSoles(spec) ? null : "needs a left and a right foot, each with a box sole";
}

/** **The stance** as a balance: the game's. */
export const STANCE_BALANCE: BalancePart<StanceBalanceConfig> = deepFreeze({
  role: "balance", label: "Stance", stage: "game", fields: [], slots: [], defaults: { kind: "stance" }, keys: { kind: true },
  fits: fitsSoles, faults: () => [],
  make: () => stanceControl,
});
