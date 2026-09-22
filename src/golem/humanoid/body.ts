import { HEAD_NECK, LOCOMOTION_BIPED, TORSO_PLAIN } from "../config.ts";
import { bipedDefinition } from "../locomotion/biped.ts";
import { torsoModule } from "../torso/torso.ts";
import { headModule } from "../head/head.ts";
import type { GolemPart, ModuleBuild } from "../module.ts";

/** Human geometry is data supplied to the shared builders, never global tuning mutation. */
export const HUMAN_BIPED = { ...LOCOMOTION_BIPED,
  pelvisWidth: 0.31, pelvisHeight: 0.16, pelvisDepth: 0.23, pelvisMass: 14,
  hipSide: 0.095, hipInset: 0.025, thighLength: 0.40, shinLength: 0.39,
  thighRadius: 0.065, shinRadius: 0.047, thighMass: 10, shinMass: 4,
  footLength: 0.27, footWidth: 0.115, footHeight: 0.08, footMass: 1.5,
  footprintRadius: 0.28, footprintHeight: 1.8, crouchDepth: 0.22,
  carrier: { ...LOCOMOTION_BIPED.carrier, maxSpeedMps: 2.6 },
};
export const HUMAN_TORSO = { ...TORSO_PLAIN, coreWidth: 0.36, coreHeight: 0.46, coreDepth: 0.23,
  coreMass: 37, coreArmour: 0.5, socketSide: 0.215, socketHeight: 0.15, neckHeight: 0.23,
  leanMax: 0.35, twistMax: 0.65 };
export const HUMAN_HEAD = { ...HEAD_NECK, neckLength: 0.095, neckRadius: 0.045, neckMass: 1,
  headWidth: 0.19, headHeight: 0.24, headDepth: 0.23, headMass: 6.5, headArmour: 0.5,
  browOffset: 0.115 };

function humanDefinition<T extends { parts: readonly GolemPart[] }, D extends { build(ctx: ModuleBuild): T }>(definition: D): D {
  return { ...definition, build(ctx: ModuleBuild) {
    const built = definition.build(ctx);
    return { ...built, parts: built.parts.map(part => ({ ...part, appearance: "human" as const,
      combatRole: "body" as const, armour: part.armour ?? 0.35 })) };
  } } as D;
}
export const humanBiped = humanDefinition(bipedDefinition("locomotion.human", "human legs", HUMAN_BIPED));
export const humanTorso = humanDefinition(torsoModule("torso.human", "human armoured torso", HUMAN_TORSO));
export const humanHead = humanDefinition(headModule("head.human", "human helmeted head", { guardPitch: 0.25, ram: null }, HUMAN_HEAD));
