import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../build/build-body.ts";
import type { BodyObservation } from "../observation.ts";
import { footStatesOf } from "./support.ts";
import { recoveryReady } from "./recovery-ready.ts";

/** Actual loaded contact patches and uprightness, independent of the recovery policy's requests. */
export function recoveryMeasurement(built: BuiltBody, observe: () => BodyObservation) {
  const feet = footStatesOf(built), root = built.segments.get("lowerTrunk")!;
  const inverseRoot = Quaternion.Inverse(root.rest), turn = new Quaternion(), up = new Vector3();
  const footUps = feet.map(f => Vector3.UpReadOnly.applyRotationQuaternionToRef(Quaternion.Inverse(f.segment.rest),new Vector3()));
  // Quiet, upright two-foot support is the recovery-to-host acceptance condition.
  const settings = { slow: .1, minUpNormal: .9 };
  return () => {
    const observation = observe();
    root.node.rotationQuaternion!.multiplyToRef(inverseRoot,turn);
    up.set(0,1,0).applyRotationQuaternionToRef(turn,up);
    const rootUp = up.y;
    const soleUp = feet.map((f,i) => {
      up.copyFrom(footUps[i]!).applyRotationQuaternionToRef(f.segment.node.rotationQuaternion!,up); return up.y;
    });
    const supports = feet.map(f => ({segment:f.segment.spec.name,
      corners:observation.contacts.filter(c => c.segment === f.segment.spec.name && c.fixed !== null
        && c.impulse > 0 && Math.abs(c.normal[1]) >= settings.minUpNormal)
        .flatMap(c => (c.patch ?? []).filter(p => p.distance <= 0 && Math.abs(p.normal[1]) >= settings.minUpNormal).map(p => p.point))}));
    const ready = rootUp >= .9 && soleUp.every(v => v >= .9) && recoveryReady(observation,supports,settings);
    return {observation,rootUp,soleUp,ready};
  };
}
