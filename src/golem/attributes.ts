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
  /**
   * How fast the body travels: the carrier's walk, back-off, strafe and acceleration, together
   * (`withMovement`), and on a biped the gait re-timed to carry them (`bipedAtMovement` in
   * `src/golem/locomotion/biped.ts`, with its table). Session 03, 2026-09-23.
   *
   * **The range is where the legs still hold the ground.** Node harness, `runGolemLocomotion`,
   * 1 s standing, 1.75 s at full forward command, 1 s stopped. Top speed reached tracks the
   * multiplier to the millimetre per second on all four bodies at every level below; the carrier is
   * keyframed, so nothing else binds. Mean planted-sole slip, mm/s, against each module's own
   * `meanFootSlipBudgetMps`:
   *
   *     movement            0.50   0.60   0.75   0.90   1.00   1.10   1.25   1.50
   *     biped (300)          208    243    199    162    186    193    204    219
   *     skeleton (300)       453    440    275    181    180    200    203    286
   *     multileg (700)        --     --    237     --    334     --    496    627
   *     wheel                  0      0      0      0      0      0      0      0
   *
   * The skeleton's slow end sets the floor at x0.75, and the multileg's rise sets the ceiling at
   * x1.5. No body left the supported state or leaned at any level, on this course or on one that
   * backs off, strafes, spins and walks diagonally -- where the biped's slip is already 764 mm/s at
   * x1 and scales with the speed (567 at x0.75, 1072 at x1.5), which is the sideways gait's known
   * gap (`meanFootSlipBudgetMps`) and not this stat's.
   *
   * **In the duel it does nothing measurable.** Swept against an unmodified body over 384 bouts a
   * level (`research/stat-sweep.mjs`, the four probe minds), every level from x0.75 to x1.5 sits
   * inside the null row: win rate 46.7 % to 51.3 %, no margin d above 0.07, same bout length. The
   * minds fight in contact, where two footprints block each other and top speed binds only on the
   * approach -- the brawler asks for full speed 76.5 % of a bout and has it 24.8 %. The tables and
   * that argument are `docs/analysis/2026-09-23-attribute-measurements.md`, "Movement".
   */
  movement: Object.freeze({ label: "Movement", min: 0.75, max: 1.5, step: 0.05, live: true }),
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
 * A setting with one stat changed: stored when it is off 1, deleted when it is back on 1.
 *
 * **A stat at its default is not written down**, so a body somebody tuned and then reset is the body
 * that was never touched -- the same record, the same link, the same fingerprint. Both editors use
 * this one rule: `withGolemAttribute` in `src/bout.ts` for an arena corner, and the dungeon's hero
 * dialog for a setting it holds before there is a setup to put it on.
 */
export function withAttribute(
  setting: AttributeSetting | undefined, id: AttributeId, value: number,
): AttributeSetting {
  const next: Partial<Record<AttributeId, number>> = { ...setting };
  if (value === 1) delete next[id];
  else next[id] = value;
  return next;
}

/**
 * A copy of a setup carrying exactly this setting, and no `attributes` field at all when the setting
 * is empty -- so a body with every stat at its default is the record of one nobody tuned.
 */
export function withAttributeSetting<T extends { readonly attributes?: AttributeSetting }>(
  setup: T, setting: AttributeSetting | undefined,
): T {
  const { attributes: _dropped, ...rest } = setup;
  return setting && Object.keys(setting).length > 0 ? { ...rest, attributes: { ...setting } } as T : rest as T;
}

/** The carrier fields movement scales: every speed it may travel at, and how hard it may change one. */
interface CarrierSpeeds {
  readonly maxSpeedMps: number;
  readonly maxAccelerationMps2: number;
  readonly backSpeedMps?: number;
  readonly strafeSpeedMps?: number;
}

/**
 * A locomotion table with its carrier's travel scaled by the movement stat.
 *
 * **All four together.** The walk, the back-off, the strafe and the acceleration move by one
 * factor, so the back and strafe ratios -- 0.59 and 0.76 of a walk on the biped -- hold by
 * construction; they exist because a golem that backs off as fast as it advances can never be
 * cornered. Yaw is the turning stat's and is left alone.
 *
 * **The whole table, not only the carrier's config.** A builder reads `carrier` in more places than
 * the port -- the stride cadence, the gait's authority, the published envelope -- and a carrier
 * scaled alone would outrun its own legs. So the builder takes this table and hands it to all of
 * them. At x1 the very table it was handed comes back, so a body at its default is the body it was
 * to the bit rather than to the rounding.
 *
 * **Scaling the speed is not enough for legs.** A biped also re-times its gait on top of this
 * (`bipedAtMovement` in `src/golem/locomotion/biped.ts`, which says why); the multileg measured
 * better without that, and the wheel has no gait.
 */
export function withMovement<T extends { readonly carrier: CarrierSpeeds }>(table: T, movement: number): T {
  if (movement === 1) return table;
  const carrier = table.carrier;
  return {
    ...table,
    carrier: {
      ...carrier,
      maxSpeedMps: carrier.maxSpeedMps * movement,
      maxAccelerationMps2: carrier.maxAccelerationMps2 * movement,
      ...(carrier.backSpeedMps === undefined ? {} : { backSpeedMps: carrier.backSpeedMps * movement }),
      ...(carrier.strafeSpeedMps === undefined ? {} : { strafeSpeedMps: carrier.strafeSpeedMps * movement }),
    },
  };
}

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
