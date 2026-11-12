import type { Reader } from "../evaluation.ts";
import type { BuiltLone } from "../lone.ts";
import { atan2, cos, sin } from "../../core/math/real.ts";
import { Vector3 } from "../../core/math/vector.ts";
import { massCentreToRef, massOf } from "../../core/bodies/read-motion.ts";
import { uprightness } from "../../control/ground.ts";
import { orderTime } from "../order-time.ts";
import { AFTER, HOLD, RUN_UP, scriptOf, START, TURN_RATE, TURNING, WALK, type LocomotionCondition } from "./cases.ts";

/**
 * What a Locomotion trial came to: its kind (`LocomotionCondition`), whether the body fell and when, s; over a walk's last
 * `HELD` s, its speed along the way asked and across it as shares of the pace (`along`,
 * `across`); a run's or a turn's fastest speed over any second, m/s (`top`); whether it stopped
 * (`stopped`: standing, and over the trial's last second its root moved under `STILL` m); and how
 * far its root ended from where it stood when its last cue came, m (`moved`). The run's bar: its
 * slowest second, m/s, forward over the held run and along its path over a turning one (`held`);
 * how far the way it went lagged the way asked at most, rad, over a turning run past its first
 * second (`trail`); a stopped run's (one from a walk among them) speed over the second before the
 * stop, m/s (`speed`), and how long from the stop it took to go slower than `HALTED` over
 * `HALT_SPAN`, s (`halt`). A run to a place reads its time lost alone. Null where the trial
 * does not read it. The seconds lost against its orders, and how long it had been down at the end
 * (`lost`, `downFor`: `orderTime`).
 */
export type LocomotionReading = {
  readonly kind: LocomotionCondition["kind"];
  readonly fell: boolean;
  readonly fellAt: number | null;
  readonly along: number | null;
  readonly across: number | null;
  readonly top: number | null;
  readonly held: number | null;
  readonly trail: number | null;
  readonly speed: number | null;
  readonly halt: number | null;
  readonly stopped: boolean;
  readonly moved: number;
  readonly seconds: number;
  readonly lost: number;
  readonly downFor: number | null;
};

/** The span of a walk read for its pace, s, ending as the stop is asked; and how far a stopped body's root moves over the last second at most, m. */
const HELD = 2, STILL = .05;

/** Under what speed a run has stopped, m/s, read over how long, s; and how far apart the turning run's way is read, s. */
const HALTED = .15, HALT_SPAN = .25, TRAIL_SPAN = .5;

/** The reader of `condition`'s trial: the root segment's ground point every step, read when the trial has run `AFTER` s past its last cue. */
export function readLocomotion({ world, body }: BuiltLone, condition: LocomotionCondition): Reader<LocomotionReading> {
  const spec = body.built.spec, rootName = spec.segments.find((segment) => !spec.joints.some((joint) => joint.child === segment.name))!.name;
  const root = body.built.segments.get(rootName)!.pose, hz = world.hz, { cues, last } = scriptOf(condition);
  const parts = [...body.built.segments.values()], mass = massOf(parts), upright = uprightness(body.built), orders = orderTime(cues, hz);
  const centre = new Vector3(), velocity = new Vector3(), work = new Vector3();
  const end = Math.round((last + AFTER) * hz), path: number[] = [];
  let fellAt: number | null = null, steps = 0;
  const at = (seconds: number) => 2 * Math.min(path.length / 2 - 1, Math.max(0, Math.round(seconds * hz) - 1));
  return {
    afterStep() {
      steps++;
      path.push(root.position.x, root.position.z);
      if (fellAt === null && body.body.down) fellAt = world.time;
      massCentreToRef(parts, mass, centre, work, velocity);
      orders.step(centre, velocity, upright.fallen());
    },
    get ended() { return steps >= end; },
    reading() {
      const x = (seconds: number) => path[at(seconds)]!, z = (seconds: number) => path[at(seconds) + 1]!;
      const gap = (a: number, b: number) => { const dx = x(b) - x(a), dz = z(b) - z(a); return Math.sqrt(dx * dx + dz * dz); };
      const ended = world.time, standing = !body.body.down;
      let along: number | null = null, across: number | null = null, top: number | null = null;
      if (condition.kind === "walk") {
        const way = condition.way * Math.PI / 180, from = START + WALK - HELD, to = START + WALK;
        const dx = (x(to) - x(from)) / HELD, dz = (z(to) - z(from)) / HELD;
        along = (dx * sin(way) + dz * cos(way)) / condition.pace;
        across = (dx * cos(way) - dz * sin(way)) / condition.pace;
      }
      if (condition.kind === "run" || condition.kind === "turn") {
        top = 0;
        for (let step = (START + 1) * hz; step <= last * hz; step++) top = Math.max(top, gap(step / hz - 1, step / hz));
      }
      let held: number | null = null, trail: number | null = null, speed: number | null = null, halt: number | null = null;
      // The slowest second between `from` and `to`, s: forward (+z), or along the path.
      const slowest = (from: number, to: number, forward: boolean) => {
        let least = Infinity;
        for (let step = Math.round((from + 1) * hz); step <= Math.round(to * hz); step++) least = Math.min(least, forward ? z(step / hz) - z(step / hz - 1) : gap(step / hz - 1, step / hz));
        return least;
      };
      if (condition.kind === "run-held") held = slowest(START + RUN_UP, START + RUN_UP + HOLD, true);
      if (condition.kind === "run-turn") {
        const from = START + RUN_UP;
        held = slowest(from, from + TURNING, false);
        trail = 0;
        for (let step = Math.round((from + 1) * hz); step <= Math.round((from + TURNING - TRAIL_SPAN / 2) * hz); step++) {
          const time = step / hz, asked = condition.way * TURN_RATE * (time - from), dx = x(time + TRAIL_SPAN / 2) - x(time - TRAIL_SPAN / 2), dz = z(time + TRAIL_SPAN / 2) - z(time - TRAIL_SPAN / 2);
          const ax = sin(asked), az = cos(asked);
          trail = Math.max(trail, Math.abs(atan2(dx * az - dz * ax, dx * ax + dz * az)));
        }
      }
      if (condition.kind === "run-stop" || condition.kind === "walk-run") {
        speed = gap(last - 1, last);
        for (let step = Math.round(last * hz); step <= Math.round((ended - HALT_SPAN) * hz); step++)
          if (gap(step / hz, step / hz + HALT_SPAN) / HALT_SPAN < HALTED) { halt = step / hz - last; break; }
      }
      return { kind: condition.kind, fell: fellAt !== null, fellAt, along, across, top, held, trail, speed, halt, stopped: standing && gap(ended - 1, ended) < STILL, moved: gap(last, ended), seconds: ended, ...orders.reading() };
    },
  };
}
