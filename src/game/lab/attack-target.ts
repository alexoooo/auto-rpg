import { regionSegments } from "../../skills/intent/action-aim.ts";
import { skillsOf } from "../../minds/option/kinds.ts";
import type { PartConfig } from "../../parts/parts.ts";
import type { GameContext } from "../arena/context.ts";
import type { ActionConfig } from "../../skills/config.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { dummyPart, dummyParts, dummySpec } from "./dummy-spec.ts";
import type { MindConfig } from "../../minds/config.ts";

/** What `mind`'s Options ask of its strikes on a body of `spec` (`skillsOf`), where its config names Options; null where it names none. */
export function strikeActions(context: GameContext, spec: BodySpec, mind: MindConfig): readonly ActionConfig[] | null {
  const { options } = mind as { readonly options?: readonly PartConfig[] | null };
  return Array.isArray(options) ? skillsOf(context.catalog.partLookup, spec, options).actions : null;
}

/** Anatomical compatibility only: readiness, reach and the planner's choices remain runtime decisions. */
export function attackTargetWarnings(spec: BodySpec, actions: readonly ActionConfig[], requested: string): readonly string[] {
  const part = dummyPart(spec, requested), target = dummySpec(spec, part);
  if (!actions.length) return ["No actions are available. Change the loadout."];
  return actions.filter(action => action.regions && !action.regions.some(region => regionSegments(target, region).length > 0))
    .map(action => `${action.name}: no target region matches ${part}. Choose another target part or edit its target regions.`);
}

/**
 * **The part the Attack field's targets are made of for `mind`**, where the address names none: of
 * the body's high part and then each part a ball is made of (`dummyParts`), the first that the most
 * of its actions can aim at (`regionSegments`); the high part where it names no strikes.
 */
export function attackTargetPart(context: GameContext, spec: BodySpec, mind: MindConfig): string {
  const actions = strikeActions(context, spec, mind), parts = dummyParts(spec);
  if (!actions || parts.length === 0) return spec.marks.high;
  let chosen = spec.marks.high, most = -1;
  for (const part of [spec.marks.high, ...parts]) {
    if (!parts.includes(part)) continue;
    const target = dummySpec(spec, part), aimed = actions.filter(action => !action.regions || action.regions.some(region => regionSegments(target, region).length > 0)).length;
    if (aimed > most) { chosen = part; most = aimed; }
  }
  return chosen;
}
