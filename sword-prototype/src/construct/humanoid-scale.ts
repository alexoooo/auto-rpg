import type { PrimitiveShape, Triple } from "./blueprint.ts";

/** One similarity transform for the stone chassis; the ordinary sword is an explicit exception. */
export const HUMANOID_SCALE = 0.75;
export const HUMANOID_MASS_SCALE = HUMANOID_SCALE ** 3;
export const HUMANOID_ACTUATOR_SCALE = HUMANOID_SCALE ** 4;

export const humanoidLength = (value: number): number => value * HUMANOID_SCALE;
export const humanoidMass = (value: number): number => value * HUMANOID_MASS_SCALE;
export const humanoidActuator = (value: number): number => value * HUMANOID_ACTUATOR_SCALE;
export const humanoidTriple = (value: Triple): Triple => Object.freeze([
  humanoidLength(value[0]), humanoidLength(value[1]), humanoidLength(value[2]),
]);

export const humanoidShape = (shape: PrimitiveShape): PrimitiveShape => {
  if (shape.kind === "box") return Object.freeze({ kind: "box", sizeM: humanoidTriple(shape.sizeM) });
  if (shape.kind === "sphere") return Object.freeze({ kind: "sphere", radiusM: humanoidLength(shape.radiusM) });
  return Object.freeze({ kind: shape.kind, lengthM: humanoidLength(shape.lengthM),
    radiusM: humanoidLength(shape.radiusM) });
};
