import { derive, sourced, type Quantity } from "../../spec/quantity.ts";
import type { DeLevaSegment } from "./de-leva-1996.ts";

/**
 * **How stiff each part of a human is under a blunt load**, as the impact literature measured it,
 * by de Leva's segments, each row in its paper's own units. A part no study gives takes a
 * neighbour's under `contact-stiffness-gaps`. The table, what each paper measured and how, its
 * gaps and what the shares do when a value is halved or doubled: `docs/reference/wounds.md#stiffness`.
 */

/** The nasal bone under a flat impactor, between 20 and 80 % of its peak force (`cormier-2009`). */
const head = sourced(201, "N/mm", "cormier-2009", "Table 14, nasal bone, secondary stiffness, mean");

/** The intact chest under a hub pressed into the sternum (`kent-2005`). */
const upperTrunk = sourced(170.0, "N/cm", "kent-2005", "Table 3, effective stiffness, hub, intact, average");

/** A thigh bone bent at mid-shaft until it broke: the load it bore over how far it had bent (`funk-2004`). */
const thigh = derive("N/mm", "the load at failure over the deflection at failure", [
  sourced(4349, "N", "funk-2004", "Results, summed support load at failure, mean of 15 femurs"),
  sourced(17.6, "mm", "funk-2004", "Results, mid-bone deflection at failure, mean of 15 femurs"),
], (load, deflection) => load / deflection);

/** A second metacarpal, a pig's, bent at mid-shaft (`ochman-2011`). */
const hand = sourced(122.3, "N/mm", "ochman-2011", "Results, intact metacarpals, bending stiffness, mean");

const WHOLE = sourced(1, "1", "contact-stiffness-gaps", "a part no study gives takes its neighbour's whole");

/** A part no study gives: the row it borrows, and the decision that it borrows it. */
const neighbour = (row: Quantity<number>): Quantity<number> =>
  derive(row.unit, "the neighbour's, times the share of it taken", [row, WHOLE], (stiffness, share) => stiffness * share);

const middleTrunk = neighbour(upperTrunk);

export const CONTACT_STIFFNESS: Readonly<Record<DeLevaSegment, Quantity<number>>> = Object.freeze({
  head,
  upperTrunk,
  middleTrunk,
  lowerTrunk: neighbour(middleTrunk),
  upperArm: neighbour(thigh),
  forearm: neighbour(thigh),
  hand,
  thigh,
  shank: neighbour(thigh),
  foot: neighbour(hand),
});
