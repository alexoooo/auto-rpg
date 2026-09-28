import { HEAD_NECK, LOCOMOTION_BIPED, TORSO_PLAIN, TORSO_WAIST } from "../config.ts";
import { bipedDefinition } from "../locomotion/biped.ts";
import { torsoModule } from "../torso/torso.ts";
import { headModule } from "../head/head.ts";
import type { GolemPart, ModuleBuild } from "../module.ts";
import { workshopSource, type WorkshopModel } from "./workshop-profile.ts";
import { workshopSegmentKg } from "./anthropometry.ts";

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

/**
 * A workshop model's body. Geometry follows the saved model, at the size it was authored; the size
 * a human is built at brings it to a typical adult at x1 (`WORKSHOP_FIT_SCALE`). Every part's
 * mass is the model's own, de Leva's share of its body mass (`workshopSegmentKg`). Protection and
 * drive budgets remain the human's.
 *
 * **One per model**, built once: every world that builds a model holds the same definitions, as it
 * holds a registry module's, so a fork shares a definition's tables with its original rather than
 * finding them in a closure it cannot copy (`every_registered_module_hands_its_stepping_state_to_the_fork`).
 */
export function workshopBody(model: WorkshopModel): ReturnType<typeof buildWorkshopBody> {
  let body = WORKSHOP_BODIES.get(model);
  if (!body) { body = buildWorkshopBody(model); WORKSHOP_BODIES.set(model, body); }
  return body;
}
const WORKSHOP_BODIES = new Map<WorkshopModel, ReturnType<typeof buildWorkshopBody>>();
function buildWorkshopBody(model: WorkshopModel) {
const WORKSHOP_SOURCE = workshopSource(model);
const kg = workshopSegmentKg(model);
const workshopLegs = { ...HUMAN_BIPED, thighLength: WORKSHOP_SOURCE.thighLength,
  shinLength: WORKSHOP_SOURCE.shinLength, hipSide: WORKSHOP_SOURCE.hipSide,
  pelvisMass: kg.pelvisMass, thighMass: kg.thighMass, shinMass: kg.shinMass, footMass: kg.footMass };
const workshopWaistY = workshopLegs.pelvisHeight / 2 + workshopLegs.hipInset
  + workshopLegs.thighLength + workshopLegs.shinLength + workshopLegs.footHeight;
const workshopCoreHeight = WORKSHOP_SOURCE.neckHeight - workshopWaistY;
const workshopBiped = humanDefinition(bipedDefinition("locomotion.human", "workshop fighter legs", workshopLegs));
const workshopTorso = humanDefinition(torsoModule("torso.human", "workshop fighter torso", {
  ...HUMAN_TORSO, coreHeight: workshopCoreHeight, socketSide: WORKSHOP_SOURCE.shoulderSide,
  socketHeight: WORKSHOP_SOURCE.shoulderHeight - workshopWaistY - workshopCoreHeight / 2,
  socketFront: .0208679512143135, neckHeight: workshopCoreHeight / 2, coreMass: kg.coreMass,
}, { ...HUMAN_WAIST, ballMass: kg.ballMass }));
const workshopHead = humanDefinition(headModule("head.human", "workshop fighter head",
  { guardPitch: .25, ram: null }, { ...HUMAN_HEAD, neckLength: WORKSHOP_SOURCE.neckLength, neckMass: kg.neckMass, headMass: kg.headMass, ...(model === "workshop-rogue" ? {yawJointMin:-1.45,yawJointMax:1.45} : {}) }));

return Object.freeze({ legs: workshopBiped, torso: workshopTorso, head: workshopHead });
}
export const { legs: workshopBiped, torso: workshopTorso, head: workshopHead } = workshopBody("workshop-fighter");
