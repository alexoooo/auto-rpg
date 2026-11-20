import { derive, sourced, type Quantity } from "../../../quantity.ts";
import type { DeLevaSegment } from "./de-leva-1996.ts";

/**
 * **How stiff each part of a human is under a blunt load**, as the impact literature measured it,
 * by what the body is made of and by de Leva's segments, each row in its paper's own units. A part
 * no study gives takes a neighbour's under `contact-stiffness-gaps`. The table, what each paper
 * measured and how, and its gaps: `docs/reference/wounds.md#stiffness`.
 */

/**
 * The nasal bone under a flat impactor, between 20 and 80 % of its peak force (`cormier-2009`).
 * It is the head's own surface, its face: what a blow aimed at a head meets.
 */
const head = sourced(201, "N/mm", "cormier-2009", "Table 14, nasal bone, secondary stiffness, mean");

/**
 * The forehead under the same impactor, read the same way (`cormier-2009`): the skull, which is
 * the head wherever it is not its face (`skullPlace`, `segments.ts`).
 */
export const SKULL_STIFFNESS = sourced(731, "N/mm", "cormier-2009", "Table 10, frontal bone, stiffness between 20 and 80 % of peak force, mean");

/** The intact chest under a hub pressed into the sternum (`kent-2005`). */
const chest = sourced(170.0, "N/cm", "kent-2005", "Table 3, effective stiffness, hub, intact, average");

/**
 * The rib cage alone under the same hub: the same chests with their skin, fat and muscle taken
 * off and their organs out (`kent-2005`). A cage of ribs bends, so it gives more than the chest
 * its organs and flesh fill.
 */
const ribCage = sourced(54.1, "N/cm", "kent-2005", "Table 3, effective stiffness, hub, eviscerated, average");

/** A thigh bone bent at mid-shaft until it broke: the load it bore over how far it had bent (`funk-2004`). */
const thigh = derive("N/mm", "the load at failure over the deflection at failure", [
  sourced(4349, "N", "funk-2004", "Results, summed support load at failure, mean of 15 femurs"),
  sourced(17.6, "mm", "funk-2004", "Results, mid-bone deflection at failure, mean of 15 femurs"),
], (load, deflection) => load / deflection);

/** A second metacarpal, a pig's, bent at mid-shaft (`ochman-2011`). */
const hand = sourced(122.3, "N/mm", "ochman-2011", "Results, intact metacarpals, bending stiffness, mean");

/**
 * One joint of the lower spine, two vertebrae with the disc and the ligaments between them,
 * pushed front to back with no load down the spine (`gardner-morse-2004`).
 */
const lumbar = sourced(251, "N/mm", "gardner-morse-2004", "Table 1, intact motion segments, no preload, anterior-posterior shear, mean of 8");

/** A bare hip bone loaded on the crest of its wing, ten of them: the mean (`guillemot-1998`). */
const pelvis = derive("N/mm", "the mean of the ten",
  [206, 129, 211, 206, 155, 72, 46, 88, 141, 105].map((stiffness, k) => sourced(stiffness, "N/mm", "guillemot-1998", `Table 3, iliac wing, pelvis ${k + 1}`)),
  (...each) => each.reduce((sum, one) => sum + one) / each.length);

/**
 * The heel: its pad with the heel bone it sits under, cut from the leg and pressed flat at a load
 * of the body's own weight (`bennett-1990`). The foot strikes with it, in a stomp or a kick.
 */
const foot = sourced(1160, "kN/m", "bennett-1990", "Results, heel pad stiffness at a load equal to body weight, mean of 5 pads");

const WHOLE = sourced(1, "1", "contact-stiffness-gaps", "a part no study gives takes its neighbour's whole");

/** A part no study gives: the row it borrows, and the decision that it borrows it. */
const neighbour = (row: Quantity<number>): Quantity<number> =>
  derive(row.unit, "the neighbour's, times the share of it taken", [row, WHOLE], (stiffness, share) => stiffness * share);

type Trunk = "upperTrunk" | "middleTrunk" | "lowerTrunk";

/** A body's rows: its own trunk's, and the rest every body's. */
function rows(trunk: Readonly<Record<Trunk, Quantity<number>>>): Readonly<Record<DeLevaSegment, Quantity<number>>> {
  return Object.freeze({
    head,
    ...trunk,
    upperArm: neighbour(thigh),
    forearm: neighbour(thigh),
    hand,
    thigh,
    shank: neighbour(thigh),
    foot,
  });
}

/** What a human figure is made of: what its rows are read by. */
export type HumanSubstance = "flesh" | "bone";

/**
 * Each row by what the body is made of. The head's, the limbs' and the hand's are each a bone's
 * own reading, so a body of flesh and a body of bare bone share them, and they share the heel's,
 * no heel bone having been read without its pad. They differ in the trunk. Of flesh it is the
 * chest whole, which lends the belly and the hips its own. Of bare bone it is the rib cage alone,
 * the lower spine and the hip bone, each as it was read.
 */
export const CONTACT_STIFFNESS: Readonly<Record<HumanSubstance, Readonly<Record<DeLevaSegment, Quantity<number>>>>> = Object.freeze({
  flesh: rows({ upperTrunk: chest, middleTrunk: neighbour(chest), lowerTrunk: neighbour(neighbour(chest)) }),
  bone: rows({ upperTrunk: ribCage, middleTrunk: lumbar, lowerTrunk: pelvis }),
});
