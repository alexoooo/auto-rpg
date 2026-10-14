import type { BodyView } from "../../body.ts";
import { deepFreeze } from "../../state.ts";
import type { OwnBody } from "../mind.ts";
import type { GroundReading, Position } from "./reading.ts";
import { phaseClock, poseDrive, REACHED_SECONDS, type TechniqueEnd, type TechniqueRun } from "./techniques.ts";

/** Flexing the trunk brings the shoulders forward while bent knees and posted arms check the fall. */
const CURL = deepFreeze({ "neck flexion": .25, "lumbar flexion": .65, "thoracic flexion": .45,
  "hip.left flexion": 1.5, "hip.right flexion": 1.5, "knee.left flexion": 1.6, "knee.right flexion": 1.6,
  "shoulder.left flexion": .8, "shoulder.right flexion": .8, "elbow.left flexion": .7, "elbow.right flexion": .7 });
/** The pelvis and feet bear while the hands reach behind the hips. */
const SIT = deepFreeze({ ...CURL, "lumbar flexion": .15, "thoracic flexion": .1,
  "shoulder.left flexion": -.5, "shoulder.right flexion": -.5, "shoulder.left abduction": .3,
  "shoulder.right abduction": .3, "elbow.left flexion": .15, "elbow.right flexion": .15 });

/** A back-to-sitting transition whose fixed terminal predicate requires actual pelvic support. */
export function sitUp(own: OwnBody, _view: BodyView): TechniqueRun {
  const drive = poseDrive(own.muscles), clock = phaseClock(), pelvis = own.spec.segments.findIndex(s => s.name === "lowerTrunk");
  const upper = own.built.segments.get("upperTrunk")!, lower = own.built.segments.get("lowerTrunk")!;
  const state = { phase: "curl" as "curl" | "sit", elapsed: 0, ended: null as TechniqueEnd | null, clock: clock.state, yieldPending: true };
  const reached = (g: GroundReading, to: Position) => to === "sitting" && g.position === "sitting"
    && g.load[pelvis]! >= .03 && upper.node.position.y - lower.node.position.y > .15
    && g.velocity.lengthSquared() < .25 && g.spin < 1;
  return {
    state, get phase() { return state.phase; },
    get yields() { const value = state.yieldPending; state.yieldPending = false; return value || state.ended !== null; },
    admits(g, side) { return side === "left" && g.lie === "back" && g.height < .5 && g.spin < 4 && g.velocity.lengthSquared() < 1; },
    reached,
    begin(side) { state.phase = "curl"; state.elapsed = 0; state.ended = side === "left" ? null : "failed"; state.yieldPending = true; clock.reset(); },
    end() { state.ended = "interrupted"; },
    step(g, _senses, dt) {
      if (state.ended) return state.ended;
      state.elapsed += dt;
      if (state.elapsed > 5) return state.ended = "timed-out";
      drive(state.phase === "curl" ? CURL : SIT);
      const high = upper.node.position.y - lower.node.position.y;
      const result = clock.step({ inside: g.height < .8 && g.spin < 12,
        event: state.phase === "curl" ? high > .15 && g.load[pelvis]! >= .03 : reached(g, "sitting"),
        hold: state.phase === "sit" ? REACHED_SECONDS : 0, deadline: 3,
        ...(state.phase === "curl" ? { progress: { value: high, gain: .02, window: 1.5 } } : {}) }, dt);
      if (result === "done" && state.phase === "curl") { state.phase = "sit"; clock.reset(); state.yieldPending = true; }
      else if (result) state.ended = result;
      return state.ended;
    },
  };
}
