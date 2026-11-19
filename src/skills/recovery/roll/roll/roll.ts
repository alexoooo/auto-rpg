import type { BodyView } from "../../../../control/body.ts";
import type { OwnBody } from "../../../../core/bodies/own-body.ts";
import type { GroundReading, Position } from "../../../../control/ground-reading.ts";
import { phaseClock, poseDrive, postureError, REACHED_SECONDS, trunkOf, type TechniqueEnd, type TechniqueRun } from "../../shared/technique.ts";
import { rollOver } from "../../shared/staged/stages.ts";
import type { Side } from "../../../../core/bodies/bilateral.ts";

/** A side roll, through the staged roll's postures over its side (`rollOver`), ends on loaded front support, preserving its real momentum for the next technique. */
export function rollToFront(own: OwnBody, _view: BodyView): TechniqueRun<Side> {
  const drive = poseDrive(own.muscles), clock = phaseClock();
  const sides = { right: rollOver("right"), left: rollOver("left") };
  const channels = { right: sides.right.map(pose => Object.keys(pose.posture).map(name => own.muscles.channel(name)).filter(i => i !== undefined)),
    left: sides.left.map(pose => Object.keys(pose.posture).map(name => own.muscles.channel(name)).filter(i => i !== undefined)) };
  const trunk = trunkOf(own.spec);
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
    step(g, _senses, control, dt) {
      if (state.ended !== null) return state.ended;
      state.elapsed += dt;
      if (state.elapsed > 5) return finish("timed-out");
      if (g.spin > 15 || g.height > .8) return finish("failed");
      state.reached = reached(g, "front") ? state.reached + dt : 0;
      if (state.reached + 1e-9 >= REACHED_SECONDS) return finish("done");
      const poses = sides[state.side], pose = poses[state.stage]!, indices = channels[state.side][state.stage]!;
      drive(control.muscles, pose.posture);
      const event = state.stage === 0 ? postureError(own.muscles, indices, pose.posture) < .25
        : state.stage === 1 ? g.lie === state.side || g.lie === "front" : state.stage === 2 && g.lie === "front";
      const result = clock.step({ inside: true, event: state.stage < poses.length - 1 && event, deadline: 2 }, dt);
      if (result === "done") { state.stage++; clock.reset(); state.yieldPending = true; }
      else if (result) return finish(result);
      return null;
    },
  };
}
