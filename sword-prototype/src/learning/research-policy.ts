import { freshIntent } from "../action-primitives.ts";
import type { FighterView, Intent, Mind } from "../mind.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES, composeTactic, handActionOption, movementIntent,
  type CombatOption, type HandActionName, type MovementName } from "../options.ts";
import { FeatureWriter } from "./features.ts";
import { supportedOptions } from "./meta.ts";
import type { DaggerLabel } from "./dagger.ts";

export type ResearchLabeler = (view: FighterView, features: readonly number[]) => DaggerLabel;

/** Shared deployment seam for teacher, DAgger and recurrent NEAT policies. */
export function researchLabelMind(name: string, labeler: ResearchLabeler,
  onDecision?: (view: FighterView, features: readonly number[], label: DaggerLabel) => void): Mind & {
    readonly selectedMovement: MovementName; readonly selectedAction: HandActionName;
  } {
  const writer = new FeatureWriter(); let movement: MovementName = "hold"; let action: HandActionName = "recover";
  let option: CombatOption | null = null; let nextDecision = -Infinity;
  return { name, get selectedMovement() { return movement; }, get selectedAction() { return action; },
    decide(view, dt): Intent {
      const allowed = new Set(supportedOptions(view));
      if (!Object.values(view.self.hands).some((hand) => !hand.lost)) allowed.delete("cover");
      if (!allowed.size) return freshIntent();
      if (!option || option.done(view) || view.clock >= nextDecision || !allowed.has(action)) {
        writer.setTactic(movement, action, view.clock); const features = writer.write(view); const label = labeler(view, features);
        if (!(MOVEMENT_NAMES as readonly string[]).includes(label.movement)) throw new Error(`research policy produced unknown movement "${label.movement}"`);
        if (!(HAND_ACTION_NAMES as readonly string[]).includes(label.action) || !allowed.has(label.action as HandActionName)) {
          throw new Error(`research policy produced unsupported action "${label.action}" for unit "${view.self.unit}"`);
        }
        movement = label.movement as MovementName; action = label.action as HandActionName;
        option = handActionOption(action); option.enter(view); writer.setTactic(movement, action, view.clock);
        nextDecision = view.clock + Math.max(0.10, Math.min(0.80, label.persistence));
        onDecision?.(view, features, label);
      }
      return composeTactic(view, movement, action, movementIntent(movement, view), option.decide(view, dt));
    },
  };
}
