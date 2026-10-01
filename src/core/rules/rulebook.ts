import type { AssistCeiling } from "../control/assist.ts";
import { derive, sourced, type Quantity } from "../spec/quantity.ts";

/**
 * **The fight rules, in one immutable object per mode**: what wounds, what severs, what kills and
 * how a fight ends. A rule reads its numbers from here and nowhere else, and every number says
 * where it came from, as a spec's do (`tests/fixtures/spec.mjs`). An experiment passes an override
 * in and gets a new rulebook; nothing mutates one.
 *
 * The arena and the dungeon use the same rules (the owner: "The dungeon and the arena use the same
 * rule"); the mode is named so that a rule that comes to differ has a place.
 */
type Mode = "arena" | "dungeon";

/**
 * How a blow wounds, each with its own price: something blunt arriving (a club, a fist), an edge
 * drawn (a sword), an axe's short edge, and a point going in (an arrow, a bite). Which one a
 * contact is waits for the weapons that have edges and points; a club is `blunt`.
 */
type Mechanism = "blunt" | "edge" | "axe" | "point";
export const MECHANISMS: readonly Mechanism[] = Object.freeze(["blunt", "edge", "axe", "point"]);

export interface Rulebook {
  readonly mode: Mode;
  /**
   * A part is taken off by a blow that empties it and goes on past empty by this share of its
   * full hit points, whatever the blow; a clean blow takes it off at empty (`src/core/rules/pool.ts`).
   */
  readonly severMargin: Quantity<number>;
  /**
   * **The damage unit**: the energy of a blunt blow worth one hit point, joules. It is the
   * Warrior's strongest one-handed blow with the wooden club (`owner-club`), so that blow is worth
   * 1 (`core-club-unit` has how it was found).
   */
  readonly unit: Quantity<number>;
  /**
   * What each mechanism's joule is worth against a blunt one: the blunt price over its own
   * (`MECHANISM_PRICE`), so every weapon keeps its ratio to the club. An edge's is 5.7.
   */
  readonly worth: Readonly<Record<Mechanism, Quantity<number>>>;
  /**
   * **What a point of balance is worth** (`AttributeSpec.balance`): the most an assist gives a
   * body for each point, a force in the body's own weights and a moment in its weights times a
   * metre. What each worth does to how bouts end: `docs/reference/assist.md`.
   */
  readonly balance: { readonly force: Quantity<number>; readonly moment: Quantity<number> };
}

/** What an experiment may set in place of a mode's rules. */
type RulebookOverride = Partial<Omit<Rulebook, "mode">>;

/**
 * Each mechanism's price, joules per point of wound: the prices whose ratios the owner keeps
 * (`owner-weapon-ratios`).
 * Only their ratios to the blunt price are read; the unit sets the scale.
 */
const MECHANISM_PRICE: Readonly<Record<Mechanism, Quantity<number>>> = Object.freeze({
  blunt: sourced(1134.99, "J", "owner-weapon-ratios", "blunt 1134.99 (crushJoulesPerDamage)"),
  edge: sourced(197.96, "J", "owner-weapon-ratios", "an edge 197.96 (cutJoulesPerDamage)"),
  axe: sourced(147.45, "J", "owner-weapon-ratios", "an axe's edge 147.45 (chopJoulesPerDamage)"),
  point: sourced(34, "J", "owner-weapon-ratios", "a point 34 (PROJECTILE_PENETRATION_V1.joulesPerDamage)"),
});

const RULES: Omit<Rulebook, "mode"> = Object.freeze({
  severMargin: sourced(0.5, "1", "owner-hp-pool", "a part severs half its hit points past empty"),
  unit: sourced(138.26, "J/HP", "core-club-unit", "the best blow at 1920 Hz, mean of 8 trials: 138.26 J"),
  worth: Object.freeze(Object.fromEntries(MECHANISMS.map((mechanism) => [mechanism,
    derive("1", "the blunt price over this mechanism's", [MECHANISM_PRICE.blunt, MECHANISM_PRICE[mechanism]], (blunt, own) => blunt / own)],
  )) as Record<Mechanism, Quantity<number>>),
  balance: Object.freeze({
    force: sourced(0.05, "1", "owner-balance", "a point is 0.05 of the body's weight"),
    moment: sourced(0.013, "m", "owner-balance", "and 0.013 weight-metres"),
  }),
});

/**
 * **What a blow is worth**, hit points: its energy (`impactEnergy` in `src/core/rules/impact.ts`)
 * in the rulebook's unit, times what its mechanism's joule is worth. Every blow is priced; the
 * floors under which a blow only shoves come with the edges that need them.
 */
export function blowDamage(rules: Rulebook, mechanism: Mechanism, energy: number): number {
  if (!(energy >= 0) || !Number.isFinite(energy)) throw new Error(`a blow's energy is a finite joules >= 0, not ${energy}`);
  return energy * rules.worth[mechanism].value / rules.unit.value;
}

/** What a point of balance is worth under `rules`, as a ceiling. */
export function balancePoint(rules: Rulebook): AssistCeiling {
  return { force: rules.balance.force.value, moment: rules.balance.moment.value };
}

/** The most an assist gives a body of `balance` points, each worth `point`. */
export function balanceCeiling(balance: number, point: AssistCeiling): AssistCeiling {
  if (!(balance >= 0) || !Number.isFinite(balance)) throw new Error(`a balance is a finite number of points >= 0, not ${balance}`);
  return { force: balance * point.force, moment: balance * point.moment };
}

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
