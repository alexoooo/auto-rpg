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
export type WeaponKind =
  | "sword"
  | "axe"
  | "bow"
  | "shield"
  | "buckler"
  | "club"
  | "empty";

/**
 * Everything that can hurt somebody, which is **not** the same list.
 *
 * An arrow is a thing that hits and is not a thing a hand holds, and that one
 * sentence is the whole of why this type exists. It was declared in
 * `scoring.ts`, by hand, until session 04 found it had drifted into an exact
 * copy of `WeaponKind` and collapsed it into an alias -- correctly, on the
 * evidence available, and wrongly one session later.
 *
 * The lesson is worth more than the type: **two unions that are equal today are
 * not the same union**, and the test is not whether they currently agree, it is
 * whether you can name the member that is coming. `HandView.reach` was deleted
 * and restored for exactly the same reason, one session apart.
 *
 * What keeps this from being a hand-maintained list again is the direction of
 * the derivation. `GRIPS` below is keyed by `Striker`, and `WEAPON_KINDS` is
 * the rows of it that a hand can actually take -- so the narrow list is
 * computed from the wide table rather than written beside it.
 */
export type Striker = WeaponKind | "arrow";

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
 * `Record<Striker, Grip>` is total, so a kind without a row is a compile error,
 * and every predicate under it is a field read rather than a guess. `weapon.ts`
 * builds its meshes from a second such record and `scoring.ts` decides what a
 * blow is worth from a third; this one is the *shape* of the thing, which is the
 * half every layer above the physics asks about.
 *
 * It is keyed by `Striker` rather than by `WeaponKind`, so the arrow -- which no
 * hand ever holds -- has a row here too, and `WEAPON_KINDS` is what filters it
 * back out. Every field below is answerable for an arrow, and answerable
 * *truthfully*: it takes no hands, it is not carried, it strikes, it is all
 * point, and it has no second edge. A row that had to be filled in with
 * placeholders would be an argument against keying it this way; there are none.
 */
interface Grip {
  /**
   * How many hands it takes.
   *
   * **Zero is a real answer**, and it is the arrow's. It was `1 | 2` while every
   * row was something a person picks up.
   */
  hands: 0 | 1 | 2;
  /**
   * How it is carried: out on the end of the arm like a blade, strapped across
   * the forearm, or not carried at all.
   *
   * The whole of what `mountFor` needs, and it used to be spelled `kind ===
   * "shield"` in two files that had to agree with each other. `loosed` is the
   * third answer and it does a second job: it is what `WEAPON_KINDS` and
   * `isWeaponKind` test, so a thing that is shot rather than held cannot reach
   * the picker, a `<select>` value, or `Weapon`'s builder.
   */
  carry: "held" | "strapped" | "loosed";
  /** Whether this row owns a separate weapon body in the hand. */
  heldWeapon: boolean;
  /**
   * What it is for.
   *
   * `shoot` is not a flavour of `strike`, and keeping them apart is what stops a
   * policy swinging a bow. `isStriking` is how a policy chooses the hand it
   * attacks with; a bow is not swung, so it answers false, and `archer` asks
   * `isShooting` instead.
   */
  use: "strike" | "cover" | "shoot" | "none";
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
const GRIPS: Record<Striker, Grip> = {
  sword: { hands: 1, carry: "held", heldWeapon: true, use: "strike", point: true, bothEdges: true },
  axe: { hands: 1, carry: "held", heldWeapon: true, use: "strike", point: false, bothEdges: false },
  // Two hands, like the club, and for the same reason the club takes two: one
  // holds it and the other works it. `mountFor` gives it the blade's mount, so
  // its +Y runs out along the arm and **an arrow flies where the arm points**.
  bow: { hands: 2, carry: "held", heldWeapon: true, use: "shoot", point: false, bothEdges: false },
  shield: { hands: 1, carry: "strapped", heldWeapon: true, use: "cover", point: false, bothEdges: false },
  buckler: { hands: 1, carry: "held", heldWeapon: true, use: "cover", point: false, bothEdges: false },
  club: { hands: 2, carry: "held", heldWeapon: true, use: "strike", point: false, bothEdges: false },
  empty: { hands: 1, carry: "held", heldWeapon: false, use: "strike", point: false, bothEdges: false },
  // Not a weapon, and every field says so honestly rather than by omission.
  arrow: { hands: 0, carry: "loosed", heldWeapon: false, use: "strike", point: true, bothEdges: false },
};

/**
 * Is this a thing a hand can take?
 *
 * The one claim in this file that the compiler is taking on trust, and it is
 * confined to a single line so that it can be. Everything that separates the two
 * unions goes through here.
 */
const held = (kind: Striker): kind is WeaponKind => GRIPS[kind].carry !== "loosed";

/**
 * Every kind that is actually a thing, in the order the picker offers them.
 *
 * Derived rather than written out, because it was written out for three
 * sessions and read by nobody -- which is the state a hand-maintained copy of a
 * list ends up in, and `AGENTS.md` carries the rule about it. `Object.keys` of a
 * total record over the union *is* the union, in declaration order, so this
 * cannot drift from `GRIPS`. It has a reader: `tests/bout.test.mjs` asserts that
 * the picker offers exactly these, so a kind added here and forgotten on the
 * setup screen is a failing test rather than a weapon nobody can choose.
 *
 * The filter is what makes `GRIPS` able to carry the arrow without the arrow
 * turning up on the setup screen. It is stated as a property of the row --
 * "nobody carries this" -- rather than as a name to skip, so the next thing that
 * is shot rather than held needs no edit here.
 */
export const WEAPON_KINDS: readonly WeaponKind[] = (Object.keys(GRIPS) as Striker[]).filter(held);

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
 *
 * `"arrow"` is a row in `GRIPS` and is refused here, which is the door the two
 * unions meet at: a string is only a `WeaponKind` if it is a row *and* the row
 * is something a hand takes.
 */
export const isWeaponKind = (value: string): value is WeaponKind =>
  Object.hasOwn(GRIPS, value) && held(value as Striker);

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

/** How many hands a kind takes. The club and the bow take two; an arrow takes none. */
export const handsFor = (kind: Striker): 0 | 1 | 2 => GRIPS[kind].hands;

/** Does this kind put a separate weapon body in the hand? */
export const hasHeldWeapon = (kind: Striker): boolean => GRIPS[kind].heldWeapon;

/**
 * Is this kind a shield -- something that covers and scores nothing?
 *
 * True for both. What follows from it: the thing goes on the shield collision
 * layer, which is the one its owner's own trunk can stop, `scoring.ts` gives it
 * no damage however hard it arrives, and a policy holding one interposes it
 * rather than swinging it.
 */
export const isShield = (kind: Striker): boolean => GRIPS[kind].use === "cover";

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
export const isStrapped = (kind: Striker): boolean => GRIPS[kind].carry === "strapped";

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
 * `empty` is true: its striker is the real simulated hand rather than a weapon
 * welded onto it. `hasHeldWeapon` keeps that distinction available to policies
 * which must prefer steel while still treating a bare fist as an attack.
 *
 * **A bow is false**, and that is the one answer here worth arguing with. It is
 * a weapon, it is in the picker, and it kills people -- and it is not *swung*,
 * so a policy that picked the bow hand as the hand it attacks with would run a
 * cut with a stave. The consequence is stated rather than discovered: `duelist`
 * and `swinger` handed a bow find no striking hand and fall through
 * `attackHand`'s nothing-left-to-swing branch, which is the branch two shields
 * already take. That is a fighter who has brought a bow to a sword fight, which
 * is a true thing about the world rather than a hole -- and `archer`, which asks
 * `isShooting`, is the policy that knows what to do with one.
 */
export const isStriking = (kind: Striker): boolean => GRIPS[kind].use === "strike";

/**
 * Can this kind be loosed at somebody from across the arena?
 *
 * Its own question rather than a flavour of `isStriking`, for the reason that
 * one is its own question rather than a negation of `isShield`: it is asked for
 * its own purpose. `archer` reads it to find the hand it shoots with, `Arm` reads
 * it to decide whether to build a quiver at all, and neither of those wants the
 * hand that swings.
 */
export const isShooting = (kind: Striker): boolean => GRIPS[kind].use === "shoot";

/**
 * Can this kind be driven point-first?
 *
 * The sword can, and it is the only one that can. A club has a head rather than
 * a point, a shield has an edge you could shove with and nothing to drive, and
 * **an axe has a corner**: the top horn of a bearded axe will catch on a mail
 * collar and that is about the end of it. `scoring.ts` is what enforces it --
 * a thrust with anything else is a shove, which is what `slap` already means.
 *
 * An **arrow** is the one thing here that is nothing but point, and it does not
 * read this either: `scoring.ts` gives it a bite of its own -- `how: "point"` --
 * because an arrow has no cutting branch to fall out of and no tip zone to be
 * near. The field is true for it because it is true, not because anything asks.
 *
 * No policy reads this, and that is not an oversight either. `duelist` and
 * `swinger` set `thrust = false` on every hand of every intent they write, and
 * `duelist`'s own docstring argues at length that a thrusting policy is a second
 * policy rather than a branch in this one. So this is a rule a **person** meets,
 * on the left mouse button, and the half of the axe's trade that the bench
 * cannot see. `archer` holds the button, but it is holding it to draw a bow --
 * which has no point either.
 */
export const hasPoint = (kind: Striker): boolean => GRIPS[kind].point;

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
export const cutsBothWays = (kind: Striker): boolean => GRIPS[kind].bothEdges;
