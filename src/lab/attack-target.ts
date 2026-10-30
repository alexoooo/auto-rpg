import { armedActions } from "../core/mind/action-config.ts";
import { regionSegments } from "../core/mind/action-aim.ts";
import { partLookup } from "../entrants/game.ts";
import type { SkillKit } from "../core/mind/config.ts";
import { heldIn } from "../core/skills/strikes.ts";
import type { BodySpec } from "../core/spec/body.ts";
import type { Held } from "../core/items/held.ts";
import { dummyPart, dummySpec } from "./dummy-spec.ts";
import { allowing, strikeAllowed } from "./loadout.ts";

/** Anatomical compatibility only: readiness, reach and the planner's choices remain runtime decisions. */
export function attackTargetWarnings(spec: BodySpec, kit: SkillKit, requested: string, barred: readonly Held[]): readonly string[] {
  const part = dummyPart(spec, requested), target = dummySpec(spec, part), allows = allowing(barred);
  const strikes = { left: allows(heldIn(spec, "left")), right: allows(heldIn(spec, "right")) };
  const actions = armedActions(partLookup, spec, kit.executors, kit.actions)
    .filter(action => action.effectors.some(effector => strikeAllowed(effector, strikes)));
  if (!actions.length) return ["No actions are available with the permitted effectors. Enable a strike or change the loadout."];
  return actions.filter(action => action.regions && !action.regions.some(region => regionSegments(target, region).length > 0))
    .map(action => `${action.name}: no target region matches ${part}. Choose another target part or edit its target regions.`);
}
