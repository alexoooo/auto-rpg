import { heldVariations, type BodySpec } from "../../core/bodies/spec/body.ts";
import type { ActionConfig } from "../config.ts";
import type { Executor } from "./action.ts";
import type { ExecutorMaking } from "./executor-part.ts";

/**
 * **A skill's variations**, by name: each one's maker, its own code where it has any (`src/skills/strikes/<skill>/<variation>/`),
 * calling what variations do alike in `src/skills/strikes/shared/`. A body runs those its character holds (`BodySpec.skills`).
 */
export type Variations<C> = Readonly<Record<string, (making: ExecutorMaking, config: C, actions: readonly ActionConfig[]) => Executor>>;

/** **A config of a skill with variations**: the variation it runs; absent, the one its body holds where it holds one (`chosenVariation`). */
export interface Varied {
  readonly variation?: string;
}

/**
 * **The variation of `skill` a config runs on a body of `spec`**: the one it names; where it names
 * none, the one variation of the skill the body holds; undefined where it holds none, or several.
 */
export function chosenVariation(spec: Pick<BodySpec, "skills">, skill: string, config: object): string | undefined {
  const named = (config as Varied).variation;
  if (named !== undefined) return named;
  const held = heldVariations(spec, skill);
  return held.length === 1 ? held[0] : undefined;
}

/**
 * A skill's part's `fits` for its `variations`: why a body of `spec` does not run `skill` (its
 * `label`) as `config` names it, or null: its character holds no variation of it, not the one
 * `config` names, or one it has no code for.
 */
export function variationFault(skill: string, label: string, variations: Variations<never>): (spec: BodySpec, config: object) => string | null {
  return (spec, config) => {
    const named = (config as Varied).variation;
    const held = heldVariations(spec, skill);
    if (held.length === 0) return `the character has no ${label}`;
    if (named !== undefined && !held.includes(named)) return `the character has no ${label} ${named}`;
    const unknown = held.find((variation) => !Object.hasOwn(variations, variation));
    return unknown === undefined ? null : `the ${label} has no variation ${unknown}`;
  };
}

/**
 * A skill's part's `make` for its `variations`: the maker of the one `config` runs on the body
 * (`chosenVariation`; `variationFault` refused the rest). A body holding several must be given
 * the one in its config.
 */
export function variationMaker<C extends Varied>(skill: string, variations: Variations<C>): Variations<C>[string] {
  return (making, config, actions) => {
    const spec = making.body.built.spec, chosen = chosenVariation(spec, skill, config);
    if (chosen === undefined || !Object.hasOwn(variations, chosen)) throw new Error(`${spec.model}'s character runs no one variation of ${skill} it has: name it`);
    return variations[chosen]!(making, config, actions);
  };
}
