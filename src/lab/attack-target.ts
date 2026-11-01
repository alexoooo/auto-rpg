import { armedActions } from "../core/tactics/action-config.ts";
import { regionSegments } from "../core/intent/action-aim.ts";
import { partLookup } from "../entrants/game.ts";
import type { SkillKit } from "../core/skills/config.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { dummyPart, dummyParts, dummySpec } from "./dummy-spec.ts";
import type { MindConfig } from "../core/mind/config.ts";

/** Anatomical compatibility only: readiness, reach and the planner's choices remain runtime decisions. */
export function attackTargetWarnings(spec: BodySpec, kit: StrikeKit, requested: string): readonly string[] {
  const part = dummyPart(spec, requested), target = dummySpec(spec, part);
  const actions = armedActions(partLookup, spec, kit.executors, kit.actions);
  if (!actions.length) return ["No actions are available. Change the loadout."];
  return actions.filter(action => action.regions && !action.regions.some(region => regionSegments(target, region).length > 0))
    .map(action => `${action.name}: no target region matches ${part}. Choose another target part or edit its target regions.`);
}

/** What of a mind's skills strikes: its executors and its actions. */
type StrikeKit = Pick<SkillKit, "executors" | "actions">;

/** `mind`'s strikes, where its config carries its executors and actions, as a fighter's and the Option Mind's do; null where it does not. */
export function strikeKit(mind: MindConfig): StrikeKit | null {
  const { executors, actions } = mind as Partial<SkillKit>;
  return Array.isArray(executors) && Array.isArray(actions) ? { executors, actions } : null;
}

/**
 * **The part the Attack field's targets are made of for `mind`**, where the address names none: of
 * the body's high part and then each part a ball is made of (`dummyParts`), the first that the most
 * of its actions can aim at (`regionSegments`); the high part where it names no strikes.
 */
export function attackTargetPart(spec: BodySpec, mind: MindConfig): string {
  const kit = strikeKit(mind), parts = dummyParts(spec);
  if (!kit || parts.length === 0) return spec.marks.high;
  const actions = armedActions(partLookup, spec, kit.executors, kit.actions);
  let chosen = spec.marks.high, most = -1;
  for (const part of [spec.marks.high, ...parts]) {
    if (!parts.includes(part)) continue;
    const target = dummySpec(spec, part), aimed = actions.filter(action => !action.regions || action.regions.some(region => regionSegments(target, region).length > 0)).length;
    if (aimed > most) { chosen = part; most = aimed; }
  }
  return chosen;
}
