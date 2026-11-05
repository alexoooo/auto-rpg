import type { ConfigurationSpec, ShapeSpec } from "../spec/body.ts";

/** Collision configurations used by human hands and the skills that articulate them. */
export const HAND_CONFIGURATION = Object.freeze({ open: "open", fist: "fist", grip: "grip" } as const);

/** Human hand shapes, attachment retention and the closed fist's striking endpoint. */
export function handConfigurations(shapes: Readonly<Record<typeof HAND_CONFIGURATION[keyof typeof HAND_CONFIGURATION], ShapeSpec>>): ConfigurationSpec {
  return { initial: HAND_CONFIGURATION.open, shapes,
    holding: { configuration: HAND_CONFIGURATION.grip, release: HAND_CONFIGURATION.open },
    aim: { [HAND_CONFIGURATION.fist]: "strike" } };
}
