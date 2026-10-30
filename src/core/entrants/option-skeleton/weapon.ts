import type { BodySpec } from "../../spec/body.ts";

/** A sensed held edge or point calls for the blade defence. */
export const hasBlade = (spec: BodySpec): boolean => spec.held?.some(held => held.item.contacts?.some(region =>
  region.surface.directed?.mechanism === "edge" || region.surface.directed?.mechanism === "point")) ?? false;
