import type { LimbSpec, WoundSpec } from "../spec/body.ts";
import { sourced, type Quantity } from "../../quantity.ts";
import type { HumanFigure } from "./figure.ts";
import type { WorkshopModel } from "./rig.ts";
import { SKELETON_MODEL } from "./skeleton.ts";
import { SIDES } from "../bilateral.ts";

/** A limb (`owner-life`): its segments, its bar's share of full life, and what its loss does. */
const limb = (name: string, segments: readonly string[], share: number, lost: LimbSpec["lost"]): LimbSpec =>
  ({ name, segments, share: sourced(share, "1", "owner-life", `${name}: ${share} of full life`), lost });

/** A human figure's arms and legs, each `side`'s: upper arm, forearm and hand; thigh, shank and foot. */
const armsAndLegs = (arm: number, leg: number): LimbSpec[] => SIDES.flatMap((side) => [
  limb(`arm.${side}`, [`upperArm.${side}`, `forearm.${side}`, `hand.${side}`], arm, "fights on"),
  limb(`leg.${side}`, [`thigh.${side}`, `shank.${side}`, `foot.${side}`], leg, "out"),
]);

/**
 * **What a human figure's wounds are** (`owner-life`): its hit points (the figure's); a workshop
 * human's head vital, its arms (0.25 of full life each) fighting on without them and its legs
 * (0.35) not; the Skeleton's ribcage vital and never coming off, its head a limb (0.2) it fights
 * on without, its arms 0.15 and its legs 0.25.
 */
export function humanWounds(figure: HumanFigure): WoundSpec {
  const bareExtremities = SIDES.flatMap((side) => [`hand.${side}`, `foot.${side}`]);
  return figure.model === SKELETON_MODEL
    ? { hp: figure.hp, vital: ["upperTrunk"], whole: ["upperTrunk"], limbs: [limb("head", ["head"], 0.2, "fights on"), ...armsAndLegs(0.15, 0.25)], bareExtremities }
    : { hp: figure.hp, vital: ["head"], whole: [], limbs: armsAndLegs(0.25, 0.35), bareExtremities };
}

/** A workshop model's hit points: Warrior 6, Rogue 4. */
export function workshopHitPoints(model: WorkshopModel): Quantity<number> {
  switch (model) {
    case "workshop-fighter": return sourced(6, "HP", "owner-hp-pool", "Warrior 6");
    case "workshop-rogue": return sourced(4, "HP", "owner-hp-pool", "Rogue 4");
    default: { const never: never = model; throw new Error(`no hit points for ${String(never)}`); }
  }
}
