import type { Reader } from "../evaluation.ts";
import type { BuiltLone } from "../lone.ts";
import { cos, sin } from "../../core/math/real.ts";
import { AFTER, scriptOf, START, WALK, type LocomotionCondition } from "./cases.ts";

/**
 * What a Locomotion trial came to: its kind (`LocomotionCondition`), whether the body fell and when, s; over a walk's last
 * `HELD` s, its speed along the way asked and across it as shares of the pace (`along`,
 * `across`); a run's or a turn's fastest speed over any second, m/s (`top`); whether it stopped
 * (`stopped`: standing, and over the trial's last second its root moved under `STILL` m); and how
 * far its root ended from where it stood when its last cue came, m (`moved`). Null where the trial
 * does not read it.
 */
export type LocomotionReading = {
  readonly kind: LocomotionCondition["kind"];
  readonly fell: boolean;
  readonly fellAt: number | null;
  readonly along: number | null;
  readonly across: number | null;
  readonly top: number | null;
  readonly stopped: boolean;
  readonly moved: number;
  readonly seconds: number;
};

/** The span of a walk read for its pace, s, ending as the stop is asked; and how far a stopped body's root moves over the last second at most, m. */
export const HELD = 2, STILL = .05;

/** The reader of `condition`'s trial: the root segment's ground point every step, read when the trial has run `AFTER` s past its last cue. */
export function readLocomotion({ world, body }: BuiltLone, condition: LocomotionCondition): Reader<LocomotionReading> {
  const spec = body.built.spec, rootName = spec.segments.find((segment) => !spec.joints.some((joint) => joint.child === segment.name))!.name;
  const root = body.built.segments.get(rootName)!.node, hz = world.hz, { last } = scriptOf(condition);
  const end = Math.round((last + AFTER) * hz), path: number[] = [];
  let fellAt: number | null = null, steps = 0;
  const at = (seconds: number) => 2 * Math.min(path.length / 2 - 1, Math.max(0, Math.round(seconds * hz) - 1));
  return {
    afterStep() {
      steps++;
      path.push(root.position.x, root.position.z);
      if (fellAt === null && body.body.down) fellAt = world.time;
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
      return { kind: condition.kind, fell: fellAt !== null, fellAt, along, across, top, stopped: standing && gap(ended - 1, ended) < STILL, moved: gap(last, ended), seconds: ended };
    },
  };
}
