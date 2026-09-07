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

/**
 * A contact reduced to the numbers that decide what it was worth.
 *
 * Three of them are physics -- what was swung, what it met, and how fast the two were closing
 * along the surface between them -- and three are placement. There is no `speed` here any more,
 * and its absence is this session's whole argument: how fast a striker was travelling says
 * nothing about how much of that arrived, and the difference between a square blow and a rake
 * is exactly the difference between the two.
 */
export interface Contact {
  /**
   * How fast the striker was arriving into the surface at the contact point, m/s.
   *
   * Its velocity at the point, projected on the contact normal. A blow driven straight in keeps
   * all of its speed here; a rake across a surface keeps almost none of it, which is what ends a
   * rake being paid as a cut. Only the normal component of a collision is lost to deformation --
   * the tangential part is friction's business -- which is what entitles this to be squared.
   *
   * The struck part's own motion is not subtracted, and `Combat.closingSpeedAt` is where the
   * measurement that says why lives: by the time a collision callback runs, the solver has
   * already handed the part most of the striker's normal velocity.
   */
  closingSpeed: number;
  /**
   * What the striker arrives with, kilograms, and **absent is an error**.
   *
   * It was optional for a day, under the name `massKg`, and optional meant "the row's own
   * reference mass" -- which is how a stone fist came to be scored against a human hand's 0.65
   * kg and be worth eleven blades. There is no default that is right, so there is no default:
   * `impactEnergyJ` throws on a mass that is not a positive finite number, and `Striking`
   * declares the field required so the compiler finds a striker that has not been taught it.
   */
  strikerMassKg: number;
  /**
   * What it met, kilograms: the struck part's own rigid-body mass.
   *
   * The mass its Havok body reports, which `Combat` already reads for the shove. A jointed part
   * is effectively heavier than its own body -- a forearm on an elbow drags an upper arm with it
   * -- so this errs in the striker's favour and never against it, and the entry under Session 03
   * of the style set says by how much.
   */
  partMassKg: number;
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
  /** 0..1. How well the blow was delivered, before the energy is considered. */
  quality: number;
  damage: number;
}

export type Tuning = typeof CONFIG.combat;

/**
 * The energy one body hands another in a collision, joules. The whole of the physics.
 *
 * `E = 0.5 * mu * v^2` with `mu = m M / (m + M)`, the reduced mass of the pair. That is the
 * kinetic energy of the *relative* motion, which is the most a perfectly inelastic contact can
 * take out of the pair and put into deformation -- and deformation is what a wound is.
 *
 * **The saturation is the point.** A 48 kg maul head meeting a 9.4 kg golem link has a reduced
 * mass of 7.86 kg, barely more than the 6.18 of an 18 kg mace: on a limb a maul is a mace is a
 * fist, because a limb that light simply gets out of the way. Meeting a 139 kg trunk core the
 * same two are 35.7 and 15.9, and the head pays in full. Nobody tuned that; it is what
 * `mu` does, and it is the weapon triangle the owner asked for.
 *
 * The solver's own impulse is deliberately not used, for the reason `combat.ts` gives at its
 * head: it is dominated by how the contact was resolved rather than by how it was delivered.
 *
 * A striker mass that is absent, zero, negative or not finite throws. There is no sensible
 * default for "what was swung", and the version of this model that had one scored a stone fist
 * as a hand.
 *
 * **`Infinity` is a legal part mass and means an immovable one**: a static post, a wall, the
 * floor. The limit of `mu` as `M` grows is `m`, so a blow on something that cannot be moved
 * delivers all of its own kinetic energy and no more, which is both the right answer and the
 * upper bound on every other answer. Havok reports a mass of 0 for a body it does not
 * integrate, and `Combat` is what turns that 0 into this `Infinity` -- here a zero is a bug,
 * because a part that weighs nothing and can still be pushed does not exist.
 */
export function impactEnergyJ(strikerMassKg: number, partMassKg: number,
  closingSpeed: number): number {
  if (!Number.isFinite(strikerMassKg) || strikerMassKg <= 0) {
    throw new Error(`a striker has to publish a positive mass, got ${strikerMassKg}`);
  }
  if (Number.isNaN(partMassKg) || partMassKg <= 0) {
    throw new Error(`a struck part has to have a positive mass, got ${partMassKg}`);
  }
  if (!Number.isFinite(closingSpeed)) {
    throw new Error(`a contact has to have a finite closing speed, got ${closingSpeed}`);
  }
  // Written out rather than left to the arithmetic: `m * Infinity / (m + Infinity)` is NaN.
  const reduced = Number.isFinite(partMassKg)
    ? (strikerMassKg * partMassKg) / (strikerMassKg + partMassKg)
    : strikerMassKg;
  return 0.5 * reduced * closingSpeed * closingSpeed;
}

/**
 * What a blow with each kind is worth.
 *
 * The companion of `hands.ts`'s `GRIPS`, and split from it along a seam worth
 * keeping: that one is the *shape* of the thing -- how many hands, how it is
 * carried, whether it has a point -- and this one is what the shape is worth,
 * which is balance and which moves.
 *
 * It replaces a pair of `by === "club"` comparisons whose else-branch was the
 * sword. That is the hole this session is named for and it was the worst of the
 * six, because it is the one that compiles, runs, and produces a plausible
 * number: a weapon added to the program without a row here was not broken, it
 * was **a sword with a different mesh**, and nothing on screen said so.
 *
 * **A row is four accessors and used to be six.** Since 2026-09-06 there is no scale, no speed
 * reference and no reference mass in it, because a blow is worth the energy that arrives and
 * energy needs no ramp. What is left is a mechanism, the energy that mechanism must clear, the
 * joules it charges for a point of wound, and the placement bar above which it may take a limb
 * off -- and the last of those is here rather than folded into the mechanism because a sever bar
 * is a statement about placement and not about damage. `CONFIG.combat.severQuality` says the
 * same in longer form.
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
   *
   * `blunt` was `mass` and then `impulse` and is now neither, because there is nothing left in
   * it to be a flavour of. A club, a lash, a stone fist, a shield bash and a ram plate all do
   * the same thing to a body -- they arrive -- and what separates them is `Contact.strikerMassKg`
   * and nothing else. The two rows that used to differ (`whip` refusing to be weighed, `ram`
   * carrying its own two speeds) differ no longer, and both of those arguments are answered by
   * the reduced mass instead: a 0.57 kg bead at 20 m/s and a 74 kg plate at 1.5 both arrive with
   * about a hundred joules.
   */
  how: "edge" | "point" | "blunt" | "none";
  /**
   * Arriving energy below which it does nothing, joules, and the readout says so.
   *
   * A speed until 2026-09-06, which meant every floor was a statement about the mass a *hand*
   * can accelerate -- and a ram plate scored literally nothing on the club's 2.2 m/s until it
   * was given two speeds of its own to say that a head on a hinge is not a wrist. In joules
   * there is one floor for blunt and one for edges, and a plate, a maul and a club all clear
   * or fail it on the same terms.
   */
  floorJ: (tuning: Tuning) => number;
  /**
   * What this mechanism charges for a point of wound, joules.
   *
   * The one balance number a row has. An edge concentrates what arrives into a line and costs
   * 34.82 J; an axe's shorter edge costs 25.93; anything blunt spreads it and costs 115.24.
   * Each is anchored on the Warrior blow the retired scale was set for, so a Warrior with a
   * sword, an axe or a club scores at 11 m/s on a torso exactly what it scored before.
   */
  joulesPerDamage: (tuning: Tuning) => number;
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
 * A golem's plate is the other half of that sentence and is not this row: it publishes
 * `kind: "empty"`, it is a slab thrown by a chain rather than a board strapped to a forearm,
 * and it is worth its 16.6 kg on the blunt row. What is refused here is a *Warrior's* shield
 * scoring, which is a decision about the guard.
 *
 * The floor is the blade's, which is the one thing here that is only about the
 * readout: below it a shield contact reads `TOO SLOW` and above it `FLAT`, and
 * it is zero damage either way. `Infinity` joules a point is the same idiom
 * `severQuality: () => 1` uses to say never: a wound at infinite cost is no wound, and the
 * `none` branch returns before it is ever read.
 */
const inert: Bite = {
  how: "none",
  floorJ: (t) => t.cutFloorJ,
  joulesPerDamage: () => Infinity,
  severQuality: () => 1,
};

const BITE: Record<Striker, Bite> = {
  sword: {
    how: "edge",
    floorJ: (t) => t.cutFloorJ,
    joulesPerDamage: (t) => t.cutJoulesPerDamage,
    severQuality: (t) => t.severQuality,
  },
  /**
   * The axe. Everything about it is the sword's row with one number moved and
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
   * So what is left is `chopJoulesPerDamage`: the same energy arriving through a hand's width
   * of edge instead of through 840 mm of it, and therefore cheaper per point of wound. Its own
   * 1.4 kg does the rest, and does it in the physics now rather than in the row -- an axe head
   * has a higher reduced mass against everything it hits than a sword does.
   *
   * What it pays for that is not in this table at all. It has no point, so a
   * thrust with it is a shove (`hasPoint`); it has one edge, so a backhand
   * arrives poll-first and scores nothing (`cutsBothWays`); it is 27 % shorter
   * than the sword, which is a quarter of a metre a policy has to walk inside
   * the other fighter's range to make up. Only the first two are rules. The rest
   * is `config.ts` and the solver, which is where a weapon's feel belongs.
   */
  axe: {
    how: "edge",
    floorJ: (t) => t.cutFloorJ,
    joulesPerDamage: (t) => t.chopJoulesPerDamage,
    severQuality: (t) => t.severQuality,
  },
  /**
   * A club has no edge, so there is nothing to align with and no way to hold it
   * wrong. Everything it does is arrive, which is the whole character of the
   * weapon: you cannot place a blow with it, you can only be somewhere with one.
   *
   * `crushFloorJ` is below `cutFloorJ` because a blade that arrives slowly is a blade being
   * leaned on and a club that arrives slowly is still several kilograms of wood -- and it is a
   * *lower* bar for a heavier weapon in speed terms twice over, since the club's own mass is
   * now in the energy as well as in the floor's derivation.
   */
  club: {
    how: "blunt",
    floorJ: (t) => t.crushFloorJ,
    joulesPerDamage: (t) => t.crushJoulesPerDamage,
    severQuality: () => 0,
  },
  /**
   * A lash. The club's row exactly, and that is the finding.
   *
   * For a day it was `mass` rather than `impulse` on a deliberate argument: a whip bead is half
   * a kilogram and its whole point is speed, so a row that weighed it would score a crack at
   * 20 m/s as a sixth of a Warrior's club at the same speed. Under energy the argument answers
   * itself and needs no row of its own -- `0.5 * mu * v^2` with a 0.57 kg bead at 20 m/s into a
   * golem link is 107 J against a 3.4 kg club at 11 m/s into the same link's 78 J, so the lash
   * wins on speed exactly as far as speed takes it and no further.
   */
  whip: {
    how: "blunt",
    floorJ: (t) => t.crushFloorJ,
    joulesPerDamage: (t) => t.crushJoulesPerDamage,
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
   * All of it is arrival and alignment, and the alignment is the *shaft's*: an
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
   *
   * Combat routes every live projectile through `scoreProjectileImpact`, which keeps its own
   * speed floor and the three-damage ceiling. This row is what a *swung* or resting arrow is
   * worth and what the policy classifier reads, and since 2026-09-06 the two agree on their
   * arithmetic: `PROJECTILE_PENETRATION_V1.joulesPerDamage` is the number both charge.
   */
  arrow: {
    how: "point",
    floorJ: (t) => t.pointFloorJ,
    joulesPerDamage: () => PROJECTILE_PENETRATION_V1.joulesPerDamage,
    severQuality: () => 1,
  },
  /**
   * A bare fist: mass without an edge, a point, or a severing path -- and now, one row for both
   * of the fists in the program rather than a row and a ratio.
   *
   * A Warrior's is 0.65 kg of hand and a golem's is a 8 kg ball of stone on the end of a chain,
   * and under `impulse` the second was the first times twelve because the row could only
   * multiply. Under energy the same two masses give 0.64 kg and 7.56 kg of reduced mass against
   * a torso, so the stone fist is worth about twelve times the punch there and about five times
   * it on a light limb -- the ratio falls where the thing being hit can move.
   *
   * `severQuality` at 1 is unreachable and stays so: a blunt blow scores quality 1 and the
   * comparison in `severs` is strict, so a fist may empty a limb and never take it off.
   */
  empty: {
    how: "blunt",
    floorJ: (t) => t.crushFloorJ,
    joulesPerDamage: (t) => t.crushJoulesPerDamage,
    severQuality: () => 1,
  },
  /** A living jaw: point-like damage, but no dismemberment in this contract. */
  bite: {
    how: "point",
    floorJ: (t) => t.pointFloorJ,
    joulesPerDamage: () => PROJECTILE_PENETRATION_V1.joulesPerDamage,
    severQuality: () => 1,
  },
  /**
   * A golem's ram plate: mass, on a hinge, and the row that used to need four numbers of its own.
   *
   * It had them because the model was mass-blind. A ram lunge puts its plate into a contact at
   * 1.3 to 1.8 m/s -- a head traces a 0.36 m arc about a hinge and cannot reach a blade's tip
   * speed however hard it is driven -- so on the club's 2.2 m/s floor it scored literally
   * nothing, and the fix was two speeds carried across at equal energy plus a reference mass
   * plus a scale of 9. Every one of those four is now what `0.5 * mu * v^2` says: 74 kg into a
   * 139 kg trunk core at 1.5 m/s is 54 J, which clears `crushFloorJ` six times over and is worth
   * about half a point of wound.
   *
   * **That is a large fall from what `ramScale` 9 paid**, and it is the model's answer rather
   * than a tuning: a ram is most of a body arriving slowly, and slowly is the term that is
   * squared. The entry under Session 03 of the style set reports what it did to the ram cells
   * and leaves the lever -- how fast a hinged head can be driven -- where it belongs, in
   * `src/golem/config.ts` and in front of the owner.
   *
   * **It never severs.** `severQuality` at 1 is unreachable, the same idiom `inert` and `arrow`
   * use to say never: taking a limb off wants an edge and a swing, and a head-butt is neither.
   */
  ram: {
    how: "blunt",
    floorJ: (t) => t.crushFloorJ,
    joulesPerDamage: (t) => t.crushJoulesPerDamage,
    severQuality: () => 1,
  },
};

/**
 * The arriving energy below which this kind does nothing at all, joules.
 *
 * Exported for exactly one caller and worth the export. `combat.ts` bails out
 * before computing a direction and three dot products for a contact too slight to
 * matter, which is a real saving at 240 Hz -- but it bailed out on
 * `minCutSpeed`, hard-coded, which is the blade's number and not everyone's. So
 * a club at 2.5 m/s never reached `scoreHit` at all, and `minCrushSpeed` -- a
 * setting with a paragraph of config comment explaining why it is lower than the
 * blade's, and a unit test proving it works -- did nothing whatsoever in an
 * actual fight for the whole of the club's life. The test was right and the
 * arena never ran the code it tested.
 *
 * That is the same fault as the rest of that session in its purest form: not a
 * missing branch, but a **second copy** of a rule, in a file that had no reason
 * to hold an opinion about it. Which is also why the early-out asks `scoreHit`
 * itself for the sub-floor answer rather than writing one: below the floor the
 * alignments cannot change it, so passing zeros for them costs nothing and keeps
 * one rule.
 */
export const biteFloorJ = (by: Striker, tuning: Tuning = CONFIG.combat): number =>
  BITE[by].floorJ(tuning);

/**
 * Which of the three mechanisms a kind hurts by, or `none`.
 *
 * `combat.ts` asks because a blunt blow below its floor is a **slap** that still shoves, and an
 * edge below its floor is weak and returns before the shove -- so the early-out has to know
 * which it is holding. Nothing else about the mechanism escapes this file.
 */
export const biteMechanism = (by: Striker): "edge" | "point" | "blunt" | "none" => BITE[by].how;

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Projectile wounds pay for axial kinetic energy that actually arrived.
 *
 * This is deliberately separate from `BITE.arrow`. A hand-held point attack
 * has no projectile mass, while a projectile has no useful edge placement or
 * arm-speed reference. Keeping the equation pure also makes the three-damage
 * ceiling an import boundary rather than a promise made by every launcher.
 */
export const PROJECTILE_PENETRATION_V1 = Object.freeze({
  axialSpeedFloorMps: 8,
  joulesPerDamage: 34,
  maximumDamage: 3,
});

export interface ProjectileImpact {
  readonly massKg: number;
  readonly speedMps: number;
  readonly signedShaftAlignment: number;
  readonly contactedHead: boolean;
  readonly penetrationEfficiency: number;
}

export interface ProjectileImpactEvaluation {
  readonly score: Score;
  readonly usableEnergyJ: number;
  readonly uncappedDamage: number;
}

/** One calculation owns both the wound and the immutable evidence reported for it. */
export function evaluateProjectileImpact(impact: ProjectileImpact): ProjectileImpactEvaluation {
  if (typeof impact.contactedHead !== "boolean" ||
      ![impact.massKg, impact.speedMps, impact.signedShaftAlignment,
        impact.penetrationEfficiency].every(Number.isFinite)) {
    throw new Error("projectile impact contains a non-finite physical input");
  }
  if (impact.massKg <= 0 || impact.speedMps < 0 ||
      impact.signedShaftAlignment < -1 || impact.signedShaftAlignment > 1 ||
      impact.penetrationEfficiency <= 0 || impact.penetrationEfficiency > 1) {
    throw new Error("projectile impact is outside the physical scoring bounds");
  }
  const alignment = clamp01(impact.signedShaftAlignment);
  if (!impact.contactedHead || alignment <= 0) {
    return Object.freeze({ score: Object.freeze({ kind: "slap", quality: 0, damage: 0 }),
      usableEnergyJ: 0, uncappedDamage: 0 });
  }
  const axialSpeed = impact.speedMps * alignment;
  const usableEnergyJ = 0.5 * impact.massKg * Math.max(0,
    axialSpeed * axialSpeed - PROJECTILE_PENETRATION_V1.axialSpeedFloorMps ** 2);
  const uncapped = usableEnergyJ / PROJECTILE_PENETRATION_V1.joulesPerDamage *
    impact.penetrationEfficiency;
  const damage = Math.min(PROJECTILE_PENETRATION_V1.maximumDamage, uncapped);
  return Object.freeze({
    score: Object.freeze({ kind: damage > 0 ? "thrust" : "weak",
      quality: alignment * alignment, damage }),
    usableEnergyJ,
    uncappedDamage: uncapped,
  });
}

export const scoreProjectileImpact = (impact: ProjectileImpact): Score =>
  evaluateProjectileImpact(impact).score;

/**
 * The rule that decides whether a contact was a cut, a thrust, or a clang.
 *
 * Kept pure and separate from the physics so it can be argued with in a test
 * rather than only in the browser. This is the balance surface of the whole
 * prototype: change these few lines and the game becomes a different game.
 *
 * Since 2026-09-06 there is one shape under all four branches. Work out what arrived, refuse it
 * if it is under the mechanism's floor, and charge the mechanism's joules for a point of wound
 * -- with the placement quality multiplying an edge, gating a point, and meaning nothing at all
 * to something blunt. There is no ramp, no ceiling and no per-weapon scale left: a heavier
 * striker is worth more because `impactEnergyJ` says so, and a lighter part is worth less to hit
 * for the same reason.
 */
export function scoreHit(
  contact: Contact,
  by: Striker = "sword",
  tuning: Tuning = CONFIG.combat,
): Score {
  const bite = BITE[by];
  const floorJ = bite.floorJ(tuning);

  if (bite.how === "point") {
    // How straight it arrived, and nothing else. A tumbling arrow's velocity is
    // across its own shaft, `bladeAlignment` collapses toward zero, and the same
    // 45 m/s that buries a clean shot is a stick hitting somebody. Only the axial component
    // of the closing speed gets in, so the energy is taken again at that speed rather than
    // scaled -- the two agree at `edgeExponent` 2 and would quietly disagree at any other.
    const alignment = clamp01(contact.bladeAlignment);
    const axialJ = impactEnergyJ(contact.strikerMassKg, contact.partMassKg,
      contact.closingSpeed * alignment);
    if (axialJ < floorJ) return { kind: "weak", quality: 0, damage: 0 };
    const quality = Math.pow(alignment, tuning.edgeExponent);
    // Subtracted rather than gated, which is the shape `PROJECTILE_PENETRATION_V1` already has:
    // a point spends the floor getting in and wounds with what is left.
    return { kind: quality < 0.25 ? "slap" : "thrust", quality,
      damage: (axialJ - floorJ) / bite.joulesPerDamage(tuning) };
  }

  const energyJ = impactEnergyJ(contact.strikerMassKg, contact.partMassKg, contact.closingSpeed);
  if (energyJ < floorJ) {
    // A blunt contact that is under its floor still transfers momentum through a real contact.
    // Name that a slap so `Combat` lets it reach the shove path; an edge under its floor stays
    // weak, because there is no useful action to report or resolve.
    return { kind: bite.how === "blunt" ? "slap" : "weak", quality: 0, damage: 0 };
  }

  if (bite.how === "none") {
    // A slap rather than a kind of its own: the shove still lands, and the
    // readout already has a word for a blow that pushes without biting.
    return { kind: "slap", quality: 0, damage: 0 };
  }

  if (bite.how === "blunt") {
    // Quality stays 1 for the club's reason -- there is nothing to place -- and every difference
    // between a bead, a fist, a club, a mace, a maul, a bash and a ram is already in the energy.
    return { kind: "crush", quality: 1, damage: energyJ / bite.joulesPerDamage(tuning) };
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

  return { kind, quality, damage: quality * energyJ / bite.joulesPerDamage(tuning) };
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

/**
 * What a blow costs a piece that is armoured.
 *
 * The whole of the armour rule, in one pure function, because the alternative is what a body
 * experiment always reaches for first: a branch inside the body that says "if this is the plated
 * one, halve it". That is a special case, and this directory has a name for what happens next --
 * a caller holding its own copy of a rule is the same defect as a missing table row and is much
 * harder to see. So armour is a *number* on a part, this is the rule, and `Combatant.applyDamage`
 * is the seam that already existed for a body to turn raw scoring damage into applied damage.
 *
 * **It runs after `scoreHit` and never inside it, and that ordering is a design decision rather
 * than an implementation detail.** Armour does not change what a blow *was*: a cut through plate
 * is still a cut, it still has the quality it was delivered with, and `severs` still reads that
 * quality against the same bar. What armour changes is how much of the blow the piece pays for,
 * which is exactly the arithmetic below and nothing else. Fold it into the score instead and a
 * plated torso would quietly become harder to dismember as well as harder to hurt, which is two
 * mechanics wearing one number -- the shape the axe's two refuted knobs had.
 *
 * `armour` is the fraction absorbed: 0 is bare, 0.34 keeps a third of the blow off. One is
 * refused rather than clamped, because a piece that takes no damage at all is a bug wearing a
 * setting's clothes -- there is no sequence of blows that ends it, so a bout against one cannot
 * be won. Same argument, and the same refusal, as `evaluateProjectileImpact`'s bounds check.
 */
export function armouredDamage(raw: number, armour: number): number {
  if (!Number.isFinite(raw) || !Number.isFinite(armour)) {
    throw new Error("armoured damage takes finite damage and a finite armour fraction");
  }
  if (armour < 0 || armour >= 1) {
    throw new Error(`armour must be a fraction absorbed in [0, 1), got ${armour}`);
  }
  return raw <= 0 ? 0 : raw * (1 - armour);
}
