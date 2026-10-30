/**
 * **How the Gait drill reads a trial**: when the subject stopped, how fast it was going then, when
 * its action was admitted, and whether it went down.
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Duel } from "../../arena/duel.ts";
import { drillTask } from "../../core/command/drill.ts";
import type { World } from "../../core/world.ts";
import type { Reader } from "../evaluation.ts";

/**
 * How a trial came out: `ready`, its action admitted after it stopped, on its feet; `fell`, down at
 * any time of the trial; `never`, stopped and never admitted; `unreached`, never stopped.
 */
type GaitOutcome = "ready" | "fell" | "never" | "unreached";

/** What a trial came to. */
export type GaitReading = {
  readonly outcome: GaitOutcome;
  /** The centre of mass's speed over the ground the step it stopped, m/s; null where it never stopped. */
  readonly moving: number | null;
  /** From the stop to the step its action was admitted, s: how long the gait left it unbraced; null where it never was. */
  readonly braced: number | null;
  readonly down: boolean;
  readonly seconds: number;
};

/** The reader of a trial in which the subject, the bout's left side, goes at its foe by a gait, stops and strikes, for at most `seconds` s, and `settle` s past its action's end. */
export function readGait({ world, duel }: { readonly world: World; readonly duel: Duel }, { seconds, settle }: { readonly seconds: number; readonly settle: number }): Reader<GaitReading> {
  const left = duel.duelists.left, skills = left.minded.skills;
  if (!skills) throw new Error("the subject runs no skills");
  let stopped: number | null = null, moving: number | null = null, admitted: number | null = null, ended: number | null = null, down = false;
  const velocity = new Vector3(), segments = [...left.built.segments.values()], mass = segments.reduce((sum, segment) => sum + segment.rigid.mass, 0);
  /** The centre of mass's speed over the ground, m/s. */
  const speed = (): number => {
    let x = 0, z = 0;
    for (const segment of segments) { segment.body.linearVelocityToRef(velocity); x += segment.rigid.mass * velocity.x; z += segment.rigid.mass * velocity.z; }
    return Math.sqrt(x * x + z * z) / mass;
  };
  return {
    afterStep() {
      const phase = drillTask(duel.commanded("left")?.task ?? "lost").phase;
      if (phase !== "going" && stopped === null) { stopped = world.time; moving = speed(); }
      if (admitted === null && skills.report.actions.length > 0) admitted = world.time;
      if (phase === "done") ended ??= world.time;
      down ||= left.body.down;
    },
    get ended() { return world.time >= seconds || ended !== null && world.time >= ended + settle; },
    reading() {
      const outcome: GaitOutcome = down ? "fell" : stopped === null ? "unreached" : admitted === null ? "never" : "ready";
      return { outcome, moving, braced: stopped !== null && admitted !== null ? admitted - stopped : null, down, seconds: world.time };
    },
  };
}
