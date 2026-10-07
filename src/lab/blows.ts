import unitBlow from "../../research/core-club-unit.json" with { type: "json" };
import { REPERTOIRE, type Band, type Strike } from "../core/skills/strikes.ts";
import type { BlowPlace } from "./blow.ts";
import type { Side } from "../core/spec/body.ts";

/**
 * **The blows the lab's Blow scenario throws** (`blow-scenario.ts`): each a strike found by the
 * strike search (`research/core-strike-search.mjs`), with the place its target stood at, the
 * body it was found on and what it read there. The lab throws it on whichever body is loaded,
 * at the lab's rate; the readings beside it are the search's.
 */
export interface StoredBlow {
  readonly id: string;
  readonly name: string;
  /** Where it was found and what it read there. */
  readonly line: string;
  /** The body it was searched on. */
  readonly model: string;
  readonly hand: Side;
  /** What the hand holds to throw it, by the core's name for it (`heldIn`). */
  readonly held: string;
  readonly strike: Strike;
  /** Where its target stood from the striker's own head, m, and the band it was (`BANDS`). */
  readonly place: BlowPlace;
  readonly band: Band;
}

/**
 * Every stored blow, in the order offered; the first is the default. The club's best is the
 * blow the wooden club's energy was measured by (`research/core-club-unit.json`); after it,
 * every recipe of the repertoire (`REPERTOIRE`).
 */
export const LAB_BLOWS: readonly StoredBlow[] = [
  {
    id: "unit", name: "The club's best",
    line: `The Warrior's strongest club blow (research/core-club-unit.json): searched at 960 Hz, `
      + `${unitBlow.readings.at1920.mean} J into a head-sized mark at 1920 Hz and ${unitBlow.readings.at120.mean} at 120, `
      + `closing at ${unitBlow.readings.at1920.closing} m/s.`,
    model: unitBlow.model, hand: unitBlow.hand as Side, held: "wooden club",
    strike: unitBlow.strike as Strike, place: { ahead: unitBlow.distance, up: 0 }, band: "high",
  },
  ...REPERTOIRE.map((recipe): StoredBlow => ({
    id: `${recipe.model}/${recipe.held}/${recipe.band}`, name: `${recipe.model}, ${recipe.held}, ${recipe.band}`,
    line: `A recipe of the repertoire (assets/core/strikes.json): ${recipe.net} HP done less cost at its place. ${recipe.found}`,
    model: recipe.model, hand: recipe.strike.hand, held: recipe.held, strike: recipe.strike, place: recipe.place, band: recipe.band,
  })),
];
