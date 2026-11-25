import type { Ground, Leaves, Outcome } from "../contract/terms.ts";
import type { Position } from "../../../control/ground-reading.ts";
import { FALLEN } from "../predictions/by-hand.ts";
import type { Spot } from "../../../skills/framework/menu.ts";
import type { Exit } from "../../../skills/framework/profile/profile.ts";
import type { Situation } from "../contract/situation.ts";
import { atan2, cos, sin } from "../../../core/math/real.ts";

/** Leaving the body as it is: nothing changed. */
export const AS_IS: Leaves = Object.freeze({});

/** **Ending one way**: leaving the body as it is (`AS_IS`), for certain. */
export const UNMOVED: readonly Outcome[] = Object.freeze([Object.freeze({ leaves: AS_IS, chance: 1 })]);

/** No motion over the ground. */
export const STILL: Ground = Object.freeze({ x: 0, z: 0 });

/**
 * **Up, or fallen**: leaving the body as `up` says in the share it stays up, lying in `posture`
 * (`FALLEN` unless given) in the share `down`; one outcome where either share is none.
 */
export function upOrDown(up: Leaves, down: number, posture: Position = FALLEN): readonly Outcome[] {
  if (!(down > 0)) return up === AS_IS ? UNMOVED : [{ leaves: up, chance: 1 }];
  const fallen: Outcome = { leaves: { posture, velocity: STILL }, chance: Math.min(1, down) };
  return down >= 1 ? [fallen] : [{ leaves: up, chance: 1 - down }, fallen];
}

/** Whether `leaves` changes nothing (`AS_IS`). */
export const unchanged = (leaves: Leaves): boolean => leaves.where === undefined && leaves.around === undefined && leaves.posture === undefined && leaves.velocity === undefined && leaves.grace === undefined;

/**
 * **Where the body stands `range` m head to head from the focus of `at`**: on the line from the
 * focus through where it stands at `at` (the way it faces, back, where it stands on the focus's
 * centre), facing the focus.
 */
export function along(at: Situation, range: number): Spot {
  const focus = at.focus!, where = at.where, apart = at.apart, to = Math.max(0, range + apart - at.range);
  const x = apart > 0 ? (where.x - focus.centre.x) / apart : -sin(where.face), z = apart > 0 ? (where.z - focus.centre.z) / apart : -cos(where.face);
  return { x: focus.centre.x + x * to, z: focus.centre.z + z * to, face: atan2(-x, -z) };
}

/**
 * **Where an Option leaves the body by its trials' exit** (`Expected.exit`) from `at`, as `leaves`
 * says but for where: where it stands in the share of its trials that ended within `ARRIVED` of
 * where they began centre to centre (`stays`), else as much further from the focus as the rest
 * moved (`moved`, m), on the line from the focus through it (`along`); where its trials do not
 * say, where it stands. Down in the share `down` (`upOrDown`).
 */
export function exitOutcomes(at: Situation, exit: Exit | undefined, down: number, leaves: Omit<Leaves, "where"> = {}): readonly Outcome[] {
  const stays = exit?.stays ?? 1, here = { ...leaves, where: along(at, at.range) };
  if (!(stays < 1)) return upOrDown(here, down);
  const there = { ...leaves, where: along(at, at.range + (exit?.moved ?? 0)) };
  if (!(stays > 0)) return upOrDown(there, down);
  return upOrDown(here, down).flatMap((one) => one.leaves === here ? [{ leaves: here, chance: one.chance * stays }, { leaves: there, chance: one.chance * (1 - stays) }] : [one]);
}
