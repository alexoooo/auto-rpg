import { pawsOf, type BodySpec } from "../../core/bodies/spec/body.ts";

const LIMBS = new WeakMap<BodySpec, readonly string[]>();

/**
 * The default attack model's limbs: endpoints other than paw supports, where no executor names
 * what attacks. Foe priors and the Cover drill's contact classification use this model; an
 * actual executor declares its own effectors and applicability.
 */
export function defaultStrikeLimbs(spec: BodySpec): readonly string[] {
  let limbs = LIMBS.get(spec);
  if (!limbs) {
    const paws = pawsOf(spec).map((paw) => paw.segment);
    LIMBS.set(spec, limbs = Object.freeze((spec.effectors ?? []).filter((effector) => !paws.includes(effector.segment)).map((effector) => effector.segment)));
  }
  return limbs;
}
