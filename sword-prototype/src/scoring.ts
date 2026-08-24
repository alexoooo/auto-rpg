// Explicit extension: this module and its test are run directly by Node (which
// requires it) as well as bundled by Vite (which does not care).
import { CONFIG } from "./config.ts";
import { cutsBothWays, hasPoint, type Striker } from "./hands.ts";

export type HitKind = "cut" | "thrust" | "slap" | "weak" | "crush";

/**
 * What is doing the hitting, forwarded from `hands.ts`.
 *
 * It was declared here, hand-maintained, as a restatement of `WeaponKind` --
 * because `weapon.ts` imports Babylon and the whole value of this module is that
 * it does not. Session 04 noticed that `hands.ts` imports nothing at all either,
 * so the copy had no job left, and collapsed it to `type Striker = WeaponKind`.
 *
 * One session later there is an arrow: a thing that hits somebody and is not a
 * thing a hand holds. The alias was right about where the type belongs and wrong
 * about what it is, and `hands.ts` now declares both -- so this is a forwarding,
 * which is the shape everything else in that file already has. **Two unions that
 * are equal today are not the same union**; the test is whether you can name the
 * member that is coming.
 */
export type { Striker };

/** A contact reduced to the four numbers that decide what it was worth. */
export interface Contact {
  /** Speed of the blade at the contact point, m/s. */
  speed: number;
  /**
   * `unit velocity . edge axis` -- 1 when travelling straight into the edge,
   * and **signed**, which it was not until there was a weapon with one edge.
   *
   * A sword is double-edged and cuts either way, so the sign means nothing to
   * it and `cutsBothWays` is what says so. An axe's bit is on +X and its poll is
   * on -X: a blow arriving at -1 is the back of the head, and the back of an axe
   * head is a hammer that this model deliberately does not give a hammer's
   * damage to. `combat.ts` keeps the *absolute* value for the readout, because
   * the HUD draws a bar with it and a bar cannot be -87 % wide.
   */
  edgeAlignment: number;
  /** |unit velocity . blade axis| -- 1 when travelling straight along the blade. */
  bladeAlignment: number;
  /** Whether the contact landed in the business end of the point. */
  nearTip: boolean;
}

export interface Score {
  kind: HitKind;
  /** 0..1. How well the blow was delivered, before speed is considered. */
  quality: number;
  damage: number;
}

export type Tuning = typeof CONFIG.combat;

/**
 * What a blow with each kind is worth.
 *
 * The companion of `hands.ts`'s `GRIPS`, and split from it along a seam worth
 * keeping: that one is the *shape* of the thing -- how many hands, how it is
 * carried, whether it has a point -- and this one is what the shape is worth,
 * which is balance and which moves. A kind's row here is three numbers out of
 * `Tuning`, as accessors rather than as values, so the tuning parameter stays a
 * parameter and a test can still hand in a different table.
 *
 * It replaces a pair of `by === "club"` comparisons whose else-branch was the
 * sword. That is the hole this session is named for and it was the worst of the
 * six, because it is the one that compiles, runs, and produces a plausible
 * number: a weapon added to the program without a row here was not broken, it
 * was **a sword with a different mesh**, and nothing on screen said so.
 */
interface Bite {
  /**
   * How it hurts somebody: with an edge that has to be placed, with a point that
   * has to arrive straight, with mass that has to do neither, or not at all.
   *
   * `point` is not "the thrust half of `edge`". The edge branch scores a thrust
   * only for a contact near the tip of something that is mostly *not* a point,
   * and takes the better of the cut and the thrust; an arrow is a point along
   * its whole length, has no cut to lose to and no tip zone to be inside, and a
   * blade's arithmetic applied to one would have scored a hit anywhere along the
   * shaft as a slap. Its own branch is four lines and says what an arrow is.
   */
  how: "edge" | "point" | "mass" | "none";
  /** Contact speed below which it does nothing, and the readout says so. */
  floor: (tuning: Tuning) => number;
  /**
   * Contact speed at which it is worth everything it can be worth.
   *
   * Beside `floor` because it is the same kind of fact -- the two ends of the
   * one ramp -- and per kind for the reason the floor is: `combat.referenceSpeed`
   * is 11 m/s and that is a **blade's** number. An arrow leaves the string at 48,
   * so scored against 11 every arrow that arrives straight saturates at 1 and a
   * half-drawn bow does exactly as much damage as a full one. That is a knob
   * that changes nothing, which is the defect the axe's two refuted knobs were,
   * and this is it caught before it shipped rather than after.
   *
   * Every hand-held row hands back `referenceSpeed`, so nothing about the sword,
   * the axe or the club moves by a bit.
   */
  reference: (tuning: Tuning) => number;
  /** Damage at `reference` for a blow of quality 1. */
  scale: (tuning: Tuning) => number;
  /**
   * How well a blow has to be placed before it may take a limb off.
   *
   * A literal 0.4 in `severs` until there was a second edged weapon to disagree
   * with it. A club's is 0 and that is not a special case being smuggled in: a
   * club only ever scores `crush` or `weak`, `crush` is quality 1 and `weak` is
   * quality 0, so "any crush severs" and "quality above nothing severs" are the
   * same sentence and the old branch was the long way round to it.
   */
  severQuality: (tuning: Tuning) => number;
}

/**
 * A kind that scores nothing: a shield or a buckler.
 *
 * A shield still files a report and still shoves, because the shove is applied
 * by `combat.ts` regardless of quality and a bash is a real thing to do with
 * one -- but a plate has no edge and no point, and giving one damage would be
 * inventing a weapon rather than modelling one.
 *
 * A buckler punch is the case with an argument on the other side: it is a
 * fist-sized boss driven point-first at speed, and people did break faces with
 * them. It is refused all the same, because the moment a shield scores, every
 * policy that holds one has an offensive option nobody designed and the guard
 * stops being a guard. If it is ever given damage it should be given its own
 * kind and its own test, not a share of the sword's.
 *
 * The floor is the blade's, which is the one thing here that is only about the
 * readout: below it a shield contact reads `TOO SLOW` and above it `FLAT`, and
 * it is zero damage either way. It is the blade's number rather than one of its
 * own because that is what it has always been and there is nothing to gain by
 * moving it.
 */
const inert: Bite = {
  how: "none",
  floor: (t) => t.minCutSpeed,
  reference: (t) => t.referenceSpeed,
  scale: () => 0,
  severQuality: () => 1,
};

const BITE: Record<Striker, Bite> = {
  sword: {
    how: "edge",
    floor: (t) => t.minCutSpeed,
    reference: (t) => t.referenceSpeed,
    scale: (t) => t.damageScale,
    severQuality: (t) => t.severQuality,
  },
  /**
   * The axe. Everything about it is the sword's row with two numbers moved and
   * two facts out of `GRIPS` doing the rest.
   *
   * **The sword's row with one number changed**, and that is the finding rather
   * than the starting point. It was drafted with its own speed floor and its own
   * sever bar as well, on arguments that sounded good -- a heavy head arriving
   * slowly still bites; taking limbs off is what an axe is for -- and the bench
   * refused both. The floor moved 24 bouts' damage by 15 points out of 3350 and
   * only changed what got *called* a blow; the sever bar returned byte-identical
   * numbers at 0.2 and at 0.4, because an axe blow that empties a limb has
   * already landed at a quality above either. `config.ts` has both tables.
   *
   * So what is left is `chopScale`: the same arm speed arriving through a hand's
   * width of edge instead of through 840 mm of it.
   *
   * What it pays for that is not in this table at all. It has no point, so a
   * thrust with it is a shove (`hasPoint`); it has one edge, so a backhand
   * arrives poll-first and scores nothing (`cutsBothWays`); it is 27 % shorter
   * than the sword, which is a quarter of a metre a policy has to walk inside
   * the other fighter's range to make up; and its mass is out at the head. Only
   * the first two are rules. The rest is `config.ts` and the solver, which is
   * where a weapon's feel belongs.
   */
  axe: {
    how: "edge",
    floor: (t) => t.minCutSpeed,
    reference: (t) => t.referenceSpeed,
    scale: (t) => t.chopScale,
    severQuality: (t) => t.severQuality,
  },
  /**
   * A club has no edge, so there is nothing to align with and no way to hold it
   * wrong. Everything it does is speed, which is the whole character of the
   * weapon: you cannot place a blow with it, you can only arrive with one.
   *
   * `minCrushSpeed` is below `minCutSpeed` because a blade that arrives slowly
   * is a blade being leaned on and a club that arrives slowly is still several
   * kilograms of wood. Gating both on the blade's number made the club's floor
   * unreachable and the setting a lie -- caught by the test that asserts a club
   * does something at a speed a sword does not.
   */
  club: {
    how: "mass",
    floor: (t) => t.minCrushSpeed,
    reference: (t) => t.referenceSpeed,
    scale: (t) => t.crushScale,
    severQuality: () => 0,
  },
  shield: inert,
  buckler: inert,
  /**
   * A bow, swung.
   *
   * `inert`, like the shields, and for the same reason rather than a different
   * one: it is a stave with a string on it, and a weapon that scores when it is
   * used the way it is not meant to be used is a weapon with an option nobody
   * designed. Everything a bow is worth is in the arrow below.
   */
  bow: inert,
  /**
   * An arrow, which is the first striker in this table that no hand ever holds.
   *
   * All of it is speed and alignment, and the alignment is the *shaft's*: an
   * arrow that arrives point-first buries itself, and one that arrives broadside
   * is a stick hitting somebody. There is no edge to place and no wrist to place
   * it with, so `edgeAlignment` never enters -- which is what `how: "point"`
   * means and why it is not a flavour of the blade's branch.
   *
   * **It never severs.** `severQuality` at 1 is unreachable, which is the same
   * idiom `inert` uses to say never. An arrow through an arm is an arm with an
   * arrow in it; taking the limb off wants an edge and a swing, and giving a
   * projectile that power would make the bow strictly better than the axe at the
   * one thing the axe is for.
   */
  arrow: {
    how: "point",
    floor: (t) => t.minArrowSpeed,
    reference: (t) => t.arrowReference,
    scale: (t) => t.pierceScale,
    severQuality: () => 1,
  },
  /** A bare fist: mass without an edge, point, or severing path. */
  empty: {
    how: "mass",
    floor: (t) => t.fistMinSpeed,
    reference: (t) => t.fistReferenceSpeed,
    scale: (t) => t.fistScale,
    // `mass` scores quality 1; the strict comparison in `severs` makes this
    // unreachable without teaching a fist a special-case exemption there.
    severQuality: () => 1,
  },
  /** A living jaw: point-like damage, but no dismemberment in this contract. */
  bite: {
    how: "point",
    floor: (t) => t.biteMinSpeed,
    reference: (t) => t.biteReferenceSpeed,
    scale: (t) => t.biteScale,
    severQuality: () => 1,
  },
};

/**
 * The contact speed below which this kind does nothing at all.
 *
 * Exported for exactly one caller and worth the export. `combat.ts` bails out
 * before computing a direction and three dot products for a contact too slow to
 * matter, which is a real saving at 240 Hz -- but it bailed out on
 * `minCutSpeed`, hard-coded, which is the blade's number and not everyone's. So
 * a club at 2.5 m/s never reached `scoreHit` at all, and `minCrushSpeed` -- a
 * setting with a paragraph of config comment explaining why it is lower than the
 * blade's, and a unit test proving it works -- did nothing whatsoever in an
 * actual fight for the whole of the club's life. The test was right and the
 * arena never ran the code it tested.
 *
 * That is the same fault as the rest of this session in its purest form: not a
 * missing branch, but a **second copy** of a rule, in a file that had no reason
 * to hold an opinion about it.
 */
export const biteFloor = (by: Striker, tuning: Tuning = CONFIG.combat): number =>
  BITE[by].floor(tuning);

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * The rule that decides whether a contact was a cut, a thrust, or a clang.
 *
 * Kept pure and separate from the physics so it can be argued with in a test
 * rather than only in the browser. This is the balance surface of the whole
 * prototype: change these few lines and the game becomes a different game.
 */
export function scoreHit(
  contact: Contact,
  by: Striker = "sword",
  tuning: Tuning = CONFIG.combat,
): Score {
  const bite = BITE[by];
  const floor = bite.floor(tuning);
  if (contact.speed < floor) {
    // A slow fist still transfers momentum through a real contact. Name that a
    // slap so `Combat` lets it reach the shove path; blades below their floor
    // remain weak because there is no useful action to report or resolve.
    return { kind: by === "empty" ? "slap" : "weak", quality: 0, damage: 0 };
  }

  // How far up its own ramp this arrived, floor to reference, both out of the
  // kind's own row. It was one expression against `tuning.referenceSpeed`, which
  // was every kind's ramp because every kind was swung by an arm.
  const hard = clamp01((contact.speed - floor) / (bite.reference(tuning) - floor));

  if (bite.how === "none") {
    // A slap rather than a kind of its own: the shove still lands, and the
    // readout already has a word for a blow that pushes without biting.
    return { kind: "slap", quality: 0, damage: 0 };
  }

  if (bite.how === "mass") {
    return { kind: "crush", quality: 1, damage: bite.scale(tuning) * hard };
  }

  if (bite.how === "point") {
    // How straight it arrived, and nothing else. A tumbling arrow's velocity is
    // across its own shaft, `bladeAlignment` collapses toward zero, and the same
    // 45 m/s that buries a clean shot is a stick hitting somebody.
    const quality = Math.pow(contact.bladeAlignment, tuning.edgeExponent);
    const kind: HitKind = quality < 0.25 ? "slap" : "thrust";
    return { kind, quality, damage: bite.scale(tuning) * quality * hard };
  }

  // Which way round the blade was travelling, for the kinds that care. A sword
  // cuts on both sides and takes the magnitude; an axe cuts on +X only, so a
  // backhand is a negative alignment and floors at zero rather than folding up
  // into a cut delivered with the back of the head.
  const along = cutsBothWays(by)
    ? Math.abs(contact.edgeAlignment)
    : Math.max(0, contact.edgeAlignment);

  const cutQuality = Math.pow(along, tuning.edgeExponent);
  // Driving the middle of the blade lengthwise into something is a shove, not a
  // thrust, so only a contact near the point can score as one -- and only with
  // something that has a point at all.
  const thrustQuality =
    hasPoint(by) && contact.nearTip
      ? Math.pow(contact.bladeAlignment, tuning.edgeExponent)
      : 0;

  const thrusting = thrustQuality > cutQuality;
  const quality = thrusting ? thrustQuality : cutQuality;
  const kind: HitKind = quality < 0.25 ? "slap" : thrusting ? "thrust" : "cut";

  return { kind, quality, damage: bite.scale(tuning) * quality * hard };
}

/**
 * Whether a blow that emptied a limb should also take it off.
 *
 * Beating a limb to nothing with the flat leaves it ruined but attached, which
 * is both more interesting and more honest than letting a clumsy player
 * dismember by accumulation.
 *
 * One rule for every kind now, where there used to be a club-shaped branch in
 * front of it. The branch said "a club severs when it crushes", which for a
 * weapon whose only two outcomes are a quality-1 crush and a quality-0 nudge is
 * the same sentence as "a club has no placement bar" -- so the bar moved into
 * the table beside the kind it belongs to, and the axe's is lower than the
 * sword's because taking limbs off is what an axe is for.
 */
export function severs(
  score: Score,
  remainingHealth: number,
  by: Striker = "sword",
  tuning: Tuning = CONFIG.combat,
): boolean {
  if (remainingHealth > 0) return false;
  const bite = BITE[by];
  if (bite.how === "none") return false;
  return score.quality > bite.severQuality(tuning) && score.kind !== "slap";
}
