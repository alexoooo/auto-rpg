import type { BuiltBody } from "../build/build-body.ts";
import { rigidPoints } from "../build/rigid.ts";
import { chainTo } from "./kinematics.ts";
import { deepFreeze } from "../state.ts";
import type { Vec3 } from "../spec/quantity.ts";

/** Detached endpoint capability; coordinates are the body's reference frame, not engine handles. */
export interface EffectorModel {
  readonly segment: string;
  readonly point: string;
  readonly points: Readonly<Record<string, Vec3>>;
  readonly channels: readonly string[];
}

/** Compile a body's endpoint declarations and retain the legacy hands for undeclared fixtures. */
export function bodyEffectors(built: BuiltBody) {
  const declarations = built.spec.effectors ?? (["left", "right"] as const).filter(side => built.segments.has(`hand.${side}`)).map(side => {
    const segment = built.segments.get(`hand.${side}`)!;
    const chain = chainTo(built, segment);
    return { segment: segment.spec.name, base: chain[Math.max(0, chain.length - 3)]!.parent.spec.name, point: "knuckles" };
  });
  const seen = new Set<string>();
  return declarations.map(description => {
    const segment = built.segments.get(description.segment);
    if (!segment || seen.has(description.segment)) throw new Error("invalid effector segment");
    seen.add(description.segment);
    const chain = chainTo(built, segment), start = chain.findIndex(j => j.parent.spec.name === description.base);
    const points = new Map([...rigidPoints(built.spec, segment.spec)].map(([name, p]) => [name, p.value]));
    if (start < 0 || !points.has(description.point)) throw new Error("effector needs an ancestor base and a physical point");
    const free = chain.flatMap((joint, j) => j < start ? [] : joint.dofs.map((dof, k) => ({ joint: j, k,
      min: dof.spec.min.value, max: dof.spec.max.value, preferred: 0, name: `${joint.spec.name} ${dof.spec.positive}` })));
    const model: EffectorModel = deepFreeze({ segment: description.segment, point: description.point,
      points: Object.fromEntries([...points].map(([name, p]) => [name, [...p] as Vec3])), channels: free.map(f => f.name) });
    return { segment, chain, points, free, model };
  });
}
