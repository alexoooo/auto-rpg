/** Compatibility for the currently supported five-slot bodies, not a universal anatomy model. */
export type BodyFamily = "golem" | "human";

const HUMAN_MODULES = new Set(["locomotion.human", "torso.human", "head.human", "anatomical"]);
export const moduleFamily = (id: string): BodyFamily =>
  HUMAN_MODULES.has(id) || id.startsWith("effector.anatomical.") ? "human" : "golem";

export function bodyFamily(setup: { family?: BodyFamily; locomotion: string }): BodyFamily {
  return setup.family ?? moduleFamily(setup.locomotion);
}
