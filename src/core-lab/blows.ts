import havokBlow from "../../research/core-club-havok.json" with { type: "json" };
import unitBlow from "../../research/core-club-unit.json" with { type: "json" };
import type { WorkshopModel } from "../core/human/rig.ts";
import type { Strike } from "../core/skills/strikes.ts";

/**
 * **The blows the lab's Blow scenario throws** (`blow-scenario.ts`): each a strike found by the
 * strike search (`research/core-strike-search.mjs`), with the target's distance it was found at,
 * the body it was found on and what it read there. The lab throws it on whichever body is loaded,
 * at the lab's rate; the readings beside it are the search's.
 */
export interface StoredBlow {
  readonly id: string;
  readonly name: string;
  /** Where it was found and what it read there. */
  readonly line: string;
  /** The body it was searched on. */
  readonly model: WorkshopModel;
  readonly hand: "left" | "right";
  /** The club's, unless a fist's. */
  readonly weapon: "club";
  readonly strike: Strike;
  /** The target's centre ahead of the striker's own head, m. */
  readonly distance: number;
}

/** Every stored blow, in the panel's order; the first is the default. */
export const LAB_BLOWS: readonly StoredBlow[] = [
  {
    id: "unit", name: "The damage unit's",
    line: `The damage unit's club blow (research/core-club-unit.json): searched on Rapier at 960 Hz, from Havok's, `
      + `${unitBlow.readings.at1920.mean} J at 1920 Hz and ${unitBlow.readings.at120.mean} at 120, `
      + `closing at ${unitBlow.readings.at1920.closing} m/s.`,
    model: unitBlow.model as WorkshopModel, hand: unitBlow.hand as "left" | "right", weapon: "club",
    strike: unitBlow.strike as Strike, distance: unitBlow.distance,
  },
  {
    id: "havok", name: "Havok's unit",
    line: `The damage unit's blow on Havok (research/core-club-havok.json): ${havokBlow.readings.at1920.mean} J there at `
      + `1920 Hz, closing at ${havokBlow.readings.at1920.closing} m/s. On Rapier it goes another way and lands glancing.`,
    model: havokBlow.model as WorkshopModel, hand: havokBlow.hand as "left" | "right", weapon: "club",
    strike: havokBlow.strike as Strike, distance: havokBlow.distance,
  },
];
