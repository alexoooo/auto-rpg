/**
 * A golem's numeric attributes: nine multipliers on the body's own tuned values.
 *
 * The plan set was `docs/plans/2026-09-23-attributes-00-overview.md` (in git at fd4285a), and the
 * argument for each stat -- which number it scales and what bounds it -- is "A first slice of
 * numeric attributes" in
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
   * level under the physical contact model (`research/stat-sweep.mjs` at 231403a, physical contact
   * session 10, Node harness, research runner; stone with the four probe minds, the skeleton
   * duelist's mirror): every level from x0.75 to x1.5 sits inside the null, stone at 47.1 % to 52.2
   * % with no paired d above 0.09, the skeleton at 45.3 % at x0.75 and 43.0 % at x1.5. The minds
   * fight in contact, where two footprints block each other and top speed binds only on the
   * approach -- the brawler asked for full speed 76.5 % of a bout and had it 24.8 % (the attributes
   * set's reading). The tables are `docs/analysis/2026-09-23-attribute-measurements.md`, "Physical
   * contact 10".
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
   * **In the duel, turning slowly costs a little and turning fast pays nothing.** Swept against an
   * unmodified body over 384 bouts a level under the physical contact model
   * (`research/stat-sweep.mjs` at 231403a, physical contact session 10, Node harness, research
   * runner; stone with the four probe minds, the skeleton duelist's mirror): stone wins 40.6 % at
   * x0.5 (paired d -0.25) and 47.8 % to 51.3 % from x0.75 to x1.5; the skeleton 40.6 % at x0.5 (d
   * -0.26) and 53.1 % at x1.5 (d 0.12). The minds commanded a full turn 3 % to 48 % of a bout and
   * sat at the cap 2 % to 26 % (the attributes set's reading), so a slower cap binds and a faster
   * one mostly does not. The range is the swept one. The tables are
   * `docs/analysis/2026-09-23-attribute-measurements.md`, "Physical contact 10".
   */
  turning: Object.freeze({ label: "Turning", min: 0.5, max: 1.5, step: 0.05, live: true }),
  /**
   * How hard the body is to knock over: a plain factor on both the stagger and the fall line of its
   * stability ledger (`stabilityScale`, formed only in `stabilityLines` in
   * `src/supported-locomotion-state.ts`), and on the rule that interrupts a rise. It moves the
   * impulse ledger and nothing else: a body that tips over its own feet is not steadier for it.
   * Session 06, 2026-09-23. Since physical contact session 08 the lines it multiplies are the
   * body's own geometry, and the table below is the frozen lines' record.
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
   * **In the duel it barely matters any more.** The lines it multiplies are the body's own since
   * physical contact session 08, and a blow seldom reaches stone's. Swept against an unmodified
   * body over 384 bouts a level under the physical contact model (`research/stat-sweep.mjs` at
   * 231403a, physical contact session 10, Node harness, research runner; stone with the four probe
   * minds, the skeleton duelist's mirror): stone wins 46.1 % at x0.5 (paired d -0.12) and 48.2 % at
   * x2, its knockdowns going from 0.63 a bout to 0.47; the skeleton 45.3 % at x0.5 and 51.3 % at x2
   * (d 0.01), falling 18.3 to 16.0 times a bout, because its falls are its stance's. The range is
   * the attributes set's. The tables are `docs/analysis/2026-09-23-attribute-measurements.md`,
   * "Physical contact 10".
   */
  stability: Object.freeze({ label: "Stability", min: 0.5, max: 2, step: 0.05, live: true }),
  /**
   * How fast a knocked-down body is back on its feet: the frozen dwell and the frozen rise divided by
   * the stat for every body (`fallenDwellS`, `risingFloorS` and `recoveredRiseS` in
   * `src/supported-locomotion-state.ts`, from `recoveryScale` on the authority), and the
   * knockdown's rest window and lying cap divided on every body (`withRecovery`; one table,
   * `KNOCKDOWN`, since physical contact session 08). It does not change how
   * often a body goes down; that is stability. Session 07, 2026-09-23.
   *
   * **The ceiling is x1.25, and since physical contact session 08 stone sets it.** Node harness,
   * whole golems (the knockdown test's pair), shoved along +x to twice the fall line along that push
   * (`stabilityLinesAlong`), three times a level; lie and rise in seconds, the pelvis's height when
   * the rise starts, and the peak limb speed against the pelvis during the rise. Re-measured at
   * 567350a, 2026-09-24:
   *
   *     recovery                   0.50   0.75   1.00   1.25   1.50        2.00
   *     stone    lie, s            2.19   2.11   2.03   1.93   1.68 (cap)  1.26 (cap)
   *              pelvis, m         0.20   0.20   0.20   0.20   0.30-0.66   0.78-0.86
   *              rise, s           2.33   1.55   1.16   0.94   0.30-0.67   0.23
   *              peak limb, m/s    1.81   2.83   3.45   4.09  14.73       10.71
   *     skeleton lie, s            1.96   1.83   1.76   1.72   1.67        1.26
   *              pelvis, m         0.10   0.10   0.10   0.10   0.10        0.45-0.54
   *              rise, s           2.53   1.68   1.27   1.01   0.85        0.32
   *              peak limb, m/s    2.36   3.54   4.66   5.71   6.90       11.61
   *
   * Stone now lies about two seconds, because since session 08 it runs the one `KNOCKDOWN` table,
   * whose rise waits for the fall to finish; it used to rise a fixed 0.35 s after it was released,
   * mid-fall. At x1.25 one lie in three
   * reaches the cap, from a finished fall; at x1.5 every lie ends on the cap, the rise begins
   * mid-fall and a limb whips at 14.7 m/s. The skeleton, which set the ceiling before, now rises
   * from a finished fall through x1.6 and would allow x1.5 on its own. So the top is still x1.25.
   * Stone above x1.25 was read with a 3 s window per shove against the 7 s used below it; every one
   * of those shoves finished inside it.
   *
   * **In the duel, lying longer costs and getting up sooner pays nothing.** Swept against an
   * unmodified body over 384 bouts a level under the physical contact model
   * (`research/stat-sweep.mjs` at 231403a, physical contact session 10, Node harness, research
   * runner; stone with the four probe minds, the skeleton duelist's mirror): stone wins 44.8 % at
   * x0.5 (paired d -0.14; down 5 % of a bout against 3 %) and 46.2 % at x1.25; the skeleton, down
   * 64 % of a bout at x1, wins 29.7 % at x0.5 (d -0.46, down 83 %) and 52.1 % at x1.25 (d -0.01).
   * The attributes set read the skeleton at 60.2 % at x1.5, outside the range, under the old
   * contact model; that level was not re-measured. The tables are
   * `docs/analysis/2026-09-23-attribute-measurements.md`, "Physical contact 10".
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
   * 384 bouts a level under the physical contact model (`research/stat-sweep.mjs` at 231403a,
   * physical contact session 10, Node harness, research runner; stone with the four probe minds,
   * the skeleton duelist's mirror): the stone default wins 46.9 % to 47.4 % at every level from
   * x0.5 to x2 (its paired d is noise over a margin that barely varies); the skeleton 35.2 % at
   * x0.5 and 94.0 % at x2 (d 1.94). The plated build read 47.8 % to 52.0 % under the old contact
   * model and was not re-measured. No level is unsafe -- nothing physical moves and the cap keeps
   * every blow landing a tenth -- so the range is the swept one; how much of it a fair fight wants
   * is a balance call, not a bench one. The tables are
   * `docs/analysis/2026-09-23-attribute-measurements.md`, "Physical contact 10".
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
   * **Its gain matches its cost.** Swept against an unmodified body over 384 bouts a level under
   * the physical contact model (`research/stat-sweep.mjs` at 231403a, physical contact session 10,
   * Node harness, research runner; stone with the four probe minds, the skeleton duelist's mirror):
   * stone wins 18.0 % at x0.5, 36.1 % at x0.75, 59.1 % at x1.25, 69.3 % at x1.5 and 83.1 % at x2
   * (paired d 1.65); the skeleton 21.1 % at x0.5 and 83.9 % at x2 (d 1.63). Nothing physical moves,
   * so the range is the swept one. The tables are
   * `docs/analysis/2026-09-23-attribute-measurements.md`, "Physical contact 10".
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
   *     anatomical blade    8.4/67    11.2/76    11.8/119   13.0/155   13.2/181   12.3/219
   *     pitch blade        12.4/--    15.5/--    18.4/--    19.7/--    15.5/--    12.4/--
   *
   * Re-measured at 567350a, 2026-09-24: every row is the same to the digit but the anatomical arm's,
   * which physical contact session 09's capability builder now drives at the orientation it holds.
   * Timed as a mind times it (`timed`), the skeletal blade rises to 21.5 m/s at x1.5 and is flat
   * after, and the other rows keep their shape.
   *
   * The committed sword shape -- the one `tests/golem-bench.test.mjs` holds under 50 mm of stray --
   * stays at 32 mm on the wrist and 16 mm on the skeletal arm at every level to x2.5, so the plan's
   * bar on its own sets no ceiling; the mace and maul are over it already at x1 and flat. What does
   * set one is a chain that stops following its command. The pitch hinge arrives at its mark at
   * 19.7 m/s at x1.5 and at 8.7 at x2, its lag 644 mm growing to 743, and the wrist blade's peak is
   * spent by x1.5. The anatomical arm is the known cost inside the range: its stray grows at every
   * level above x1, to 149 mm at x1.5, though its tip speed still rises.
   *
   * Swept against an unmodified body over 384 bouts a level under the physical contact model
   * (`research/stat-sweep.mjs` at 231403a, physical contact session 10, Node harness, research
   * runner; stone with the four probe minds, the skeleton duelist's mirror): stone wins 14.8 % at
   * x0.5, 31.0 % at x0.75, 55.5 % at x1.1, 54.7 % at x1.25 and 49.6 % at x1.5 (paired d 0.14), so
   * it peaks early; the skeleton 14.8 % at x0.5 and 66.4 % at x1.5 (d 0.40). Under the old contact
   * model, and not re-measured: the pitch-blade build was flat from x1 to x1.5 (49.3 %, 52.6 %) and
   * collapsed at x2 (20.3 %), where the hinge stops following, and the human mirror gained nothing
   * above x1. The tables are `docs/analysis/2026-09-23-attribute-measurements.md`, "Physical
   * contact 10".
   */
  armSpeed: Object.freeze({ label: "Arm speed", min: 0.5, max: 1.5, step: 0.05, live: true }),
  /**
   * How dense the body is: every body part's mass times the stat, at the same geometry, through
   * `withWeight`. Items -- every terminal, the ram's plate, the human shield -- keep their own mass.
   * The arm's joint torques follow the stat too (physical contact session 07, 2026-09-24); no other
   * force does. Session 11, 2026-09-23.
   *
   * **The bench sets the floor, and it is x0.8.** Node harness, `.review/weight-ring.mjs`: a 1 N.s
   * nudge on the terminal in the hold, settle time in seconds (2.40 is the window, so the tip never
   * settled) and direction changes, then whether the sweep-then-hold rings.
   *
   *     weight                 0.50         0.70         0.75         0.80         1.00         2.00
   *     pitch blade        2.40/48      2.40/15      1.07/31      0.77/21      0.40/18      0.10/8
   *     skeletal blade     0.40/9 grows 0.26/7 grows 0.25/7 grows 0.20/7       0.18/6       0.08/4
   *     wrist blade        0.20/6       0.14/5       0.10/4       0.10/4       0.09/4       0.05/2
   *
   * Re-measured at 567350a, 2026-09-24. Physical contact session 07's rule that the arm's torques
   * follow the stat makes the pitch hinge settle more slowly below x1 (0.52 s at x0.8 before it,
   * 0.77 after), and it still settles; the skeletal hold still grows at x0.75 and not at x0.8.
   *
   * Every chain rings less as it gets heavier and none grows at the heavy end, so the ceiling is the
   * swept x2. What rises with it is the anatomical arm's rest wander, 1.8 mm at x1 to 4.5 at x1.5,
   * and its stroke stray, 77 to 104 mm at x2. A stroke's tip speed moves by under 10 % across the
   * whole range, because every arm link's rotational inertia sits on the solver's floor at every
   * level and the rate limits shape a commanded move.
   *
   * What fells a body is linear in the stat, since its lines are its own geometry times its mass.
   * Swept against an unmodified body over 384 bouts a level under the physical contact model
   * (`research/stat-sweep.mjs` at 231403a, physical contact session 10, Node harness, research
   * runner; stone with the four probe minds, the skeleton duelist's mirror): **both bodies win by
   * it**: stone 35.2 % at x0.8 (paired d -0.38), 58.5 % at x1.1, 66.9 % at x1.25 and 79.7 % at x2
   * (d 0.81); the skeleton 43.0 % at x0.8 and 68.2 % at x2 (d 0.49), its knockdowns going from 18.1
   * a bout to 11.6. Stone's modified corner falls more often at either end than in the control
   * mirror (2.06 a bout at x0.8, about one from x1.1 up, against 0.52), which is not explained.
   * Under the attributes set's contact model neither body won by it. The tables are
   * `docs/analysis/2026-09-23-attribute-measurements.md`, "Physical contact 10".
   */
  weight: Object.freeze({ label: "Weight", min: 0.8, max: 2, step: 0.05, live: true }),
  /**
   * How big the body is: every body table at the stat by its fields' laws (`withSize` below), on the
   * biological pair at constant density -- force s^2, torque s^3, so a drive's time goes as s and a
   * fall's as its root (`SIZE_LAW_POWER`). Items keep their size, so a larger body is also a
   * relatively smaller weapon. A human is fixed at x1 (`FAMILY_FIXED_ATTRIBUTES`). Sessions 12a
   * and 12b, 2026-09-23; the biological law, skill ceiling session 01, 2026-09-25.
   *
   * **The row is x0.8 to x1.1**, and the numbers that set it are the Node bench's
   * (`research/size-bench.mjs`, release-120 at 5ac61ce, 120 Hz), stroke stray in mm, the pitch
   * hinge's worst arrival in seconds, and the stone biped's mean planted-sole slip over a two-second
   * walk against its 300 mm/s budget:
   *
   *     size              0.75    0.80    0.90    1.00    1.10    1.15    1.20    1.25    1.50
   *     wrist blade        143    83.9    69.6    48.8    41.5    41.4    41.7    41.6    67.7
   *     wrist whip        25.3    22.1    17.8    14.6    14.9    16.0    21.1    31.7     186
   *     wrist maul         223     210     238     196     135     147     170     198     251
   *     pitch arrival s   1.34   0.283   0.625   0.233   0.250   0.200   0.167   0.167   0.192
   *     biped slip         186     163     161     223     253     413     444     609     466
   *
   * **The floor is the arm, as it was.** At x0.75 the wrist blade strays three times its x1 figure
   * and the pitch hinge takes 1.34 s to arrive with 0.85 rad of overshoot, exactly as they did
   * under dynamic similarity (143.9 mm and 1.39 s at the same base). The law gives a small arm more
   * torque than it had, and also a faster command (the rate goes as 1/s where it went as the root),
   * and the item it holds does not shrink, so the small arm is no steadier than it was.
   *
   * **The ceiling is the stone biped's foot slip, and it came down from x1.25.** Its slip leaves
   * the budget between x1.1 and x1.15. Neither torque nor gravity is why: the leg torques at the
   * old s^4 read 411 mm/s at x1.2 against 444, and gravity scaled on the drive clock reads 588.
   * What moves it is `LOCOMOTION_BIPED.targetRate`, which sits five to ten per cent above a cliff at
   * x1 at 120 Hz (0.90 of it reads 685, 0.95 reads 279), and the cliff does not follow the drive
   * clock exactly: 1.05 of the sized rate brings x1.2 to 221. The arms alone would allow x1.25,
   * where every stroke is inside the bench's 50 mm or within 2.1 mm of its own x1 figure; at x1.5
   * the whip and the maul stray, as before. The skeleton's own gait is inside its budget to x1.5.
   *
   * Top speed no longer grows with size (3.2 m/s at every level). What fells a body did not move
   * with the law, because it is geometry and mass and no actuator: the bench's weakest-way fall
   * impulse on stone reads 62.1, 85.9, 117.1 and 156.9 N s at x0.8, x0.9, x1 and x1.1 under both
   * laws, about s^3 and not the s^3.5 the shove tables' `fallImpulse` law gives, because the live
   * tipping line barely moves with size (0.479 to 0.480 m/s over the row).
   *
   * **A plate on the pitch chain is refused below x1** (`golemSetupRefusal`). The board keeps its
   * size and the chest under it does not, so the board sits 23 mm inside a plated chest at x0.8.
   *
   * The stat sweep below was taken under dynamic similarity; the biological law's is in
   * `docs/analysis/2026-09-25-size-law.md`.
   *
   * Swept against an unmodified body over 384 bouts a level under the physical contact model
   * (`research/stat-sweep.mjs` at 231403a, physical contact session 10, Node harness, research
   * runner; stone with the four probe minds, the skeleton duelist's mirror): **the strongest stat
   * on stone, and both bodies win by it**: stone 10.2 % at x0.8 (paired d -1.08), 27.1 % at x0.9,
   * 69.3 % at x1.1 and 84.9 % at x1.25 (d 0.98); the skeleton 16.7 % at x0.8 and 74.7 % at x1.25 (d
   * 0.76). Under the attributes set's contact model stone lost by it above x1 (33.1 % at x1.25).
   * The tables are `docs/analysis/2026-09-23-attribute-measurements.md`, "Physical contact 10".
   */
  size: Object.freeze({ label: "Size", min: 0.8, max: 1.1, step: 0.05, live: true }),
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
  return scaledFields(table, rates, armSpeed);
}

/**
 * A body table with the named masses multiplied by the weight stat, and nothing else moved. At x1
 * the very table it was handed comes back.
 *
 * **Density at fixed geometry**, so it goes where each builder reads its own table -- the part it
 * builds, and every figure the builder derives from the same fields (the biped's `ownMassKg`, the
 * multileg's and the wheel's supported mass), then agree with the solver by construction. What a
 * blow arrives with is read off the solver at the contact (`effectiveMassAt`), so weight reaches it
 * with no rule of its own. Weight cannot go through `kg()` in `config.ts`, which runs once when
 * the config loads.
 *
 * **The arm's torques follow its mass.** The yaw, shoulder and elbow torques of the reach chain,
 * the pitch hinge's torque and the human arm's `TORQUES` go in the same list as the links' masses,
 * because an arm twice as dense with the same motors lifts less than the arm it replaced (the house
 * rule: size a force off the arm). Node lift bench, a blade under a free target 0.4 m off, most
 * upward force the reach chain held, 2026-09-24: 1938 N at x1; at size x1.25 alone 2656 N, and with
 * weight x2 besides, 1844 N with the torques fixed. Scaled, the max giant's reach blade holds 4250 N
 * where it held 781. The wrist's roll and bend torques are left alone, because what they turn is the
 * item, and the item's mass does not follow the stat. Session 11 left every force fixed; session 07
 * changed that for the arm only.
 *
 * **What is not scaled, and why.** A terminal -- blade, fist, mace, maul, plate, whip, the ram's
 * plate, the human shield -- is an item, and items will carry their own stats. The wrist's cast
 * masses follow the load they carry, so only their floors are the body's. And the solver's inertia
 * floors (`CHAIN_REACH.jointInertiaFloor`, `HUMAN_ARM_DRIVE.inertiaFloor`) are conditioning
 * for the solver rather than anatomy, so an arm link whose inertia sits on its floor gains mass and
 * no inertia. A module definition's `massKg` stays its mass at x1; its readers that feed a fight --
 * `golemUpperMassKg` and a chain's `swingInertia` in `effectorModule` -- scale the body's share
 * themselves.
 */
export function withWeight<T extends object>(table: T, masses: readonly NumberKey<T>[], weight: number): T {
  return scaledFields(table, masses, weight);
}

/** `table` with the named numeric fields multiplied by `factor`, or `table` itself at 1. */
function scaledFields<T extends object>(table: T, keys: readonly NumberKey<T>[], factor: number): T {
  if (factor === 1) return table;
  const next = { ...table };
  for (const key of keys) (next[key] as number) = (table[key] as number) * factor;
  return next;
}

/**
 * How one field of a body table changes when every length of the body is multiplied by `s`:
 * geometric similarity at constant density, **with the body's strength following biology rather
 * than dynamic similarity** (the owner's decision, 2026-09-25; skill ceiling session 01). The
 * argument, and the bench tables it moved, are `docs/analysis/2026-09-25-size-law.md`.
 *
 * **The pair everything follows from.** A muscle's force goes as its cross-section, so `force` is
 * `s^2`, and a joint's `torque`, a force on a lever, is `s^3`. Mass stays `s^3` and inertia `s^5`.
 * So a larger body is weaker for its mass by `1 / s`: it holds its own weight up with a torque of
 * `s^3` against a load of `s^4`. Until then force went as `s^3` and torque as `s^4` (dynamic
 * similarity), which made a larger body exactly as strong for its mass as a small one, and time
 * went as `sqrt(s)` everywhere, drives and gravity alike.
 *
 * **Two clocks, where there was one.** Under dynamic similarity the drives and gravity kept one time
 * scale, `sqrt(s)`, which is what made the similarity exact. Under the new pair they part:
 *
 * - **The drive clock is `s`.** An actuator turning a link through a fixed angle has an angular
 *   acceleration of torque over inertia, `s^3 / s^5 = s^-2`, so the time it takes goes as `s` and
 *   every rate it can hold as `1 / s`. A point on the link, `s` out, then moves at `s / s = s^0`:
 *   **a larger body's limbs move no faster, and turn more slowly** -- Hill's result that animals of
 *   one shape run at about one top speed whatever their size. A linear drive (a leg pushing the
 *   carrier) accelerates at force over mass, `s^2 / s^3 = s^-1`. Every rate limit, servo response,
 *   gait timing, rise and lunge in a table is on this clock: `speed`, `frequency`, `duration`,
 *   `acceleration`, `angularAcceleration`.
 * - **The fall clock is `sqrt(s)`.** What gravity alone does -- a body tipping over its base and
 *   coming to rest, and the impulse that tips it -- was never dynamic similarity's to change,
 *   because no actuator enters it: a pendulum's period goes as `sqrt(length)` whatever its
 *   muscles. Those fields keep the powers they had under their own names: `fallSpeed`,
 *   `fallDuration`, `fallImpulse`.
 *
 * The laws:
 *
 * - `one`: angles, ratios, fractions, health, armour, and anything whose value only matters by
 *   being set (a joint motor's `motorDamping`, measured to be saturated).
 * - `length`: `s`. Every metre, including a band and an offset.
 * - `perLength`: `1 / s`. A stride's radians per metre of foot travel.
 * - `mass`: `s^3`. The weight stat multiplies on top.
 * - `inertia`: `s^5`, mass times length squared: a floor stated in kg m2.
 * - `force`: `s^2`, a muscle's cross-section. No table carries one today (the reach anchor's
 *   `anchorForce` went in 2026-09-18); it is here so that the next one has its law.
 * - `torque`: `s^3`, a force on a lever. Was `s^4`, what held a pose against gravity exactly.
 * - `speed`: `s^0`, a linear rate a drive holds, m/s: a joint's rate times the lever it acts on. Was
 *   `sqrt(s)`.
 * - `frequency`: `1 / s`, an angular rate or any per-second rate a drive sets: a joint's target
 *   rate, a first-order servo response, a body's damping. Was `1 / sqrt(s)`. Damping is on the
 *   drive clock because it is there to settle the drives: at the drive's own frequency the loop
 *   keeps its damping ratio, where the fall clock would over-damp a larger body's every move.
 * - `duration`: `s`, the time a drive takes: a lunge, a ramp, a rise. Was `sqrt(s)`.
 * - `acceleration`: `1 / s`, a linear acceleration a drive can give its own mass: force over mass.
 *   Was `one` (`sqrt(s) / sqrt(s)`), and not a law of its own.
 * - `angularAcceleration`: `1 / s^2`, torque over inertia. Was `1 / s`.
 * - `fallSpeed`: `sqrt(s)`, a speed gravity sets: how fast a falling body is still coming down.
 * - `fallDuration`: `sqrt(s)`, a time gravity sets: how long a fall takes to finish and settle.
 * - `fallImpulse`: `s^3.5`, the impulse that tips a body over its base: its mass times the speed
 *   its tipping line is (`tippingLineMps` in `src/tipping.ts`, a root of `g` times a length).
 *   This was `impulse`, "a mass times a speed", when there was one kind of speed. A drive's
 *   impulse, mass times a drive speed, is `s^3`; no table carries one, so it has no law.
 */
export type SizeLaw =
  | "one" | "length" | "perLength" | "mass" | "inertia" | "force" | "torque"
  | "speed" | "frequency" | "duration" | "acceleration" | "angularAcceleration"
  | "fallSpeed" | "fallDuration" | "fallImpulse";

/** The power of `s` each law multiplies by. */
export const SIZE_LAW_POWER: Readonly<Record<SizeLaw, number>> = Object.freeze({
  one: 0, length: 1, perLength: -1, mass: 3, inertia: 5, force: 2, torque: 3,
  speed: 0, frequency: -1, duration: 1, acceleration: -1, angularAcceleration: -2,
  fallSpeed: 0.5, fallDuration: 0.5, fallImpulse: 3.5,
});

/** The fields of `T` a size law must be declared for: every number, and every nested record. */
type SizedKey<T> = { [K in keyof T]-?: NonNullable<T[K]> extends number | object ? K : never }[keyof T];
type SizeLawFor<V> = [V] extends [number] ? SizeLaw
  : [V] extends [readonly unknown[]] ? SizeLaw
  : SizeLaws<V> | "one";

/**
 * A law for every numeric field of a table, and for every nested record either the laws of its own
 * fields or `one` to carry it unchanged. **Total by type**: a table that gains a number gains a
 * compile error here until its law is written, which is the rule that a default branch is a silent
 * substitution (AGENTS.md). Strings and booleans carry across as they are.
 */
export type SizeLaws<T> = { readonly [K in SizedKey<T>]-?: SizeLawFor<NonNullable<T[K]>> };

/**
 * A body table with every length multiplied by the size stat and every other field by its law, or
 * the very table it was handed at x1. Session 12, 2026-09-23.
 *
 * The type makes a missing law a compile error; this makes it a refusal at build as well, for a
 * table reached through a cast or a spread the type did not follow, and it refuses a law that names
 * a field the table does not have, which is a law that has drifted from its table.
 */
export function withSize<T extends object>(table: T, laws: SizeLaws<T>, size: number): T {
  if (size === 1) return table;
  return scaleByLaws(table, laws as unknown as Record<string, unknown>, size, "") as T;
}

function scaleByLaws(table: object, laws: Record<string, unknown>, size: number, path: string): object {
  const next: Record<string, unknown> = { ...(table as Record<string, unknown>) };
  for (const key of Object.keys(laws)) {
    if (!(key in table)) throw new Error(`a size law names ${path}${key}, which the table does not have`);
  }
  for (const [key, value] of Object.entries(table)) {
    const law = laws[key];
    if (typeof value === "number") {
      if (typeof law !== "string") throw new Error(`no size law for ${path}${key}`);
      next[key] = value * Math.pow(size, SIZE_LAW_POWER[law as SizeLaw]);
    } else if (Array.isArray(value)) {
      if (typeof law !== "string") throw new Error(`no size law for ${path}${key}`);
      if (law !== "one") {
        next[key] = value.map((item) => {
          if (typeof item !== "number") throw new Error(`${path}${key} scales by ${law} and holds a non-number`);
          return item * Math.pow(size, SIZE_LAW_POWER[law as SizeLaw]);
        });
      }
    } else if (value !== null && typeof value === "object") {
      if (law === "one") continue;
      if (law === null || typeof law !== "object") throw new Error(`no size law for ${path}${key}`);
      next[key] = scaleByLaws(value, law as Record<string, unknown>, size, `${path}${key}.`);
    }
  }
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
 * body is doing (`maxLyingSeconds`), both divided. At x1 the table it was handed comes back.
 *
 * **Half of the stat, and the half only the body can see.** The other half -- the frozen dwell, the
 * frozen rise and every body's own rise length, the knockdown's `risePeakMps` included -- is divided
 * by the port from `recoveryScale` on the body's authority (`fallenDwellS` and `recoveredRiseS` in
 * `src/supported-locomotion-state.ts`), so it is not scaled again here. The cap is divided and
 * never removed: the range keeps it finite, and a cap is what lets a body that is struck while it
 * lies get up at all (the house rule on recovery).
 */
export function withRecovery<K extends LyingRule, T extends { readonly knockdown: K }>(
  table: T, recovery: number,
): T {
  if (recovery === 1) return table;
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
