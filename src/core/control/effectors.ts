import type { BuiltBody } from "../build/build-body.ts";
import { rigidPoints } from "../build/rigid.ts";
import { chainTo } from "./kinematics.ts";
import { deepFreeze } from "../state.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";

/** Detached endpoint capability; coordinates are the body's reference frame, not engine handles. */
export interface EffectorModel {
  readonly segment: string;
  readonly point: string;
  readonly points: Readonly<Record<string, Vec3>>;
  readonly channels: readonly string[];
}

/**
 * The point an effector strikes with: the aim of what it holds (`ItemSpec.aim`), else the point
 * its declaration names.
 */
export function effectorAim(spec: BodySpec, segment: string): string {
  const aim = spec.held?.find((h) => h.segment === segment)?.item.aim ?? spec.effectors?.find((e) => e.segment === segment)?.point;
  if (aim === undefined) throw new Error(`${spec.model} has no effector ${segment}`);
  return aim;
}

/**
 * Compile a body's endpoint declarations (`BodySpec.effectors`), in their declared order. Each owns
 * the freedoms of its chain below its base; two that would share one are refused.
 */
export function bodyEffectors(built: BuiltBody) {
  const seen = new Set<string>(), owned = new Map<string, string>();
  return (built.spec.effectors ?? []).map(description => {
    const segment = built.segments.get(description.segment);
    if (!segment || seen.has(description.segment)) throw new Error("invalid effector segment");
    seen.add(description.segment);
    const chain = chainTo(built, segment), start = chain.findIndex(j => j.parent.spec.name === description.base);
    const points = new Map([...rigidPoints(built.spec, segment.spec)].map(([name, p]) => [name, p.value]));
    if (start < 0 || !points.has(description.point)) throw new Error("effector needs an ancestor base and a physical point");
    const free = chain.flatMap((joint, j) => j < start ? [] : joint.dofs.map((dof, k) => ({ joint: j, k,
      min: dof.spec.min.value, max: dof.spec.max.value, preferred: 0, name: `${joint.spec.name} ${dof.spec.positive}` })));
    for (const f of free) {
      const other = owned.get(f.name);
      if (other) throw new Error(`effectors ${other} and ${description.segment} share ${f.name}`);
      owned.set(f.name, description.segment);
    }
    const model: EffectorModel = deepFreeze({ segment: description.segment, point: description.point,
      points: Object.fromEntries([...points].map(([name, p]) => [name, [...p] as Vec3])), channels: free.map(f => f.name) });
    return { segment, chain, points, free, model };
  });
}
