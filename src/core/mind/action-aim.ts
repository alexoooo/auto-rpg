import type { BodyView } from "../body.ts";
import type { BodySpec, Side } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { Ended, Region, TargetRef } from "../skills/action.ts";
import type { AttackTuning } from "../skills/attack-path.ts";
import type { BlowFamily } from "./intent.ts";
import { capsuleSurfaceAtHeight, openingSelector, type OpeningTuning } from "./openings.ts";
import type { BodySense } from "./senses.ts";

/** An action owns its aiming rule; execution decides when to read it again. */
export type AimRule = { readonly kind: "centre"; readonly lead: number }
  | { readonly kind: "surface"; readonly tuning: OpeningTuning }
  | { readonly kind: "leg-height"; readonly height: number };

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

/** A compiled aiming rule shares surface geometry with the opening reader. */
export function actionAim(spec: BodySpec, rule: AimRule, family: BlowFamily = "straight", paths?: AttackTuning) {
  const surface = rule.kind === "surface" ? openingSelector(spec, rule.tuning, paths) : null;
  return (view: BodyView, target: TargetRef, effector: string, ledger: readonly Ended[] = []): Aimed | null => {
    if (target.kind === "point") return { at: target.at, ...(target.direction ? { direction: target.direction } : {}) };
    const foe = sensedActionTarget(view, target);
    if (!foe) return null;
    const names = regionSegments(foe.spec, target.region);
    if (!names.length) return null;
    switch (rule.kind) {
      case "centre": {
        if (!Number.isFinite(rule.lead) || rule.lead < 0) throw new Error("invalid aim prediction");
        let chosen: Vec3 | null = null, best = Infinity;
        for (const name of names) {
          const segment = foe.segments.get(name);
          if (!segment) continue;
          const seconds = rule.lead + Math.max(0, view.time - (foe.time ?? view.time));
          const at: Vec3 = [segment.centre.x + segment.velocity.x * seconds, segment.centre.y + segment.velocity.y * seconds, segment.centre.z + segment.velocity.z * seconds];
          const dx = at[0] - view.stance.centre.x, dy = at[1] - view.stance.centre.y, dz = at[2] - view.stance.centre.z, squared = dx * dx + dy * dy + dz * dz;
          if (squared < best) { chosen = at; best = squared; }
        }
        return chosen ? { at: chosen } : null;
      }
      case "surface": {
        if (effector !== "hand.left" && effector !== "hand.right") return null;
        const side = effector.slice(5) as Side;
        const blocked = ledger.filter(record => record.target.body === foe.id).flatMap(record => record.contacts.blockedSegments);
        const found = surface!(view, foe, side, null, "mixed", { family, segments: names, blocked });
        return found ? { at: found.target, ...(found.direction ? { direction: found.direction } : {}), estimate: { unit: "opening", value: -found.score } } : null;
      }
      case "leg-height": {
        if (!Number.isFinite(rule.height)) throw new Error("invalid leg aim height");
        const from: Vec3 = [view.stance.centre.x, view.stance.centre.y, view.stance.centre.z];
        let chosen: Vec3 | null = null, best = Infinity;
        for (const name of names) {
          const at = capsuleSurfaceAtHeight(foe, name, from, rule.height);
          if (!at) continue;
          const dx = at[0] - from[0], dz = at[2] - from[2], squared = dx * dx + dz * dz;
          if (squared < best) { chosen = at; best = squared; }
        }
        return chosen ? { at: chosen } : null;
      }
      default: { const never: never = rule; throw new Error(`unknown aim ${JSON.stringify(never)}`); }
    }
  };
}
