import type { Body, BodyView } from "../../../control/body.ts";
import { bodyEffectors } from "../../../control/effectors.ts";
import { intoFrameToRef, pointAtToRef } from "../../../control/kinematics.ts";
import { channelName } from "../../../core/bodies/muscle/driver.ts";
import { hypot } from "../../../core/math/real.ts";
import { Vector3 } from "../../../core/math/vector.ts";
import type { Vec3 } from "../../../core/quantity.ts";
import type { Side } from "../../../core/bodies/bilateral.ts";
import { legOf } from "../../locomotion/shared/leg.ts";
import type { StrikingFace } from "./held-face.ts";
import { steerChannels, steerFeatures, type SteerLayout } from "./steer.ts";

/**
 * **A held face's steer as `layout` lays it out**: each hand's channels (`steerChannels`), and for
 * each hand with a face, what its readings are measured from: the shoulder's centre on the trunk
 * chain, and the arm's straight length from it to the face's point (the elbow straight, the
 * reference pose otherwise). `read` writes what a steered blow reads into `out`.
 */
export function faceSteering(body: Body, faces: Partial<Record<Side, StrikingFace>>, layout: SteerLayout) {
  const spec = body.built.spec, effectors = bodyEffectors(body.built), leg = legOf(spec);
  const limbOf = (hand: Side) => {
    const face = faces[hand];
    if (!face) return null;
    const effector = effectors.find((e) => e.segment.spec.name === `hand.${hand}`)!, chain = effector.chain, trunk = effector.free[0]!.joint;
    const point = effector.points.get(face.point);
    if (!point) throw new Error(`${spec.model}'s ${hand} hand has no point ${face.point} to strike with`);
    const angles = chain.map((joint) => joint.dofs.map(() => 0)), shoulder = chain[trunk]!.spec.centre.value, at = new Vector3();
    for (const f of effector.free) if (/^elbow/.test(f.name)) angles[f.joint]![f.k] = f.min;
    pointAtToRef(chain, angles, point, at);
    return { trunkChain: chain.slice(0, trunk), angles: angles.slice(0, trunk), shoulder, point: face.point,
      arm: hypot(at.x - shoulder[0], at.y - shoulder[1], at.z - shoulder[2]) };
  };
  const limbs = { left: limbOf("left"), right: limbOf("right") };
  const channels = { left: steerChannels("left", leg, layout), right: steerChannels("right", leg, layout) };
  const shoulder = new Vector3(), target = new Vector3(), apart = new Vector3(), struck = new Vector3();
  return {
    channels,
    /** What `hand`'s blow `since` s old reads (`steerFeatures`), into `out`: the target `sensed` (world) moving at `aimed`, m/s. */
    read(view: BodyView, hand: Side, since: number, sensed: Vec3, aimed: readonly number[], touching: boolean, out: number[]): void {
      const limb = limbs[hand]!;
      limb.trunkChain.forEach((joint, j) => joint.dofs.forEach((_, k) => { limb.angles[j]![k] = view.angles[channelName(joint, k)] ?? 0; }));
      pointAtToRef(limb.trunkChain, limb.angles, limb.shoulder, shoulder);
      intoFrameToRef(view.root, sensed, target);
      view.effectors[`hand.${hand}`]!.points[limb.point]!.applyRotationQuaternionToRef(view.root.rotation, struck).addInPlace(view.root.position);
      steerFeatures(body, view, hand, channels[hand], since, apart.set(target.x - shoulder.x, target.y - shoulder.y, target.z - shoulder.z), sensed, aimed,
        touching, limb.arm, out, struck);
    },
  };
}
