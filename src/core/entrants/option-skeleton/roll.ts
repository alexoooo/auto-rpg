import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import data from "../../../../assets/entrants/option-skeleton/roll.json" with { type: "json" };
import { turnOfToRef } from "../../control/support.ts";
import type { OwnBody } from "../../mind/mind.ts";
import type { GroundReading, Position } from "../../mind/ground/reading.ts";
import { mirrorPosture, poseDrive, REACHED_SECONDS, type TechniqueEnd, type TechniqueRun } from "../../mind/ground/technique.ts";
import type { Side } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";

/** Searched poses turn over the left side; the right side mirrors their anatomical targets. */
const ROLL = deepFreeze(data);

/** A two-pose roll flattens once the pelvis faces down, then waits for loaded front support. */
export function skeletonRoll(own: OwnBody): TechniqueRun {
  const drive = poseDrive(own.muscles), work = { turn: new Quaternion(), forward: new Vector3() };
  const poses = { left: ROLL.poses, right: ROLL.poses.map(mirrorPosture) }, root = own.built.segments.get("lowerTrunk")!;
  const trunk = own.spec.segments.flatMap((segment, i) => segment.name.endsWith("Trunk") ? [i] : []);
  const state = { side: "left" as Side, elapsed: 0, skipWind: false, flatten: false, reached: 0, ended: null as TechniqueEnd | null };
  const reached = (g: GroundReading, to: Position) => to === "front" && g.position === "front" && g.lie === "front"
    && g.height < .5 && trunk.reduce((sum, i) => sum + g.load[i]!, 0) >= .5;
  const finish = (end: TechniqueEnd) => { state.ended = end; return end; };
  return {
    state, get phase() { return state.flatten ? "flatten" : !state.skipWind && state.elapsed < ROLL.wind ? "wind" : "turn"; },
    get yields() { return state.ended !== null; },
    admits: (g) => g.height < .5 && g.spin < 8 && g.velocity.lengthSquared() < 9,
    reached,
    begin(side) { state.side = side; state.elapsed = 0; state.skipWind = false; state.flatten = false; state.reached = 0; state.ended = null; },
    end() { finish("interrupted"); },
    step(g, _senses, dt) {
      if (state.ended !== null) return state.ended;
      if (state.elapsed > 6) return finish("timed-out");
      if (state.elapsed === 0) state.skipWind = g.lie !== "back";
      turnOfToRef(root, work.turn);
      work.forward.set(0, 0, 1).applyRotationQuaternionToRef(work.turn, work.forward);
      if (work.forward.y < ROLL.flattenAt) state.flatten = true;
      drive(state.flatten ? ROLL.flat : poses[state.side][!state.skipWind && state.elapsed < ROLL.wind ? 0 : 1]!, ROLL.within, ROLL.speed);
      state.elapsed += dt;
      state.reached = reached(g, "front") ? state.reached + dt : 0;
      return state.reached + 1e-9 >= REACHED_SECONDS ? finish("done") : null;
    },
  };
}
