import type { BodyView } from "../../body.ts";
import { deepFreeze } from "../../state.ts";
import type { OwnBody } from "../../mind/mind.ts";
import type { GroundReading, Position } from "../../control/ground-reading.ts";
import { armClearance } from "./clearance.ts";
import { phaseClock, poseDrive, REACHED_SECONDS, type TechniqueEnd, type TechniqueRun } from "./technique.ts";

/** Wide arms arrest rolling while the legs and trunk relax toward a loaded lie. */
const FLAT = deepFreeze({ "shoulder.left abduction": 1.3, "shoulder.right abduction": 1.3,
  "elbow.left flexion": .2, "elbow.right flexion": .2, "hip.left flexion": .1, "hip.right flexion": .1,
  "knee.left flexion": .2, "knee.right flexion": .2 });

/** Repositioning proves anatomical arm clearance independently of filtered self-contacts. */
export function flatten(own: OwnBody, _view: BodyView): TechniqueRun {
  const drive = poseDrive(own.muscles), clear = armClearance(own.built), clock = phaseClock();
  const trunk = own.spec.segments.flatMap((s, i) => s.name.endsWith("Trunk") ? [i] : []);
  const state = { ended: null as TechniqueEnd | null, clock: clock.state };
  const reached = (g: GroundReading, to: Position) => (to === "front" || to === "back") && g.lie === to
    && trunk.some(i => g.load[i]! >= .03) && g.velocity.lengthSquared() < .25 && g.spin < 1 && clear();
  return {
    state, phase: "flatten", yields: true,
    admits: g => g.height < .8 && g.spin < 8,
    reached,
    begin() { state.ended = null; clock.reset(); },
    end() { state.ended = "interrupted"; },
    step(g, _senses, dt) {
      if (state.ended) return state.ended;
      drive(FLAT, .35, 2, .35);
      state.ended = clock.step({ inside: g.height < 1 && g.spin < 15,
        event: reached(g, g.lie), hold: REACHED_SECONDS, deadline: 3 }, dt);
      return state.ended;
    },
  };
}
