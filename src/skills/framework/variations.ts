import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { ActionConfig } from "../config.ts";
import type { Executor } from "./action.ts";
import type { ExecutorMaking } from "./executor-part.ts";

/**
 * **A skill's variations**, by name: each one's maker, its own code where it has any (`src/skills/strikes/<skill>/<variation>/`),
 * calling what variations do alike in `src/skills/strikes/shared/`.
 * A body runs the one its character chose (`BodySpec.skills`).
 */
export type Variations<C> = Readonly<Record<string, (making: ExecutorMaking, config: C, actions: readonly ActionConfig[]) => Executor>>;

/**
 * A skill's part's `fits` for its `variations`: why a body of `spec` does not run `skill` (its
 * `label`), or null: its character has not chosen it, or chose a variation it has no code for.
 */
export function variationFault(skill: string, label: string, variations: Variations<never>): (spec: BodySpec) => string | null {
  return (spec) => {
    const chosen = spec.skills?.[skill];
    if (chosen === undefined) return `the character has no ${label}`;
    return Object.hasOwn(variations, chosen) ? null : `the ${label} has no variation ${chosen}`;
  };
}

/** A skill's part's `make` for its `variations`: the maker of the one the body's character chose (`variationFault` refused the rest). */
export function variationMaker<C>(skill: string, variations: Variations<C>): Variations<C>[string] {
  return (making, config, actions) => {
    const spec = making.body.built.spec, chosen = spec.skills?.[skill];
    if (chosen === undefined || !Object.hasOwn(variations, chosen)) throw new Error(`${spec.model}'s character runs no variation of ${skill} it has`);
    return variations[chosen]!(making, config, actions);
  };
}
