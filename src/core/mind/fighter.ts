import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { wrap } from "../skills/locomotion.ts";
import { APPROACH, rangeOf, type StrikeReport } from "../skills/strike.ts";
import { BAND_NAMES, BANDS, type Band } from "../skills/strikes.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { FIGHTER, type FighterMindConfig } from "./config.ts";
import { GUARD_ACTION, type HandAction, type Intent } from "./intent.ts";
import { STAND_ORDERS, type Orders } from "./orders.ts";
import type { BodySense } from "./senses.ts";
import type { Sight, Tactics } from "./tactics.ts";
import { THREAT, threatOf, type Threat } from "./threat.ts";
import { sin, cos, atan2, hypot } from "../math/real.ts";

/**
 * How near a target a fighter attacks it rather than walking to it, m, between the two centres of
 * mass across the ground: the club's reach ahead of the head (1.05 m, `REPERTOIRE`) and a step,
 * which the strike skill closes itself. Set (`docs/reference/human-and-strikes.md#attack-distance`).
 */
export const ATTACK_METRES = 1.8;

/**
 * Walking one way while facing another (`fighterTactics`): the share of the fastest walk held
 * across the heading or backward, and how near its facing a body must have turned, rad, before
 * it walks any faster. Measured with the club in hand: `docs/reference/orders.md#the-rule`.
 */
export const STRAFE = { share: 0.5, turned: 0.3 } as const;

/**
 * **Holding at the edge of a foe's reach** (`FighterMindConfig.range`, `"edge"`): how far past the
 * foe's reach a fighter stands before it walks in again, m; and how long it stands still there,
 * s, before it walks in to attack all the same. Set: `docs/reference/human-and-strikes.md#the-edge`.
 */
export const EDGE: NonNullable<FighterMindConfig["edge"]> = Object.freeze({ band: 0.25, patience: 4 });

/**
 * **A fighter's tactics** carry out `Orders`, asked for every control step with what the body
 * sees. Ordered to walk, it walks that way at its body's fastest walk (`Body.envelope`), turning
 * to it; ordered to face another way as it walks, it walks at the pace that holds (`strafe`,
 * `STRAFE` unless an experiment passes another). Given a point to attack it attacks it with what
 * the right hand holds: the strike skill brings the body the rest of the way (`APPROACH` in
 * `src/core/skills/strike.ts`). It holds the point it aims at while the ordered one stays within
 * `APPROACH.reach` of it, and aims again after each blow, since the skill sets the feet for the
 * point it is given and a point that followed a swaying head would move under every placing.
 * Once the blow is committed (its chamber and its swing) it aims at the ordered point itself,
 * which the skill turns the body to follow (`STEER`). Back from another mind (`BodyView.resumed`), it aims afresh.
 *
 * A hand that does not attack guards as `guard` says (`FighterMindConfig.guard`): in the pose,
 * or covering what threatens the head (`threatOf`, by `threat`) while anything does.
 *
 * The stance turns only while it walks (`locomotion`), so a standing body ordered to face
 * does not turn.
 */
export function fighterTactics(name: string, orders: (sight: Sight) => Orders, strafe: typeof STRAFE = STRAFE,
  guard: FighterMindConfig["guard"] = FIGHTER.guard, threat: Threat = THREAT): Tactics {
  /** What a hand that does not attack does this step. */
  const guarding = ((): (sight: Sight) => HandAction => {
    switch (guard) {
      case "pose": return () => GUARD_ACTION;
      case "cover": return ({ view }) => {
        const cover = threatOf(view, threat);
        return cover ? { kind: "guard", cover } : GUARD_ACTION;
      };
      default: {
        const never: never = guard;
        throw new Error(`a fighter guards in the pose or by a cover, not by ${JSON.stringify(never)}`);
      }
    }
  })();
  /** Its memory: the point aimed at, and the blows thrown when it was chosen. */
  const state: { aim: { point: Vec3; thrown: number } | null } = { aim: null };
  return {
    name, state,
    decide: (sight): Intent => {
      if (sight.view.resumed) state.aim = null;
      const { report, envelope } = sight, { move, face, attack } = orders(sight), rest = guarding(sight);
      if (attack) {
        const thrown = report.strike.thrown.right;
        let aim = state.aim;
        const phase = report.strike.phase;
        if (!aim || aim.thrown !== thrown || phase === "chamber" || phase === "swing"
          || hypot(attack[0] - aim.point[0], attack[1] - aim.point[1], attack[2] - aim.point[2]) > APPROACH.reach) {
          aim = state.aim = { point: [attack[0], attack[1], attack[2]], thrown };
        }
        return { move: null, face: report.heading, hands: { left: rest, right: { kind: "attack", target: aim.point } } };
      }
      state.aim = null;
      const hands = { left: rest, right: rest };
      // A facing under 8 cm long names no direction: the point to face is over the body itself.
      const facing = face && hypot(face.x, face.z) > 0.08 ? atan2(face.x, face.z) : null;
      if (!move || !envelope) return { move: null, face: facing ?? report.heading, hands };
      const bearing = atan2(move.x, move.z), walk = envelope.walk.value;
      // Facing its walk: the walk the envelope measured, forward, turning to it.
      if (facing === null) return { move: [walk, 0], face: bearing, hands };
      // Facing elsewhere: the walk's direction in the heading's frame, at the pace that holds.
      const off = bearing - report.heading;
      const share = Math.abs(wrap(facing - report.heading)) < strafe.turned
        ? strafe.share + (1 - strafe.share) * Math.max(0, cos(off)) : strafe.share;
      return { move: [walk * share * cos(off), walk * share * sin(off)], face: facing, hands };
    },
  };
}

/**
 * The band of a foe a fighter attacks, by its `aim` (`FighterMindConfig.aim`): the high one, its
 * head; or the one the right hand's recipe nets the most on (`StrikeReport.nets`), the first of
 * equals in the bands' order, and the high one where the hand has no recipe.
 */
function bandAimed(aim: FighterMindConfig["aim"], nets: StrikeReport["nets"]): Band {
  switch (aim) {
    case "head": return "high";
    case "pays": {
      let best: Band = "high", most: number | null = null;
      for (const band of BAND_NAMES) {
        const net = nets.right[band];
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

/**
 * **The orders of a fighter that picks its own fight**, from what it sees: the nearest body of
 * another side, one still in the fight before one that is out. It attacks the part its `aim`
 * names (`bandAimed`, `BANDS`), its head where it has not that part, coming to it as its `range`
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
export function seekFoe({ view, report }: Sight, aim: FighterMindConfig["aim"] = FIGHTER.aim,
  range: FighterMindConfig["range"] = FIGHTER.range, edge: NonNullable<FighterMindConfig["edge"]> = EDGE): Orders {
  const { senses, stance } = view, from = stance.centre;
  let foe: BodySense | null = null, near = Infinity;
  for (const other of senses.others) {
    if (other.side === senses.side) continue;
    const d = hypot(other.centre.x - from.x, other.centre.z - from.z);
    if (foe === null || (foe.out && !other.out) || (foe.out === other.out && d < near)) { foe = other; near = d; }
  }
  if (!foe) return STAND_ORDERS;
  const d = Math.max(0.001, near);
  const toward = { x: (foe.centre.x - from.x) / d, z: (foe.centre.z - from.z) / d };
  if (senses.out || foe.out) return { move: null, face: toward, attack: null };
  const head: Vector3 = foe.segments.get("head")?.centre ?? foe.centre;
  const part = aim === "head" ? head : foe.segments.get(BANDS[bandAimed(aim, report.strike.nets)])?.centre ?? head;
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
