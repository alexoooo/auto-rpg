import type { WorkshopModel } from "./workshop-profile.ts";

/**
 * How big and how heavy a human is at x1, and how its mass is shared among its parts. Session 2,
 * step 2 of `docs/plans/2026-09-27-warrior-rogue-reptile.md`; the findings that asked for it are
 * `docs/analysis/2026-09-27-human-strike-realism.md` (in git at c76ce6bc) ("The body is not a typical adult").
 *
 * **x1 is a typical adult** (the owner's decision, 2026-09-27): about 1.77 m and 79 kg for a man.
 * Until then a Warrior at x1 was the workshop model at the size it was authored, 1.88 m of skin
 * and 107 kg, every part mass a constant, so the Rogue weighed what the Warrior did.
 */

/**
 * The top of each model's skin, metres, with the soles on 0: `base__skin` in its GLB, bind pose
 * (`tests/workshop-anthropometry.test.mjs` reads it back from the asset). Hair is not stature.
 */
export const WORKSHOP_SKIN_TOP_M: Readonly<Record<WorkshopModel, number>> = Object.freeze({
  "workshop-fighter": 1.880,
  "workshop-rogue": 1.730,
});

/** A typical adult man's stature, metres: the owner's 1.76-1.78 m. */
export const TYPICAL_STATURE_M = 1.77;

/**
 * **What every length of a workshop model is multiplied by at x1**: the Warrior's skin brought to a
 * typical man's stature, 0.9415.
 *
 * The Rogue takes the same factor, so it keeps its own proportions and its size against the
 * Warrior's (the owner's answer): 1.730 m becomes 1.63 m, which is a typical adult woman's
 * stature, as the Rogue is the female build (`scripts/character-lab/realistic/build.py`).
 *
 * It is applied as part of the size a human is built at (`builtAttributes` in
 * `src/golem/build.ts`), so it goes through the same biological size law as the stat does
 * (`SizeLaw`). A body scaled is a body scaled: the model's rates, torques and fall lines move with
 * its lengths, and items -- a sword, a shield -- keep their own size, exactly as they do under the
 * stat. The masses are the one thing the law would get wrong, because the model's constants were
 * never a human's, so they are restated below.
 */
export const WORKSHOP_FIT_SCALE = TYPICAL_STATURE_M / WORKSHOP_SKIN_TOP_M["workshop-fighter"];

/**
 * Each model's body mass at x1, kilograms.
 *
 * The Warrior is the owner's typical man, 79 kg. The Rogue is the Warrior times the ratio of their
 * bodies' volumes, so its mass is its own build's. The volume is each model's skin, feet, jacket,
 * trousers, collar and belt, closed by voxel flood fill in the bind pose and extrapolated to a zero
 * voxel from grids of 4.5 to 8 mm (a finer grid leaks through a seam). What is enclosed, and what
 * is not outside, bracket it (litres, at the size the model was authored):
 *
 *     model        enclosed   not outside   taken
 *     Warrior        107.6       111.4       109.5
 *     Rogue           78.0        81.6        79.8
 *
 * The ratio is 0.729 on either bound to the third digit, and the clothes are the same garments on
 * both. So the Rogue is 57.6 kg at 1.63 m.
 */
export const WORKSHOP_BODY_KG: Readonly<Record<WorkshopModel, number>> = Object.freeze({
  "workshop-fighter": 79,
  "workshop-rogue": 79 * 79.8 / 109.5,
});

/** Which of de Leva's two tables a model's build takes. */
const SEX: Readonly<Record<WorkshopModel, "male" | "female">> = Object.freeze({
  "workshop-fighter": "male",
  "workshop-rogue": "female",
});

/**
 * Segment masses as fractions of body mass: de Leva 1996, J Biomech 29:1223, Table 4, his
 * adjustment of Zatsiorsky and Seluyanov. `docs/analysis/2026-09-27-human-strike-reference.md`
 * section 6 has the male table with lengths and inertias. Each sums to 1 to the fourth digit.
 *
 * - `head` is his head segment, vertex to C7, so it carries the neck.
 * - The trunk is his three: the thorax (`upperTrunk`), the abdomen (`middleTrunk`) and the pelvis
 *   (`lowerTrunk`).
 */
const DE_LEVA = Object.freeze({
  male: Object.freeze({ head: 0.0694, upperTrunk: 0.1596, middleTrunk: 0.1633, lowerTrunk: 0.1117,
    upperArm: 0.0271, forearm: 0.0162, hand: 0.0061, thigh: 0.1416, shank: 0.0433, foot: 0.0137 }),
  female: Object.freeze({ head: 0.0668, upperTrunk: 0.1545, middleTrunk: 0.1465, lowerTrunk: 0.1247,
    upperArm: 0.0255, forearm: 0.0138, hand: 0.0056, thigh: 0.1478, shank: 0.0481, foot: 0.0129 }),
});

/**
 * The neck capsule's share of de Leva's head segment. The body has a neck and a head where he has
 * one segment; this keeps the split the human had, 1 kg of 7.5.
 */
const NECK_SHARE = 1 / 7.5;

/**
 * The fist's share of the hand. The closed fingers are a terminal welded to the hand link, and a
 * hand that holds a sword has no fist, so an armed hand is the link alone. A third is a judgement
 * of the fingers' share, not a measurement; at 79 kg it is 0.16 kg.
 */
const FIST_SHARE = 1 / 3;

/** A human's parts' masses, kilograms, keyed as the tables that build them name them. */
export interface WorkshopSegmentKg {
  readonly pelvisMass: number;
  readonly thighMass: number;
  readonly shinMass: number;
  readonly footMass: number;
  /** The waist ball, which spans the abdomen: de Leva's middle trunk. */
  readonly ballMass: number;
  /** The trunk's core box, the thorax: de Leva's upper trunk. */
  readonly coreMass: number;
  readonly neckMass: number;
  readonly headMass: number;
  /** Upper arm, forearm and hand link, one arm, as `anatomicalChain` builds them. */
  readonly arm: readonly [number, number, number];
  readonly fist: number;
}

/**
 * Each part's mass **as the tables must state it**: at the size the model was authored, so that
 * the size law, which multiplies a mass by the cube of the size a body is built at, makes it the
 * typical adult's at x1. Divided by `WORKSHOP_FIT_SCALE` cubed, 0.8346; `workshopSegmentKgAtX1`
 * is the same table as the body has it.
 */
export function workshopSegmentKg(model: WorkshopModel): WorkshopSegmentKg {
  const atX1 = workshopSegmentKgAtX1(model), native = 1 / WORKSHOP_FIT_SCALE ** 3;
  return Object.freeze({
    pelvisMass: atX1.pelvisMass * native, thighMass: atX1.thighMass * native,
    shinMass: atX1.shinMass * native, footMass: atX1.footMass * native,
    ballMass: atX1.ballMass * native, coreMass: atX1.coreMass * native,
    neckMass: atX1.neckMass * native, headMass: atX1.headMass * native,
    arm: Object.freeze(atX1.arm.map((kg) => kg * native)) as unknown as readonly [number, number, number],
    fist: atX1.fist * native,
  });
}

/** Each part's mass at x1, kilograms: de Leva's fraction of the model's body mass. */
export function workshopSegmentKgAtX1(model: WorkshopModel): WorkshopSegmentKg {
  const f = DE_LEVA[SEX[model]], body = WORKSHOP_BODY_KG[model];
  return Object.freeze({
    pelvisMass: f.lowerTrunk * body,
    thighMass: f.thigh * body,
    shinMass: f.shank * body,
    footMass: f.foot * body,
    ballMass: f.middleTrunk * body,
    coreMass: f.upperTrunk * body,
    neckMass: f.head * NECK_SHARE * body,
    headMass: f.head * (1 - NECK_SHARE) * body,
    arm: Object.freeze([f.upperArm * body, f.forearm * body, f.hand * (1 - FIST_SHARE) * body]) as readonly [number, number, number],
    fist: f.hand * FIST_SHARE * body,
  });
}

/** One arm's three links, kilograms, as the tables state them (see `workshopSegmentKg`). */
export const workshopArmKg = (model: WorkshopModel): number => {
  const { arm } = workshopSegmentKg(model);
  return arm[0] + arm[1] + arm[2];
};
