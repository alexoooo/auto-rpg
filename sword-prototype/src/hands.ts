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
export type WeaponKind = "sword" | "shield" | "buckler" | "club" | "empty";

/** Every kind that is actually a thing, in the order the picker offers them. */
export const WEAPON_KINDS: readonly WeaponKind[] = [
  "sword",
  "shield",
  "buckler",
  "club",
  "empty",
];

/** How many hands a kind takes. Only the club takes two. */
export const handsFor = (kind: WeaponKind): 1 | 2 => (kind === "club" ? 2 : 1);

/**
 * Is this kind a shield -- something that covers and scores nothing?
 *
 * True for both. What follows from it: the thing goes on the shield collision
 * layer, which is the one its owner's own trunk can stop, `scoring.ts` gives it
 * no damage however hard it arrives, and a policy holding one interposes it
 * rather than swinging it.
 */
export const isShield = (kind: WeaponKind): boolean =>
  kind === "shield" || kind === "buckler";

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
export const isStrapped = (kind: WeaponKind): boolean => kind === "shield";

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
export const isStriking = (kind: WeaponKind): boolean =>
  kind === "sword" || kind === "club";
