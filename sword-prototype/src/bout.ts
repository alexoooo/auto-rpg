// Explicit `.ts` extensions, and this file is the reason the convention exists
// as much as it is a follower of it: `tests/bout.test.mjs` imports this module
// directly under Node, with no DOM and no Babylon anywhere in its graph. The
// only value import here is `config.ts`, which imports nothing at all; `Side`
// and `HitKind` are types and erase. Nothing in this file may become a value
// import from a module that touches Babylon without moving the test with it.
import { CONFIG } from "./config.ts";
import type { Side } from "./physics.ts";
import type { HitKind } from "./scoring.ts";

/**
 * The bout, as state and rules rather than as wiring.
 *
 * `src/main.ts` renders what is in here and owns every Babylon object in the
 * arena; this file owns what a bout *is* -- who is fighting whom, which of the
 * three phases it is in, when it is finished and who won. The split is the same
 * one `src/scoring.ts` already earns its keep with, and for the same reason:
 * "when does a fight end" is a rule worth arguing with, and an argument you can
 * only have by starting a browser and waiting ninety seconds is an argument
 * nobody has.
 *
 * Everything here is plain data and pure functions. The transitions return a new
 * state rather than mutating one, so a test can hold both sides of a transition
 * at once and so a transition that was refused is visibly the same object it was
 * handed.
 */

/**
 * Where a bout is.
 *
 * `select` is the screen, `fight` is the arena, and `over` is a fight that has
 * been decided. `over` deliberately does **not** stop the world: the fighters go
 * on being driven by their minds and the solver goes on solving, and all that
 * changes is what the banner says and where `Space` and `R` take you. Freezing would need
 * either a branch in `Fighter` for "the bout is over" -- which is the same shape
 * of branch as "is this one the player", and the whole point of the seam is that
 * there is not one -- or a keyframed torso left holding its last velocity, which
 * would slide it across the arena forever.
 */
export type Phase = "select" | "fight" | "over";

/** Whether a side reads a policy or a person. */
export type Control = "mind" | "you";

/** One corner of the setup screen. */
/**
 * What a hand can be given, and what the picker offers.
 *
 * Same `{ name, label }` shape as `UNITS` and `POLICIES`, because `setup.ts`
 * builds every `select` from one of these and an option that is offered is then
 * provably an option the code has.
 */
export const EQUIPMENT: readonly { name: string; label: string }[] = [
  { name: "sword", label: "Sword" },
  { name: "shield", label: "Shield" },
  { name: "club", label: "Club (two-handed)" },
  { name: "empty", label: "Empty" },
];

export interface SideSetup {
  /** Which body. One kind for now; see `UNITS`. */
  unit: string;
  /** Which policy, by `Policy.name` in `mind.ts`. */
  policy: string;
  control: Control;
  /** The primary hand -- the one the mouse starts on. */
  handA: string;
  /** The secondary. `empty` is a choice rather than an absence. */
  handB: string;
}

export interface Matchup {
  left: SideSetup;
  right: SideSetup;
}

/**
 * The units on offer.
 *
 * One of them, and it is still a list feeding a `select` rather than a label,
 * because the day there are two the control that has to change is the one that
 * already exists -- and because a label is a promise that the choice does not
 * matter, which is not what is meant here.
 */
export const UNITS: readonly { name: string; label: string }[] = [
  { name: "warrior", label: "Warrior" },
];

/**
 * What the screen opens on.
 *
 * The left side is yours. The plan's sketch of the screen draws both sides on
 * `mind`, and this deliberately differs: the page as it stands hands you the
 * left fighter the moment you press the button, and a session that adds a screen
 * should not also quietly take the sword away. Choosing `mind` on the left is one
 * click, and the idle-versus-idle pairing the plan asks for is two.
 */
export function defaultMatchup(): Matchup {
  return {
    // A sword and an empty hand, which is what every fighter carried before
    // there was a choice -- so the default matchup is the body every number in
    // `docs/measurements.md` was taken from, and a bout opened without touching
    // the pickers is still that measurement's bout.
    left: { unit: "warrior", policy: "idle", control: "you", handA: "sword", handB: "empty" },
    right: { unit: "warrior", policy: "idle", control: "mind", handA: "sword", handB: "empty" },
  };
}

/** Which side the person is on, or null when two policies are fighting. */
export function humanSide(matchup: Matchup): Side | null {
  if (matchup.left.control === "you") return "left";
  if (matchup.right.control === "you") return "right";
  return null;
}

const other = (side: Side): Side => (side === "left" ? "right" : "left");

const copy = (matchup: Matchup): Matchup => ({
  left: { ...matchup.left },
  right: { ...matchup.right },
});

export function withUnit(matchup: Matchup, side: Side, unit: string): Matchup {
  const next = copy(matchup);
  next[side].unit = unit;
  return next;
}

export function withPolicy(matchup: Matchup, side: Side, policy: string): Matchup {
  const next = copy(matchup);
  next[side].policy = policy;
  return next;
}

/**
 * Choosing who you are, which is also choosing who you are not.
 *
 * There is one of you, so taking a side gives the other one back to its policy.
 * Two radio groups cannot say that on their own -- each only knows its own two
 * buttons -- so the rule lives here where it can be tested, and the screen
 * re-reads both groups from the answer. Letting the DOM own it instead is how
 * you get a setup screen that offers two humans and an arena that has one.
 */
/**
 * Put something in a hand.
 *
 * The club is one weapon and takes two hands, so choosing it in either hand
 * fills both, and choosing anything else in a hand that was holding half a club
 * empties the other. The rule lives here rather than in the DOM for exactly the
 * reason "there is one of you" does: `setup.ts` re-reads the whole screen from
 * the matchup after every change, precisely because a change to one control can
 * legitimately move another.
 *
 * `Fighter` enforces the same rule again when it builds a body, because a
 * harness that makes a fighter directly never goes near this screen.
 */
export function withEquipment(
  matchup: Matchup,
  side: Side,
  hand: "handA" | "handB",
  kind: string,
): Matchup {
  const next = copy(matchup);
  const other = hand === "handA" ? "handB" : "handA";
  next[side][hand] = kind;
  if (kind === "club") next[side][other] = "club";
  else if (next[side][other] === "club") next[side][other] = "empty";
  return next;
}

export function withControl(matchup: Matchup, side: Side, control: Control): Matchup {
  const next = copy(matchup);
  next[side].control = control;
  if (control === "you") next[other(side)].control = "mind";
  return next;
}

/**
 * Taking a body in the middle of a bout.
 *
 * It is `withControl` and nothing else, which is the point rather than a
 * shortcut. Who is driving which fighter is already a property of the matchup --
 * it is what the setup screen edits, what `humanSide` answers, and what
 * `main.ts` reads to decide whom the camera follows, which body the aim
 * indicator draws for and which pair `Targeting` is pointed at. Stepping into a
 * body mid-fight is the same fact arriving through a different door, so it is
 * the same field, and everything downstream retargets without being told.
 *
 * Two consequences worth stating because they are load-bearing rather than
 * incidental. There is one of you, so `withControl` gives the body you left back
 * to `mind` in the same breath -- the arena never has to work out who was
 * displaced, because the matchup has already said. And the change persists past
 * the bout: `restart` keeps the matchup and `toSelect` carries it back to the
 * screen, so a bout you fought out from the right-hand body opens the screen
 * again with the right-hand body yours. That is the same argument `toSelect`
 * already makes for keeping the matchup at all -- the thing you want after a
 * bout is the same bout again -- applied to a choice you made with a click
 * instead of with a radio button.
 *
 * Refused from the screen, by returning exactly the state it was handed. There
 * is no body to take there, the radio buttons already own the same field, and a
 * takeover armed behind the curtain would be a click on a fighter nobody can
 * see. `over` is allowed: a decided bout deliberately does not stop the world --
 * see `Phase` -- so there are still two bodies being driven, and refusing to let
 * somebody pick one up while the verdict is on screen would be a rule invented
 * to protect a banner.
 */
export function takeBody(state: BoutState, side: Side): BoutState {
  if (state.phase === "select") return state;
  return { ...state, matchup: withControl(state.matchup, side, "you") };
}

/**
 * The part of a `Limb` the rules read. `Limb` satisfies it structurally, so
 * `Fighter.limbs` is handed straight in and there is no per-frame projection
 * between the body and the rule that decides it is finished.
 */
export interface PartState {
  key: string;
  health: number;
  severed: boolean;
}

/**
 * The part of a `HitReport` the ending reads, declared here rather than imported
 * so that nothing in this module's graph reaches Babylon. `HitReport` satisfies
 * it, and `tests/bout.test.mjs` can write one out by hand in four fields instead
 * of building three `Vector3`s it would never look at.
 */
export interface Blow {
  by: Side;
  /** The limb's label, as the readout spells it: "Head", "Sword arm". */
  limb: string;
  kind: HitKind;
  /** Speed of the blade at the contact point, m/s. */
  speed: number;
  /** Simulation time it landed at. */
  at: number;
}

/** One side of the ring as the rules see it. */
export interface SideState {
  parts: readonly PartState[];
  /** The last blow *this* side landed, which is what names it if it wins. */
  lastBlow: Blow | null;
}

export interface Ring {
  left: SideState;
  right: SideState;
}

/** How a bout finished. */
export type Ending = "beaten" | "time";

export interface Outcome {
  /** Null is a draw. */
  winner: Side | null;
  ending: Ending;
  /** The blow that landed it, when there is one to name. */
  blow: Blow | null;
  /** The sentence the banner shows, built here so a test can argue with it. */
  text: string;
}

export interface BoutState {
  phase: Phase;
  matchup: Matchup;
  /** Simulation seconds since this bout began. Only runs while fighting. */
  clock: number;
  /** Set exactly when the phase becomes `over`, and cleared by every way out. */
  outcome: Outcome | null;
}

/**
 * Whether a body is finished.
 *
 * Two conditions, straight from the plan: a head or a torso off, or every part
 * it has at zero.
 *
 * The torso is named even though `Fighter` gives it `attachment: null` and it
 * therefore cannot come off today. Severability is a property of the body, not
 * of the rule, and session 08's authored warrior is free to change it; a rule
 * that only names the parts that happen to be severable this week has to be
 * found and edited when one more becomes so, and nobody would think to look.
 *
 * The consequence worth writing down is that a torso beaten to nothing does not
 * end a bout on its own -- the second clause takes the whole body, all twelve
 * parts. So most bouts will end on a cut to the head, and "every part at zero"
 * is the long way round. That is what the plan asks for and it is not obviously
 * right: the torso is the biggest target on the body and the one a swing finds
 * by accident, so making it lethal on its own would make it the whole game. The
 * first person to play a bout to the end should say which of the two is worse.
 */
export function beaten(parts: readonly PartState[]): boolean {
  // A body with no parts at all is a disposed fighter, not a beaten one, and
  // `every` on an empty list would answer yes to the second clause.
  if (parts.length === 0) return false;
  for (const part of parts) {
    if (part.severed && (part.key === "head" || part.key === "torso")) return true;
  }
  return parts.every((part) => part.health <= 0);
}

const KIND_NOUN: Record<HitKind, string> = {
  crush: "crushing blow",
  cut: "cut",
  thrust: "thrust",
  slap: "flat",
  weak: "shove",
};

/**
 * What the end of a bout is called.
 *
 * The winner and how, from the report of the blow that landed it, because a
 * fight that ends with a number on a bar teaches nothing and "right, by a cut to
 * the head at 14.2 m/s" is a sentence about something you just watched happen.
 *
 * Plain ASCII with no markup: it is a rule's answer and the screen's business
 * what to do with it. `main.ts` puts it in the banner beside text that does
 * carry entities, which is why there is no dash in here to get wrong.
 */
export function verdict(winner: Side | null, ending: Ending, blow: Blow | null): string {
  if (ending === "time") {
    return `a draw: neither could finish it inside ${CONFIG.bout.capSeconds} s`;
  }
  if (!winner) return "a draw: both fell together";
  if (!blow) return `${winner}, left standing`;
  const noun = KIND_NOUN[blow.kind];
  const where = blow.limb.toLowerCase();
  return `${winner}, by a ${noun} to the ${where} at ${blow.speed.toFixed(1)} m/s`;
}

/**
 * Whether the fight is over yet, and what to call it if so. Null while it is on.
 *
 * The cap is a draw whatever the state of the two bodies, and that is a decision
 * rather than an omission. Deciding a fight on accumulated damage means writing
 * a scoring rule, and a scoring rule invented in passing by the function that
 * needed a tie-break quietly becomes the balance of the game. `scoring.ts` is
 * where such a rule would belong, with a test, on the day somebody wants one.
 *
 * Both sides finished on the same step is a draw for the same reason: there is
 * no honest way to order two things that happened in one solver step, and
 * picking the left one because it is checked first is exactly the sort of
 * accident that ends up being called a rule.
 */
export function settle(ring: Ring, clock: number): Outcome | null {
  const leftDown = beaten(ring.left.parts);
  const rightDown = beaten(ring.right.parts);

  if (leftDown || rightDown) {
    const winner: Side | null = leftDown === rightDown ? null : leftDown ? "right" : "left";
    const blow = winner ? ring[winner].lastBlow : null;
    return { winner, ending: "beaten", blow, text: verdict(winner, "beaten", blow) };
  }

  if (clock >= CONFIG.bout.capSeconds) {
    return { winner: null, ending: "time", blow: null, text: verdict(null, "time", null) };
  }

  return null;
}

/** The screen, with a matchup on it. */
export function selectScreen(matchup: Matchup): BoutState {
  return { phase: "select", matchup, clock: 0, outcome: null };
}

/**
 * The Fight button.
 *
 * Takes the matchup from the screen rather than from the state it is handed,
 * because the screen is what the player has been editing and the state is only
 * where the last bout's copy of it was kept. Refused -- by returning exactly the
 * state it was given -- from anywhere but the screen, so that a click on a
 * button that says "Resume" cannot silently start a different fight.
 */
export function begin(state: BoutState, matchup: Matchup): BoutState {
  if (state.phase !== "select") return state;
  return { phase: "fight", matchup, clock: 0, outcome: null };
}

/**
 * `R` during a fight: the same bout again, from nothing.
 *
 * `Space` did this until `Space` became the pause, which is what a key beside
 * the thumb is for once you are driving a body rather than watching one. The
 * behaviour is unchanged and it is kept because it is the key you press when you
 * have made a mess of a limb and want to try the cut again. `main.ts` rebuilds
 * both fighters beside this; the clock going back to zero is this function's
 * whole share of it.
 */
export function restart(state: BoutState): BoutState {
  if (state.phase !== "fight") return state;
  return { ...state, clock: 0, outcome: null };
}

/**
 * From a finished bout, whichever of `Space`, `Esc` and `R` you press: back to
 * the screen with the same matchup selected, because the thing you want after a
 * bout is the same bout again. All three agree there deliberately -- a decided
 * fight has nothing left to pause and nothing worth rebuilding in place.
 */
export function toSelect(state: BoutState): BoutState {
  if (state.phase === "select") return state;
  return selectScreen(state.matchup);
}

/**
 * One frame of the rules.
 *
 * Only the fight phase has a clock, so this is the one place time passes and the
 * one place a bout can end. `dt` is the rendered frame's delta rather than the
 * solver's substep, which is the same clock `Combat` stamps its reports with --
 * so `Outcome.blow.at` and `BoutState.clock` are comparable, which they would not
 * be if this counted substeps.
 */
export function advance(state: BoutState, ring: Ring, dt: number): BoutState {
  if (state.phase !== "fight") return state;
  const clock = state.clock + dt;
  const outcome = settle(ring, clock);
  if (!outcome) return { ...state, clock };
  return { ...state, clock, phase: "over", outcome };
}
