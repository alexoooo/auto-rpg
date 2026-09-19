import { mulberry32 } from "../../rng.ts";
import { clamp } from "../tactics.ts";
import type { Pilot, PilotHook } from "../pilot.ts";
import { watchedPilot } from "../pilot.ts";
import {
  COMMAND_RANGES, GOLEM_TACTICS_V4, freshCommand, golemDriven,
  type DrivenTactics, type GolemDriven, type StyleCommand,
} from "../tactics-v4.ts";

/**
 * `golem-reaper`: the first rung of the ladder, and a mind with one idea.
 *
 *
 * **Where in its own swing the blade lands is not a distance the mind can choose.** This one is
 * worth the most words, because the gradient behind it is the largest in the file and it still
 * does not cash. Tracing every cut against its own blade's speed trace -- 1689 cuts for this mind,
 * 1328 for `golem-planner`, 1278 for `golem-duelist`, all on the same gauntlet -- says that what a
 * cut is worth is almost entirely *how far through its arc the blade was when it touched*:
 *
 * ```
 * fraction of that stroke's peak   share   dmg/cut   contact speed   gap at contact
 *   0.00 .. 0.40                   37.5 %   0.2596       7.38 m/s        1.43 m
 *   0.40 .. 0.60                   35.1 %   0.4899      11.74            1.45
 *   0.60 .. 0.80                   15.2 %   0.7064      15.55            1.47
 *   0.80 .. 0.95                    7.9 %   0.9074      18.20            2.01
 *   0.95 .. 1.01                    4.4 %   0.5860      20.90            2.43
 * ```
 *
 * Four to one across the axis, and every mind measured spends about a third of its cuts in the
 * dead band. The gap column reads like a lever -- the cuts that land fast are the ones that
 * touched from furthest away, and this mind stands 1.535 m from its opponent at contact where the
 * two 55 % minds stand 1.72 and 1.73. **It is not a lever, and the reading that it was is
 * retracted.** Two gates were built to test it and both are gone from the file again: a floor on
 * the patience throw, so a stroke is never opened from inside the window, and a knob on the
 * advance held during the stroke, so the body stops closing while the arc builds.
 *
 * ```
 * throwFloor  score  frac  dead %   gap     strokeAdvance  score  frac  dead %   gap
 *   0.85      49.0   0.497  37.5   1.55        1.0 (ship)  45.8   0.500  38.2   1.54
 *   0.70      46.9   0.503  38.1   1.55        0.5         38.5   0.503  39.1   1.62
 *   0.55      39.6   0.497  38.8   1.54        0.0         34.4   0.503  39.2   1.72
 *   0.00      45.8   0.500  38.2   1.54       -0.4         40.6   0.482  44.0   1.76
 * ```
 *
 * The floor moves the fraction by 0.006 across its whole range, which is nothing. The advance does
 * move the gap, 1.54 out to 1.76, and the fraction goes the *wrong way* while it does -- 0.500 to
 * 0.482, with the dead band growing from 38.2 % to 44.0 % -- so backing the body off buys slower
 * cuts, not faster ones. The causation in the first table runs the other way: a blade lands far
 * out *because* it reached full extension before it touched anything, and standing further away
 * does not reproduce that, it only makes the blade arrive at a body that is no longer there. The
 * dead band is not made of badly-timed commits either; at 7.4 m/s it is mostly the blade brushing
 * a body it was not thrown at, which no gate on committing can reach.
 *
 * ## The measurement it is built on
 *
 * 320 bouts among the five best minds at the shipped operating point, every contact logged. What
 * a bout is decided by is not close:
 *
 * ```
 * kind      count   share    dmg each   speed  closing   edge   blade  severs
 * cut        7254    8.5%    0.5557   11.76     6.62  0.837   0.185     303
 * slap      11300   13.2%    0.0180    5.27     2.82  0.450   0.376       0
 * crush      1106    1.3%    0.1804    8.51     6.05  0.493   0.398       0
 * thrust      187    0.2%    0.1370    7.27     4.90  0.344   0.657       0
 * weak      65928   76.9%    0.0000    2.90     0.80  0.228   0.313       0
 * ```
 *
 * Eight and a half percent of contacts carry ninety percent of the damage, and they are all one
 * kind. Three quarters of everything that touches is a blade resting on a body at 2.9 m/s and
 * scoring nothing at all. So a mind is its cuts, and nothing else it does shows up in a bar.
 *
 * **And a cut is its speed.** Pooled over every cut in those bouts:
 *
 * ```
 * cut speed    n      dmg each   edge   sever %
 *   0..6      663      0.1656  0.795      1.8
 *   6..8     1274      0.2271  0.795      4.0
 *   8..10    1126      0.3507  0.818      3.1
 *  10..12    1018      0.4700  0.839      3.4
 *  12..14     891      0.6116  0.865      2.5
 *  14..16     901      0.6557  0.881      2.4
 *  16..18     598      0.8534  0.873      4.0
 *  18..22     572      1.2891  0.874     11.7
 *  22..       211      1.7789  0.815     16.6
 * ```
 *
 * A factor of **ten and a half** in damage and **nine** in the chance of taking a limb off, across
 * a range the arm can actually reach. Edge alignment is worth a further 2.27x inside a fixed speed
 * band -- 0.295 at 0.50..0.70 against 0.671 at 0.95..1.00, over the 10..14 m/s cuts -- but the
 * shipped bodies already hold 0.84 of it, so there is little left on that row and a great deal
 * left on the one above.
 *
 * ## What the four best minds have in common, which is the opening
 *
 * ```
 * mind              score   cuts/bout  cut m/s  dmg/cut   edge   weak/bout  severs  peak  dmg/bout
 * golem-planner      57.8       12.9    11.75   0.5682  0.838         98    0.56  20.7      8.05
 * golem-duelist      57.8       12.5    12.10   0.5832  0.841        103    0.62  19.7      7.93
 * golem-champion     57.0       13.4    11.87   0.5888  0.846         57    0.54  21.5      8.77
 * golem-fencer       50.8       11.8    11.82   0.5805  0.842        104    0.50  20.6      7.47
 * golem-tactician    26.6        6.1    10.69   0.3528  0.802        153    0.15  14.0      2.62
 * ```
 *
 * The four that win are **identical in the quality of a cut** -- 11.75 to 12.10 m/s, 0.568 to
 * 0.589 of a bar, 0.838 to 0.846 of edge -- and differ only in how many they throw. Four minds
 * written by four different arguments have converged on one stroke and then competed on
 * throughput. `golem-tactician` is bad for the same reason read backwards: half the cuts, and
 * worse ones.
 *
 * **But their blades peak at 20.6 to 21.5 m/s and their cuts land at 11.8.** Every one of them is
 * meeting the body at a little over half the speed its own arm reaches, which by the table above
 * is the difference between 0.47 of a bar and 1.29. Nobody is fighting for the right-hand end of
 * that table, and the whole of this mind is the attempt to.
 *
 * ## The things tried, and retracted
 *
 * All of them are written down because they were measured and because the next rung should not pay
 * for them again.
 *
 * **The radius the blade meets at does not set the speed.** `bite` says where along the terminal
 * the mark is crossed and `reach` how far out the hand holds it, and between them they set the
 * lever arm, so the arithmetic says contact speed should follow. 768 bouts against the gauntlet,
 * the driver's own pilot with those two axes overwritten:
 *
 * ```
 * bite    cut m/s      reach   cut m/s
 *  0.00    11.07       -0.50    11.18
 *  0.20    11.17        0.00    11.33
 *  0.33    11.29        0.50    11.33
 *  0.50    11.38        1.00    11.29
 *  0.66    11.34
 *  0.85    11.43
 * ```
 *
 * Three tenths of a metre a second across the whole of both axes, against the three-fold spread
 * the speed table offers. The arc is the anchor's, not the wrist's, and the lever arm is not the
 * lever.
 *
 * **Leading the target does not either.** A committed cut is 0.32 s of chamber and 0.20 s of
 * stroke, so a mind could aim at where the gap *will* be rather than where it is. 619 of the
 * driver's cuts attributed to the ask that threw them, bucketed by the gap at that ask over the
 * strike range then in force, gave 10.2 to 13.6 m/s across every bucket from 0.6 to 1.5 with no
 * trend in it. The same log says why the idea was worth less than it looked: **373 of the 619
 * landed inside 0.35 s of the commit** -- they are the wind-up hitting on its way back, not the
 * arc arriving -- and those carry 0.465 of a bar against the arc's 0.556 and sever almost never.
 */
const REAPER_TABLE = {
  ...GOLEM_TACTICS_V4,
  /** Where the feet want to be between strokes, as a multiple of their reach. */
  standOffFraction: 1.06,
  /**
   * The throwing window, as a fraction of the furthest a committed cut can be started from.
   *
   * This is the mind's one idea. Every other style opens a cut the moment the mark is inside
   * `strike + cutReachMetres` and takes whatever speed the arc happens to have arrived with; this
   * one refuses the near part of that window and holds the range until the far part comes back.
   */
  openFloor: 0.80,
  openCeiling: 1.00,
  /**
   * Where inside that window the feet are asked to stand, and the correction the first draft
   * needed.
   *
   * That draft kept the window and the stand-off as two independent distances: the feet were sent
   * to `theirReach * standOffFraction` the way every other style sends them, and a separate rule
   * asked for a small `advance` whenever the gap was outside the window. **It threw nothing at
   * all** -- 98 asks, 0 strokes, beaten in 8.2 s -- because the stand-off held the body where the
   * stand-off wanted it and the advance was a fraction of a normalised excess, so a body parked at
   * 1.05 of the window asked for five hundredths of a step and stayed there for the whole bout.
   *
   * Two distances that disagree is not a gain to tune, it is one distance written twice. So the
   * window *is* the stand-off: the feet are commanded to `far * openHold`, the executor's own
   * `closeGain` walks them there, and `advance` goes back to meaning the step-in and the void.
   */
  openHold: 0.90,
  /** How much further out than the strike range this mind will open one, metres. */
  openReachMetres: 0.30,
  /**
   * Seconds of nothing happening before it opens one anyway, wherever it is standing.
   *
   * The third correction, and the largest of the three. `golem-form` ships 2.2 and says so with
   * intent -- "roughly a stroke every two and a half seconds, which is a sixth of what the duelist
   * throws and is the whole point of it" -- and the first draft inherited it along with the rest of
   * the rule order. Against the gauntlet that is most of what was wrong.
   *
   * **Both tables this row was first set on are withdrawn.** They were taken by a probe that
   * built the mind itself and seeded it from `job.seed` on *both* sides, where `runBout` seeds a
   * right-side mind from `seeds[1]`; so on the right the reaper ran on its opponent's own
   * `mulberry32` stream. The correlation was worth twenty to thirty points on that side alone, and
   * every absolute number in those tables is wrong. The first also picked the maximum of a
   * six-cell sweep at 96 bouts a cell, where the band is about +/-10 points and the expected
   * maximum sits above the truth even when every cell is identical -- it read 59.4 at 0.35 against
   * neighbours at 36.5 and 29.7, and 0.35 is not a peak.
   *
   * Re-taken with the seeding fixed, 256 bouts a cell, both sides, the four-mind gauntlet:
   *
   * ```
   * patience   score      95 % band      left  right  dealt  taken
   *   0.45      47.7    [41.5..53.8]     42.2   53.1   8.35   8.36
   *   0.90      31.6    [25.5..37.8]     26.6   36.7   7.33   9.66
   *   1.40      27.7    [21.6..33.9]     25.0   30.5   7.13  10.15
   *   2.20      27.0    [20.8..33.1]     25.0   28.9   6.46  10.06
   * ```
   *
   * The slope is the part that survived, and it is worth more than the peak ever was: twenty
   * points across the axis, monotone in `score`, in `dealt` and in `taken` together, and moving on
   * **both** sides -- which is the signature that separates a real effect from the seed leak,
   * since the leak moves one side and leaves the other byte-identical. `golem-form` ships 2.2 and
   * says so with intent -- "roughly a stroke every two and a half seconds, which is a sixth of
   * what the duelist throws and is the whole point of it" -- and the first draft inherited it
   * along with the rest of the rule order. Against the gauntlet that is most of what was wrong: a
   * style that throws a sixth of what a duelist throws is a style that loses, and it loses at both
   * ends at once, dealing 6.46 where the aggressive row deals 8.35 and taking 10.06 where it takes
   * 8.36.
   *
   * This row is 0.35 rather than the swept 0.45 because the band below 0.45 is flat -- the older
   * pass, wrong in level but taken at a single count across its own cells, read 0.25 through 0.50
   * within three points of each other -- and 0.35 sits in the middle of it. It is a flat band's
   * middle, not a peak, and nothing here claims otherwise.
   */
  patience: 0.35,
  /**
   * Where up their body the cut is aimed, as a fraction of their rise: 0 the floor they stand on,
   * 1 the crown of their head. Null aims at the trunk mark every other style aims at, which is
   * their shoulder height.
   *
   * The row exists because the contact log says the trunk mark is not the best place to put a
   * blade. Cuts only, pooled over the 320 diagnostic bouts, by the part they landed on:
   *
   * ```
   * where a cut lands            n   dmg each   m/s   severs   share of cut damage
   * legs.pelvis               1039     0.8190  12.0       14       21.1 %
   * trunk.core                1176     0.6740  12.3       10       19.7 %
   * primary.blade             1574     0.4329  11.7      173       16.9 %
   * secondary.forearm          603     0.5071  11.4       29        7.6 %
   * head.head                  465     0.5699  11.9       12        6.6 %
   * legs.thighL                309     0.7137  12.7       11        5.5 %
   * ```
   *
   * The pelvis is worth 1.22x the trunk and 1.89x their blade at the same speed, and a quarter of
   * every cut thrown in those bouts went into their blade instead -- which is a parry, and is the
   * cheapest contact on the board.
   *
   * **And the row ships null, because aiming there is worse.** 768 bouts, both sides, the gauntlet:
   *
   * ```
   * markHeight   score          strokes  cuts  cut m/s  dmg/cut  severs  dealt  taken  seconds
   *   0.35     21.9 [14.7..29.1]   11.2  10.4    11.46   0.4340    0.11   7.09  10.25     15.1
   *   0.45     31.3 [23.2..39.3]    9.8  10.6    11.52   0.4715    0.20   7.25   9.44     13.2
   *   0.55     45.3 [36.7..54.0]    9.4  12.1    11.61   0.4963    0.33   8.21   8.97     12.6
   *   0.65     37.5 [29.1..45.9]    9.2  12.4    11.62   0.4930    0.19   8.17   9.45     12.2
   *   0.75     40.6 [32.1..49.2]    9.0  11.7    11.87   0.5165    0.27   7.95   9.03     12.1
   * **trunk**  56.3 [47.6..64.9]    9.0  12.7    11.85   0.5156    0.31   8.65   8.16     12.0
   * ```
   *
   * The per-part table was confounded and this is what it was confounded by: a cut aimed low is a
   * *different cut*, not the same cut landing lower. At 0.35 the mind throws 11.2 strokes to land
   * 10.4 cuts at 0.434 of a bar, against 9.0 strokes landing 12.7 at 0.516 from the trunk mark --
   * more swinging, fewer connections, and each one worth a fifth less. The pelvis is worth more
   * *when a cut arrives there*; aiming at it is how you stop cuts arriving.
   *
   * The row stays because the sweep is the claim and a reader who has the same idea should be able
   * to see it priced. It is the only row here that ships at its control value.
   */
  markHeight: null as number | null,
  /** The fraction of its idle time spent circling rather than standing. */
  circleDuty: 0.40,
  /** Whether their point is met with the spare hand or only stepped away from. */
  parryOnCommit: true,
  /**
   * Whether the spare hand covers the whole time there is something to cover, or only at the
   * instant their arm commits. On, and this is the second correction the first draft needed.
   *
   * `formDirector` parries under `reading.theirs === "commit"` and `golem-driver` transcribes that
   * gate faithfully, so the first draft carried it too. **It is the wrong gate on this executor**,
   * and the reason is a difference between the two executors rather than between the two minds.
   * v3's parry is an *option*: naming it once latches the spare hand there and the executor
   * releases it `readRecoverSeconds` after their arm stops, so a single coincidence of a committed
   * arm and a solved crossing buys a parry that lasts. v4's parry is an *axis*, re-read at every
   * ask, so the same coincidence has to recur twelve times a second or the hand comes back.
   *
   * 96 bouts against the gauntlet, 303,808 samples of the mind's own reading, and the gate costs
   * almost exactly everything:
   *
   * ```
   * the spare hand can cover                     77.3 % of samples
   * a crossing is solved for it to go to         22.8 %
   * their arm is committing                       1.0 %   with a crossing   0.3 %
   * their arm is chambering                       5.4 %   with a crossing   0.9 %
   * my own arm is free                           64.5 %   with a crossing  14.4 %
   * the spare hand is actually parrying           0.2 %
   * ```
   *
   * Their commit is a tenth of a second at a time and a hundredth of the bout; waiting for it to
   * coincide with a solved crossing is waiting for three thousandths. Meanwhile the cover is
   * available on nearly a quarter of every bout and the mind takes a five-hundredth of it -- and
   * **66.1 % of all the damage it takes lands while its own arm is free**, which is the same fact
   * read from the other end. The spare hand's only other job is a passive guard, so holding the
   * parry whenever there is one to hold costs the acting hand nothing at all.
   *
   * **What this row does not buy is score, and the claim that it did is retracted.** Switched off
   * against on, 512 bouts a side, both sides, seeding correct: **41.0 off, 40.6 on**. That is one
   * cell of noise apart on an axis where the band is about +/-4 points, so the honest reading is
   * no effect rather than a small one. The behaviour is real and is pinned by a test --
   * `tests/tactics-v4.test.mjs` measures the mind covering 33.8 to 53.7 % of the crossings it is
   * offered against `golem-driver`'s 0.0 to 4.5 % -- and the gate above genuinely is the wrong
   * gate for this executor. Both of those survive. What does not survive is the inference that
   * covering more must therefore win more: the damage it takes is dominated by blows its spare
   * hand was never going to reach, and the ledger says so directly, since the mind's deficit sits
   * in what its own cuts are worth rather than in what it fails to block. The row stays on because
   * it costs nothing and is the behaviour the style is named for, not because it earns a point.
   */
  parryWhenever: true,
};

/** Every constant this mind has: the fourth executor's table with this mind's rows over it. */
export type ReaperTactics = DrivenTactics & {
  openFloor: number;
  openCeiling: number;
  openHold: number;
  openReachMetres: number;
  markHeight: number | null;
  circleDuty: number;
  parryOnCommit: boolean;
  parryWhenever: boolean;
};

export const REAPER: ReaperTactics = REAPER_TABLE;

/**
 * The mind: hold the range a cut is fast from, and throw only from inside it.
 *
 * The order of the rules is `golem-form`'s and `golem-driver`'s, because that order has been
 * measured four times and this mind is not an argument about it. What is new is the rule that
 * comes before the circle, which the other two do not have at all: when nothing is happening the
 * feet do not orbit idly, they walk the gap back into the throwing window, so that the next
 * opening is taken from the range the speed table wants rather than from wherever the last
 * exchange happened to leave the body.
 */
export function reaperPilot(seed: number, T: ReaperTactics = REAPER): Pilot {
  const random = mulberry32(seed);
  const command = freshCommand();

  let opened = 0;
  let patience = T.patience * (0.8 + random() * 0.4);
  let circling = true;
  let phaseUntil = Number.NEGATIVE_INFINITY;
  let strokeHeight = 0.5;
  let feinting = false;

  return (reading, view): StyleCommand => {
    const them = view.opponent;
    const clock = view.clock;
    const rise = them.crownHeight - them.ground.y;
    const trunk = rise > 1e-6 ? clamp((them.shoulder.y - them.ground.y) / rise, 0, 1) : 0.5;
    const trunkHeight = T.markHeight === null ? trunk : clamp(T.markHeight, 0, 1);

    /** The throwing window in metres, and where in it the body is standing. */
    const far = reading.strike + (reading.headfirst ? 0 : T.openReachMetres);
    const where = far > 1e-6 ? reading.gap / far : 0;

    // The window is the stand-off, which is the whole of this mind: the feet are sent to the
    // range a cut is fast from and the executor's `closeGain` keeps them there. The floor is the
    // driver's -- a body may not ask to stand inside its own shell -- and nothing else is.
    const wantHold = reading.headfirst
      ? reading.myReach * T.holdFraction
      : Math.max(reading.near + reading.slack, far * T.openHold);
    command.standOff = reading.theirReach > 1e-3
      ? Math.min(COMMAND_RANGES.standOff[1], wantHold / reading.theirReach)
      : COMMAND_RANGES.standOff[1];
    command.reach = T.guardReach;
    command.strafe = 0;
    command.lean = 0;
    command.advance = 0;
    command.targetHeight = trunkHeight;
    command.targetLateral = 0;
    command.swing = 1;
    command.bite = T.strikeBite;
    command.commit = 0;
    command.abort = 0;

    // The spare hand's standing posture, written before any rule runs and left alone by all of
    // them: cover whenever there is a crossing to cover. Every branch below returns `command`
    // without touching this, so a parry no longer depends on which rule the ask happened to take.
    const meets = T.parryOnCommit && reading.spareCanCover && reading.intercept !== null;
    command.parry = T.parryWhenever && meets ? 1 : 0;
    const threatening = reading.theirs === "commit"
      && reading.gap <= reading.theirReach + reading.slack;

    // ---- a stroke in flight: it was opened as a committed cut and it stays one --------------
    if (reading.mine === "exchange") {
      command.targetHeight = strokeHeight;
      command.lean = T.cutLean;
      command.advance = 1;
      if (feinting && reading.mineSeconds >= T.feintHoldSeconds) {
        command.abort = 1;
        feinting = false;
      }
      if (threatening && meets) {
        command.parry = 1;
        command.abort = 1;
        feinting = false;
      }
      return command;
    }

    // ---- rule one: meet their point, or step off its line -----------------------------------
    if (threatening) {
      if (meets) {
        command.parry = 1;
        return command;
      }
      command.advance = -clamp(T.voidStep, 0, 1);
      command.strafe = clamp(reading.voidAxis * T.voidStrafe, -1, 1);
      command.lean = T.withdrawLean;
      return command;
    }

    const open = (height: number): StyleCommand => {
      opened = clock;
      patience = T.patience * (0.8 + random() * 0.4);
      strokeHeight = height;
      feinting = random() < T.feintFraction;
      command.targetHeight = height;
      command.swing = 1;
      command.bite = T.strikeBite;
      command.lean = T.cutLean;
      command.advance = 1;
      command.commit = 1;
      return command;
    };

    const inWindow = where >= T.openFloor && where <= T.openCeiling;

    // ---- rule two: their arm on its way back, taken only from inside the window -------------
    if (reading.armed && inWindow && reading.theirs === "recover") return open(trunkHeight);

    // ---- rule three: patience, which throws from anywhere it can reach ----------------------
    if (reading.armed && clock - opened > patience && where <= T.openCeiling) {
      return open(trunkHeight);
    }

    // ---- the circle, for the fraction of the time this style circles ------------------------
    if (clock >= phaseUntil) {
      circling = !circling;
      const span = circling ? T.circleSeconds : T.circleSeconds * (1 - T.circleDuty) / T.circleDuty;
      phaseUntil = clock + span * (0.6 + random() * 0.8);
    }
    if (circling) command.strafe = clamp(reading.circleSide * T.circleStrafe, -1, 1);
    return command;
  };
}

/** The mind over the executor, with an optional hook on the ask for a command log. */
export function golemReaper(
  seed: number, T: ReaperTactics = REAPER, onAsk: PilotHook | null = null,
): GolemDriven {
  const pilot = reaperPilot(seed, T);
  return golemDriven(seed, T, onAsk === null ? pilot : watchedPilot(pilot, onAsk));
}
