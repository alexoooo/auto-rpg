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
  /**
   * How fast the body turns: the carrier's yaw rate and yaw acceleration, together (`withTurning`),
   * through the same per-build table movement uses, so the biped's feet step the pivot they are
   * asked for. Not the trunk's twist, which is the torso's. Session 05, 2026-09-23.
   *
   * **Nothing the bench can see breaks anywhere from x0.5 to x2.** Node harness,
   * `runGolemLocomotion`, 1 s standing, 2 s at full turn command, 1 s stopped: the carrier's yaw
   * rate reaches the multiplier exactly on all four bodies, and no body leaves the supported state or
   * leans. A sole has no yaw joint, so it twists on the floor in proportion to the spin -- mean
   * planted slip, mm/s, against the pivot budget `0.99 x yaw rate x hipSide` the spin test already
   * held it to:
   *
   *     turning              0.50   0.75   1.00   1.25   1.50   2.00
   *     biped   slip          122    183    231    300    344    440
   *             budget        282    423    564    705    846   1129
   *     skeleton slip          64     90    114    142    174    243
   *     time to 90 deg, s    1.32   0.97   0.78   0.68   0.62   0.52   (biped and skeleton)
   *
   * The same share of the budget at every level, so the feet set no range. One thing does grow:
   * both limits scale together, so the angle a body coasts after the command lets go scales with the
   * stat too -- 0.72 rad on the biped at x1, 1.07 at x1.5.
   *
   * **In the duel, turning slowly costs and turning fast barely pays.** Swept against an unmodified
   * body over 384 bouts a level (`research/stat-sweep.mjs`, the four probe minds): win rate 36.2 %
   * at x0.5 and 38.4 % at x0.75, paired d -0.36 and -0.24; x0.9 to x1.1 inside the null; 53.0 % and
   * 54.0 % at x1.25 and x1.5, d 0.09 and 0.10 with intervals that touch zero. The minds command a
   * full turn 3 % to 48 % of a bout and sit at the cap 2 % to 26 %, so a slower cap binds and a faster
   * one mostly does not. The range is the swept one. The tables are
   * `docs/analysis/2026-09-23-attribute-measurements.md`, "Turning".
   */
  turning: Object.freeze({ label: "Turning", min: 0.5, max: 1.5, step: 0.05, live: true }),
  /**
   * How hard the body is to knock over: a plain factor on both the stagger and the fall threshold of
   * its stability ledger (`stabilityScale`, formed only in `stabilityCapacity` in
   * `src/supported-locomotion-state.ts`), and on the rule that interrupts a rise. Not through the
   * brace multiplier, which is refused below 1 and is the wheel's 1 today. It moves the impulse
   * ledger and nothing else: a body that tips over its own feet is not steadier for it. Session 06,
   * 2026-09-23.
   *
   * **The thresholds move by exactly the multiple on every body.** Node harness,
   * `runGolemLocomotion`, a standing body shoved once, the bench's `shoveImpulseNs` bisected; the
   * fall threshold, N.s, is the ledger's prediction to the hundredth at every level (stagger reads
   * 0.02-0.03 N.s over it, the ledger's decay across the shove):
   *
   *     stability            0.50   1.00   2.00
   *     biped   (90.7 kg)    0.95   1.91   3.81
   *     skeleton (65.8 kg)   0.92   1.84   3.69
   *     multileg (102.4 kg)  1.86   3.73   7.46
   *     wheel   (117.5 kg)   0.58   1.15   2.30
   *
   * No body's own gait leaves the supported state at any level, x0.5 included, on its walk or on a
   * course that backs off, strafes and spins.
   *
   * **In the duel, being easy to fell costs and being hard to fell barely pays**, as with turning.
   * Swept against an unmodified body over 384 bouts a level (`research/stat-sweep.mjs`): on stone
   * with the four probe minds, x0.5 falls 13.7 times a bout against the control's 4.9 and spends 38 %
   * of it down, and wins 33.5 % (paired d -0.45); x2 falls 1.6 times, spends 4.8 % down, and wins
   * 51.8 % (d 0.15, an interval that just clears zero). The skeleton duelist's mirror is a gentler
   * slope, 42.4 % at x0.5 to 55 % at x1.5 and x2. The range is the swept one. The tables are
   * `docs/analysis/2026-09-23-attribute-measurements.md`, "Stability".
   */
  stability: Object.freeze({ label: "Stability", min: 0.5, max: 2, step: 0.05, live: true }),
  /**
   * How fast a knocked-down body is back on its feet: the frozen dwell and the frozen rise divided by
   * the stat for every body (`fallenDwellS`, `risingFloorS` and `recoveredRiseS` in
   * `src/supported-locomotion-state.ts`, from `recoveryScale` on the authority), and a knockdown's
   * rest window and lying cap divided on a body that has one (`withRecovery`). It does not change how
   * often a body goes down; that is stability. Session 07, 2026-09-23.
   *
   * **Stone scales exactly and to x2.** Node harness, whole golems (the knockdown test's pair),
   * shoved twice past the fall line three times a level: stone lies 0.350 s and rises in 0.454 at
   * x1, and the same over the stat at every level from x0.5 to x2. Its limbs never move faster than
   * 1.67 m/s against the pelvis during a rise.
   *
   * **The skeleton sets the ceiling.** Its lie ends on the cap at x1.25 and above, and the cap cuts
   * a fall that is still going on:
   *
   *     recovery                   0.50   0.75   1.00   1.25   1.50   2.00
   *     lie, s                     2.61   2.50   2.38   2.01   1.68   1.26
   *     pelvis at rise start, m    0.20   0.19   0.20   0.27   0.34   0.68
   *     rise, s                    2.21   1.50   1.11   0.80   0.58   0.23
   *     peak limb speed, m/s       5.52   5.64   5.80   5.71   9.31  16.27   (vs the pelvis, in the rise)
   *
   * At x1.25 the rise still begins from a finished fall -- 0.26 to 0.28 m, against the 0.26 m the
   * knockdown table's note records for the rises it watched -- and nothing moves faster. At x1.5 it begins mid-fall and a wrist
   * whips at 9.3 m/s, and at x2 the body is lifted off a fall barely begun. So the top is x1.25.
   * Held off its rest rule, the skeleton lies exactly the cap over the stat at both ends and stands.
   *
   * **In the duel, lying longer costs and getting up sooner barely pays** -- the shape of every stat
   * so far. Swept against an unmodified body over 384 bouts a level (`research/stat-sweep.mjs`): on
   * stone, x0.5 spends 28 % of a bout down against 15 % and wins 38.8 % (paired d -0.38), x1.25 is
   * inside the null, and x1.5 and x2 win 52.9 % and 54.0 % (d 0.16 and 0.15). The skeleton mirror
   * is flat from x0.5 to x1.25 -- and wins 60.2 % at x1.5 (d 0.27), the level where the rise stops
   * being one; that gain is not shipped, and what makes it is not established. The tables are
   * `docs/analysis/2026-09-23-attribute-measurements.md`, "Recovery".
   */
  recovery: Object.freeze({ label: "Recovery", min: 0.5, max: 1.25, step: 0.05, live: true }),
  /**
   * How much of a blow a part turns aside: the part's own armour fraction times the stat, capped at
   * `ARMOUR_CAP` (`armourAt`, read in `Golem.armourOf`). A part with no armour gets none, and a
   * per-kind table is scaled kind by kind. It changes no physics: a bout at another armour setting
   * is the same fight until damage decides something. Session 08, 2026-09-23.
   *
   * **The stat is only as large as the armour it has to scale.** Node harness, one 10-point blow
   * through `Golem.applyDamage` on a standing golem, damage the part takes:
   *
   *     armour                          0.50   0.75   1.00   1.25   1.50   2.00
   *     stone core (0.10)               9.50   9.25   9.00   8.75   8.50   8.00
   *     stone head (0.05)               9.75   9.63   9.50   9.38   9.25   9.00
   *     stone pelvis, legs, arms (0)   10.00  10.00  10.00  10.00  10.00  10.00
   *     plated core (0.34)              8.30   7.45   6.60   5.75   4.90   3.20
   *     skeleton cut (0.50)             7.50   6.25   5.00   3.75   2.50   1.00   (capped at x2)
   *     skeleton thrust (0.60)          7.00   5.50   4.00   2.50   1.00   1.00   (capped from x1.5)
   *     skeleton crush, slap (0)       10.00  10.00  10.00  10.00  10.00  10.00
   *     human core, head (0.50)         7.50   6.25   5.00   3.75   2.50   1.00   (capped at x2)
   *     human pelvis, upper arm (0.35)  8.25   7.38   6.50   5.63   4.75   3.00
   *
   * **So it is flat on stone and decisive on the skeleton.** Swept against an unmodified body over
   * 384 bouts a level (`research/stat-sweep.mjs`): the stone default wins 47.8 % at x0.5 and 50.0 %
   * at x2, inside the null at every level; the plated build, 47.8 % to 52.0 %; the skeleton duelist's
   * mirror, 32.3 % at x0.5, 64.8 % at x1.25, 84.9 % at x1.5 and 97.1 % at x2 (paired d 1.90). No
   * level is unsafe -- nothing physical moves and the cap keeps every blow landing a tenth -- so the
   * range is the swept one; how much of it a fair fight wants is a balance call, not a bench one.
   * The tables are `docs/analysis/2026-09-23-attribute-measurements.md`, "Armour".
   */
  armour: Object.freeze({ label: "Armour", min: 0.5, max: 2, step: 0.05, live: true }),
  /**
   * How much a part can take: every body part's health and full health times the stat, in
   * `Golem.register`, the one place a golem's parts get their health. A piece that parries -- a
   * blade, a mace, a plate -- is never wounded and keeps its own. Everything measured against full
   * health follows by itself: the breaking point (`severMargin` of it), ruin at zero, wear's share,
   * and the overtime drain, which takes a fraction of it. The bar's weights are not touched, so
   * where a blow lands matters exactly as much as it did. Session 09, 2026-09-23.
   *
   * **Blows to ruin and to break off scale with the stat, to within one.** Node harness, standard
   * 0.5-point cuts through `Golem.applyDamage`, counted to zero health and to the breaking point:
   *
   *     toughness               0.50    0.75    1.00    1.25    1.50    2.00
   *     stone core              7/11   11/16   14/21   18/26   21/32   28/42
   *     stone pelvis            7/10   10/15   13/19   16/24   19/29   25/38
   *     stone upper arm          3/5     5/7     6/9    8/11    9/13   12/18
   *     skeleton core            6/8    8/12   11/16   14/20   16/24   22/32
   *     human core             13/19   19/29   25/38   32/47   38/57   50/75
   *     any held blade           3/5     3/5     3/5     3/5     3/5     3/5
   *
   * **The strongest stat on stone so far, and the first there whose gain matches its cost.** Swept
   * against an unmodified body over 384 bouts a level (`research/stat-sweep.mjs`): on stone with the
   * four probe minds, 16.8 % at x0.5, 32.2 % at x0.75, 60.4 % at x1.25, 72.4 % at x1.5 and 84.6 % at
   * x2 (paired d 1.78); on the skeleton duelist's mirror, 22.1 % to 87.8 %. Modules lost fall from
   * 0.98 a bout to 0.13 on stone. Every bout at every level ended on an empty bar inside 115 s, the
   * overtime drain taking the same share of a tough body as of any other, so no level reaches the
   * cap. Nothing physical moves, so the range is the swept one. The tables are
   * `docs/analysis/2026-09-23-attribute-measurements.md`, "Toughness".
   */
  toughness: Object.freeze({ label: "Toughness", min: 0.5, max: 2, step: 0.05, live: true }),
  /**
   * How fast an arm may be driven: every arm chain's rate limits times the stat, through
   * `withArmSpeed` -- the reach anchor's `anchorRate` (every point chain), the wrist's roll and bend
   * rates, the pitch hinge's `targetRate` and each coordinate of the anatomical arm's `RATES`. Force
   * ceilings are not touched, and neither is the stroke clock: `GOLEM_TACTICS` still times every
   * stroke at the arm it was tuned on. Session 10, 2026-09-23.
   *
   * **The bench sets the ceiling, and it is x1.5.** Node harness, `runStrokeBench` with the shipped
   * cut: peak driven tip speed, m/s, then peak anchor stray in the stroke window, mm.
   *
   *     arm speed             0.75       1.00       1.25       1.50       2.00       2.50
   *     wrist blade        14.7/32    18.1/38    21.1/39    23.6/38    23.9/38    23.9/38
   *     wrist mace         28.8/284   31.9/298   32.8/290   32.8/289   32.8/301   32.8/302
   *     skeletal blade     17.0/46    17.6/47    17.6/46    17.5/46    17.6/47    17.5/47
   *     anatomical blade    9.2/62    11.1/77    12.1/108   13.6/149   13.4/171   12.0/228
   *     pitch blade        12.4/--    15.5/--    18.4/--    19.7/--    15.5/--    12.4/--
   *
   * The committed sword shape -- the one `tests/golem-bench.test.mjs` holds under 50 mm of stray --
   * stays at 32 mm on the wrist and 16 mm on the skeletal arm at every level to x2.5, so the plan's
   * bar on its own sets no ceiling; the mace and maul are over it already at x1 and flat. What does
   * set one is a chain that stops following its command. The pitch hinge arrives at its mark at
   * 19.7 m/s at x1.5 and at 8.7 at x2, its lag 644 mm growing to 743, and the wrist blade's peak is
   * spent by x1.5. The anatomical arm is the known cost inside the range: its stray grows at every
   * level above x1, to 149 mm at x1.5, though its tip speed still rises.
   *
   * Swept against an unmodified body over 384 bouts a level (`research/stat-sweep.mjs`): stone with
   * the four probe minds, 15.5 % at x0.5, 29.2 % at x0.75, 62.4 % at x1.25, 65.0 % at x1.5 and
   * 70.3 % at x2.5; the skeleton duelist's mirror, 3.4 %, 17.4 %, 71.4 %, 77.9 % and 80.2 %. Both
   * flatten past x1.5, and on stone the share of contacts that are real blows falls from 45.8 % to
   * 41.9 % there. The tables are `docs/analysis/2026-09-23-attribute-measurements.md`, "Arm speed".
   */
  armSpeed: Object.freeze({ label: "Arm speed", min: 0.5, max: 1.5, step: 0.05, live: true }),
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

/** The carrier fields turning scales. */
interface CarrierYaw {
  readonly maxYawSpeedRadS: number;
  readonly maxYawAccelerationRadS2: number;
}

/**
 * A locomotion table with its carrier's yaw scaled by the turning stat: the fastest it may turn and
 * how hard it may start or stop a turn, together.
 *
 * The same path as `withMovement` and for the same reason -- the builder hands this one table to the
 * port, the gait and the envelope -- and the two compose, each touching only its own fields. At x1
 * the table it was handed comes back.
 *
 * **The trunk's twist is not this stat's.** `TORSO_WAIST.twistRate` turns the upper body on the
 * torso's own hinge and belongs to the torso module; a body that turns its feet faster keeps the
 * waist it had.
 */
export function withTurning<T extends { readonly carrier: CarrierYaw }>(table: T, turning: number): T {
  if (turning === 1) return table;
  const carrier = table.carrier;
  return {
    ...table,
    carrier: {
      ...carrier,
      maxYawSpeedRadS: carrier.maxYawSpeedRadS * turning,
      maxYawAccelerationRadS2: carrier.maxYawAccelerationRadS2 * turning,
    },
  };
}

/**
 * The most armour the stat can give a part: nine tenths of a blow absorbed.
 *
 * `armouredDamage` in `src/scoring.ts` refuses a fraction of 1 or more -- a part that takes nothing
 * is a part no weapon can ruin, and a bout that cannot end -- so a multiplier on a fraction needs a
 * ceiling under 1, and 0.9 is where "hard to hurt" has already become "ignores nine blows in ten".
 * It binds only where the multiplied fraction passes it: a skeleton's thrust (0.6) at x1.5, a human
 * core or head (0.5) at x1.8. Never applied at x1, so a body at the default reads its own fractions.
 */
export const ARMOUR_CAP = 0.9;

/**
 * A part's armour fraction against one kind of blow, at an armour stat: the fraction the part was
 * built with times the stat, capped at `ARMOUR_CAP`.
 *
 * Read once per blow, in `Golem.armourOf`, which is the only reader of a part's armour -- so a
 * number and a per-kind table (`ArmourByHit`) are scaled alike, since the table is answered for the
 * kind before it reaches here. A fraction of 0 stays 0 at any setting: the stat scales armour a part
 * has and gives none to a part that has none. That is the owner's rule (armour scales the armour
 * fraction), and it is why a skeleton's slap and crush and a stone core's thin 0.10 move little.
 * Equipment never reaches it: a blow on a held piece is a parry, not a wound (`Limb.guarding`).
 */
export function armourAt(fraction: number, armour: number): number {
  if (armour === 1) return fraction;
  return Math.min(ARMOUR_CAP, fraction * armour);
}

/** The keys of a table whose values are numbers: the only fields a rate can be. */
type NumberKey<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T];

/**
 * A chain's table with the named rate limits multiplied by the arm-speed stat, and nothing else
 * moved. At x1 the very table it was handed comes back.
 *
 * **The rate and not the force.** On an arm chain a commanded move is shaped by how fast its target
 * may travel, and not by the ceiling on the motor chasing it: above about 3900 N every figure of an
 * ordinary move stops changing (AGENTS.md, "On a low-axis chain the anchor's *rate limit* shapes a
 * commanded move"). So the stat is a factor on the rates alone -- the reach anchor's `anchorRate`
 * in `buildArmCore`, which every point chain is built on; the wrist's `rollRate` and `bendRate`;
 * the pitch hinge's `targetRate`; and each of the anatomical arm's `RATES`. Each chain publishes an
 * axis's `rate` off the same table, so the envelope follows. No mind reads that rate yet: a stroke
 * is still timed by `GOLEM_TACTICS` at the arm the tactics were tuned on.
 */
export function withArmSpeed<T extends object>(table: T, rates: readonly NumberKey<T>[], armSpeed: number): T {
  if (armSpeed === 1) return table;
  const next = { ...table };
  for (const key of rates) (next[key] as number) = (table[key] as number) * armSpeed;
  return next;
}

/** The fields of a biped's `Knockdown` (`src/golem/config.ts`) the recovery stat reads. */
interface LyingRule {
  readonly restSeconds: number;
  readonly maxLyingSeconds: number;
}

/**
 * A locomotion table with its knockdown's lie shortened by the recovery stat: the stillness a fall
 * must hold before it counts as finished (`restSeconds`) and the cap that ends a lie whatever the
 * body is doing (`maxLyingSeconds`), both divided. At x1, or on a table with no knockdown, the table
 * it was handed comes back.
 *
 * **Half of the stat, and the half only the body can see.** The other half -- the frozen dwell, the
 * frozen rise and every body's own rise length, the knockdown's `risePeakMps` included -- is divided
 * by the port from `recoveryScale` on the body's authority (`fallenDwellS` and `recoveredRiseS` in
 * `src/supported-locomotion-state.ts`), so it is not scaled again here. The cap is divided and
 * never removed: the range keeps it finite, and a cap is what lets a body that is struck while it
 * lies get up at all (the house rule on recovery).
 */
export function withRecovery<K extends LyingRule, T extends { readonly knockdown: K | null }>(
  table: T, recovery: number,
): T {
  if (recovery === 1 || table.knockdown === null) return table;
  const knockdown = table.knockdown;
  return {
    ...table,
    knockdown: {
      ...knockdown,
      restSeconds: knockdown.restSeconds / recovery,
      maxLyingSeconds: knockdown.maxLyingSeconds / recovery,
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
