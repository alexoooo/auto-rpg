import { HEAD_NECK, LOCOMOTION_BIPED, TORSO_PLAIN, TORSO_WAIST } from "../config.ts";
import { bipedDefinition } from "../locomotion/biped.ts";
import { torsoModule } from "../torso/torso.ts";
import { headModule } from "../head/head.ts";
import type { GolemPart, ModuleBuild } from "../module.ts";
import { workshopSource, type WorkshopModel } from "./workshop-profile.ts";

/** Human geometry is data supplied to the shared builders, never global tuning mutation. */
export const HUMAN_BIPED = { ...LOCOMOTION_BIPED,
  pelvisWidth: 0.31, pelvisHeight: 0.16, pelvisDepth: 0.23, pelvisMass: 14,
  hipSide: 0.095, hipInset: 0.025, thighLength: 0.40, shinLength: 0.39,
  thighRadius: 0.065, shinRadius: 0.047, thighMass: 10, shinMass: 4,
  footLength: 0.27, footWidth: 0.115, footHeight: 0.08, footMass: 1.5,
  footprintRadius: 0.28, footprintHeight: 1.8, crouchDepth: 0.22,
  // Stone's leg torques from before stone took its own body density (2026-09-24).
  hipTorque: 900, kneeTorque: 500, ankleTorque: 220,
  // Stone's bench shove from before stone took its own body density.
  shoveImpulseNs: 200,
  carrier: { ...LOCOMOTION_BIPED.carrier, maxSpeedMps: 2.6 },
};
export const HUMAN_TORSO = { ...TORSO_PLAIN, coreWidth: 0.36, coreHeight: 0.46, coreDepth: 0.23,
  coreMass: 37, coreArmour: 0.5, socketSide: 0.215, socketHeight: 0.15, neckHeight: 0.23,
  leanMax: 0.35, twistMax: 0.65 };
/**
 * The human's waist, the lumbar segment between the pelvis and the core: stone's waist with a
 * human's mass. 5.346 kg is what it weighed while it was stone's at `SHIPPED_MASS_SCALE`, pinned here
 * when the stone body went to its own density (physical contact session 04, 2026-09-24), so that the
 * human trunk stays where the anthropometry check in that session left it.
 */
export const HUMAN_WAIST = { ...TORSO_WAIST, ballMass: 5.346, leanTorque: 600, twistTorque: 360 };
export const HUMAN_HEAD = { ...HEAD_NECK, neckLength: 0.095, neckRadius: 0.045, neckMass: 1,
  headWidth: 0.19, headHeight: 0.24, headDepth: 0.23, headMass: 6.5, headArmour: 0.5,
  browOffset: 0.115, pitchTorque: 100, yawTorque: 10 };

function humanDefinition<T extends { parts: readonly GolemPart[] }, D extends { build(ctx: ModuleBuild): T }>(definition: D): D {
  return { ...definition, build(ctx: ModuleBuild) {
    const built = definition.build(ctx);
    return { ...built, parts: built.parts.map(part => ({ ...part, appearance: "human" as const,
      combatRole: "body" as const, armour: part.armour ?? 0.35 })) };
  } } as D;
}
export const humanBiped = humanDefinition(bipedDefinition("locomotion.human", "human legs", HUMAN_BIPED));
export const humanTorso = humanDefinition(torsoModule("torso.human", "human armoured torso", HUMAN_TORSO, HUMAN_WAIST));
export const humanHead = humanDefinition(headModule("head.human", "human helmeted head", { guardPitch: 0.25, ram: null }, HUMAN_HEAD));

// Geometry follows the saved model. Protection, mass and drive budgets remain the human's.
export function workshopBody(model: WorkshopModel) {
const WORKSHOP_SOURCE = workshopSource(model);
const workshopLegs = { ...HUMAN_BIPED, thighLength: WORKSHOP_SOURCE.thighLength,
  shinLength: WORKSHOP_SOURCE.shinLength, hipSide: WORKSHOP_SOURCE.hipSide };
const workshopWaistY = workshopLegs.pelvisHeight / 2 + workshopLegs.hipInset
  + workshopLegs.thighLength + workshopLegs.shinLength + workshopLegs.footHeight;
const workshopCoreHeight = WORKSHOP_SOURCE.neckHeight - workshopWaistY;
const workshopBiped = humanDefinition(bipedDefinition("locomotion.human", "workshop fighter legs", workshopLegs));
const workshopTorso = humanDefinition(torsoModule("torso.human", "workshop fighter torso", {
  ...HUMAN_TORSO, coreHeight: workshopCoreHeight, socketSide: WORKSHOP_SOURCE.shoulderSide,
  socketHeight: WORKSHOP_SOURCE.shoulderHeight - workshopWaistY - workshopCoreHeight / 2,
  socketFront: .0208679512143135, neckHeight: workshopCoreHeight / 2,
}, HUMAN_WAIST));
const workshopHead = humanDefinition(headModule("head.human", "workshop fighter head",
  { guardPitch: .25, ram: null }, { ...HUMAN_HEAD, neckLength: WORKSHOP_SOURCE.neckLength, ...(model === "workshop-rogue" ? {yawJointMin:-1.45,yawJointMax:1.45} : {}) }));

return { legs: workshopBiped, torso: workshopTorso, head: workshopHead };
}
export const { legs: workshopBiped, torso: workshopTorso, head: workshopHead } = workshopBody("workshop-fighter");
