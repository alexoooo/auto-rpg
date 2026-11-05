import { Quaternion, Vector3 } from "../../../../core/math/vector.ts";
import { stanceFeetOf } from "../../../framework/skill.ts";
import type { Carrying } from "../../../../control/motor.ts";
import { turnOfToRef } from "../../../../core/bodies/read-motion.ts";
import { atan2 } from "../../../../core/math/real.ts";
import type { BodyView } from "../../../../control/body.ts";
import type { OwnBody } from "../../../../core/bodies/own-body.ts";
import { standReady, type GroundReading } from "../../../../control/ground-reading.ts";
import { REACHED_SECONDS, type TechniqueEnd } from "../../technique.ts";
import type { BodyControl } from "../../../../core/bodies/body-control.ts";

/** The longest the climb after a rise (`stanceSteady`) may take, s. */
const STEADY_LIMIT = 3;
/** How long the climb after a rise may read the body off its feet (`GroundReading.onFeet`: a knee or the trunk down), s, before it has failed. */
const STEADY_OFF = .3;

/**
 * **The stance's climb and steadying after a rise**: from the height the rise leaves the body at
 * over its lower sole, the stance's goal raised to standing height over `climb` s on a smoothstep,
 * on both feet, heading the way the pelvis faces. Done once the body has been ready to hand back
 * (`standReady`) `REACHED_SECONDS`; failed once off its feet (`GroundReading.onFeet`) `STEADY_OFF`
 * after its first 0.5 s;
 * timed out past `STEADY_LIMIT`.
 */
export function stanceSteady(own: OwnBody, view: BodyView, motor: Carrying<"stance">, climb: number) {
  const feet = Object.keys(stanceFeetOf(own.spec));
  const state = { time: 0, off: 0, reached: 0, height: 0, heading: 0 };
  const work = { turn: new Quaternion(), across: new Vector3() };
  return {
    state,
    /** Begin from where the rise has left the body. */
    begin(g: GroundReading): void {
      turnOfToRef(own.built.segments.get("lowerTrunk")!, work.turn);
      work.across.set(1, 0, 0).applyRotationQuaternionToRef(work.turn, work.across);
      state.heading = atan2(-work.across.z, work.across.x);
      motor.reset(); motor.stance.read();
      let lowest = Infinity;
      for (const end of feet) lowest = Math.min(lowest, motor.stance.reading.ends[end]!.middle.y);
      state.height = g.centre.y - lowest;
      state.time = 0; state.off = 0; state.reached = 0;
    },
    step(g: GroundReading, control: BodyControl, dt: number): TechniqueEnd | null {
      state.time += dt;
      state.off = g.onFeet ? 0 : state.off + dt;
      if (state.off > STEADY_OFF && state.time > .5) return "failed";
      if (state.time > STEADY_LIMIT) return "timed-out";
      const w = Math.min(1, state.time / climb), smooth = w * w * (3 - 2 * w), top = view.standing - .03;
      motor.stance.read();
      motor.setStance({ feet, centre: null, height: state.height + (top - state.height) * smooth, heading: state.heading });
      motor.control(own.muscles, control, dt);
      state.reached = standReady({ down: view.down, ground: g }) ? state.reached + dt : 0;
      return state.reached + 1e-9 >= REACHED_SECONDS ? "done" : null;
    },
  };
}
