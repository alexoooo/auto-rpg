import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../../core/body.ts";
import { lowsOf } from "../../core/control/ground.ts";
import { chainTo, pointAtToRef } from "../../core/control/kinematics.ts";
import type { OwnBody } from "../../core/mind/mind.ts";
import { channelName } from "../../core/muscle/driver.ts";
import type { Side } from "../../core/spec/body.ts";

/** Find knee flexion that brings the foot's lowest shape to the measured floor, within its limits. */
export function footLanding(own: OwnBody) {
  const m = own.muscles, point = new Vector3();
  const state = { depth: new Float64Array(2) };
  const feet = (["left", "right"] as const).map(side => {
    const segment = own.built.segments.get(`foot.${side}`)!, chain = chainTo(own.built, segment);
    const indices = chain.map(j => j.dofs.map((_, k) => m.channel(channelName(j, k))));
    const angles = chain.map(j => j.dofs.map(() => 0)), knee = chain.findIndex(j => j.spec.name === `knee.${side}`);
    return { side, segment, chain, indices, angles, knee, channel: indices[knee]![0]!,
      fixed: segment.rigid.shapes.flatMap(shape => shape.kind === "hull" ? [] : lowsOf(shape, segment.frame)) };
  });
  const step = (view: BodyView, side: Side, goals: Float64Array, dt: number): number => {
    const g = view.ground;
    if (!g) return Infinity;
    const index = side === "left" ? 0 : 1, foot = feet[index]!;
    // Position feedback's loaded equilibrium needs a preload; measured load bounds its depth.
    state.depth[index] = Math.max(0, Math.min(view.standing * .06, state.depth[index]! + dt * view.standing * .1 * (.2 - g.footLoad[index]!)));
    const level = g.centre.y - g.height * view.standing - state.depth[index]!;
    for (let j = 0; j < foot.chain.length; j++) for (let k = 0; k < foot.indices[j]!.length; k++) foot.angles[j]![k] = m.angle(foot.indices[j]![k]!);
    const height = (knee: number): number => {
      foot.angles[foot.knee]![0] = knee;
      let lowest = Infinity;
      for (const low of foot.fixed) {
        pointAtToRef(foot.chain, foot.angles, low.at, point);
        point.applyRotationQuaternionToRef(view.root.rotation, point).addInPlace(view.root.position);
        lowest = Math.min(lowest, point.y - low.radius);
      }
      // Toe hulls change with their bend; only the foot's fixed shapes may be cached.
      for (const shape of foot.segment.rigid.shapes) if (shape.kind === "hull") for (const corner of shape.points) {
        pointAtToRef(foot.chain, foot.angles, corner.value, point);
        point.applyRotationQuaternionToRef(view.root.rotation, point).addInPlace(view.root.position);
        lowest = Math.min(lowest, point.y);
      }
      return lowest - level;
    };
    const actual = height(m.angle(foot.channel)) - state.depth[index]!;
    const d = m.channels[foot.channel]!.dof.spec, start = d.max.value;
    let previous = start, above = height(start);
    // Search from the folded knee toward extension, choosing the first floor crossing.
    for (let sample = 1; sample <= 16; sample++) {
      const next = start + (d.min.value - start) * sample / 16, below = height(next);
      if (above * below <= 0) {
        let lo = Math.min(previous, next), hi = Math.max(previous, next), atLo = height(lo);
        for (let pass = 0; pass < 12; pass++) {
          const middle = (lo + hi) / 2, atMiddle = height(middle);
          if (atLo * atMiddle <= 0) hi = middle; else { lo = middle; atLo = atMiddle; }
        }
        goals[foot.channel] = (lo + hi) / 2;
        return actual;
      }
      previous = next; above = below;
    }
    return actual;
  };
  return { state, reset() { state.depth.fill(0); }, step };
}
