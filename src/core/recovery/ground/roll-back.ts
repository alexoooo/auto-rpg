import type { Side } from "../../spec/body.ts";
import type { BodyView } from "../../body.ts";
import { deepFreeze } from "../../state.ts";
import type { OwnBody } from "../../mind/mind.ts";
import type { GroundReading, Position } from "../../control/ground-reading.ts";
import { mirrorPosture, phaseClock, poseDrive, REACHED_SECONDS, type TechniqueEnd, type TechniqueRun, technique } from "./technique.ts";

/** A leftward turn opens the far shoulder and sweeps the far leg across the body's line. */
const POSES = deepFreeze<readonly Readonly<Record<string, number>>[]>([
  { "shoulder.right flexion": 2.8, "shoulder.left abduction": 1.1, "elbow.left flexion": 1.4,
    "hip.left flexion": .8, "hip.left abduction": .5, "knee.left flexion": 1.5 },
  { "shoulder.right flexion": 2.8, "shoulder.left abduction": 1.8, "lumbar rotation right": -.4,
    "thoracic rotation right": -.4, "hip.left flexion": 1.3, "hip.left abduction": -.1, "knee.left flexion": 1 },
  { "shoulder.right abduction": 1.1, "shoulder.left abduction": 1.1,
    "hip.left flexion": .15, "hip.right flexion": .15, "knee.left flexion": .3, "knee.right flexion": .3 },
]);

/** A front-to-back roll with contact and orientation events; no phase duration proves a turn. */
export function rollBack(own: OwnBody, _view: BodyView): TechniqueRun {
  const drive = poseDrive(own.muscles), clock = phaseClock();
  const trunk = own.spec.segments.flatMap((s, i) => s.name.endsWith("Trunk") ? [i] : []);
  const sides = { right: POSES.map(mirrorPosture), left: POSES };
  const channels = { right: Object.keys(sides.right[0]!).map(name => own.muscles.channel(name)).filter(i => i !== undefined),
    left: Object.keys(sides.left[0]!).map(name => own.muscles.channel(name)).filter(i => i !== undefined) };
  const state = { side: "right" as Side, stage: 0, elapsed: 0, reached: 0, ended: null as TechniqueEnd | null, clock: clock.state, yieldPending: true };
  const reached = (g: GroundReading, to: Position) => to === "back" && g.position === "back" && g.lie === "back"
    && g.height < .5 && trunk.reduce((sum, i) => sum + g.load[i]!, 0) >= .5;
  return {
    state, get phase() { return ["wind", "turn", "flat"][state.stage]!; },
    get yields() { const value = state.yieldPending; state.yieldPending = false; return value || state.ended !== null; },
    admits(g, side) { return (g.lie === "front" || g.lie === side) && g.height < .5 && g.spin < 8 && g.velocity.lengthSquared() < 9; },
    reached,
    begin(side) { state.side = side; state.stage = 0; state.elapsed = 0; state.reached = 0; state.ended = null; state.yieldPending = true; clock.reset(); },
    end() { state.ended = "interrupted"; },
    step(g, _senses, dt) {
      if (state.ended) return state.ended;
      state.elapsed += dt;
      if (state.elapsed > 5) return state.ended = "timed-out";
      state.reached = reached(g, "back") ? state.reached + dt : 0;
      if (state.reached + 1e-9 >= REACHED_SECONDS) return state.ended = "done";
      const pose = sides[state.side][state.stage]!, indices = channels[state.side];
      drive(pose);
      let error = 0;
      for (const i of indices) {
        const c = own.muscles.channels[i]!, dof = c.dof.spec;
        const goal = Math.max(dof.min.value, Math.min(dof.max.value, (pose[c.name] ?? 0) - dof.bind.value));
        error += Math.abs(own.muscles.angle(i) - goal);
      }
      const event = state.stage === 0 ? error / indices.length < .25 : state.stage === 1 && (g.lie === state.side || g.lie === "back");
      const result = clock.step({ inside: g.height < .8 && g.spin < 15, event, deadline: 2 }, dt);
      if (result === "done") { state.stage++; clock.reset(); state.yieldPending = g.lie === "back"; }
      else if (result) state.ended = result;
      return state.ended;
    },
  };
}

/** **Roll onto back** (`rollBack`). */
export const ROLL_BACK = technique("roll-back", { label: "Roll onto back", stage: "experimental", sides: Object.freeze(["right"] as const),
  edges: Object.freeze([Object.freeze({ from: "front" as const, to: "back" as const })]), make: rollBack });
