import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { APPROACH, rangeOf, type StrikeReport } from "../skills/strike.ts";
import { BAND_NAMES, type Band } from "../skills/strikes.ts";
import type { Marks } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { RECIPE_FIGHTER, type RecipeFighterConfig } from "./config.ts";
import type { Intent } from "./intent.ts";
import { STAND_ORDERS, type Orders } from "./orders.ts";
import type { Sight, Tactics } from "./tactics.ts";
import { guarding, orderedIntent, STRAFE } from "./ordered.ts";
import { nearestFoe } from "./targets.ts";
import { THREAT, type Threat } from "./threat.ts";
import { hypot } from "../math/real.ts";

/**
 * How near a target a fighter attacks it rather than walking to it, m, between the two centres of
 * mass across the ground: the club's reach ahead of the head (1.05 m, `REPERTOIRE`) and a step,
 * which the strike skill closes itself. Set (`docs/reference/human-and-strikes.md#attack-distance`).
 */
export const ATTACK_METRES = 1.8;

/**
 * **Holding at the edge of a foe's reach** (`RecipeFighterConfig.range`, `"edge"`): how far past the
 * foe's reach a fighter stands before it walks in again, m; and how long it stands still there,
 * s, before it walks in to attack all the same. The band is set, the patience read in bouts:
 * `docs/reference/human-and-strikes.md#the-edge`.
 */
export const EDGE: Edge = Object.freeze({ band: 0.25, patience: 4 });

/** Where a fighter holds at the edge of a foe's reach (`EDGE`): the band past it, m, and the patience there, s. */
export interface Edge { readonly band: number; readonly patience: number }

/**
 * **The recipe fighter's tactics** carry out `Orders`, asked for every control step with what the
 * body sees: to walk and to face as `orderedIntent` does, at `strafe`. Given a point to attack it
 * attacks it with what the right hand holds: the strike skill brings the body the rest of the way
 * (`APPROACH` in `src/core/skills/strike.ts`). It holds the point it aims at while the ordered one
 * stays within `APPROACH.reach` of it, and aims again after each blow, since the skill sets the
 * feet for the point it is given and a point that followed a swaying head would move under every
 * placing. Once the blow is committed (its chamber and its swing) it aims at the ordered point
 * itself, which the skill turns the body to follow (`STEER`). Back from another mind
 * (`BodyView.resumed`), it aims afresh.
 *
 * A hand that does not attack guards as `guard` says (`RecipeFighterConfig.guard`, `guarding`).
 */
export function recipeTactics(name: string, orders: (sight: Sight) => Orders, strafe: typeof STRAFE = STRAFE,
  guard: RecipeFighterConfig["guard"] = RECIPE_FIGHTER.guard, threat: Threat = THREAT): Tactics {
  const rest = guarding(guard, threat);
  /** Its memory: the point aimed at, and the blows thrown when it was chosen. */
  const state: { aim: { point: Vec3; thrown: number } | null } = { aim: null };
  return {
    name, state,
    decide: (sight): Intent => {
      if (sight.view.resumed) state.aim = null;
      const { report } = sight, given = orders(sight), cover = rest(sight), attack = given.attack;
      if (attack) {
        const thrown = report.strike.thrown.right;
        let aim = state.aim;
        const phase = report.strike.phase;
        if (!aim || aim.thrown !== thrown || phase === "chamber" || phase === "swing"
          || hypot(attack[0] - aim.point[0], attack[1] - aim.point[1], attack[2] - aim.point[2]) > APPROACH.reach) {
          aim = state.aim = { point: [attack[0], attack[1], attack[2]], thrown };
        }
        return { move: null, face: report.heading, guard: { left: cover, right: null }, attack: { kind: "blow", hand: "right", target: aim.point } };
      }
      state.aim = null;
      return orderedIntent(sight, given, { left: cover, right: cover }, strafe);
    },
  };
}

/**
 * The band of a foe a fighter attacks, by its `aim` (`RecipeFighterConfig.aim`): the high one, its
 * head; or the one the right hand's recipe nets the most on (`StrikeReport.nets`), the first of
 * equals in the bands' order, and the high one where the hand has no recipe or the skill throws none.
 */
function bandAimed(aim: RecipeFighterConfig["aim"], nets: StrikeReport["nets"]): Band {
  switch (aim) {
    case "head": return "high";
    case "pays": {
      let best: Band = "high", most: number | null = null;
      for (const band of BAND_NAMES) {
        const net = nets?.right[band] ?? null;
        if (net !== null && (most === null || net > most)) { best = band; most = net; }
      }
      return best;
    }
    default: {
      const never: never = aim;
      throw new Error(`a fighter aims at the head or at what pays, not at ${JSON.stringify(never)}`);
    }
  }
}

/** The mark of a foe's body (`BodySpec.marks`) a blow at `band` is aimed at: its high one, or the first of its middle. */
function markOf(marks: Marks, band: Band): string | undefined {
  switch (band) {
    case "high": return marks.high;
    case "middle": return marks.middle[0];
    default: {
      const never: never = band;
      throw new Error(`no band ${JSON.stringify(never)}`);
    }
  }
}

/**
 * **The orders of a fighter that picks its own fight**, from what it sees: the nearest body of
 * another side, one still in the fight before one that is out (`nearestFoe`). It attacks the
 * mark its `aim` names (`bandAimed`, `markOf`), its high one where it has not that mark, coming to it as its `range`
 * says:
 *
 * - **close**: it walks at the foe, facing its walk, until their centres of mass are within
 *   `ATTACK_METRES` across the ground, then attacks.
 * - **edge**: it stands where the foe's blow at its head reaches it from where the foe stands
 *   (`rangeOf`, by what it sees of the foe), and no more than `edge.band` further: walking in,
 *   facing its walk, from further, and backing out, facing the foe, from nearer. It attacks when
 *   the part stands in its own blow's window along from where it stands (`StrikeReport.rangeAt`),
 *   which the strike skill throws from there; or when it has stood still `edge.patience`, and
 *   the skill walks it in. An attack under way goes on to its end.
 *
 * Once either is out it stands, facing the foe; and with nobody to fight it stands as it is.
 */
export function seekFoe({ view, report }: Sight, aim: RecipeFighterConfig["aim"] = RECIPE_FIGHTER.aim,
  range: RecipeFighterConfig["range"] = RECIPE_FIGHTER.range, edge: Edge = EDGE): Orders {
  const { senses, stance } = view, from = stance.centre;
  const foe = nearestFoe(senses, from, "standing-first");
  if (!foe) return STAND_ORDERS;
  const d = Math.max(0.001, hypot(foe.centre.x - from.x, foe.centre.z - from.z));
  const toward = { x: (foe.centre.x - from.x) / d, z: (foe.centre.z - from.z) / d };
  if (senses.out || foe.out) return { move: null, face: toward, attack: null };
  const head: Vector3 = foe.segments.get(foe.spec.marks.high)?.centre ?? foe.centre;
  const mark = aim === "head" ? undefined : markOf(foe.spec.marks, bandAimed(aim, report.strike.nets));
  const part = (mark === undefined ? undefined : foe.segments.get(mark)?.centre) ?? head;
  const attack: Orders = { move: null, face: toward, attack: [part.x, part.y, part.z] };
  switch (range) {
    case "close": return d > ATTACK_METRES ? { move: toward, face: null, attack: null } : attack;
    case "edge": {
      const strike = report.strike, me = view.head;
      if (strike.phase !== null) return attack;
      const mine = strike.rangeAt("right", part.y - me.y), off = hypot(part.x - me.x, part.z - me.z) - mine.reach;
      if ((mine.along[0] <= off && off <= mine.along[1]) || strike.still >= edge.patience) return attack;
      const theirs = rangeOf(foe.spec, "right", me.y - head.y), outside = theirs.reach + theirs.along[1];
      const apart = hypot(head.x - me.x, head.z - me.z);
      if (apart > outside + edge.band) return { move: toward, face: null, attack: null };
      if (apart < outside) return { move: { x: -toward.x, z: -toward.z }, face: toward, attack: null };
      return { move: null, face: toward, attack: null };
    }
    default: {
      const never: never = range;
      throw new Error(`a fighter comes close or holds at the edge, not ${JSON.stringify(never)}`);
    }
  }
}
