import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyObservation } from "../observation.ts";

interface Model {
  readonly rest: readonly [number, number, number, number];
  readonly standing: number;
  readonly channels: readonly { readonly min: number; readonly max: number }[];
  readonly balance: number;
  readonly strength: number;
}

/** Body-local actor inputs and previous actions for recovery training. */
export function recoveryFeatures(model: Model) {
  const restInverse = Quaternion.Inverse(new Quaternion(...model.rest));
  const q = new Quaternion(), inverse = new Quaternion(), turn = new Quaternion(), v = new Vector3();
  const extremities = ["head","hand.left","hand.right","foot.left","foot.right"];
  const contacts = [...extremities,"shank.left","shank.right","lowerTrunk","upperTrunk"];
  return (measurement: { readonly observation: BodyObservation; readonly rootUp: number; readonly soleUp: readonly number[] },
    previous: readonly number[]): number[] => {
    const o = measurement.observation, r = o.segments.find(s => s.name === "lowerTrunk")!;
    q.set(...r.rotation).multiplyToRef(restInverse,turn); Quaternion.InverseToRef(turn,inverse);
    const local = (a: readonly number[]) => {
      v.set(a[0]!,a[1]!,a[2]!).applyRotationQuaternionToRef(inverse,v); return [v.x,v.y,v.z];
    };
    const features = [o.height/model.standing,measurement.rootUp,...measurement.soleUp,...local([0,1,0]),
      ...local(r.velocity).map(x => x/3),...local(r.spin).map(x => x/10)];
    o.joints.forEach((j,i) => features.push(2*(j.angle-model.channels[i]!.min)/(model.channels[i]!.max-model.channels[i]!.min)-1,j.rate/10));
    for (const name of extremities) {
      const part = o.segments.find(s => s.name === name)!;
      features.push(...local(part.centre.map((x,k) => (x-r.centre[k]!)/model.standing)));
    }
    for (const name of contacts) features.push(o.contacts.some(c => c.segment === name && c.fixed !== null && c.impulse > 0) ? 1 : 0);
    features.push(...previous,model.balance/100,model.strength,1);
    if (!features.every(Number.isFinite)) throw new Error("nonfinite recovery observation");
    return features;
  };
}
