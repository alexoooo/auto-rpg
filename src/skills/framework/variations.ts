import { heldVariations, type BodySpec } from "../../core/bodies/spec/body.ts";
import type { DataKey } from "../../core/data/store.ts";
import type { ActionConfig } from "../config.ts";
import type { Executor } from "./action.ts";
import type { ExecutorMaking } from "./executor-part.ts";
import type { PartConfig } from "../../parts/parts.ts";
import { recordFault } from "./records.ts";

/** The name a decision uses for one held variation, also used in combat reports. */
export const skillName = (config: PartConfig): string => `${config.kind}/${(config as Varied).variation ?? ""}`;

/**
 * **A skill's variations**, by name (`Part.variations`): each what its part makes of it, `V`, by
 * the part's role (an executor's maker, a guard's posture and maker, a technique's run), its own
 * code where it has any, calling what variations do alike. A body runs those its character holds
 * (`BodySpec.skills`).
 */
export type Variations<V> = Readonly<Record<string, V>>;

/** **An executor's variations** (`Variations`): each its maker. */
export type ExecutorVariations<C> = Variations<(making: ExecutorMaking, config: C, actions: readonly ActionConfig[]) => Executor>;

/**
 * **What a variation tuned per body reads**: the records it names (`reads`, mind data by model,
 * `SkillRecord`), its own or another variation's, which is how two share one; and the bodies that
 * have them (`bodies`), known before the records load.
 */
export interface Recorded {
  readonly reads: readonly DataKey[];
  readonly bodies: readonly string[];
}

/** **A variation tuned per body**: what its part makes of it, `V`, and what it reads (`Recorded`). */
export interface RecordedVariation<V> extends Recorded {
  readonly make: V;
}

/** What a part makes of each of its variations tuned per body (`RecordedVariation`), by name. */
export const makersOf = <V>(variations: Variations<RecordedVariation<V>>): Variations<V> =>
  Object.fromEntries(Object.entries(variations).map(([name, one]) => [name, one.make]));

/**
 * A part's `reads` for its `variations` (`Recorded`): the records of the variation a config names,
 * and every variation's where it names none, each key once.
 */
export function variationReads(variations: Variations<Recorded>): (config: object) => readonly DataKey[] {
  const every = [...new Set(Object.values(variations).flatMap((one) => one.reads))];
  return (config) => {
    const named = (config as Varied).variation;
    return named !== undefined && Object.hasOwn(variations, named) ? variations[named]!.reads : every;
  };
}

/**
 * A part's `fits` for its `variations` tuned per body (`Recorded`): why a body of `spec` has no
 * record of a variation of `skill` (its `label`) it runs as `config` names it (the one it names,
 * else each its character holds), or null (`recordFault`, of that variation's `bodies`, which
 * names the variation where the skill has several).
 */
export function variationRecordFault<T>(skill: string, label: string, variations: Variations<Recorded>, whole: (tuning: T) => boolean): (spec: BodySpec, config: { readonly tuning?: T }) => string | null {
  const several = Object.keys(variations).length > 1;
  const faults = new Map(Object.entries(variations).map(([name, one]) => [name, recordFault(several ? `${label} ${name}` : label, one.bodies, whole)]));
  return (spec, config) => {
    const named = (config as Varied).variation;
    for (const variation of named !== undefined ? [named] : heldVariations(spec, skill)) {
      const fault = faults.get(variation)?.(spec, config) ?? null;
      if (fault !== null) return fault;
    }
    return null;
  };
}

/** **A config of a skill with variations**: the variation it runs; absent, the one its body holds where it holds one (`chosenVariation`). */
export interface Varied {
  readonly variation?: string;
}

/** Whether a configured skill selects this kind and variation; an unnamed variation selects every held one. */
export function selectsVariation(config: PartConfig, held: PartConfig): boolean {
  const named = (config as Varied).variation;
  return config.kind === held.kind && (named === undefined || named === (held as Varied).variation);
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
