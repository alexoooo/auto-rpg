import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Duel } from "../../arena/duel.ts";
import type { BuiltSegment } from "../../core/build/build-body.ts";
import type { World } from "../../core/world.ts";
import type { Reader } from "../evaluation.ts";
import { readStrike, type StrikeReading } from "../strike/read.ts";
import type { StandCondition, StandRung } from "./cases.ts";

/**
 * What a Stand trial came to: when the shove came, s of the bout (null where it never did: a strike
 * whose limb never flew); whether the subject kept its feet from then to the trial's end, and when
 * it went down, s; the steps it took to settle, each foot landing from the shove until it settled
 * (all of them where it did not); how long after the shove it settled, s, its centre of mass's
 * velocity over the rung's window back within the rung's margin of what it aims at and staying so
 * to the end (`StandRung`), null where it did not; and, on the striking rung, its strike's outcome
 * (`StrikeReading`), when its action began and ended, s, and whether it finished, begun and ended
 * neither let go nor fallen.
 */
export type StandReading = {
  readonly shoved: number | null;
  readonly upright: boolean;
  readonly fellAt: number | null;
  readonly steps: number;
  readonly settled: number | null;
  readonly strike: { readonly outcome: StrikeReading["outcome"]; readonly began: number | null; readonly ended: number | null; readonly finished: boolean } | null;
  readonly seconds: number;
};

/** How long a foot bears on nothing before it bears again for a landing, s: a step, not a sole rolling on the floor. */
const LIFTED = .05;

/** Whether a strike finished: begun and ended, neither let go nor fallen. */
const finished = (strike: StrikeReading): boolean => strike.began !== null && strike.ended !== null && strike.outcome !== "abandoned" && strike.outcome !== "fell";

/**
 * The reader of a trial of `rung`: the subject, the bout's left side, read every step from its
 * body (its centre of mass's velocity, each segment's by its mass, and its feet bearing on the floor), ending
 * `watch` s after the shove, or at the rung's seconds where none came; on the striking rung, its
 * strike read as the Strike drill reads it, to its end.
 */
export function readStand(built: { readonly world: World; readonly duel: Duel }, condition: StandCondition, rung: StandRung): Reader<StandReading> {
  const { world, duel } = built, left = duel.duelists.left, body = left.built, dt = 1 / world.hz;
  const parts = [...body.segments.values()], mass = parts.reduce((sum, part) => sum + part.body.massProperties.mass, 0);
  const feet = (["left", "right"] as const).map((side) => ({ side, segment: body.segments.get(`foot.${side}`) }));
  const velocity = new Vector3(), part = new Vector3();
  /** Whether a foot bears on something fixed, the floor: the solver pushed on it last step. */
  const bears = (segment: BuiltSegment | undefined) => segment !== undefined && body.physics.contactsOf(segment.body, (other) => other === null).some((contact) => contact.impulse > 0);
  const strike = rung.state === "striking" ? readStrike(built, { mark: rung.mark ?? "middle", hand: condition.hand ?? "right" },
    { seconds: rung.seconds, settle: .5, settled: rung.after ?? 0, patience: 8 }) : null;
  /** The centre of mass's velocity across the ground over the last `window` s, a ring of x and z. */
  const size = Math.max(1, Math.round(rung.window * world.hz)), ring = new Float64Array(2 * size);
  let filled = 0, next = 0, sumX = 0, sumZ = 0;
  let aimX = 0, aimZ = 0, lastOff: number | null = null, off = true, fellAt: number | null = null, watching = false;
  /** Each foot's time bearing on nothing, s. */
  const landings: number[] = [], free = { left: 0, right: 0 };
  return {
    afterStep() {
      if (strike && !strike.ended) strike.afterStep();
      const time = duel.clock;
      // The centre of mass's velocity: each segment's, by its mass.
      velocity.setAll(0);
      for (const one of parts) velocity.addInPlace(one.body.linearVelocityToRef(part).scaleInPlace(one.body.massProperties.mass));
      velocity.scaleInPlace(1 / mass);
      if (!watching && duel.shoved !== null) {
        // The step the shove came: what the body was doing, over the window before it.
        watching = true;
        if (rung.aim === "before" && filled > 0) { aimX = sumX / filled; aimZ = sumZ / filled; }
      }
      if (filled === size) { sumX -= ring[2 * next]!; sumZ -= ring[2 * next + 1]!; } else filled++;
      ring[2 * next] = velocity.x; ring[2 * next + 1] = velocity.z; sumX += velocity.x; sumZ += velocity.z;
      next = (next + 1) % size;
      for (const { side, segment } of feet) {
        if (!bears(segment)) { free[side] += dt; continue; }
        if (watching && free[side] >= LIFTED) landings.push(time);
        free[side] = 0;
      }
      if (fellAt === null && left.body.down) fellAt = time;
      if (!watching) return;
      const dx = sumX / filled - aimX, dz = sumZ / filled - aimZ;
      off = dx * dx + dz * dz > rung.within * rung.within;
      if (off) lastOff = time;
    },
    get ended() {
      const shoved = duel.shoved, clock = duel.clock;
      if (clock >= rung.seconds) return true;
      return shoved !== null && clock >= shoved + rung.watch && (strike === null || strike.ended);
    },
    reading() {
      const shoved = duel.shoved, struck = strike?.reading() ?? null;
      const settled = shoved === null || fellAt !== null || off ? null : lastOff === null ? 0 : lastOff + dt - shoved;
      const until = settled === null || shoved === null ? Infinity : shoved + settled;
      return { shoved, upright: fellAt === null, fellAt, steps: landings.filter((at) => at <= until).length, settled,
        strike: struck && { outcome: struck.outcome, began: struck.began, ended: struck.ended, finished: finished(struck) }, seconds: duel.clock };
    },
  };
}
