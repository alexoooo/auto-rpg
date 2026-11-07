import type { Vec3 } from "../../core/quantity.ts";
import type { SolidSense } from "../../core/bodies/object-senses.ts";

/**
 * A foot's sweep against a body's colliders: exact against round colliders, against conservative
 * bounds for polyhedral ones, admitting a sweep that separates outward.
 */
export type FootClearance = (from: Vec3, to: Vec3, radius: number) => boolean;

/** A body's colliders read once: their bounds, as `sensedBounds` gives them, and a foot's sweep against them. */
export interface SensedObstacle { readonly bounds: readonly SolidSense[]; readonly clear: FootClearance }
