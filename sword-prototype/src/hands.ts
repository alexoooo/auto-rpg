/**
 * The vocabulary a hand is described in: which hand it is, and what is in it.
 *
 * **This file imports nothing**, and that is its entire reason for existing
 * rather than being a few more lines of `weapon.ts` and `mind.ts`. Both halves
 * of it are things a *policy* has to be able to say, and `policies.ts` keeps an
 * import graph of exactly `config.ts` so that `tests/minds.test.mjs` costs
 * milliseconds rather than seconds:
 *
 * - **What is in the hand**, because a shield is interposed and a blade is
 *   swung, and there is no way to plan a hand without the question. The
 *   predicates lived in `weapon.ts`, which imports Babylon, so asking from a
 *   policy would have dragged a whole scene in.
 * - **Which hand**, because a policy now plans both of them and has to name the
 *   other one. `HANDS` and `otherHand` lived in `mind.ts`, and `mind.ts` imports
 *   `policies.ts` at run time -- so reaching back for them would have closed a
 *   real module cycle. A cycle that happens to work because nobody reads the
 *   constant during evaluation is the thing that stops working when somebody
 *   moves a line, and it stops working in the browser rather than in a test.
 *
 * `weapon.ts` re-exports the kinds and `mind.ts` re-exports the hand names, so
 * nothing that already imported one of these had to change. Each name has one
 * declaration, here, and everything else is a forwarding.
 */

/** Which of a fighter's two hands. */
export type HandName = "primary" | "secondary";

/**
 * Both of them, for the loops that must not favour the one being driven.
 *
 * Frozen order, and `primary` first: it is the hand the mouse starts on, the
 * hand every figure in `docs/measurements.md` was taken from, and the hand a
 * policy prefers to attack with when both could.
 */
export const HANDS: readonly HandName[] = ["primary", "secondary"];

/** The other one. */
export const otherHand = (hand: HandName): HandName =>
  hand === "primary" ? "secondary" : "primary";

/**
 * What is in a hand.
 *
 * `empty` is a kind rather than a null, and that is deliberate: a hand holding
 * nothing is still a hand that swings, blocks with its forearm and can be cut
 * off, and every path that asks "what is in this hand" would otherwise have to
 * ask "is there anything in this hand" first. The one place it does become a
 * null is the physics -- there is no body for an empty hand to weld to.
 */
export type WeaponKind = "sword" | "axe" | "shield" | "buckler" | "club" | "empty";

/**
 * What a kind *is*, as one row per kind, and the whole reason this file was
 * worth opening a second time.
 *
 * Everything below used to be a `===` chain with a default, and every one of
 * them answered for a kind it had never heard of. That is not a hypothetical:
 * `isStriking` is the question session 03 made a policy ask to decide **which
 * hand it attacks with**, and its default is `false` -- so a kind added to the
 * union, given a builder, given a mesh, given a picker entry and given a place
 * in `EQUIPMENT` is a weapon that compiles, ships, and that every policy in the
 * program silently declines to swing. The fighter stands there holding it.
 *
 * `Record<WeaponKind, Grip>` is total, so a kind without a row is a compile
 * error, and every predicate under it is a field read rather than a guess.
 * `weapon.ts` builds its meshes from a second such record and `scoring.ts`
 * decides what a blow is worth from a third; this one is the *shape* of the
 * thing, which is the half every layer above the physics asks about.
 */
interface Grip {
  /** How many hands it takes. */
  hands: 1 | 2;
  /**
   * How it is carried: out on the end of the arm like a blade, or strapped
   * across the forearm.
   *
   * The whole of what `mountFor` needs, and it used to be spelled `kind ===
   * "shield"` in two files that had to agree with each other.
   */
  carry: "held" | "strapped";
  /** What it is for. */
  use: "strike" | "cover" | "none";
  /**
   * Whether it has a point that can be driven into somebody.
   *
   * A sword does. An axe does not: the top of an axe head is a corner, and
   * driving it forward is a shove. Nothing in the AI reads this, because no
   * policy thrusts -- see `duelist`, which explains at length why not -- so this
   * is a rule a *person* meets, on the left mouse button, and one the bench
   * cannot price.
   */
  point: boolean;
  /**
   * Whether it cuts on both sides of its edge axis, or only on +X.
   *
   * The arming sword is double-edged and genuinely cuts either way, which is
   * why the damage model has always taken the absolute value of the edge
   * alignment. An axe is single-bitted: swung backhand it arrives poll-first,
   * and a poll is a lump of steel rather than an edge. `scoring.ts` is where
   * that becomes a number.
   */
  bothEdges: boolean;
}

/**
 * Every kind, in the order the picker offers them.
 *
 * `empty` is a row like any other. A hand holding nothing is still a hand that
 * can be cut off and still a hand a policy has to plan, and the alternative to a
 * row is a null check in front of every question.
 */
const GRIPS: Record<WeaponKind, Grip> = {
  sword: { hands: 1, carry: "held", use: "strike", point: true, bothEdges: true },
  axe: { hands: 1, carry: "held", use: "strike", point: false, bothEdges: false },
  shield: { hands: 1, carry: "strapped", use: "cover", point: false, bothEdges: false },
  buckler: { hands: 1, carry: "held", use: "cover", point: false, bothEdges: false },
  club: { hands: 2, carry: "held", use: "strike", point: false, bothEdges: false },
  empty: { hands: 1, carry: "held", use: "none", point: false, bothEdges: false },
};

/**
 * Every kind that is actually a thing, in the order the picker offers them.
 *
 * Derived rather than written out, because it was written out for three
 * sessions and read by nobody -- which is the state a hand-maintained copy of a
 * list ends up in, and `AGENTS.md` carries the rule about it. `Object.keys` of a
 * total record over the union *is* the union, in declaration order, so this
 * cannot drift from `GRIPS` and the cast is on the type rather than on the
 * value. It has a reader now: `tests/bout.test.mjs` asserts that the picker
 * offers exactly these, so a kind added here and forgotten on the setup screen
 * is a failing test rather than a weapon nobody can choose.
 */
export const WEAPON_KINDS = Object.keys(GRIPS) as readonly WeaponKind[];

/**
 * Is this string one of them?
 *
 * The guard at the boundary where a `<select>`'s value becomes a weapon.
 * `main.ts` used to spell that boundary `side.handA as WeaponKind`, which is a
 * promise rather than a check -- and the day the table below became total, an
 * unrecognised string stopped being "a one-handed thing that is not a shield"
 * and started being `undefined.hands`. A `TypeError` from inside `handsFor` is a
 * worse way to learn that a saved matchup has gone stale than a named refusal at
 * the door.
 */
export const isWeaponKind = (value: string): value is WeaponKind =>
  Object.hasOwn(GRIPS, value);

/**
 * The same question asked as a conversion, for the one caller that has to hand
 * a body *something*.
 *
 * An empty hand is the honest thing to put in a hand whose contents nobody
 * recognises, and it is what the picker's own default already is. Here rather
 * than inline in `main.ts` because `main.ts` has no test and this does -- and
 * because a repository with two spellings of "trust this string or do not" ends
 * up trusting it in one of them.
 */
export const kindOrEmpty = (value: string): WeaponKind =>
  isWeaponKind(value) ? value : "empty";

/** How many hands a kind takes. Only the club takes two. */
export const handsFor = (kind: WeaponKind): 1 | 2 => GRIPS[kind].hands;

/**
 * Is this kind a shield -- something that covers and scores nothing?
 *
 * True for both. What follows from it: the thing goes on the shield collision
 * layer, which is the one its owner's own trunk can stop, `scoring.ts` gives it
 * no damage however hard it arrives, and a policy holding one interposes it
 * rather than swinging it.
 */
export const isShield = (kind: WeaponKind): boolean => GRIPS[kind].use === "cover";

/**
 * Is this kind **strapped** across the forearm, rather than held out on the arm?
 *
 * True for the heater shield and nothing else, and it is a different question
 * from `isShield` -- which is exactly why they are two functions. Being strapped
 * is what forces the plate's normal square to the forearm, and everything that
 * costs follows from it: the hand is built already turned to the front so the
 * board is not made inside its owner's pelvis, the frame is seeded from the
 * radial rather than from world up, and the reach is capped so the elbow bends.
 *
 * A buckler is none of that. It is held out on the end of the arm like a blade,
 * so it takes the blade's mount, the blade's seed and the blade's reach.
 */
export const isStrapped = (kind: WeaponKind): boolean => GRIPS[kind].carry === "strapped";

/**
 * Can this kind be swung at somebody?
 *
 * The complement of `isShield` over the kinds that are things, and it is written
 * as its own question rather than as a negation because it is asked for its own
 * reason: it is how a policy decides **which hand it is attacking with**. A
 * fighter carrying a shield in the primary and a sword in the secondary attacked
 * with the shield for as long as `driving` was a constant, and this is what
 * stops that.
 *
 * `empty` is false. A bare fist genuinely can hurt somebody and the damage model
 * would happily score it, but nothing welds a body to an empty hand, so there is
 * no contact to score and a policy that chose one as its attacking hand would
 * swing at the air for the rest of the bout.
 */
export const isStriking = (kind: WeaponKind): boolean => GRIPS[kind].use === "strike";

/**
 * Can this kind be driven point-first?
 *
 * The sword can, and it is the only one that can. A club has a head rather than
 * a point, a shield has an edge you could shove with and nothing to drive, and
 * **an axe has a corner**: the top horn of a bearded axe will catch on a mail
 * collar and that is about the end of it. `scoring.ts` is what enforces it --
 * a thrust with anything else is a shove, which is what `slap` already means.
 *
 * No policy reads this, and that is not an oversight either. `policies.ts` sets
 * `thrust = false` on every hand of every intent it writes, and `duelist`'s own
 * docstring argues at length that a thrusting policy is a second policy rather
 * than a branch in this one. So this is a rule a **person** meets, on the left
 * mouse button, and the half of the axe's trade that the bench cannot see.
 */
export const hasPoint = (kind: WeaponKind): boolean => GRIPS[kind].point;

/**
 * Does this kind cut on both sides of its edge axis, or only on +X?
 *
 * The arming sword is double-edged, so a cut is worth what it is worth whichever
 * way the blade was travelling, and the damage model has taken the absolute
 * value of the edge alignment since the day there was one. An axe is not: the
 * bit is on +X and the poll is on -X, and a blow that arrives poll-first is a
 * lump of steel on a stick rather than an edge. Without this the axe is a short
 * heavy sword that happens to cut with its back, which is not a weapon anybody
 * has ever carried.
 */
export const cutsBothWays = (kind: WeaponKind): boolean => GRIPS[kind].bothEdges;
