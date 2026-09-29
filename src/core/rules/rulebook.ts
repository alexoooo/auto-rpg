import { sourced, type Quantity } from "../spec/quantity.ts";

/**
 * **The fight rules, in one immutable object per mode** (stage 5 of
 * `docs/plans/2026-09-28-core-foundation.md`): what wounds, what severs, what kills and how a fight
 * ends. A rule reads its numbers from here and nowhere else, and every number says where it came
 * from, as a spec's do (`tests/fixtures/spec.mjs`). An experiment passes an override in and gets a
 * new rulebook; nothing mutates one.
 *
 * The arena and the dungeon use the same rules today (the owner's, 2026-09-27: "The dungeon and
 * the arena use the same rule"); the mode is named so that a rule that comes to differ has a place.
 */
export type Mode = "arena" | "dungeon";

export interface Rulebook {
  readonly mode: Mode;
  /**
   * A part is taken off by a blow that empties it and goes on past empty by this share of its
   * full hit points, whatever the blow; a clean blow takes it off at empty (`src/core/rules/pool.ts`).
   */
  readonly severMargin: Quantity<number>;
}

/** What an experiment may set in place of a mode's rules. */
export type RulebookOverride = Partial<Omit<Rulebook, "mode">>;

const RULES: Omit<Rulebook, "mode"> = Object.freeze({
  severMargin: sourced(0.5, "1", "owner-hp-pool", "the old game's health below -0.5 x max"),
});

/** The rules of `mode`, with `override` in place of any of them. */
export function rulebook(mode: Mode, override: RulebookOverride = {}): Rulebook {
  switch (mode) {
    case "arena":
    case "dungeon":
      return Object.freeze({ ...RULES, ...override, mode });
    default: {
      const never: never = mode;
      throw new Error(`no rulebook for ${String(never)}`);
    }
  }
}
