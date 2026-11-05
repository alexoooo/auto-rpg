import type { BodyView } from "../../control/body.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { Vec3 } from "../../core/bodies/spec/quantity.ts";
import type { Region, TargetRef } from "../framework/action.ts";
import type { BodySense } from "../../core/bodies/senses.ts";

/** Estimates with unlike units are never ranked against one another. */
interface AimEstimate { readonly unit: "opening" | "net"; readonly value: number }
/**
 * **Where an action aims**: a world point, the way it drives at it where its aim says, how good the
 * aim is where it says, and the part of its effector that meets it where the aim chose one (`with`:
 * a jaw's tooth, by its contact region's name).
 */
export interface Aimed { readonly at: Vec3; readonly direction?: Vec3; readonly estimate?: AimEstimate; readonly with?: string }

/** Each spec's regions as expanded (`regionSegments`), by region: a spec is immutable. */
const REGIONS = new WeakMap<BodySpec, Map<string, readonly string[]>>();

/** A region expands in the target's anatomical order and never falls back implicitly: found once a spec and region. */
export function regionSegments(spec: BodySpec, region: Region): readonly string[] {
  let bySpec = REGIONS.get(spec);
  if (!bySpec) REGIONS.set(spec, bySpec = new Map());
  const key = region.kind === "segment" ? `segment ${region.segment}` : `mark ${region.mark}`, known = bySpec.get(key);
  if (known) return known;
  const found = Object.freeze(expanded(spec, region));
  bySpec.set(key, found);
  return found;
}

/** The segments `region` names on `spec`, in its anatomical order (`regionSegments`). */
function expanded(spec: BodySpec, region: Region): readonly string[] {
  let named: readonly string[];
  switch (region.kind) {
    case "segment": named = [region.segment]; break;
    case "mark":
      switch (region.mark) {
        case "high": named = [spec.marks.high]; break;
        case "middle": named = spec.marks.middle; break;
        case "legs": named = spec.marks.legs; break;
        case "any": return spec.segments.map(s => s.name);
        default: { const never: never = region.mark; throw new Error(`unknown mark ${never}`); }
      }
      break;
    default: { const never: never = region; throw new Error(`unknown region ${JSON.stringify(never)}`); }
  }
  return spec.segments.filter(s => named.includes(s.name)).map(s => s.name);
}

/** The same target identity is resolved throughout an instance; absence means loss, never substitution. */
export function sensedActionTarget(view: BodyView, target: TargetRef): BodySense | null {
  return target.body === undefined ? null : view.senses.others.find(other => other.id === target.body && !other.out) ?? null;
}
