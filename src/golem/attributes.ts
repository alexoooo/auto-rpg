/**
 * A golem's numeric attributes: nine multipliers on the body's own tuned values.
 *
 * The plan set is `docs/plans/2026-09-23-attributes-00-overview.md`, and the argument for each
 * stat -- which number it scales and what bounds it -- is "A first slice of numeric attributes" in
 * `docs/analysis/2026-09-22-attributes-and-mind-schools.md`. The owner's decisions, 2026-09-23:
 * every stat is a factor with a default of 1.00, at which a body is exactly the body it was; armour
 * scales the armour fraction and toughness scales health; weight and size are two stats; and
 * armour and arm speed may later come from item stats as well as from the setup.
 *
 * **This module imports nothing.** `src/bout.ts` reads `ATTRIBUTE_IDS` for its link codec, and
 * that file runs under Node with no Babylon anywhere in its graph (`bout_loads_with_babylon_
 * unresolvable` in `tests/bout.test.mjs`). A value import here that reached Babylon would take the
 * codec with it.
 *
 * **A row is not live until its own session has measured it.** Each stat's session wires the
 * number it scales, proves 1.00 moves no body (the body fingerprint), proves the stat moves a bench
 * reading, sweeps bouts, and only then sets `min` and `max` from those tables and turns the row
 * live. Until then the row's range is exactly 1, so validation refuses any other value and no body
 * can be built with a stat nothing reads -- a slider that did nothing would look exactly like a stat
 * that does nothing, which is the one thing these sessions exist to tell apart.
 */

export const ATTRIBUTE_IDS = Object.freeze([
  "movement", "turning", "stability", "recovery", "armour",
  "toughness", "armSpeed", "weight", "size",
] as const);

export type AttributeId = (typeof ATTRIBUTE_IDS)[number];

export type Attributes = Readonly<Record<AttributeId, number>>;

/** What a setup carries: only the stats somebody moved off 1. */
export type AttributeSetting = Readonly<Partial<Record<AttributeId, number>>>;

export interface AttributeRow {
  readonly label: string;
  /** The lowest multiplier a body may be built at. */
  readonly min: number;
  /** The highest. */
  readonly max: number;
  /** The slider's increment. */
  readonly step: number;
  /** Whether anything reads this stat yet. A row that is not live accepts only 1. */
  readonly live: boolean;
}

export type AttributeTable = Readonly<Record<AttributeId, AttributeRow>>;

/** A row nothing reads yet: its range is 1 and nothing else. */
const pending = (label: string): AttributeRow => Object.freeze({ label, min: 1, max: 1, step: 0.05, live: false });

export const ATTRIBUTES: AttributeTable = Object.freeze({
  movement: pending("Movement"),
  turning: pending("Turning"),
  stability: pending("Stability"),
  recovery: pending("Recovery"),
  armour: pending("Armour"),
  toughness: pending("Toughness"),
  armSpeed: pending("Arm speed"),
  weight: pending("Weight"),
  size: pending("Size"),
});

export const isAttributeId = (id: unknown): id is AttributeId =>
  typeof id === "string" && (ATTRIBUTE_IDS as readonly string[]).includes(id);

/** Every stat at its default. */
export const DEFAULT_ATTRIBUTES: Attributes = Object.freeze(
  Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 1])) as Record<AttributeId, number>);

/**
 * Every stat a body is built at: its defaults, overlaid by each source in turn.
 *
 * **A fold over sources, and today there is one.** The setup is the only source, but armour and arm
 * speed are expected to come from what a body holds as well, and when they do the answer is a
 * second entry in `sources` rather than a second function every caller has to learn. How two
 * sources combine is that session's decision; today there is nothing to combine.
 *
 * Nothing here clamps. `attributesRefusal` refuses a bad value where a build is checked
 * (`golemSetupRefusal`), so a value that reaches this function is one that was accepted, and
 * clamping it here would be a second copy of that rule that could disagree with the first.
 */
export function resolveAttributes(setup: { readonly attributes?: AttributeSetting }): Attributes {
  const sources: readonly (AttributeSetting | undefined)[] = [setup.attributes];
  const resolved: Record<AttributeId, number> = { ...DEFAULT_ATTRIBUTES };
  for (const source of sources) {
    if (!source) continue;
    for (const id of ATTRIBUTE_IDS) {
      const value = source[id];
      if (value !== undefined) resolved[id] = value;
    }
  }
  return Object.freeze(resolved);
}

/**
 * One stat, read from a build context, with the default spelled once.
 *
 * A module stood on a bench alone is handed a context with no attributes and builds at 1, exactly
 * as it is handed no `tone` and builds at full tone.
 */
export const attributeOf = (ctx: { readonly attributes?: Attributes }, id: AttributeId): number =>
  ctx.attributes?.[id] ?? 1;

/**
 * Why a setting cannot be built, or null.
 *
 * Refused rather than clamped, for the reason `golemSetupRefusal` gives about durability: a body
 * asking for a stat at 40 is a link somebody wrote by hand, and quietly building it at the top of
 * the range is a substitution. `table` is a parameter so a test can check the range rules against
 * a live row before any shipped row is live; nothing else passes one.
 */
export function attributesRefusal(
  setting: unknown,
  table: AttributeTable = ATTRIBUTES,
): string | null {
  if (setting === undefined) return null;
  if (typeof setting !== "object" || setting === null || Array.isArray(setting)) {
    return "attributes are not a record of stats";
  }
  for (const [id, value] of Object.entries(setting)) {
    if (!isAttributeId(id)) return `there is no attribute "${id}"`;
    const row = table[id];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return `${row.label} is ${JSON.stringify(value)}, which is not a number`;
    }
    if (!row.live && value !== 1) {
      return `${row.label} is not measured yet, so it can only be x1`;
    }
    if (value < row.min || value > row.max) {
      return `${row.label} x${value} is outside x${row.min} to x${row.max}`;
    }
  }
  return null;
}

/** The stats that differ from their default, as a short line: "movement x1.20, armour x0.90". */
export function describeAttributes(resolved: Attributes, table: AttributeTable = ATTRIBUTES): string {
  return ATTRIBUTE_IDS
    .filter((id) => resolved[id] !== 1)
    .map((id) => `${table[id].label.toLowerCase()} x${resolved[id].toFixed(2)}`)
    .join(", ");
}
