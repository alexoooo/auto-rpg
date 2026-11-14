import { heldVariations, type BodySpec } from "../../core/bodies/spec/body.ts";
import type { ActionConfig } from "../config.ts";
import type { Executor } from "./action.ts";
import type { ExecutorMaking } from "./executor-part.ts";

/**
 * **A skill's variations**, by name (`Part.variations`): each what its part makes of it, `V`, by
 * the part's role (an executor's maker, a guard's posture and maker, a technique's run), its own
 * code where it has any, calling what variations do alike. A body runs those its character holds
 * (`BodySpec.skills`).
 */
export type Variations<V> = Readonly<Record<string, V>>;

/** **An executor's variations** (`Variations`): each its maker. */
export type ExecutorVariations<C> = Variations<(making: ExecutorMaking, config: C, actions: readonly ActionConfig[]) => Executor>;

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
 * A skill's part's `fits` for its `variations` (or their names): why a body of `spec` does not run
 * `skill` (its `label`) as `config` names it, or null: its character holds no variation of it, not
 * the one `config` names, or one it has no code for.
 */
export function variationFault(skill: string, label: string, variations: Variations<unknown> | readonly string[]): (spec: BodySpec, config: object) => string | null {
  const known: readonly string[] = Array.isArray(variations) ? variations : Object.keys(variations);
  return (spec, config) => {
    const named = (config as Varied).variation;
    const held = heldVariations(spec, skill);
    if (held.length === 0) return `the character has no ${label}`;
    if (named !== undefined && !held.includes(named)) return `the character has no ${label} ${named}`;
    const unknown = held.find((variation) => !known.includes(variation));
    return unknown === undefined ? null : `the ${label} has no variation ${unknown}`;
  };
}

/**
 * **The variation of `skill` a body of `spec` runs as `config` names it** (`chosenVariation`;
 * `variationFault` refused the rest): what its part makes of it. A body holding several must be
 * given the one in its config.
 */
export function heldVariation<V>(spec: Pick<BodySpec, "skills" | "model">, skill: string, config: object, variations: Variations<V>): V {
  const chosen = chosenVariation(spec, skill, config);
  if (chosen === undefined || !Object.hasOwn(variations, chosen)) throw new Error(`${spec.model}'s character runs no one variation of ${skill} it has: name it`);
  return variations[chosen]!;
}

/**
 * **A part's `make` over its `variations`**, each a maker of the part's own arguments: the maker of
 * the one its body runs (`heldVariation`), the body's spec and the config read from the arguments by `of`.
 */
export function variedMake<A extends unknown[], R>(skill: string, variations: Variations<(...args: A) => R>,
  of: (...args: A) => readonly [Pick<BodySpec, "skills" | "model">, object]): (...args: A) => R {
  return (...args) => { const [spec, config] = of(...args); return heldVariation(spec, skill, config, variations)(...args); };
}

/** An executor's `make` for its `variations` (`variedMake`). */
export function variationMaker<C extends Varied>(skill: string, variations: ExecutorVariations<C>): ExecutorVariations<C>[string] {
  return variedMake(skill, variations, (making, config) => [making.body.built.spec, config]);
}
