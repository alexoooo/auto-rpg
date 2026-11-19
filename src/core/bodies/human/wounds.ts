import type { LimbSpec, WoundSpec } from "../spec/body.ts";
import { sourced, type Quantity } from "../../quantity.ts";
import type { HumanFigure } from "./figure.ts";
import type { HumanModel } from "./rig.ts";
import { SIDES } from "../bilateral.ts";

/** A limb (`owner-life`): its segments, its bar's share of full life, and what its loss does. */
export const limbSpec = ({ name, segments, share, lost }: Omit<LimbSpec, "share"> & { readonly share: number }): LimbSpec =>
  ({ name, segments, share: sourced(share, "1", "owner-life", `${name}: ${share} of full life`), lost });

/** A human figure's arms and legs, each `side`'s: upper arm, forearm and hand; thigh, shank and foot. */
export const armsAndLegs = (arm: number, leg: number): LimbSpec[] => SIDES.flatMap((side) => [
  limbSpec({ name: `arm.${side}`, segments: [`upperArm.${side}`, `forearm.${side}`, `hand.${side}`], share: arm, lost: "fights on" }),
  limbSpec({ name: `leg.${side}`, segments: [`thigh.${side}`, `shank.${side}`, `foot.${side}`], share: leg, lost: "out" }),
]);

/**
 * **A human model's wounds** (`owner-life`, `HumanFigure.wounds`): its head vital, its arms (0.25
 * of full life each) fighting on without them and its legs (0.35) not.
 */
export const HUMAN_WOUNDS: HumanFigure["wounds"] = Object.freeze({ vital: ["head"], whole: [], limbs: armsAndLegs(0.25, 0.35) });

/** **What a human figure's wounds are**: its hit points and its wounds (`HumanFigure`), its hands and feet bare extremities. */
export function humanWounds(figure: HumanFigure): WoundSpec {
  const bareExtremities = SIDES.flatMap((side) => [`hand.${side}`, `foot.${side}`]);
  return { hp: figure.hp, vital: figure.wounds.vital, whole: figure.wounds.whole, limbs: figure.wounds.limbs, bareExtremities };
}

/** A human model's hit points: Warrior 6, Rogue 4. */
export function humanHitPoints(model: HumanModel): Quantity<number> {
  switch (model) {
    case "man": return sourced(6, "HP", "owner-hp-pool", "Warrior 6");
    case "woman": return sourced(4, "HP", "owner-hp-pool", "Rogue 4");
    default: { const never: never = model; throw new Error(`no hit points for ${String(never)}`); }
  }
}
