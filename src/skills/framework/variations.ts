import { heldVariations, type BodySpec } from "../../core/bodies/spec/body.ts";
import type { DataKey } from "../../core/data/store.ts";
import type { ActionConfig } from "../config.ts";
import type { Executor } from "./action.ts";
import type { ExecutorMaking } from "./executor-part.ts";
import { fitsAll, type PartConfig } from "../../parts/parts.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import { recordFault } from "./records.ts";

/** **A part's config that may name a variation** (`Varied`). */
export type VariedConfig = PartConfig & Varied;

/** The name a decision uses for one held variation, also used in combat reports. */
export const skillName = (config: VariedConfig): string => `${config.kind}/${config.variation ?? ""}`;

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
export function variationReads(variations: Variations<Recorded>): (config: VariedConfig) => readonly DataKey[] {
  const every = [...new Set(Object.values(variations).flatMap((one) => one.reads))];
  return (config) => {
    const named = config.variation;
    return named !== undefined && Object.hasOwn(variations, named) ? variations[named]!.reads : every;
  };
}

/**
 * A part's `fits` for its `variations` tuned per body (`Recorded`): why a body of `spec` has no
 * record of a variation of `skill` (its `label`) it runs as `config` names it (the one it names,
 * else each its character holds), or null (`recordFault`, of that variation's `bodies`, which
 * names the variation where the skill has several), a research tuning in its place whole by
 * `whole` for that variation.
 */
export function variationRecordFault<T>(skill: string, label: string, variations: Variations<Recorded>, whole: (tuning: T, variation: string) => boolean): (spec: BodySpec, config: VariedConfig & { readonly tuning?: T }) => string | null {
  const several = Object.keys(variations).length > 1;
  const faults = new Map(Object.entries(variations).map(([name, one]) => [name, recordFault(several ? `${label} ${name}` : label, one.bodies, (tuning: T) => whole(tuning, name))]));
  return (spec, config) => {
    const named = config.variation;
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
export function selectsVariation(config: VariedConfig, held: VariedConfig): boolean {
  return config.kind === held.kind && (config.variation === undefined || config.variation === held.variation);
}

/**
 * **The variation of `skill` a config runs on a body of `spec`**: the one it names; where it names
 * none, the one variation of the skill the body holds; undefined where it holds none, or several.
 */
export function chosenVariation(spec: Pick<BodySpec, "skills">, skill: string, config: VariedConfig): string | undefined {
  const named = config.variation;
  if (named !== undefined) return named;
  const held = heldVariations(spec, skill);
  return held.length === 1 ? held[0] : undefined;
}

/**
 * A skill's part's `fits` for its `variations` (or their names): why a body of `spec` does not run
 * `skill` (its `label`) as `config` names it, or null: its character holds no variation of it, not
 * the one `config` names, or one it has no code for.
 */
export function variationFault<C extends VariedConfig>(skill: string, label: string, variations: Variations<unknown> | readonly string[]): (spec: BodySpec, config: C) => string | null {
  const known: readonly string[] = Array.isArray(variations) ? variations : Object.keys(variations);
  return (spec, config) => {
    const named = config.variation;
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
export function heldVariation<V>(spec: Pick<BodySpec, "skills" | "model">, skill: string, config: VariedConfig, variations: Variations<V>): V {
  const chosen = chosenVariation(spec, skill, config);
  if (chosen === undefined || !Object.hasOwn(variations, chosen)) throw new Error(`${spec.model}'s character runs no one variation of ${skill} it has: name it`);
  return variations[chosen]!;
}

/** A part's `fits` (`Part.fits`) for a config of `C`. */
export type Fits<C> =(spec: BodySpec, config: C, parts: PartLookup) => string | null;

/**
 * **A skill's part over its `variations`**, each a maker of the part's own arguments: their names
 * (`Part.variations`); its `fits`, a body whose character holds the variation it runs, with code
 * for it (`variationFault`, `label` in its refusals), and then each of `fits`; and its `make`, the
 * maker of the variation its body runs (`heldVariation`), the body's spec and config read from the
 * maker's arguments by `of`.
 */
export function varied<A extends unknown[], R, C extends VariedConfig>({ skill, label, variations, of, fits }: {
  readonly skill: string; readonly label: string; readonly variations: Variations<(...args: A) => R>;
  readonly of: (...args: A) => readonly [Pick<BodySpec, "skills" | "model">, C]; readonly fits: readonly Fits<C>[];
}): { readonly fits: Fits<C>; readonly make: (...args: A) => R; readonly variations: readonly string[] } {
  return {
    fits: fitsAll<C>(variationFault(skill, label, variations), ...fits),
    make: (...args) => { const [spec, config] = of(...args); return heldVariation(spec, skill, config, variations)(...args); },
    variations: Object.keys(variations),
  };
}

/** An executor's body's spec and config (`varied`'s `of`). */
export const executorOf = <C>(making: ExecutorMaking, config: C): readonly [BodySpec, C] => [making.body.built.spec, config];
