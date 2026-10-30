import type { Side } from "../../spec/body.ts";
import type { BodyView } from "../../body.ts";
import type { OwnBody } from "../../mind/mind.ts";
import { RISE } from "../rise/stages.ts";
import type { GroundReading, Position } from "./reading.ts";
import { mirrorPosture, phaseClock, poseDrive, REACHED_SECONDS, type TechniqueEnd, type TechniqueRun, technique } from "./technique.ts";

/** A side roll ends on loaded front support, preserving its real momentum for the next technique. */
export function rollToFront(own: OwnBody, _view: BodyView): TechniqueRun {
  const drive = poseDrive(own.muscles), clock = phaseClock();
  const sides = { right: RISE.roll.back, left: RISE.roll.back.map(pose => ({ ...pose, posture: mirrorPosture(pose.posture) })) };
  const channels = { right: sides.right.map(pose => Object.keys(pose.posture).map(name => own.muscles.channel(name)).filter(i => i !== undefined)),
    left: sides.left.map(pose => Object.keys(pose.posture).map(name => own.muscles.channel(name)).filter(i => i !== undefined)) };
  const trunk = own.spec.segments.flatMap((segment, i) => segment.name.endsWith("Trunk") ? [i] : []);
  const state = { side: "right" as Side, stage: 0, elapsed: 0, ended: null as TechniqueEnd | null, reached: 0, clock: clock.state, yieldPending: true };
  const reached = (g: GroundReading, to: Position) => to === "front" && g.position === "front" && g.lie === "front"
    && g.height < .5 && trunk.reduce((sum, i) => sum + g.load[i]!, 0) >= .5;
  const finish = (end: TechniqueEnd) => { state.ended = end; return end; };
  return {
    state, get phase() { return sides[state.side][state.stage]!.name; },
    get yields() { const pending = state.yieldPending; state.yieldPending = false; return pending || state.ended !== null; },
    admits(g, side) { return g.height < .5 && g.spin < 8 && g.velocity.lengthSquared() < 9 && (g.lie === "back" || g.lie === side); },
    reached,
    begin(side) { state.side = side; state.stage = 0; state.elapsed = 0; state.reached = 0; state.ended = null; state.yieldPending = true; clock.reset(); },
    end() { finish("interrupted"); },
    step(g, _senses, dt) {
      if (state.ended !== null) return state.ended;
      state.elapsed += dt;
      if (state.elapsed > 5) return finish("timed-out");
      if (g.spin > 15 || g.height > .8) return finish("failed");
      state.reached = reached(g, "front") ? state.reached + dt : 0;
      if (state.reached + 1e-9 >= REACHED_SECONDS) return finish("done");
      const poses = sides[state.side], pose = poses[state.stage]!, indices = channels[state.side][state.stage]!;
      drive(pose.posture, .2, 3);
      let error = 0;
      for (const i of indices) {
        const c = own.muscles.channels[i]!, target = Math.max(c.dof.spec.min.value, Math.min(c.dof.spec.max.value, (pose.posture[c.name] ?? 0) - c.dof.spec.bind.value));
        error += Math.abs(target - own.muscles.angle(i));
      }
      const event = state.stage === 0 ? indices.length > 0 && error / indices.length < .25
        : state.stage === 1 ? g.lie === state.side || g.lie === "front" : state.stage === 2 && g.lie === "front";
      const result = clock.step({ inside: true, event: state.stage < poses.length - 1 && event, deadline: 2 }, dt);
      if (result === "done") { state.stage++; clock.reset(); state.yieldPending = true; }
      else if (result) return finish(result);
      return null;
    },
  };
}

/** **Roll onto front** (`rollToFront`). */
export const ROLL = technique("roll", { label: "Roll onto front", stage: "experimental", sides: Object.freeze(["right"] as const),
  edges: Object.freeze((["back", "right"] as const).map(from => Object.freeze({ from, to: "front" as const }))), make: rollToFront });
