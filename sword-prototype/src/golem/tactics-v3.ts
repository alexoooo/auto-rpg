// Explicit `.ts` extensions, for the reason `tactics.ts` gives. **This file imports no value that
// is not `tactics.ts`, `tactics-v2.ts`, `hands.ts` or `rng.ts`**, and none of those has a scene in
// it, so a whole bout of this mind's cadence can be stepped in front of a hand-written view.
import { hasPoint, isShield, type Striker, type WeaponKind } from "../hands.ts";
import { mulberry32 } from "../rng.ts";
import type { DuelReading, MyPhase } from "./duel-model.ts";
import type { BodyView, FighterView, HandIntent, HandName, Intent } from "../mind.ts";
import type { EffectorCapability, GolemCapabilities } from "./module.ts";
import {
  STROKE_SHAPES, aimAt, angleTo, canAttack, canCover, canSwing, clamp, distance,
  freshGolemIntent, innerReach, mirror, reachForDistance, readyNatural, watch, writeAim,
  type Aim, type Point, type StrokeShape, type TacticalRanges, type Threat,
} from "./tactics.ts";
import {
  GOLEM_TACTICS_V2, slotHealth, strokeReader, type StrokePhase, type TargetSlot,
} from "./tactics-v2.ts";

/**
 * The golem's third executor: a body that does what it is told, and decides nothing.
 *
 * ## Why a third file and not an edit of the second
 *
 * `tactics-v2.ts` is frozen. Four shipped minds -- `golem-fencer`, `golem-planner`,
 * `golem-champion` and `golem-neural` -- are that executor with a different director on it, and
 * two of the four carry checked-in artifacts keyed to its eight-option vocabulary: a champion row
 * names an option, and `NEURAL_LAYOUT.outputs` is eight wide and refused on load if it is not. So
 * a fifteen-option executor cannot be v2 with more options; it has to be a second one, and every
 * rating this set reports is earned against a mind that did not move underneath it. The arithmetic
 * that turns a mark into a hand command -- `writeAim`, `aimAt`, `reachForDistance`, `watch`, the
 * capability predicates -- is imported from `tactics.ts` exactly as v2 imports it, because a third
 * copy of the envelope rule would be a third place for it to be wrong. `GOLEM_TACTICS` itself is
 * not: the table here is built on v2's, which is already the duelist's table copied at load, and
 * a second import of the same numbers under a second name would be two tables to keep honest. The state machine is
 * written out again, in full, because that is the thing that changes.
 *
 * ## The one rule this file is built on: no reflexes
 *
 * v2 has seven behaviours that fire without being asked -- the void on a read commit, the
 * stop-hit, the counter into a recover, patience, the shorter arm's close-on-recover, the feint
 * roll and the ram roll. Each is a good tactic and each is *the executor's* tactic, which is why a
 * director attached to v2 had to be handed `available` with those tactics already applied and
 * still found itself overruled: the fencer voids while its director is asking for a strike.
 * Here, every one of them is a director's rule. What this file decides is what a body can be
 * asked for this step, and nothing else. `golemStyled` refuses a null director rather than
 * providing a default one, because a default would be a reflex with a longer name.
 *
 * ## The machine
 *
 * ```
 *   free ──(strike / cut / thrust / feint)──> chamber ─> commit ─> recover ──┐
 *    │  ^                                        │                           │
 *    │  │                                  chamberAbort:                     │
 *    │  │                                  parry or retreat                  │
 *    │  ├──(circle, retreat, duck: timed, interruptible by an event ask)──────┤
 *    │  ├──(shove, ram: run to their end)─────────────────────────────────────┤
 *    │  └──(hold, close, withdraw, void, wait, parry: one step, re-asked)─────┘
 * ```
 *
 * `parry` is the exception to the diagram: it is a *spare hand* act and runs beside whatever the
 * acting hand is doing, released `readRecoverSeconds` after their arm stops chambering or
 * committing. Everything else is one hand, one stance, one clock.
 */

// ------------------------------------------------------------------------------------- the shapes

/**
 * A table whose literal types are widened, so that `Object.assign(GOLEM_TACTICS_V3, {...})` from
 * a harness and `{ ...GOLEM_TACTICS_V3, chamberAbort: true }` from a test both type-check against
 * the same shape a test reads back. v2's own copy of this, for the same reason.
 */
type Widened<T> = {
  -readonly [K in keyof T]: T[K] extends boolean ? boolean : T[K] extends number ? number : T[K];
};

/** One committed arc, laid over the kind's shipped stroke: the four axes the bench swept. */
const committed = (kind: WeaponKind, over: {
  chamberSwing: number; strokeSeconds: number; chamberReach: number; chamberSeconds: number;
}): StrokeShape => Object.freeze({ ...STROKE_SHAPES[kind], ...over });

/**
 * The committed cut, per weapon kind: Session 02's grid at its best cell.
 *
 * Read `COMMITTED_SHAPE_CANDIDATES` in `scripts/golem-bench.mjs` for the rows and
 * `docs/measurements.md` under Session 02 of the style set for what they cost. Three kinds have a
 * cell and the rest keep the shipped stroke, which is the bench's finding rather than an omission:
 * no cell of the grid brings a mace within 0.47 m of its mark or a maul within 0.94 m, so a club's
 * "committed" arc would be a slower miss, and the whip was never on the bench. `axe` and `bow` take
 * the sword's, as they take the sword's stroke.
 *
 * These are frozen rows and not getters onto the table, unlike `STROKE_SHAPES.sword`: the shape a
 * stroke runs on is copied out of here into the exchange's own scratch arc at the chamber, where
 * `cutSeconds` is applied from **the table the executor was handed**. A getter reading a module
 * global would have made `--override form.cutSeconds` move a number the style's own copy never read.
 */
export const COMMITTED_SHAPES: Record<WeaponKind, StrokeShape> = Object.freeze({
  sword: committed("sword", { chamberSwing: 1.20, strokeSeconds: 0.20, chamberReach: -0.20, chamberSeconds: 0.32 }),
  axe: committed("axe", { chamberSwing: 1.20, strokeSeconds: 0.20, chamberReach: -0.20, chamberSeconds: 0.32 }),
  bow: committed("bow", { chamberSwing: 1.20, strokeSeconds: 0.20, chamberReach: -0.20, chamberSeconds: 0.32 }),
  shield: committed("shield", { chamberSwing: 1.20, strokeSeconds: 0.15, chamberReach: -0.70, chamberSeconds: 0.32 }),
  buckler: committed("buckler", { chamberSwing: 1.20, strokeSeconds: 0.15, chamberReach: -0.70, chamberSeconds: 0.32 }),
  empty: committed("empty", { chamberSwing: 1.20, strokeSeconds: 0.11, chamberReach: -0.20, chamberSeconds: 0.32 }),
  club: STROKE_SHAPES.club,
  whip: STROKE_SHAPES.whip,
});

/**
 * The thrust, per weapon kind: a point stroke along the reach axis rather than an arc across it.
 *
 * The chamber draws the anchor all the way in, the commit runs it out to wherever the mark is,
 * and both angular offsets stay inside a twentieth of a radian of the aim so that what travels is
 * the point and not the edge. One row per kind because `StrokeShape` is a total record and a kind
 * added to `hands.ts` should be a compile error here too; the rows are identical because a thrust
 * is the same act with every terminal that has a point, and which terminals those are is
 * `hasPoint`'s answer at the offer rather than a shape's. `strokeSeconds` and `stepIn` here are
 * placeholders: the exchange takes both from `thrustSeconds` and `thrustStepIn` on its own table.
 */
const POINT: StrokeShape = Object.freeze({
  chamberSwing: 0.05, chamberLift: 0.05, chamberReach: -0.85,
  followSwing: 0.05, followLift: 0.05, chamberSeconds: 0.22,
  strokeSeconds: 0.12, stepIn: 0.4, windRoll: 0, roll: 0,
});

export const THRUST_SHAPES: Record<WeaponKind, StrokeShape> = Object.freeze({
  sword: POINT, axe: POINT, bow: POINT, shield: POINT, buckler: POINT,
  club: POINT, empty: POINT, whip: POINT,
});

// ------------------------------------------------------------------------------------ the numbers

/**
 * Every constant this executor has: v2's whole table, copied at load, and seventeen rows of its own.
 *
 * The copy is taken at load for the reason v2 takes its copy of `GOLEM_TACTICS` at load. A harness
 * that moves `GOLEM_TACTICS_V2` after this module has loaded moves the fencer and not this file,
 * which is the isolation four frozen minds need; the price is that `--override standOffFraction`
 * is a fencer row, and a style's own copy is reached with the style's prefix instead.
 *
 * **Three inherited rows are not read here and are kept rather than deleted.** `strafe`,
 * `circleMin` and `circleMax` are v2's free-running sideways drift -- a sign that flips on a timer
 * that never looks at the opponent, which is the thing the owner watched and called flailing. Its
 * replacements are `idleStrafe`, which is what a hold strafes at and defaults to nothing, and
 * `circleSeconds`, which is how long a circle the director *asked* for runs. They stay on the table
 * so that a control row can be written as `idleStrafe=0.55` against v2's own numbers without a
 * second table shape, and this paragraph is here so nobody assumes they are load-bearing.
 */
const STYLE = {
  ...GOLEM_TACTICS_V2,

  /**
   * What a `hold` strafes at, as a fraction of the strafe axis. Zero is the point of it: v2's 0.55
   * is on all the time in every stance, and standing still is now a thing a style can choose.
   */
  idleStrafe: 0,
  /** What a `circle` strafes at, once one has been asked for. */
  circleStrafe: 0.6,
  /** How long one runs before the executor hands the decision back. */
  circleSeconds: 0.9,
  /** The cap on a retreat, which otherwise ends when the gap passes their reach plus slack. */
  retreatSeconds: 1.2,

  /**
   * How much further out than the strike range a committed cut may be started, metres.
   *
   * The step-in buys it: a cut walks forward through both the chamber and the commit, and the mark
   * and the strike reach are recomputed every step, so a stroke started from outside corrects its
   * own extension as the feet arrive. Nothing else in the tree opens an exchange from out of range.
   */
  cutReachMetres: 0.30,
  /** The trunk lean held through a committed cut. v2's `commitLean` is 0.40, and this is more. */
  cutLean: 0.6,
  /**
   * Seconds a committed arc sweeps in, or 0 to keep each weapon kind's own bench best.
   *
   * The one axis of `COMMITTED_SHAPES` that is swept from the table rather than from the bench,
   * because a sweep needs one number to move and the bench chose three different ones.
   */
  cutSeconds: 0,

  /** An intercept further ahead than this is not chased; the cover goes to its bearing instead. */
  parryHorizon: 0.35,
  /** How far outside the guard shell a closest approach may pass and still be worth parrying, metres. */
  parryMargin: 0.15,
  /** Where along the parrying terminal the intercept is met: `reachForDistance`'s bite. */
  parryBite: 0.5,
  /**
   * Whether the spare is sent to a wall on the chamber read, before their point is closing.
   *
   * Off by default, so every style written before Session 06 is byte-identical with it here.
   * On, it is Session 02's answer to a question that session asked and this executor had not
   * yet been told: a plate takes 0.89 s to settle over 0.40 m, and a stroke's whole commit is
   * 0.20 s, so an arm that waits for their point to start closing before it moves has already
   * lost. `solveIntercept` needs a closing point and a chambering arm is drawing *away*, so
   * during their chamber there is no intercept to solve and no parry is offered at all. This
   * row makes one: the shell point on the bearing of their drawn tip, held until their commit
   * turns it into a real intercept, which the step-by-step recompute then refines.
   *
   * It is a wall and not a prediction. It reads where their hand *is*, not where the arc will
   * bring it, so a stroke that comes round the other side finds the cover on the wrong bearing.
   * Buying the chamber's seconds is the whole of what it does.
   */
  wallOnChamber: false,
  /**
   * Whether a thrust is aimed by health like a cut and a strike are, or always at the trunk.
   *
   * Off by default, so every style written before Session 07 is byte-identical with it here, and
   * off is what the executor did without being asked: `targetByHealth` has always steered a strike
   * and a cut to the least-healthy reachable slot and has always left a thrust on the trunk. There
   * was no argument for that -- a thrust runs its anchor out to wherever the mark is, and a head
   * mark is as reachable as a trunk one -- and Session 07 found it by trying to write the
   * sever-hunter's own rule, "thrust at the head when the head is the weakest slot", and finding
   * that the second half of the sentence had nowhere to land.
   *
   * On, `weakestReachable` chooses the thrust's slot too, and the mark follows it. Both halves
   * were needed and only the first was obvious: the mark for a thrust was hard-wired to the
   * trunk's vital height in a branch that never looked at the chosen slot, so the first draft of
   * this row could be swept on and off over 512 bouts and produce a byte-identical log.
   *
   * It is a capability and not a tactic: whether to want the soft part is still entirely the
   * director's to say, through `targetByHealth` and `targetMargin`, and this only decides
   * whether the point may follow.
   */
  thrustByHealth: false,
  /**
   * May a chamber be abandoned when their arm turns to commit inside it?
   *
   * Off by default, because it is the one place this executor takes an option away mid-act and the
   * cost of it is a stroke that is never thrown. Session 04 sweeps it on and off.
   */
  chamberAbort: false,

  /** How long both hands are held out at their trunk in a shove. */
  shoveSeconds: 0.35,
  /** The trunk lean behind one. */
  shoveLean: 0.7,

  /** How long the point takes to run out to the mark. */
  thrustSeconds: 0.12,
  /** What the feet are asked for behind it, added to `forward` through the commit. */
  thrustStepIn: 0.4,

  /** How deep a duck crouches, normalized on the carrier's own travel. */
  duckDepth: 1.0,
  /** How long it stays there. */
  duckSeconds: 0.35,

  /**
   * Is the director asked on events as well as on the cadence?
   *
   * The events are their read phase changing, my exchange ending, and a parry releasing. Off, the
   * cadence alone decides, which is v2's behaviour and the control condition for the ask rule.
   */
  eventAsks: true,

  /** The arc a `cut` sweeps, per weapon kind, and the one a `thrust` runs. On the table so a test can move one. */
  committedShapes: COMMITTED_SHAPES,
  thrustShapes: THRUST_SHAPES,
};

/** Every constant this executor has. `Widened` is why a harness can assign a number to any row. */
export type StyleTactics = Widened<typeof STYLE>;

export const GOLEM_TACTICS_V3: StyleTactics = STYLE;

// ------------------------------------------------------------------------------------ the options

/**
 * Everything a director may name. Fifteen, against v2's eight.
 *
 * The seven that are new are the seven v2 did by itself: a void off the line, a retreat that ends
 * on a distance, a committed cut, a thrust, an intercept parry, a shove and a duck. The eight that
 * are not new keep v2's names and v2's meanings exactly, so that a reading of one log against the
 * other is a reading of the same words.
 */
export const STYLE_OPTIONS = [
  "hold", "close", "withdraw", "circle", "void", "retreat",
  "strike", "cut", "feint", "thrust", "wait",
  "parry", "shove", "duck", "ram",
] as const;
export type StyleOption = (typeof STYLE_OPTIONS)[number];

/** The stances this machine has. `free` is v2's approach, measure and withdraw collapsed into one. */
export type StyleStance =
  "free" | "circle" | "retreat" | "duck" | "chamber" | "commit" | "recover" | "feint" | "shove" | "ram";

/** Where an intercept was found, and how far out along the parrying arm it falls. */
export interface Intercept {
  /** Seconds ahead, from now. */
  readonly t: number;
  /** Metres from the spare socket to the point being met. */
  readonly distance: number;
  /**
   * Whether this is a wall on the chamber read rather than a solved crossing.
   *
   * A director that wants to know the difference can: a wall is a bearing held in hope and an
   * intercept is a point their tip is going to arrive at.
   */
  readonly wall: boolean;
}

/**
 * What a director reads. v2's `DuelReading`, and thirteen things v2 kept to itself.
 *
 * Every one of the thirteen is something an executor's reflex used to consult and a director could
 * not: `inside` is the shorter arm's latch, `cooldown` is why a strike is not on offer,
 * `sinceTheirExchange` is what patience was counting, `intercept` is what makes a parry a decision
 * rather than a wall. `weakestSlot` is v2's `chooseTarget` answer computed whether or not
 * `targetByHealth` is on, because a director may want to know where the soft part is without the
 * executor aiming there by itself.
 */
export interface StyleReading extends DuelReading {
  /** The inner radius of my own shell: inside it a stroke is already past. */
  near: number;
  /** Where I would stand between exchanges. */
  hold: number;
  /** Their published reach. */
  theirReach: number;
  /** Whether I am the shorter arm and have got inside. */
  inside: boolean;
  /** Seconds left before a hand may be asked for another stroke; zero is armed. */
  cooldown: number;
  /** Seconds since their arm last chambered or committed, or infinity. */
  sinceTheirExchange: number;
  /** My vitality less theirs, from -1 to +1. */
  lead: number;
  /** The reachable slot of theirs with the least health, or the trunk. */
  weakestSlot: TargetSlot;
  /** Where their point crosses my guard shell, if it does. */
  intercept: Intercept | null;
  /** Whether my arm is longer or shorter than theirs by more than `reachEdge`. */
  longer: boolean;
  shorter: boolean;
  /** Whether I am fighting with my head, and whether my hands are one grip. */
  headfirst: boolean;
  paired: boolean;
  /** Whether there is a spare hand that could be asked to cover. */
  spareCanCover: boolean;
}

/**
 * A director names the next option from the ones open, given what it reads.
 *
 * Asked every `replanSeconds` while nothing is running, and at once on an event; never during a
 * commit, a recover, a ram or a shove; during a chamber only under `chamberAbort`, and then with
 * three options and not fifteen.
 */
export type StyleDirector = (
  available: readonly StyleOption[], reading: StyleReading, view: FighterView,
) => StyleOption;

/** A hook on a director, of the same shape plus the answer: how a decision log is taken. */
export type StyleAskHook = (
  available: readonly StyleOption[], reading: StyleReading, view: FighterView, option: StyleOption,
) => void;

/** What the executor exposes to a test and to the policy that names it. */
export interface GolemStyled {
  readonly stance: StyleStance;
  readonly phase: StrokePhase;
  readonly target: TargetSlot;
  readonly option: StyleOption;
  readonly reading: StyleReading;
  readonly available: readonly StyleOption[];
  /** Whether the spare hand is holding a parry this step. */
  readonly parrying: boolean;
  decide(view: FighterView, dt: number): Intent;
}

// ----------------------------------------------------------------------------------- the geometry

/**
 * The hand `watch` picked, by name.
 *
 * `watch` answers with positions and gives no name, and this file needs the name: a circle goes
 * toward the side their *armed* hand is not on, and that side is `HandView.outboard` turned into
 * the world by their facing. The rule is `watch`'s own, written out rather than exported from it,
 * because the two are one rule and a second exported reader of `hands` would be a second rule.
 */
function watchedHand(them: BodyView): HandName {
  let best: HandName | null = null;
  for (const name of ["primary", "secondary"] as const) {
    const hand = them.hands[name];
    if (hand.lost || isShield(hand.weapon)) continue;
    if (best === null || hand.tipSpeed > them.hands[best].tipSpeed) best = name;
  }
  return best ?? "primary";
}

/**
 * How far out a hand's business end sits at a normalized reach command, metres.
 *
 * `reachForDistance` read backwards, and the parry's radius: a guard held at
 * `guardReachVs[theirs]` is a shell of *some* radius around the socket, and until this function
 * existed nothing in the tree could say what that radius was in metres. `spanned` in
 * `arm-core.ts` maps the cursor onto the anchor's own span, and the terminal hangs whatever it
 * hangs past the anchor's outboard stop.
 *
 * Exported for the reason `tacticalRanges` is: the parry's radius is a claim about a body, and
 * `tests/golem-mind.test.mjs` asks it of a real published capability so that the analytic
 * intercept a test solves is solved against the same shell the executor aimed at.
 */
export function reachAt(normalized: number, reach: number, cap: EffectorCapability): number {
  const shell = cap.reachable;
  if (!shell) return reach;
  const anchor = shell.reachMin + ((clamp(normalized, -1, 1) + 1) / 2) * (shell.reachMax - shell.reachMin);
  return anchor + (reach - shell.reachMax);
}

/** One hand's stroke in flight: which hand, its shape, and its own clock. v2's, written out again. */
interface Stroke {
  hand: HandName;
  shape: StrokeShape;
  elapsed: number;
  chamberSeconds: number;
}

/** A stroke shape the exchange may write into, so the table's swept rows can be laid over a frozen row. */
type Arc = { -readonly [K in keyof StrokeShape]: StrokeShape[K] };

const freshArc = (): Arc => ({
  chamberSwing: 0, chamberLift: 0, chamberReach: 0, followSwing: 0, followLift: 0,
  strokeSeconds: 0, chamberSeconds: 0, stepIn: 0, windRoll: 0, roll: 0,
});

/**
 * The duelist's `tacticalRanges` read from this table, with v2's two asymmetric rules on top: the
 * longer arm stands a hand's breadth further out, and the shorter arm that has got inside holds at
 * its own fraction. v2's `fencerRanges` is module-private there, and this is it again.
 */
function styleRanges(
  reach: number, cap: EffectorCapability, theirReach: number, inside: boolean, longer: boolean,
  T: StyleTactics,
): TacticalRanges {
  const slack = reach * T.slackFraction;
  const near = innerReach(reach, cap);
  const standOff = inside ? 0 : theirReach * (longer ? T.longStandOff : T.standOffFraction);
  const hold = Math.max(reach * T.holdFraction, near + slack, standOff);
  return Object.freeze({ near, hold, slack, strike: Math.max(reach * T.strikeFraction, hold + slack) });
}

/** Where a slot is on the other body, from what it publishes. v2's `slotMark`, written out again. */
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

const TARGET_SLOTS: readonly TargetSlot[] = Object.freeze(
  ["trunk", "head", "primary", "secondary", "locomotion"],
);

// ----------------------------------------------------------------------------------- the machine

/**
 * The third executor. A seed for the two rolls it still makes, a table, and a director.
 *
 * **The director is required.** v2's is optional and its absence means "run my own reflexes",
 * which is the arrangement this file exists to end: a null director here is a mind with no mind,
 * and answering it with a default would put a fourteenth tactic in the executor under the name
 * "the default". The seed is still drawn because two rolls survive -- the cooldown's initial
 * offset, so two golems built on the same frame do not share a cadence forever, and the fallback
 * side a circle takes when the two bodies are exactly nose to nose and no side can be read.
 */
export function golemStyled(
  seed: number, T: StyleTactics = GOLEM_TACTICS_V3, director: StyleDirector | null = null,
): GolemStyled {
  if (director === null) {
    throw new Error("golemStyled: this executor has no tactics of its own and was handed no director");
  }
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
  /** Where the parry is being sent: the intercept, or the closest approach. */
  const meeting: Point = { x: 0, y: 0, z: 0 };
  const healthBySlot: Record<TargetSlot, number> = {
    trunk: 1, head: 1, primary: 1, secondary: 1, locomotion: 1,
  };
  const arc = freshArc();

  let attacker: HandName = "primary";
  let prefer: HandName = "primary";
  let nextPrefer: HandName = "secondary";
  let target: TargetSlot = "trunk";
  /** Whether the exchange in flight is a thrust, whose mark is their vital height and not a slot. */
  let thrusting = false;
  /** Whether it is a committed cut, which walks the feet in and leans through both phases. */
  let cutting = false;
  /**
   * Whether a stance was entered on this very step.
   *
   * The clock a stance runs on is advanced once a step, and an act named by an ask has to get its
   * first step at zero rather than at `dt`: without this a 0.12 s thrust would run 0.116 s, which
   * is a thing that would never be noticed and would move every bench row by one frame.
   */
  let justEntered = false;

  let stance: StyleStance = "free";
  let elapsed = 0;
  let chamberSeconds = 0;
  let combo: Stroke | null = null;
  let inside = false;
  let cooldown = T.cooldown + random() * 0.8;
  /** The side a circle takes when their armed side cannot be read; the one surviving coin. */
  let fallbackSide = random() < 0.5 ? -1 : 1;

  let gapRate = 0;
  let lastGap = -1;
  let ramFired = false;
  let ramFiredAt = 0;

  let option: StyleOption = "hold";
  /** The option that opened the exchange in flight, which is what `chamberAbort` offers back. */
  let exchangeOption: StyleOption = "strike";
  let sinceAsk = Number.POSITIVE_INFINITY;
  let lastTheirs: StrokePhase = "idle";
  let parrying = false;
  let parryRelease = 0;
  let intercept: Intercept | null = null;

  const available: StyleOption[] = [];
  const reading: StyleReading = {
    gap: 0, strike: 0, slack: 0, gapRate: 0, theirWeapon: "empty", myWeapon: "empty",
    theirs: "idle", mine: "free",
    near: 0, hold: 0, theirReach: 0, inside: false, cooldown: 0,
    sinceTheirExchange: Number.POSITIVE_INFINITY, lead: 0, weakestSlot: "trunk", intercept: null,
    longer: false, shorter: false, headfirst: false, paired: false, spareCanCover: false,
  };

  const goTo = (next: StyleStance): void => {
    stance = next;
    elapsed = 0;
    justEntered = true;
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

  /** How far out this hand's cover is held, by what it is and what it is meeting. v2's rule. */
  const coverReachFor = (weapon: Striker, theirs: WeaponKind): number =>
    isShield(weapon) ? T.shieldReach : T.guardByTheirs ? T.guardReachVs[theirs] : T.guardReach;

  /**
   * The slot of theirs with the least health that this hand can actually be sent to.
   *
   * One function for two questions: what this exchange is aimed at, which honours
   * `targetByHealth` and `targetMargin` exactly as v2 does, and what the director is *told* is
   * weakest, which does not -- a style may want to know where the soft part is without the
   * executor quietly aiming there.
   */
  const weakestReachable = (
    them: BodyView, socket: Point, reach: number, cap: EffectorCapability, heading: number,
    outboard: number, margin: number,
  ): TargetSlot => {
    slotHealth(them.health, healthBySlot);
    let best: TargetSlot = "trunk";
    let bestHealth = healthBySlot.trunk > 0 ? healthBySlot.trunk : 1;
    for (const slot of TARGET_SLOTS) {
      if (slot === "trunk") continue;
      const health = healthBySlot[slot];
      if (health <= 0 || health >= bestHealth - margin) continue;
      if ((slot === "primary" || slot === "secondary") && them.hands[slot].lost) continue;
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
   * One hand's stroke, written from its own clock. v2's `driveStroke`, unchanged in every
   * arithmetic detail: the chamber for `chamberSeconds`, the arc over `strokeSeconds`, the end of
   * the arc held. What differs between a strike, a cut and a thrust here is the *shape* handed in
   * and the bite the strike reach was computed at, and nothing else.
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

  /**
   * Where their point crosses my guard shell, or the closest it comes to it.
   *
   * `|p + v t - S|^2 = r^2` for the smallest positive root with the point closing (`b < 0`). With
   * no root, or with one further ahead than `parryHorizon`, the closest approach `q` instead --
   * parried only if it passes inside `r + parryMargin`, because a parry aimed at a point half a
   * metre wide of the guard is an arm sent away from the body for nothing. `meeting` is filled
   * with whichever point was chosen, which is what the hand is then sent to.
   */
  const solveIntercept = (tip: Point, vel: Point, socket: Point, r: number): Intercept | null => {
    const wx = tip.x - socket.x, wy = tip.y - socket.y, wz = tip.z - socket.z;
    const a = vel.x * vel.x + vel.y * vel.y + vel.z * vel.z;
    if (a < 1e-6) return null;
    const half = wx * vel.x + wy * vel.y + wz * vel.z;
    if (half >= 0) return null;
    const c = wx * wx + wy * wy + wz * wz - r * r;
    const disc = half * half - a * c;
    let t = -1;
    if (disc >= 0) {
      const root = Math.sqrt(disc);
      const first = (-half - root) / a;
      const second = (-half + root) / a;
      t = first > 0 ? first : second > 0 ? second : -1;
    }
    if (t < 0 || t > T.parryHorizon) {
      const closest = -half / a;
      if (closest <= 0) return null;
      const qx = tip.x + vel.x * closest, qy = tip.y + vel.y * closest, qz = tip.z + vel.z * closest;
      const miss = Math.hypot(qx - socket.x, qy - socket.y, qz - socket.z);
      if (t < 0 && miss > r + T.parryMargin) return null;
      meeting.x = qx; meeting.y = qy; meeting.z = qz;
      return { t: closest, distance: miss, wall: false };
    }
    meeting.x = tip.x + vel.x * t;
    meeting.y = tip.y + vel.y * t;
    meeting.z = tip.z + vel.z * t;
    return {
      t, distance: Math.hypot(meeting.x - socket.x, meeting.y - socket.y, meeting.z - socket.z),
      wall: false,
    };
  };

  /**
   * The wall: the point on my guard shell that lies on the bearing of their drawn tip.
   *
   * No solve, because there is nothing yet to solve -- their arm is going backwards. `meeting` is
   * filled the same way the intercept fills it, so the spare hand's command below does not care
   * which of the two put it there, and `t` is zero because the answer is "now" rather than "in
   * `t` seconds". Returns null only for a tip sitting on top of the socket, which has no bearing.
   */
  const wallAt = (tip: Point, socket: Point, r: number): Intercept | null => {
    const dx = tip.x - socket.x, dy = tip.y - socket.y, dz = tip.z - socket.z;
    const span = Math.hypot(dx, dy, dz);
    if (span < 1e-6) return null;
    meeting.x = socket.x + dx / span * r;
    meeting.y = socket.y + dy / span * r;
    meeting.z = socket.z + dz / span * r;
    return { t: 0, distance: r, wall: true };
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
    const reach = me.reach;

    // ---- what their business end is doing, and their arm's phase -----------------------------
    watch(them, threat);
    const watched = watchedHand(them);
    const tipGap = distance(threat.tip, socket);
    if (lastGap >= 0 && dt > 0) {
      const rate = (tipGap - lastGap) / dt;
      gapRate += (rate - gapRate) * (1 - Math.exp(-12 * dt));
    }
    lastGap = tipGap;
    const theirs = reader.update(
      threat.reach > 0 ? distance(threat.tip, threat.shoulder) / threat.reach : 1, gapRate, dt);
    const theirWeapon = threat.weapon;

    // ---- the reach pair, the body, the ranges -------------------------------------------------
    const longer = reach > them.reach * (1 + T.reachEdge);
    const shorter = reach < them.reach * (1 - T.reachEdge);
    const bodyGap = Math.hypot(them.ground.x - self.ground.x, them.ground.z - self.ground.z);
    const natural = readyNatural(self);
    const headfirst = natural !== null && !canAttack(cap) && !canAttack(spareCap);
    const paired = caps.pairedHands;
    const ranges = headfirst
      ? Object.freeze({
        near: 0,
        hold: natural.reach * T.holdFraction,
        strike: natural.reach + T.ramLunge,
        slack: natural.reach * T.slackFraction,
      })
      : styleRanges(reach, cap, them.reach, T.closeOnRecover && shorter && inside, longer, T);
    const { near, hold, strike, slack } = ranges;
    const gap = headfirst ? bodyGap : distance(socket, them.shoulder);

    // The shorter arm's latch, on its own strike range. v2's rule and v2's one-step lag; what has
    // changed is that nothing here acts on it, and a director is told about it instead.
    if (T.closeOnRecover && shorter && !headfirst) {
      const ownStrike = Math.max(reach * T.strikeFraction, near + slack * 2);
      if (!inside && gap <= ownStrike) inside = true;
      else if (inside && gap > ownStrike + reach * T.insideSlack) inside = false;
    } else {
      inside = false;
    }
    if (cooldown > 0) cooldown -= dt;

    // ---- the two sides: theirs, and the one off the line of their point -----------------------
    // Their spare side, converted into my strafe axis. `outboard` is +1 on their own right and the
    // local X axis of a body is its right in the world, so their armed side is `outboard` times
    // their own right, their spare side is the other one, and what my feet can do about it is that
    // vector projected onto mine. Nose to nose with a body whose sides read equally, the coin.
    const myRightX = Math.cos(self.facing), myRightZ = -Math.sin(self.facing);
    const theirRightX = Math.cos(them.facing), theirRightZ = -Math.sin(them.facing);
    const theirOutboard = them.hands[watched].outboard;
    const spareDot = -theirOutboard * (theirRightX * myRightX + theirRightZ * myRightZ);
    const circleSide = Math.abs(spareDot) < 1e-6 ? fallbackSide : spareDot > 0 ? 1 : -1;

    // The void: the floor normal to their point's velocity, signed toward the side my socket is
    // already on, projected onto my strafe axis. Projected rather than signed, so that a point
    // travelling *across* me -- whose line I am already off -- does not pull the feet sideways for
    // nothing; the step back is `voidStep` and does the work in that case.
    const tipVelocity = them.hands[watched].tipVelocity;
    let voidAxis = fallbackSide;
    const floorSpeed = Math.hypot(tipVelocity.x, tipVelocity.z);
    if (floorSpeed > 1e-3) {
      const nx = tipVelocity.z / floorSpeed, nz = -tipVelocity.x / floorSpeed;
      const offset = nx * (socket.x - threat.tip.x) + nz * (socket.z - threat.tip.z);
      const away = Math.abs(offset) < 1e-4 ? fallbackSide : offset > 0 ? 1 : -1;
      voidAxis = away * (nx * myRightX + nz * myRightZ);
    }

    // ---- the marks ----------------------------------------------------------------------------
    const exchanging = stance === "chamber" || stance === "commit" || stance === "feint";
    // A thrust at the trunk goes at the *vital height* rather than the shoulder line, which is
    // where `slotMark` puts a trunk mark: a point driven along the reach axis is worth putting
    // where the body is thickest. That is the only reason this branch exists, so it is written
    // as what it is -- the trunk's own rule -- and a thrust that `thrustByHealth` has aimed
    // somewhere else takes that slot's mark like every other stroke. Until Session 07 the test
    // here was `thrusting` alone, which quietly threw the chosen slot away and is why the row
    // above could be turned on and off over 512 bouts without moving a single byte of the log.
    if (exchanging && thrusting && target === "trunk") {
      mark.x = them.ground.x; mark.y = them.vitalHeight; mark.z = them.ground.z;
    } else {
      slotMark(them, exchanging ? target : "trunk", mark);
    }
    const towardLength = distance(socket, them.shoulder) || 1;
    if (tipGap < towardLength) {
      guardMark.x = threat.tip.x; guardMark.y = threat.tip.y; guardMark.z = threat.tip.z;
    } else {
      guardMark.x = them.ground.x; guardMark.y = them.shoulder.y; guardMark.z = them.ground.z;
    }
    aimAt(socket, mark, trunkHeading, me.outboard, aim);
    // A thrust puts the point itself on the mark, which is what `bite` 0 means; a cut and a strike
    // want the mark crossed a third of the way down from the point, which is what `strikeBite` is.
    const strikeReach = reachForDistance(
      distance(socket, mark), reach, cap, exchanging && thrusting ? 0 : T.strikeBite);

    // ---- the feet and the posture, before any option has spoken -------------------------------
    const bearing = Math.atan2(them.ground.x - self.ground.x, them.ground.z - self.ground.z);
    intent.turn = clamp(angleTo(self.facing, bearing) * T.turnGain, -1, 1);
    const keepHold = clamp((gap - hold) * T.closeGain, -1, 1);
    intent.forward = keepHold;
    intent.strafe = 0;
    intent.posture.trunkTwist = 0;
    intent.posture.trunkLean = 0;
    intent.posture.crouch = 0;
    if (cap.reachable && caps.crouchTravel > 1e-6) {
      const shortfall = (cap.reachable.liftMin - aim.lift) * aim.horizontal;
      intent.posture.crouch = clamp(shortfall / caps.crouchTravel, 0, 1);
    }
    intent.natural.guard = true;
    intent.natural.thrust = false;

    // ---- the spare hand's shell, and whether their point crosses it ----------------------------
    const spareLost = self.hands[spare].lost;
    const spareCanCover = !paired && !spareLost && canCover(spareCap);
    const spareSocket = self.hands[spare].shoulder;
    const spareReach = self.hands[spare].reach;
    const shellRadius = spareCanCover
      ? reachAt(coverReachFor(self.hands[spare].weapon, theirWeapon), spareReach, spareCap) : 0;
    intercept = spareCanCover && !headfirst
      ? solveIntercept(threat.tip, tipVelocity, spareSocket, shellRadius) : null;
    // Their chamber has no closing point in it, so a style that wants to be there before the
    // commit gets a bearing instead of a crossing. `theirs` is read one block down for everything
    // else and is already in hand here.
    if (intercept === null && T.wallOnChamber && spareCanCover && !headfirst && theirs === "chamber") {
      intercept = wallAt(threat.tip, spareSocket, shellRadius);
    }

    // A parry is released `readRecoverSeconds` after their arm stops chambering or committing, and
    // the release is one of the three events the director is asked on.
    let released = false;
    if (parrying) {
      if (theirs === "chamber" || theirs === "commit") parryRelease = T.readRecoverSeconds;
      else parryRelease -= dt;
      if (parryRelease <= 0 || !spareCanCover) { parrying = false; released = true; }
    }

    // ---- what the director reads ---------------------------------------------------------------
    reading.gap = gap;
    reading.strike = strike;
    reading.slack = slack;
    reading.gapRate = gapRate;
    reading.theirWeapon = theirWeapon;
    reading.myWeapon = me.weapon;
    reading.theirs = theirs;
    reading.mine = stance === "recover" ? "recover"
      : stance === "free" || stance === "circle" || stance === "retreat" || stance === "duck" ? "free"
      : "exchange" as MyPhase;
    reading.near = near;
    reading.hold = hold;
    reading.theirReach = them.reach;
    reading.inside = inside;
    reading.cooldown = Math.max(0, cooldown);
    reading.sinceTheirExchange = reader.sinceExchange;
    reading.lead = self.vitality - them.vitality;
    reading.weakestSlot = weakestReachable(them, socket, reach, cap, trunkHeading, me.outboard, 0);
    reading.intercept = intercept;
    reading.longer = longer;
    reading.shorter = shorter;
    reading.headfirst = headfirst;
    reading.paired = paired;
    reading.spareCanCover = spareCanCover;

    // ---- what a body could be asked for this step ----------------------------------------------
    // What is open is what the body can do, not what a tactic would allow. v2 learned this the
    // hard way: its director inherited the shorter arm's refusal to commit from outside the latch
    // and held in range with a strike it was never offered.
    const armed = cooldown <= 0;
    const canHand = !headfirst && canAttack(cap) && !self.hands[attacker].lost;
    const pointed = hasPoint(me.weapon) || me.weapon === "empty";
    const ramCould = natural !== null && (
      bodyGap <= natural.reach + T.ramLunge ||
      (T.ramOnRecover && theirs === "recover" && bodyGap <= natural.reach + T.ramRecoverLunge));

    /** Fill the exchange's arc from the row the option asks for, and lay the swept rows over it. */
    const enterExchange = (kind: "strike" | "cut" | "thrust" | "feint"): void => {
      thrusting = kind === "thrust";
      cutting = kind === "cut";
      const byHealth = T.targetByHealth && (!thrusting || T.thrustByHealth);
      target = !byHealth ? "trunk"
        : weakestReachable(them, socket, reach, cap, trunkHeading, me.outboard, T.targetMargin);
      const source = cutting ? T.committedShapes[me.weapon]
        : thrusting ? T.thrustShapes[me.weapon]
        : STROKE_SHAPES[me.weapon];
      arc.chamberSwing = source.chamberSwing;
      arc.chamberLift = source.chamberLift;
      arc.chamberReach = source.chamberReach;
      arc.followSwing = source.followSwing;
      arc.followLift = source.followLift;
      arc.strokeSeconds = source.strokeSeconds;
      arc.chamberSeconds = source.chamberSeconds;
      arc.stepIn = source.stepIn;
      arc.windRoll = source.windRoll;
      arc.roll = source.roll;
      if (cutting && T.cutSeconds > 0) arc.strokeSeconds = T.cutSeconds;
      if (thrusting) { arc.strokeSeconds = T.thrustSeconds; arc.stepIn = T.thrustStepIn; }
      chamberSeconds = arc.chamberSeconds;
      // The option in force and not the shape's name, so that a `wait` that fires on their recover
      // is logged as the counter it is and `chamberAbort` offers it back under its own name.
      exchangeOption = option;
      nextPrefer = spare;
      goTo(kind === "feint" ? "feint" : "chamber");
    };

    const applyOption = (chosen: StyleOption): void => {
      switch (chosen) {
        case "circle": goTo("circle"); break;
        case "retreat": goTo("retreat"); break;
        case "duck": goTo("duck"); break;
        case "shove": goTo("shove"); break;
        case "ram": goTo("ram"); break;
        case "strike": case "cut": case "thrust": case "feint": enterExchange(chosen); break;
        case "parry":
          parrying = true;
          parryRelease = T.readRecoverSeconds;
          if (stance !== "free") goTo("free");
          break;
        default:
          if (stance !== "free") goTo("free");
          break;
      }
    };

    available.length = 0;
    available.push("hold", "close", "withdraw", "circle", "void", "retreat");
    if (canHand && gap <= strike) {
      available.push("wait");
      if (armed) available.push("strike", "feint");
      if (armed && pointed) available.push("thrust");
    }
    if (canHand && armed && gap <= strike + T.cutReachMetres) available.push("cut");
    if (canHand && armed && gap <= near + 0.15 * reach) available.push("shove");
    if (spareCanCover && !headfirst && intercept !== null) available.push("parry");
    if ((theirs === "chamber" || theirs === "commit") && threat.tip.y > socket.y) available.push("duck");
    if (ramCould && armed) available.push("ram");

    // ---- the ask ---------------------------------------------------------------------------------
    const phaseTurned = theirs !== lastTheirs;
    lastTheirs = theirs;
    sinceAsk += dt;
    const eventAsk = T.eventAsks && (phaseTurned || released);
    const interruptible = stance === "free" || stance === "circle" || stance === "retreat" || stance === "duck";
    if (interruptible) {
      if (sinceAsk >= T.replanSeconds || eventAsk || !available.includes(option)) {
        const answer = director(available, reading, view);
        // A director that names something that is not open is answered with the first thing that
        // is, which is always `hold`: a refusal here would take a whole run down over one cell of
        // a table, and a silent substitution of something *else* open would be a tactic.
        option = available.includes(answer) ? answer : available[0];
        sinceAsk = 0;
        applyOption(option);
      }
    } else if (stance === "chamber" && T.chamberAbort && phaseTurned && theirs === "commit") {
      // The one place an act is taken back. Three options and not fifteen: finish the stroke, meet
      // their point, or leave. Abandoning costs half a cooldown, so a style that aborts every
      // chamber pays for it in strokes it never threw.
      available.length = 0;
      available.push(exchangeOption);
      if (spareCanCover && intercept !== null) available.push("parry");
      available.push("retreat");
      const answer = director(available, reading, view);
      sinceAsk = 0;
      if (answer !== exchangeOption && available.includes(answer)) {
        cooldown = T.cooldown / 2;
        option = answer;
        applyOption(answer);
      }
    }

    // ---- the hand that is not striking, unless it is --------------------------------------------
    if (combo !== null && !paired) {
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
    const handBusy = combo !== null && combo.hand === attacker;
    const spareBusy = combo !== null && combo.hand === spare;

    const chambering = stance === "chamber" || stance === "feint";
    const committing = stance === "commit";
    if (!handBusy) {
      hand.roll = cap.rollMax > 0
        ? clamp(chambering ? arc.windRoll : arc.roll, -cap.rollMax, cap.rollMax) : 0;
      hand.wristBend = cap.bendMax > 0
        ? (chambering || committing ? T.cutBend : T.coverBend) : 0;
    }

    /** The guard, on the covering line, at the distance their weapon asks for. */
    const holdGuard = (): void => {
      if (handBusy) return;
      hand.guard = canCover(cap);
      hand.thrust = false;
      aimAt(socket, guardMark, trunkHeading, me.outboard, cover);
      writeAim(hand, cap, cover, me.outboard, 0, T.coverLift, 1, coverReachFor(me.weapon, theirWeapon));
    };

    // ---- run the stance ---------------------------------------------------------------------------
    if (!justEntered) elapsed += dt;
    justEntered = false;

    if (stance === "free") {
      holdGuard();
      switch (option) {
        case "close":
          intent.forward = 1;
          break;
        case "withdraw":
          intent.forward = -clamp(T.voidStep, 0, 1);
          intent.strafe = clamp(circleSide * T.voidStrafe, -1, 1);
          break;
        case "void":
          intent.forward = -clamp(T.voidStep, 0, 1);
          intent.strafe = clamp(voidAxis * T.voidStrafe, -1, 1);
          break;
        case "wait":
          intent.strafe = clamp(circleSide * T.idleStrafe, -1, 1);
          // The counter, and the one trigger left in this file: a `wait` is a decision already
          // taken, held until the opening it was taken for arrives. Their recover is that opening.
          if (canHand && armed && gap <= strike && theirs === "recover") enterExchange("strike");
          break;
        default:
          intent.strafe = clamp(circleSide * T.idleStrafe, -1, 1);
          break;
      }
    } else if (stance === "circle") {
      holdGuard();
      intent.strafe = clamp(circleSide * T.circleStrafe, -1, 1);
      if (elapsed >= T.circleSeconds) goTo("free");
    } else if (stance === "retreat") {
      holdGuard();
      intent.forward = -1;
      intent.strafe = clamp(voidAxis * T.voidStrafe, -1, 1);
      intent.posture.trunkLean = T.withdrawLean;
      if (elapsed >= T.retreatSeconds || gap > them.reach + slack) goTo("free");
    } else if (stance === "duck") {
      holdGuard();
      intent.forward = 0;
      intent.strafe = 0;
      // The first command written into a posture axis as a decision rather than derived from an
      // aim: everything else in this file crouches only because the mark is under the arm's floor.
      intent.posture.crouch = clamp(T.duckDepth, 0, 1);
      if (elapsed >= T.duckSeconds) goTo("free");
    }

    if (stance === "chamber" || stance === "feint") {
      hand.guard = false;
      hand.thrust = false;
      intent.posture.trunkTwist = me.outboard * T.trunkSweep;
      if (cutting) {
        // The step-in that buys `cutReachMetres`: the feet close through the wind-up as well as
        // through the arc, which is the whole reason a cut may be opened from outside the range.
        intent.forward = 1;
        intent.posture.trunkLean = T.cutLean;
      }
      if (stance === "feint" && elapsed >= T.feintHoldSeconds) {
        // The chamber shown and taken away: the feet go back while the arm returns to guard.
        intent.forward = -1;
        intent.strafe = 0;
        intent.posture.trunkTwist = 0;
        intent.posture.trunkLean = 0;
        holdGuard();
        if (elapsed >= T.feintHoldSeconds + T.feintBackSeconds) {
          cooldown = T.cooldown;
          goTo("free");
          sinceAsk = Number.POSITIVE_INFINITY;
        }
      } else {
        writeAim(hand, cap, aim, me.outboard,
          canSwing(cap) ? arc.chamberSwing : 0, arc.chamberLift, 1, arc.chamberReach);
        if (stance === "chamber" && elapsed >= chamberSeconds) goTo("commit");
      }
    } else if (stance === "commit") {
      const swept = canSwing(cap) ? 1 : 0;
      const t = arc.strokeSeconds > 0 ? clamp(elapsed / arc.strokeSeconds, 0, 1) : 1;
      hand.guard = false;
      hand.thrust = true;
      if (cutting) intent.forward = 1;
      intent.forward = clamp(intent.forward + arc.stepIn, -1, 1);
      intent.posture.trunkTwist = -me.outboard * T.trunkSweep;
      intent.posture.trunkLean = cutting ? T.cutLean : T.commitLean;
      writeAim(hand, cap, aim, me.outboard,
        swept * (arc.chamberSwing - t * (arc.chamberSwing + arc.followSwing)),
        arc.chamberLift - t * (arc.chamberLift + arc.followLift),
        0,
        arc.chamberReach + t * (strikeReach - arc.chamberReach));
      // The spare hand's stroke starts as this one's arc ends. v2's combination, unchanged.
      if (combo === null && t >= 1 && !paired && T.comboFraction > 0 &&
        !self.hands[spare].lost && canAttack(spareCap) && !isShield(self.hands[spare].weapon) &&
        random() < T.comboFraction) {
        combo = {
          hand: spare, shape: STROKE_SHAPES[self.hands[spare].weapon], elapsed: 0,
          chamberSeconds: T.comboChamberSeconds,
        };
        nextPrefer = attacker;
      }
      if (elapsed >= Math.max(T.commitSeconds, arc.strokeSeconds + T.followSeconds)) goTo("recover");
    } else if (stance === "shove") {
      intent.forward = 1;
      intent.posture.trunkLean = T.shoveLean;
      intent.natural.guard = false;
      if (!handBusy) {
        writeAim(hand, cap, aim, me.outboard, 0, 0, 0, 1);
        hand.thrust = true;
        hand.guard = false;
        hand.roll = 0;
        hand.wristBend = 0;
      }
      if (elapsed >= T.shoveSeconds) goTo("recover");
    } else if (stance === "ram") {
      intent.forward = 1;
      intent.posture.trunkLean = T.ramLean;
      intent.natural.guard = false;
      holdGuard();
      if (natural !== null && !ramFired && elapsed >= T.ramLeanSeconds &&
        bodyGap <= natural.reach + T.ramBite) {
        ramFired = true;
        ramFiredAt = elapsed;
      }
      intent.natural.thrust = ramFired;
      if (ramFired ? elapsed - ramFiredAt >= T.ramFollowSeconds : elapsed >= T.ramSeconds) {
        goTo("recover");
      }
    } else if (stance === "recover") {
      holdGuard();
      if (elapsed >= T.recoverSeconds && combo === null) {
        cooldown = T.cooldown;
        prefer = paired ? "primary" : nextPrefer;
        thrusting = false;
        cutting = false;
        goTo("free");
        // My exchange has ended, which is v2's own extra ask and not one of this file's events:
        // the cadence is restarted rather than waited out, whatever `eventAsks` says.
        sinceAsk = Number.POSITIVE_INFINITY;
      }
    }

    // ---- the spare hand ----------------------------------------------------------------------
    // Three things it can be doing and one it cannot: its own stroke (the combination above), the
    // shove's second channel, a parry, or the guard. A paired grip has no spare -- `mirror` writes
    // the acting hand over it at the end of `decide` -- and neither has a body that has lost one.
    if (!spareBusy && !paired) {
      if (stance === "shove" && !spareLost && canAttack(spareCap)) {
        aimAt(spareSocket, mark, trunkHeading, self.hands[spare].outboard, spareAim);
        writeAim(off, spareCap, spareAim, self.hands[spare].outboard, 0, 0, 0, 1);
        off.roll = 0;
        off.wristBend = 0;
        off.thrust = true;
        off.guard = false;
      } else if (parrying && intercept !== null) {
        // The one command in this file computed from a solve rather than from a pose. It is
        // recomputed every step while their arm is chambering or committing, so a parry that
        // started as a wall on the chamber read becomes a true intercept the moment their point
        // begins to close: `meeting` is refilled every step by whichever of the two answered.
        aimAt(spareSocket, meeting, trunkHeading, self.hands[spare].outboard, spareAim);
        writeAim(off, spareCap, spareAim, self.hands[spare].outboard, 0, 0, 1,
          reachForDistance(distance(spareSocket, meeting), spareReach, spareCap, T.parryBite));
        off.roll = 0;
        off.wristBend = spareCap.bendMax > 0 ? T.coverBend : 0;
        off.thrust = false;
        off.guard = true;
      } else if (spareCanCover) {
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
  };

  return {
    get stance(): StyleStance { return stance; },
    get phase(): StrokePhase { return reader.phase; },
    get target(): TargetSlot { return target; },
    get option(): StyleOption { return option; },
    get reading(): StyleReading { return reading; },
    get available(): readonly StyleOption[] { return available; },
    get parrying(): boolean { return parrying; },
    decide(view: FighterView, dt: number): Intent {
      plan(view, dt);
      if (view.self.capabilities?.pairedHands) mirror(intent.primary, intent.secondary);
      return intent;
    },
  };
}

/**
 * A hook wrapped around a director, so that a log can be taken of what was asked and answered.
 *
 * The one place a decision log can be taken without the executor knowing there is one: the reading
 * and the open mask are what the director saw, and the option is what it said, which is exactly the
 * four columns a per-decision reward needs. Session 08 hangs the corpus here.
 */
export function watchedDirector(director: StyleDirector, onAsk: StyleAskHook): StyleDirector {
  return (available, reading, view) => {
    const option = director(available, reading, view);
    onAsk(available, reading, view, option);
    return option;
  };
}
