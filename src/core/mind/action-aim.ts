import type { BodyView } from "../body.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { Region, TargetRef } from "../skills/action.ts";
import type { BodySense } from "./senses.ts";

/** Estimates with unlike units are never ranked against one another. */
interface AimEstimate { readonly unit: "opening" | "net"; readonly value: number }
/** **Where an action aims**: a world point, the way it drives at it where its aim says, and how good the aim is where it says. */
export interface Aimed { readonly at: Vec3; readonly direction?: Vec3; readonly estimate?: AimEstimate }

/** A region expands in the target's anatomical order and never falls back implicitly. */
export function regionSegments(spec: BodySpec, region: Region): readonly string[] {
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
