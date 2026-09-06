// Explicit `.ts` extensions, for the reason `tactics.ts` gives. **This file imports no value that
// is not `tactics.ts`, `hands.ts` or `rng.ts`**, and those three import nothing with a scene in
// it, so a whole bout of this mind's cadence can be stepped in front of a hand-written view.
import { isShield, type Striker, type WeaponKind } from "../hands.ts";
import { mulberry32 } from "../rng.ts";
import type { DuelOption, DuelReading, MyPhase } from "./duel-model.ts";
import type { BodyView, FighterView, HandIntent, HandName, Intent } from "../mind.ts";
import type { EffectorCapability, GolemCapabilities } from "./module.ts";
import {
  GOLEM_TACTICS, STROKE_SHAPES, aimAt, angleTo, canAttack, canCover, canSwing, clamp, distance,
  freshGolemIntent, innerReach, mirror, reachForDistance, readyNatural, watch, writeAim,
  type Aim, type GolemStance, type Point, type StrokeShape, type TacticalRanges, type Threat,
} from "./tactics.ts";

/**
 * The golem's second scripted mind, `golem-fencer`: the duelist's machine with the other
 * fighter read into it.
 *
 * ## What it is, and what it is not
 *
 * **`tactics.ts` is the baseline and does not move.** Session 05 of the matchup set asked for a
 * second file started as a copy of the first, so that every gain the tournament reports is a gain
 * against something that stayed where it was measured. What is here is that copy with the copied
 * arithmetic *imported* rather than pasted: `writeAim`, `aimAt`, `reachForDistance`, `watch`, the
 * stroke shapes and the capability predicates are the duelist's own, exported from its file with
 * their behaviour untouched, because a second copy of `unspan` would be a second place for the
 * envelope rule to be wrong. The state machine is written out again, in full, because that is
 * the thing that changes.
 *
 * **It reads the same view the duelist reads and nothing more.** The frozen choice stands: an
 * opponent publishes its positions, its tip speeds, its hands' weapons and reach, and its
 * per-part health, and never its capabilities. Everything below that looks like knowledge of the
 * other fighter is inferred from those -- their stroke's phase from their arm's extension and the
 * rate at which its point approaches, their reach from `BodyView.reach`, their weakest part from
 * `BodyView.health`. A few low-passed rates are the whole of this mind's memory of the world.
 *
 * ## The eight features, each a constant in `GOLEM_TACTICS_V2`
 *
 * | # | feature | switch | what it reads |
 * |---|---|---|---|
 * | 1 | their stroke's phase | `readStroke` | their arm's extension, its rate, and `gapRate` |
 * | 2 | counter-timing | `counterTiming`, `voidDuringCommit`, `stopHit` | the phase, and reach |
 * | 3 | reach asymmetry | `reachEdge`, `closeOnRecover`, `longStandOff` | `reach` against theirs |
 * | 4 | target selection | `targetByHealth` | `opponent.health`, by slot |
 * | 5 | the ram, by matchup | `ramOnRecover` | the phase and `naturalAttacks` |
 * | 6 | the feint | `feintFraction` | the seeded stream |
 * | 7 | the two-weapon combination | `comboFraction` | the spare hand's capability |
 * | 8 | the guard against their weapon | `guardByTheirs`, `guardReachVs` | their armed hand's `weapon` |
 *
 * Every switch is a plain field on a plain object so that a harness can move it with
 * `Object.assign` -- `scripts/tournament.mjs` takes `--override name=value` for exactly this --
 * and `golemFencer` also takes the table as an argument so a test can hand it a copy with one
 * feature off without touching what every other test reads.
 *
 * ## The machine
 *
 * ```
 *   approach / measure / withdraw ───(their recover, a stop-hit, an opening, or patience)──> chamber ─> commit ─> recover
 *          │  ^                                                                                  │
 *          │  └─── their commit: hold the guard, void a step ───┐                                  │ the follow-through:
 *          │                                                    │                                  │ the spare hand's own stroke
 *          └──(a seeded fraction of chambers)──> feint ─────────┘                                  v
 *                                                                                              measure
 * ```
 *
 * The duelist's stances are all still here and keep their names, so `GolemStance` reads the
 * same in a test; `feint` is the one addition. As before, `chamber`, `commit`, `recover` and
 * `ram` run to the end once started, and the mind changes its mind only between exchanges.
 */

// ------------------------------------------------------------------------------------- the numbers

/**
 * A table whose literal types are widened, so that `Object.assign(GOLEM_TACTICS_V2, {...})`
 * from a harness and `{ ...GOLEM_TACTICS_V2, feature: false }` from a test both type-check
 * against the same shape a test reads back.
 */
type Widened<T> = {
  -readonly [K in keyof T]: T[K] extends boolean ? boolean : T[K] extends number ? number : T[K];
};

const FENCER = {
  /**
   * The duelist's whole table, copied at load. A harness that moves `GOLEM_TACTICS` after this
   * module loaded moves the duelist and not the fencer, which is the isolation a baseline needs;
   * the sword's stroke shape is the one exception, because `STROKE_SHAPES.sword` reads the
   * duelist's table live and both minds swing it.
   */
  ...GOLEM_TACTICS,

  // ---- 1. reading their stroke ----------------------------------------------------------------

  /** Whether their phase is read at all. Off, every phase is `idle` and features 2, 5 and 6 are inert. */
  readStroke: true,
  /**
   * **Their arm's phase is read from where its point is, not from how fast it is going.** The
   * plan said tip speed, and the first reader was written on tip speed, and against a real
   * duelist it read the guard as a commit seven samples in ten: a golem's blade point is 1.78 m
   * out on a solver-driven arm and its published speed sits between 5 and 20 m/s in *every*
   * stance -- median 6.9 m/s approaching, 9.8 chambering, 10.9 committing, 6.7 recovering, seed
   * 11 of the mirror cell -- so there is no threshold on it that separates anything. What does
   * separate the stances is the arm's **extension**, the point's distance from its own socket
   * as a fraction of the hand's published reach, because the duelist chambers drawn in and
   * strikes for a mark a third of the blade past the point:
   *
   * | true stance | extension p10 / p50 / p90 | its rate, 1/s | gap rate to my socket, m/s |
   * |:--|--:|--:|--:|
   * | approach | 0.72 / 0.88 / 0.91 | -1.09 / 0.04 / 0.95 | -3.2 / 0.0 / 4.6 |
   * | measure | 0.81 / 0.89 / 0.91 | -0.66 / 0.01 / 0.63 | -4.3 / 0.0 / 5.0 |
   * | chamber | 0.58 / 0.75 / 0.89 | -2.23 / -0.87 / 0.25 | -3.8 / 1.8 / 7.3 |
   * | commit | 0.45 / 0.61 / 0.76 | -2.01 / 0.30 / 2.64 | -8.1 / -2.6 / 3.4 |
   * | recover | 0.61 / 0.85 / 0.93 | -0.61 / 0.45 / 1.79 | -3.2 / -0.3 / 4.4 |
   *
   * (Seed 11, 20 s, the right duelist watching the left's primary; seed 31 reads the same to
   * the second decimal on extension and its rate, and nothing like it on tip elevation, which
   * follows the guard mark and is the other signal that was tried and dropped.) So: a commit is
   * the arm drawn under `readCommitExtension` with the point closing on my socket faster than
   * `readClosing`; a chamber is the arm drawing in faster than `readDrawRate` under
   * `readChamberExtension`, and stays one until the arm is back out past
   * `readGuardExtension`; a recover is the `readRecoverSeconds` after either; idle is the
   * rest. The extension is low-passed over `readSeconds`. Read against the true stance over
   * three seeds of the mirror cell, 60 s in all, as a fraction of each true stance's samples:
   *
   * | true stance, read as | idle | chamber | commit | recover |
   * |:--|--:|--:|--:|--:|
   * | approach | 56 % | 20 % | 2 % | 21 % |
   * | measure | 78 % | 7 % | 0 % | 15 % |
   * | chamber | 34 % | 57 % | 3 % | 6 % |
   * | commit | 1 % | 26 % | **59 %** | 14 % |
   * | recover | 2 % | 9 % | 11 % | **78 %** |
   *
   * The two cells that matter to the tactics are bolded: a commit is read as a commit or, early,
   * as the chamber it grew out of, and almost never as the guard; a recover is read as one four
   * times in five, and the fifth is the walk-in the duelist starts before its own guard is back.
   * A guard is read as a commit in one sample in fifty, which is what keeps the void from firing
   * at a golem standing still.
   */
  readSeconds: 0.05,
  readChamberExtension: 0.80,
  readDrawRate: 0.4,
  readCommitExtension: 0.72,
  readClosing: 1.0,
  readGuardExtension: 0.82,
  /**
   * Seconds after an exchange ends during which their arm is recovering.
   *
   * The duelist's own `recoverSeconds` is 0.30 and its guard is back on the line before that
   * runs out; 0.40 is that plus the limb's lag behind its command.
   */
  readRecoverSeconds: 0.40,

  // ---- 2. counter-timing ---------------------------------------------------------------------

  /** Strike into their recover: a read recover is an opening, whatever the line says. */
  counterTiming: true,
  /** Hold the guard and step off the line while their arm is committing inside its own reach. */
  voidDuringCommit: true,
  /** How hard the feet are asked back and across during a void, on the walk and strafe axes. */
  voidStep: 0.8,
  voidStrafe: 0.9,
  /** Strike the moment they close on a longer arm, from a chamber cut short. */
  stopHit: true,
  /**
   * How fast their point has to be closing on my socket for a stop-hit, m/s along the line.
   *
   * `gapRate` is negative when the point is getting nearer. A golem walking in on a biped
   * carrier closes at up to 0.8 m/s; a stroke's point closes at several. 1.2 is above the
   * walk and below any stroke, so a stop-hit meets an arm and not a step.
   */
  stopHitClosing: 1.2,
  /** Seconds the stop-hit's chamber is held, in place of the shape's own. */
  stopHitChamberSeconds: 0.08,

  // ---- 3. reach asymmetry --------------------------------------------------------------------

  /**
   * The fraction by which one reach has to exceed the other before the pair is asymmetric.
   *
   * Inside it the two arms are the same arm and the duelist's rules apply unchanged. A blade
   * on the wrist chain publishes 1.78 m and a blade on the pitch chain 1.14, a fist 0.9, a
   * whip about 2.0; 0.12 puts every one of those pairs on one side or the other and leaves
   * two wrist blades of different carriers on neither.
   */
  reachEdge: 0.12,
  /**
   * Where the longer arm stands, as a fraction of **their** reach, in place of the duelist's
   * `standOffFraction`. Just outside their point rather than exactly on it, because the
   * longer arm can afford the extra hand's breadth and the shorter one has to cross it.
   */
  longStandOff: 1.06,
  /**
   * The shorter arm closes on their recover and stays inside once in.
   *
   * The duelist floors its hold at the other body's reach, which for a shorter arm is a
   * distance it cannot strike from; it then commits from there and walks the stroke in, which
   * is a chamber spent on the way. With this on, a shorter arm holds outside until their arm
   * is read recovering -- or patience runs out -- and then goes in on the walk axis with the
   * guard up; once inside its own strike range its hold is its own fraction and it does not
   * back out to theirs again until they have got away.
   */
  closeOnRecover: true,
  /** How far outside its own strike range the shorter arm has to be pushed before it is "out" again, as a fraction of reach. */
  insideSlack: 0.25,

  // ---- 4. target selection -------------------------------------------------------------------

  /**
   * Aim the exchange at the reachable slot with the least published health, else the trunk.
   *
   * A slot is a place on a body and not a module: the keys of `BodyView.health` name the side,
   * the body and the slot before the part, and what this reads is the slot. The five it can
   * aim at are the ones the view gives a position for -- the head under `crownHeight`, the
   * trunk column at the published shoulder, each hand's socket, and the carrier under the
   * shoulder -- and a slot whose parts are all gone is not a target.
   *
   * **Off by default, on the tournament's word.** On one body both sides, 512 bouts a row, the
   * fencer took 256.5 of 512 with this on and 265 with it off, 70.5 of 134 on blades against
   * 79.5. The mechanism is not mysterious: a bout is won on the vitality bar, the trunk
   * carries most of it, and an exchange spent on the hand with the least health left is an
   * exchange not spent on the bar. It stays as a switch because a mind that wants a sever --
   * loot, in the parts bin -- wants exactly this, and Session 07 can weigh it against that.
   */
  targetByHealth: false,
  /**
   * How much less health a slot needs than the trunk before it is chosen over it.
   *
   * The trunk is where a blow does the most -- the core is fatal and every other part is not
   * -- so an arm at 0.9 is not worth turning away from a trunk at 1.0 for. Chosen once per
   * exchange, at the chamber, and held through the commit.
   */
  targetMargin: 0.15,

  // ---- 5. the ram, by matchup ----------------------------------------------------------------

  /**
   * An armed golem with a ram head charges when their arm is read recovering inside this many
   * metres beyond the plate's reach, floor gap.
   *
   * The duelist's `ramLunge` is 0.35 and inert for an armed body, because two golems hold at
   * each other's reach and never get that close; its `ramFraction` roll is made only inside
   * that gate. This is the wider gate a body may enter through when the other guard is down:
   * the charge runs for `ramSeconds` at the carrier's speed, which on a biped is about half a
   * metre, so a gate wider than that is a charge that stops short.
   */
  ramOnRecover: true,
  ramRecoverLunge: 0.6,

  // ---- 6. the feint --------------------------------------------------------------------------

  /**
   * The fraction of chambers that are feints: chambered, held, and stepped back out of.
   *
   * A feint is only worth making against an arm that is not already recovering, so the roll is
   * made only when their phase is `idle` or `chamber`. What it draws is answered by feature 2:
   * a commit into the space the feint left is voided and struck into as it recovers. Zero is
   * off.
   */
  feintFraction: 0.20,
  /** Seconds the feint's chamber is held before the step back. */
  feintHoldSeconds: 0.18,
  /** Seconds of the step back, at the walk axis's full deflection. */
  feintBackSeconds: 0.22,

  // ---- 7. the two-weapon combination ---------------------------------------------------------

  /**
   * The fraction of commits on which an armed spare hand strikes into the follow-through.
   *
   * The spare hand's stroke starts the moment the primary's cursor reaches the end of its arc,
   * from wherever the cover left it, with a chamber of its own cut short: the other arm is
   * already up. A pair of hands on one grip has no spare, and a shield is a cover and not a
   * second weapon. One is always, zero is off.
   */
  comboFraction: 1.0,
  /** Seconds the combination's chamber is held; the shape's own chamber is for a hand at rest. */
  comboChamberSeconds: 0.10,

  // ---- 8. the guard against their weapon -----------------------------------------------------

  /**
   * How far out a non-shield guard is held, by the kind of thing coming at it, in the same
   * normalised reach `guardReach` is in. The duelist holds every guard at 0.70 whatever it is
   * meeting; a blade put out to meet a maul is a blade the maul goes through. The whip and the
   * shield rows are the sword's until a sweep separates them.
   */
  // ---- 9. a director, when one is attached ------------------------------------------------

  /**
   * How often a director is asked between exchanges. Session 06 hangs the planner here: the
   * fencer publishes what it can do and what it reads, the director names an option, and the
   * fencer runs it until the next ask or until the option starts an exchange, which then runs
   * to its end as every exchange does. Six asks a second, which is the plan's 4 to 8 Hz.
   */
  replanSeconds: 0.167,

  guardByTheirs: true,
  guardReachVs: {
    sword: 0.70, axe: 0.70, bow: 0.70, shield: 0.70, buckler: 0.70,
    club: 0.10, empty: 0.40, whip: 0.70,
  } as Record<WeaponKind, number>,
};

/** Every constant the fencer has. `Widened` is why a harness can assign a number to any row. */
export type FencerTactics = Widened<typeof FENCER>;

export const GOLEM_TACTICS_V2: FencerTactics = FENCER;

// ------------------------------------------------------------------------------ reading a stroke

/** What their arm is doing, as far as its point can say. */
export type StrokePhase = "idle" | "chamber" | "commit" | "recover";

/**
 * A reader of one arm's stroke from its point's extension.
 *
 * One low-passed extension, its rate, the gap rate the mind already keeps, and a clock. It is
 * exported and takes plain numbers so a test can feed it an arm's profile with no body behind
 * it, which is how its thresholds were checked against the duelist's true stances before the
 * tournament checked what they were worth; `GOLEM_TACTICS_V2.readSeconds` has both tables.
 */
export interface StrokeReader {
  readonly phase: StrokePhase;
  /** The low-passed extension, as a fraction of the watched hand's reach. */
  readonly extension: number;
  /** Seconds since the last chamber or commit was read, or infinity. */
  readonly sinceExchange: number;
  /**
   * @param extension the point's distance from its own socket over the hand's reach, 0..1
   * @param gapRate how fast the point is getting further from my socket, m/s, low-passed
   */
  update(extension: number, gapRate: number, dt: number): StrokePhase;
}

export function strokeReader(tactics: FencerTactics = GOLEM_TACTICS_V2): StrokeReader {
  let extension = 1;
  let rate = 0;
  let last = -1;
  let phase: StrokePhase = "idle";
  let sinceExchange = Number.POSITIVE_INFINITY;
  return {
    get phase(): StrokePhase { return phase; },
    get extension(): number { return extension; },
    get sinceExchange(): number { return sinceExchange; },
    update(sample: number, gapRate: number, dt: number): StrokePhase {
      if (!tactics.readStroke) { phase = "idle"; return phase; }
      if (dt > 0) {
        const k = 1 - Math.exp(-dt / tactics.readSeconds);
        extension += (sample - extension) * k;
        if (last >= 0) rate += ((extension - last) / dt - rate) * k;
        last = extension;
        sinceExchange += dt;
      }
      const committing = extension < tactics.readCommitExtension && gapRate < -tactics.readClosing;
      const drawing = extension < tactics.readChamberExtension && rate < -tactics.readDrawRate;
      if (committing) {
        phase = "commit";
        sinceExchange = 0;
      } else if (drawing || (phase === "chamber" && extension < tactics.readGuardExtension)) {
        phase = "chamber";
        sinceExchange = 0;
      } else if (sinceExchange < tactics.readRecoverSeconds) {
        phase = "recover";
      } else {
        phase = "idle";
      }
      return phase;
    },
  };
}

// ------------------------------------------------------------------------------------ the target

/** The five places on a body the view gives a position for. */
export type TargetSlot = "trunk" | "head" | "primary" | "secondary" | "locomotion";

const TARGET_SLOTS: readonly TargetSlot[] = Object.freeze(
  ["trunk", "head", "primary", "secondary", "locomotion"],
);

/**
 * The least health of any part in each slot, read out of the published record.
 *
 * `BodyView.health` is keyed by part, `side.golem.slot.part`, and the slot is the segment
 * before the last. A key with fewer segments is a body that is not a golem and is left to the
 * trunk. The least part rather than the mean, because a blow that finishes any part of a
 * module takes the module.
 */
export function slotHealth(health: Readonly<Record<string, number>>, into: Record<TargetSlot, number>): void {
  for (const slot of TARGET_SLOTS) into[slot] = Number.POSITIVE_INFINITY;
  for (const key of Object.keys(health)) {
    const parts = key.split(".");
    if (parts.length < 2) continue;
    const slot = parts[parts.length - 2];
    if (!(slot in into)) continue;
    const fraction = health[key];
    if (fraction < into[slot as TargetSlot]) into[slot as TargetSlot] = fraction;
  }
  for (const slot of TARGET_SLOTS) {
    if (!Number.isFinite(into[slot])) into[slot] = -1;
  }
}

/** Where a slot is on the other body, from what it publishes. */
function slotMark(them: BodyView, slot: TargetSlot, into: Point): Point {
  into.x = them.ground.x;
  into.z = them.ground.z;
  switch (slot) {
    case "head":
      into.y = (them.crownHeight + them.shoulder.y) / 2;
      break;
    case "primary":
    case "secondary": {
      const hand = them.hands[slot];
      into.x = hand.shoulder.x; into.y = hand.shoulder.y; into.z = hand.shoulder.z;
      break;
    }
    case "locomotion":
      into.y = them.shoulder.y * 0.45;
      break;
    default:
      into.y = them.shoulder.y;
  }
  return into;
}

// ------------------------------------------------------------------------------------- the ranges

/**
 * The duelist's `tacticalRanges`, read from this table rather than that one, with the two
 * asymmetric rules on top: the longer arm stands a hand's breadth further out, and the shorter
 * arm that has got inside holds at its own fraction.
 */
function fencerRanges(
  reach: number, cap: EffectorCapability, theirReach: number, inside: boolean, longer: boolean,
  T: FencerTactics,
): TacticalRanges {
  const slack = reach * T.slackFraction;
  const near = innerReach(reach, cap);
  const standOff = inside ? 0
    : theirReach * (longer ? T.longStandOff : T.standOffFraction);
  const hold = Math.max(reach * T.holdFraction, near + slack, standOff);
  return Object.freeze({
    near, hold, slack,
    strike: Math.max(reach * T.strikeFraction, hold + slack),
  });
}

// ---------------------------------------------------------------------------------- the machine

export type FencerStance = GolemStance | "feint";

/** What the fencer exposes to a test and to the policy that names it. */
export interface GolemFencer {
  readonly stance: FencerStance;
  /** Their arm's phase, as read. */
  readonly phase: StrokePhase;
  /** Where the current exchange is aimed. */
  readonly target: TargetSlot;
  /** Whether the spare hand is mid-stroke. */
  readonly combo: boolean;
  /** Whether the shorter arm has closed and is holding inside. */
  readonly inside: boolean;
  /** The option in force, in the duel model's vocabulary: what the fencer is doing, as a name. */
  readonly option: DuelOption;
  /** What the fencer reads this step, for the duel model to discretise. */
  readonly reading: DuelReading;
  /** The options open this step, which is what a director chooses among. */
  readonly available: readonly DuelOption[];
  decide(view: FighterView, dt: number): Intent;
}

/**
 * A director names the fencer's next option, from the ones open, given what it reads. The
 * planner is one; a test can be another. It is asked every `replanSeconds` between exchanges
 * and once more the step an exchange ends, and never during one.
 */
export type DuelDirector = (
  available: readonly DuelOption[], reading: DuelReading, view: FighterView,
) => DuelOption;

/** One hand's stroke in flight: which hand, its shape, and its own clock. */
interface Stroke {
  hand: HandName;
  shape: StrokeShape;
  elapsed: number;
  chamberSeconds: number;
}

export function golemFencer(
  seed: number, T: FencerTactics = GOLEM_TACTICS_V2, director: DuelDirector | null = null,
): GolemFencer {
  const random = mulberry32(seed);
  const intent = freshGolemIntent();
  const reader = strokeReader(T);

  const aim: Aim = { swing: 0, lift: 0, horizontal: 0 };
  const cover: Aim = { swing: 0, lift: 0, horizontal: 0 };
  const spareAim: Aim = { swing: 0, lift: 0, horizontal: 0 };
  const probeAim: Aim = { swing: 0, lift: 0, horizontal: 0 };
  const threat: Threat = {
    tip: { x: 0, y: 0, z: 0 }, shoulder: { x: 0, y: 0, z: 0 }, tipSpeed: 0, weapon: "empty", reach: 0,
  };
  const mark: Point = { x: 0, y: 0, z: 0 };
  const guardMark: Point = { x: 0, y: 0, z: 0 };
  const probe: Point = { x: 0, y: 0, z: 0 };
  const healthBySlot: Record<TargetSlot, number> = {
    trunk: 1, head: 1, primary: 1, secondary: 1, locomotion: 1,
  };

  let attacker: HandName = "primary";
  let prefer: HandName = "primary";
  /** Which hand the exchange after this one goes to: the spare, unless the spare struck too. */
  let nextPrefer: HandName = "secondary";
  let target: TargetSlot = "trunk";

  let stance: FencerStance = "approach";
  let elapsed = 0;
  let ranged = 0;
  /** The current exchange's chamber length, which a stop-hit cuts short. */
  let chamberSeconds = 0;
  /** The spare hand's stroke, when one is in flight. */
  let combo: Stroke | null = null;
  /** The shorter arm's latch: closed in, holding at its own range. */
  let inside = false;

  let cooldown = T.cooldown + random() * 0.8;
  let sinceOpening = random() * T.patience;
  let patience = T.patience * (0.8 + random() * 0.4);
  let crowdedGrace = 0;
  let circle = random() < 0.5 ? -1 : 1;
  let circleLeft = T.circleMin + random() * (T.circleMax - T.circleMin);

  let gapRate = 0;
  let lastGap = -1;

  let ramFired = false;
  let ramFiredAt = 0;

  /** The option in force, named for the log and the model. */
  let option: DuelOption = "hold";
  /** The director's last answer, cleared when an exchange ends so the next step asks again. */
  let directed: DuelOption | null = null;
  let sinceAsk = Number.POSITIVE_INFINITY;
  const available: DuelOption[] = [];
  const reading: DuelReading = {
    gap: 0, strike: 0, slack: 0, gapRate: 0, theirWeapon: "empty", myWeapon: "empty",
    theirs: "idle", mine: "free",
  };

  const goTo = (next: FencerStance): void => {
    stance = next;
    elapsed = 0;
    ramFired = false;
    ramFiredAt = 0;
  };

  const chooseAttacker = (self: BodyView, caps: GolemCapabilities, want: HandName): HandName => {
    const other: HandName = want === "primary" ? "secondary" : "primary";
    const able = (name: HandName): boolean =>
      !self.hands[name].lost && canAttack(caps.effectors[name]);
    const armed = (name: HandName): boolean => able(name) && !isShield(self.hands[name].weapon);
    if (armed(want)) return want;
    if (armed(other)) return other;
    if (able(want)) return want;
    if (able(other)) return other;
    return self.hands[want].lost && !self.hands[other].lost ? other : want;
  };

  /** Feature 8: how far out this hand's cover is held, by what it is and what it is meeting. */
  const coverReachFor = (weapon: Striker, theirs: WeaponKind): number =>
    isShield(weapon) ? T.shieldReach : T.guardByTheirs ? T.guardReachVs[theirs] : T.guardReach;

  /**
   * Feature 4: which slot this exchange is aimed at. The trunk unless a reachable slot is
   * `targetMargin` below it; a slot at or below zero is gone and is not one.
   */
  const chooseTarget = (
    them: BodyView, socket: Point, reach: number, cap: EffectorCapability, heading: number,
    outboard: number,
  ): TargetSlot => {
    if (!T.targetByHealth) return "trunk";
    slotHealth(them.health, healthBySlot);
    let best: TargetSlot = "trunk";
    let bestHealth = healthBySlot.trunk > 0 ? healthBySlot.trunk : 1;
    for (const slot of TARGET_SLOTS) {
      if (slot === "trunk") continue;
      const health = healthBySlot[slot];
      if (health <= 0 || health >= bestHealth - T.targetMargin) continue;
      if (slot === "primary" || slot === "secondary") {
        if (them.hands[slot].lost) continue;
      }
      slotMark(them, slot, probe);
      if (distance(socket, probe) > reach) continue;
      aimAt(socket, probe, heading, outboard, probeAim);
      const shell = cap.reachable;
      if (shell && (probeAim.lift < shell.liftMin - 0.35 || probeAim.lift > shell.liftMax + 0.05)) continue;
      best = slot;
      bestHealth = health;
    }
    return best;
  };

  /**
   * One hand's stroke, written from its own clock: the chamber for `chamberSeconds`, then the
   * arc over the shape's `strokeSeconds`, then the end of the arc held. Returns true while the
   * stroke is still being driven. Used for the acting hand's commit and for the spare hand's
   * combination, which is the same stroke on a second clock.
   */
  const driveStroke = (
    hand: HandIntent, cap: EffectorCapability, me: { reach: number; outboard: number },
    at: Aim, shape: StrokeShape, stroke: Stroke, strikeReach: number,
  ): void => {
    const swept = canSwing(cap) ? 1 : 0;
    if (stroke.elapsed < stroke.chamberSeconds) {
      hand.guard = false;
      hand.thrust = false;
      writeAim(hand, cap, at, me.outboard,
        swept * shape.chamberSwing, shape.chamberLift, 1, shape.chamberReach);
      hand.roll = cap.rollMax > 0 ? clamp(shape.windRoll, -cap.rollMax, cap.rollMax) : 0;
      return;
    }
    const since = stroke.elapsed - stroke.chamberSeconds;
    const t = shape.strokeSeconds > 0 ? clamp(since / shape.strokeSeconds, 0, 1) : 1;
    hand.guard = false;
    hand.thrust = true;
    writeAim(hand, cap, at, me.outboard,
      swept * (shape.chamberSwing - t * (shape.chamberSwing + shape.followSwing)),
      shape.chamberLift - t * (shape.chamberLift + shape.followLift),
      0,
      shape.chamberReach + t * (strikeReach - shape.chamberReach));
    hand.roll = cap.rollMax > 0 ? clamp(shape.roll, -cap.rollMax, cap.rollMax) : 0;
  };

  const plan = (view: FighterView, dt: number): void => {
    const self = view.self;
    const them = view.opponent;
    const caps = self.capabilities;
    if (!caps) return;

    const trunkHeading = self.facing + self.trunkTwist * caps.trunkTwistMax;

    attacker = caps.pairedHands ? "primary" : chooseAttacker(self, caps, prefer);
    const spare: HandName = attacker === "primary" ? "secondary" : "primary";
    intent.actingHand = attacker;
    const cap = caps.effectors[attacker];
    const spareCap = caps.effectors[spare];
    const hand = intent[attacker];
    const off = intent[spare];
    const me = self.hands[attacker];
    const socket = me.shoulder;
    const shape = STROKE_SHAPES[me.weapon];
    const reach = me.reach;

    // ---- what their business end is doing, and their arm's phase (feature 1) ----------------
    watch(them, threat);
    const tipGap = distance(threat.tip, socket);
    if (lastGap >= 0 && dt > 0) {
      const rate = (tipGap - lastGap) / dt;
      gapRate += (rate - gapRate) * (1 - Math.exp(-12 * dt));
    }
    lastGap = tipGap;
    const theirs = reader.update(
      threat.reach > 0 ? distance(threat.tip, threat.shoulder) / threat.reach : 1, gapRate, dt);
    // What their armed hand holds, for the guard (feature 8): the hand being watched is the
    // faster non-shield hand, and the body's own `weapon` is the primary's.
    const theirWeapon = threat.weapon;

    // ---- the reach pair (feature 3) ---------------------------------------------------------
    const longer = reach > them.reach * (1 + T.reachEdge);
    const shorter = reach < them.reach * (1 - T.reachEdge);

    // ---- ranges ----------------------------------------------------------------------------
    const bodyGap = Math.hypot(them.ground.x - self.ground.x, them.ground.z - self.ground.z);
    const natural = readyNatural(self);
    const headfirst = natural !== null && !canAttack(cap) && !canAttack(spareCap);
    const ranges = headfirst
      ? Object.freeze({
        near: 0,
        hold: natural.reach * T.holdFraction,
        strike: natural.reach + T.ramLunge,
        slack: natural.reach * T.slackFraction,
      })
      : fencerRanges(reach, cap, them.reach, T.closeOnRecover && shorter && inside, longer, T);
    const { near, hold, strike, slack } = ranges;
    const gap = headfirst ? bodyGap : distance(socket, them.shoulder);

    // The shorter arm's latch, on its **own** strike range and not on the ranges above, which
    // are floored at the other body's reach while it is outside. Set when it has got inside,
    // cleared when it has been pushed back out by more than `insideSlack`, so a step is not an
    // exit. One step late by construction: the ranges this step were computed on the latch as
    // it stood, which is a frame at 240 Hz and not a decision.
    if (T.closeOnRecover && shorter && !headfirst) {
      const ownStrike = Math.max(reach * T.strikeFraction, near + slack * 2);
      if (!inside && gap <= ownStrike) inside = true;
      else if (inside && gap > ownStrike + reach * T.insideSlack) inside = false;
    } else {
      inside = false;
    }

    const bladeX = threat.tip.x - threat.shoulder.x;
    const bladeY = threat.tip.y - threat.shoulder.y;
    const bladeZ = threat.tip.z - threat.shoulder.z;
    const bladeLength = Math.hypot(bladeX, bladeY, bladeZ) || 1;
    const towardX = socket.x - them.shoulder.x;
    const towardY = socket.y - them.shoulder.y;
    const towardZ = socket.z - them.shoulder.z;
    const towardLength = Math.hypot(towardX, towardY, towardZ) || 1;
    const inLine =
      (bladeX * towardX + bladeY * towardY + bladeZ * towardZ) / (bladeLength * towardLength);
    const opening = inLine < T.outOfLine ||
      (threat.tipSpeed > T.theirCommit && gapRate > T.receding);
    sinceOpening = opening ? 0 : sinceOpening + dt;
    if (cooldown > 0) cooldown -= dt;
    if (crowdedGrace > 0) crowdedGrace -= dt;

    // ---- the marks -------------------------------------------------------------------------
    // The exchange's mark is the chosen slot, chosen at the chamber and held; between exchanges
    // it is the trunk, which is where the next choice starts from.
    const exchanging = stance === "chamber" || stance === "commit" || stance === "feint";
    slotMark(them, exchanging ? target : "trunk", mark);
    if (tipGap < towardLength) {
      guardMark.x = threat.tip.x; guardMark.y = threat.tip.y; guardMark.z = threat.tip.z;
    } else {
      guardMark.x = them.ground.x; guardMark.y = them.shoulder.y; guardMark.z = them.ground.z;
    }
    aimAt(socket, mark, trunkHeading, me.outboard, aim);
    const strikeReach = reachForDistance(distance(socket, mark), reach, cap, T.strikeBite);

    // ---- the feet --------------------------------------------------------------------------
    const bearing = Math.atan2(them.ground.x - self.ground.x, them.ground.z - self.ground.z);
    intent.turn = clamp(angleTo(self.facing, bearing) * T.turnGain, -1, 1);
    circleLeft -= dt;
    if (circleLeft <= 0) {
      circle = -circle;
      circleLeft = T.circleMin + random() * (T.circleMax - T.circleMin);
    }
    // Clamped like `voidStep` below and for the same reason: the locomotion port refuses a
    // strafe outside -1..1 by throwing, and a tuner's child with `strafe` at 1.05 took a class
    // run down at its fourth generation (Session 07).
    intent.strafe = clamp(circle * T.strafe, -1, 1);
    intent.forward = clamp((gap - hold) * T.closeGain, -1, 1);

    // ---- the posture -----------------------------------------------------------------------
    const chambering = stance === "chamber" || stance === "feint";
    const committing = stance === "commit";
    intent.posture.trunkTwist = chambering
      ? me.outboard * T.trunkSweep
      : committing ? -me.outboard * T.trunkSweep : 0;
    const ramming = stance === "ram";
    intent.posture.trunkLean = committing ? T.commitLean
      : ramming ? T.ramLean
      : stance === "withdraw" ? T.withdrawLean : 0;
    intent.posture.crouch = 0;
    if (cap.reachable && caps.crouchTravel > 1e-6) {
      const shortfall = (cap.reachable.liftMin - aim.lift) * aim.horizontal;
      intent.posture.crouch = clamp(shortfall / caps.crouchTravel, 0, 1);
    }

    // ---- the head --------------------------------------------------------------------------
    intent.natural.guard = !chambering && !committing;
    if (ramming && natural !== null && !ramFired && elapsed >= T.ramLeanSeconds &&
      bodyGap <= natural.reach + T.ramBite) {
      ramFired = true;
      ramFiredAt = elapsed;
    }
    intent.natural.thrust = ramming && ramFired;

    // ---- the hand that is not striking, unless it is (feature 7) ---------------------------
    if (combo !== null && !caps.pairedHands) {
      combo.elapsed += dt;
      const comboHand = combo.hand;
      const comboCap = caps.effectors[comboHand];
      const comboMe = self.hands[comboHand];
      aimAt(comboMe.shoulder, mark, trunkHeading, comboMe.outboard, spareAim);
      const comboReach = reachForDistance(distance(comboMe.shoulder, mark), comboMe.reach,
        comboCap, T.strikeBite);
      driveStroke(intent[comboHand], comboCap, comboMe, spareAim, combo.shape, combo, comboReach);
      intent[comboHand].wristBend = comboCap.bendMax > 0 ? T.cutBend : 0;
      if (combo.elapsed >= combo.chamberSeconds + combo.shape.strokeSeconds + T.followSeconds) {
        combo = null;
      }
    }
    const spareBusy = combo !== null && combo.hand === spare;
    if (!spareBusy) {
      if (!caps.pairedHands && !self.hands[spare].lost && canCover(spareCap)) {
        const spareSocket = self.hands[spare].shoulder;
        aimAt(spareSocket, guardMark, trunkHeading, self.hands[spare].outboard, cover);
        const across = isShield(self.hands[spare].weapon) ? -T.coverAcross : T.coverAcross;
        writeAim(off, spareCap, cover, self.hands[spare].outboard,
          across, T.coverLift, 1, coverReachFor(self.hands[spare].weapon, theirWeapon));
        off.roll = 0;
        off.wristBend = spareCap.bendMax > 0 ? T.coverBend : 0;
        off.thrust = false;
        off.guard = true;
      } else {
        off.pointerX = 0;
        off.pointerY = 0;
        off.reach = 0;
        off.roll = 0;
        off.wristBend = 0;
        off.thrust = false;
        off.guard = false;
      }
    }

    // ---- the exchange ----------------------------------------------------------------------
    // The acting hand's roll and bend, unless a combination is still driving it: the combo can
    // outlast the recover and the next attacker be the hand still swinging, in which case its
    // stroke finishes before this stance writes over it.
    const handBusy = combo !== null && combo.hand === attacker;
    if (!handBusy) {
      hand.roll = cap.rollMax > 0
        ? clamp(chambering ? shape.windRoll : shape.roll, -cap.rollMax, cap.rollMax) : 0;
      hand.wristBend = cap.bendMax > 0
        ? (chambering || committing ? T.cutBend : T.coverBend) : 0;
    }

    /** The guard, on the covering line, at the distance their weapon asks for. */
    const holdGuard = (): void => {
      if (handBusy) return;
      hand.guard = canCover(cap);
      hand.thrust = false;
      aimAt(socket, guardMark, trunkHeading, me.outboard, cover);
      writeAim(hand, cap, cover, me.outboard, 0, T.coverLift, 1,
        coverReachFor(me.weapon, theirWeapon));
    };

    /**
     * Enter a chamber: pick the target, roll the feint (or take the director's word for it),
     * set the chamber's length.
     */
    const enterExchange = (quick: boolean, forceFeint: boolean | null = null): void => {
      target = chooseTarget(them, socket, reach, cap, trunkHeading, me.outboard);
      chamberSeconds = quick ? Math.min(shape.chamberSeconds, T.stopHitChamberSeconds)
        : shape.chamberSeconds;
      const feint = forceFeint !== null ? forceFeint : !quick && T.feintFraction > 0 &&
        (theirs === "idle" || theirs === "chamber") && random() < T.feintFraction;
      if (feint) option = "feint";
      nextPrefer = spare;
      ranged = 0;
      goTo(feint ? "feint" : "chamber");
    };

    // ---- what the model reads (Session 06) -------------------------------------------------
    reading.gap = gap;
    reading.strike = strike;
    reading.slack = slack;
    reading.gapRate = gapRate;
    reading.theirWeapon = theirWeapon;
    reading.myWeapon = me.weapon;
    reading.theirs = theirs;
    reading.mine = stance === "recover" ? "recover"
      : stance === "approach" || stance === "measure" || stance === "withdraw" ? "free"
      : "exchange" as MyPhase;

    if (stance === "approach" || stance === "measure" || stance === "withdraw") {
      holdGuard();
      option = stance === "withdraw" ? "withdraw"
        : stance === "approach" && intent.forward > 0.3 ? "close" : "hold";

      if (stance === "withdraw") {
        intent.forward = -1;
        if (elapsed > T.withdrawSeconds || gap > near + slack) {
          if (gap < near) crowdedGrace = T.crowdedSeconds;
          ranged = 0;
          goTo("measure");
        }
        elapsed += dt;
        return;
      }

      ranged += dt;
      if (gap < near && crowdedGrace <= 0 && ranged > T.rangeDwell) {
        ranged = 0;
        goTo("withdraw");
        return;
      }
      if (stance === "approach") {
        if (gap <= hold && ranged > T.rangeDwell) { ranged = 0; goTo("measure"); }
      } else if (gap > strike + slack && ranged > T.rangeDwell) {
        ranged = 0;
        goTo("approach");
      }

      // Feature 2, the void: while their arm is committing and its point can reach me, the
      // feet go back and across and no exchange is started. A stop-hit is the exception below.
      const theyCanReach = gap <= them.reach + slack;
      const voiding = T.voidDuringCommit && theirs === "commit" && theyCanReach && !headfirst;
      if (voiding && director === null) {
        // Clamped here and not trusted from the table: a `--override voidStep=1.2` once took a
        // whole tournament down at the locomotion's door, and the envelope is this file's to keep.
        intent.forward = -clamp(T.voidStep, 0, 1);
        intent.strafe = clamp(circle * T.voidStrafe, -1, 1);
        option = "withdraw";
      }

      // Feature 3, the shorter arm's entry: it holds outside until their arm is recovering or
      // patience is gone, then walks in with the guard up. The latch above takes over once it
      // is inside, and the hold distance with it.
      if (director === null && T.closeOnRecover && shorter && !inside && !headfirst && !voiding &&
        (theirs === "recover" || sinceOpening > patience)) {
        intent.forward = 1;
        intent.strafe = 0;
        option = "close";
      }

      // The shorter arm does not commit from outside: a stroke from beyond its own reach is a
      // chamber spent walking, and its way in is the entry above.
      const handReaches = gap <= strike && canAttack(cap);
      const handCould = handReaches && !(T.closeOnRecover && shorter && !inside);
      const ramCould = natural !== null && (
        bodyGap <= natural.reach + T.ramLunge ||
        (T.ramOnRecover && theirs === "recover" && bodyGap <= natural.reach + T.ramRecoverLunge));
      // ---- a director, when one is attached (Session 06) ------------------------------------
      // The fencer's own triggers below are not consulted; the director's option is run until
      // the next ask, and an option that cannot be run this step -- a strike from out of range,
      // a ram with no head -- closes instead, which is what the fencer would do on its way to it.
      // What is open is what the body can do, not what the fencer's rules would allow: the
      // shorter arm's refusal to commit from outside the latch (feature 3) is a tactic, and a
      // director that inherited it held in range with a strike it was never offered, because the
      // fencer reads an equal arm as the shorter one and the latch is not a state the model sees.
      if (director !== null) {
        sinceAsk += dt;
        const armed = cooldown <= 0;
        available.length = 0;
        available.push("hold", "close", "withdraw", "circle");
        if (handReaches && armed) available.push("strike", "feint");
        if (handReaches) available.push("wait");
        if (ramCould && armed) available.push("ram");
        if (directed === null || sinceAsk >= T.replanSeconds || !available.includes(directed)) {
          directed = director(available, reading, view);
          sinceAsk = 0;
        }
        option = directed;
        switch (directed) {
          case "close":
            intent.forward = 1;
            intent.strafe = 0;
            break;
          case "withdraw":
            intent.forward = -clamp(T.voidStep, 0, 1);
            intent.strafe = clamp(circle * T.voidStrafe, -1, 1);
            break;
          case "circle":
            intent.forward = 0;
            intent.strafe = circle;
            break;
          case "strike":
            if (handReaches && armed) { sinceOpening = 0; enterExchange(false, false); }
            else { intent.forward = 1; intent.strafe = 0; }
            break;
          case "feint":
            if (handReaches && armed) { sinceOpening = 0; enterExchange(false, true); }
            else { intent.forward = 1; intent.strafe = 0; }
            break;
          case "wait":
            if (handReaches && armed && theirs === "recover") { sinceOpening = 0; enterExchange(false, false); }
            break;
          case "ram":
            if (ramCould && armed) { ranged = 0; goTo("ram"); }
            else { intent.forward = 1; intent.strafe = 0; }
            break;
          default:
            break;
        }
        return;
      }

      if (cooldown <= 0 && ramCould && headfirst) {
        ranged = 0;
        option = "ram";
        goTo("ram");
        return;
      }
      if (cooldown > 0) return;
      // Feature 2, the stop-hit: the longer arm strikes the moment their point closes on it.
      if (T.stopHit && longer && handCould && gapRate < -T.stopHitClosing && theirs !== "recover") {
        sinceOpening = 0;
        option = "strike";
        enterExchange(true);
        return;
      }
      if (voiding) return;
      // Feature 2, the counter: their recover is an opening whatever the line says.
      const counter = T.counterTiming && theirs === "recover";
      if ((handCould || ramCould) && (counter || opening || sinceOpening > patience)) {
        patience = T.patience * (0.8 + random() * 0.4);
        sinceOpening = 0;
        if (ramCould && (!handCould || random() < T.ramFraction)) {
          ranged = 0;
          option = "ram";
          goTo("ram");
        } else {
          option = counter ? "wait" : "strike";
          enterExchange(false);
        }
      }
      return;
    }

    elapsed += dt;

    if (stance === "ram") {
      intent.forward = 1;
      intent.strafe = 0;
      holdGuard();
      if (ramFired ? elapsed - ramFiredAt >= T.ramFollowSeconds : elapsed >= T.ramSeconds) {
        goTo("recover");
      }
      return;
    }

    if (stance === "feint") {
      // Feature 6: the chamber shown and taken away. Held for `feintHoldSeconds` exactly as a
      // chamber is, then the feet go back for `feintBackSeconds` while the arm goes to guard;
      // what it draws, the counter above answers.
      if (elapsed < T.feintHoldSeconds) {
        hand.guard = false;
        hand.thrust = false;
        writeAim(hand, cap, aim, me.outboard,
          canSwing(cap) ? shape.chamberSwing : 0, shape.chamberLift, 1, shape.chamberReach);
        return;
      }
      intent.forward = -1;
      intent.strafe = 0;
      holdGuard();
      if (elapsed >= T.feintHoldSeconds + T.feintBackSeconds) {
        cooldown = T.cooldown;
        ranged = 0;
        goTo("measure");
      }
      return;
    }

    if (stance === "chamber") {
      hand.guard = false;
      hand.thrust = false;
      writeAim(hand, cap, aim, me.outboard,
        canSwing(cap) ? shape.chamberSwing : 0, shape.chamberLift, 1, shape.chamberReach);
      if (elapsed >= chamberSeconds) goTo("commit");
      return;
    }

    if (stance === "commit") {
      const swept = canSwing(cap) ? 1 : 0;
      const t = shape.strokeSeconds > 0 ? clamp(elapsed / shape.strokeSeconds, 0, 1) : 1;
      hand.guard = false;
      hand.thrust = true;
      intent.forward = clamp(intent.forward + shape.stepIn, -1, 1);
      writeAim(hand, cap, aim, me.outboard,
        swept * (shape.chamberSwing - t * (shape.chamberSwing + shape.followSwing)),
        shape.chamberLift - t * (shape.chamberLift + shape.followLift),
        0,
        shape.chamberReach + t * (strikeReach - shape.chamberReach));
      // Feature 7: the spare hand's stroke starts as this one's arc ends.
      if (combo === null && t >= 1 && !caps.pairedHands && T.comboFraction > 0 &&
        !self.hands[spare].lost && canAttack(spareCap) && !isShield(self.hands[spare].weapon) &&
        random() < T.comboFraction) {
        combo = {
          hand: spare, shape: STROKE_SHAPES[self.hands[spare].weapon], elapsed: 0,
          chamberSeconds: T.comboChamberSeconds,
        };
        // The spare has just struck, so the next exchange is this hand's again.
        nextPrefer = attacker;
      }
      const commitEnds = Math.max(T.commitSeconds, shape.strokeSeconds + T.followSeconds);
      if (elapsed >= commitEnds) goTo("recover");
      return;
    }

    // Recover: the guard goes back up, and the exchange is over when the recover is and the
    // spare hand's stroke, if there was one, has ended.
    holdGuard();
    if (elapsed >= T.recoverSeconds && combo === null) {
      cooldown = T.cooldown;
      // A pair never takes turns; two hands do, unless the second has just had its turn.
      prefer = caps.pairedHands ? "primary" : nextPrefer;
      ranged = 0;
      directed = null;
      goTo(gap <= hold ? "measure" : "approach");
    }
  };

  return {
    get stance(): FencerStance { return stance; },
    get phase(): StrokePhase { return reader.phase; },
    get target(): TargetSlot { return target; },
    get combo(): boolean { return combo !== null; },
    get inside(): boolean { return inside; },
    get option(): DuelOption { return option; },
    get reading(): DuelReading { return reading; },
    get available(): readonly DuelOption[] { return available; },
    decide(view: FighterView, dt: number): Intent {
      plan(view, dt);
      if (view.self.capabilities?.pairedHands) mirror(intent.primary, intent.secondary);
      return intent;
    },
  };
}
