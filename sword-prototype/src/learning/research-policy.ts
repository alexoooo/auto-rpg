import { freshIntent } from "../action-primitives.ts";
import type { FighterView, Intent, Mind } from "../mind.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES, asMeasured, chooseEffector, composeTactic, handActionOption, movementIntent,
  type CombatOption, type HandActionName, type MovementName } from "../options.ts";
import { FeatureWriter } from "./features.ts";
import { MAX_PERSISTENCE, MIN_PERSISTENCE, deployableActions, metaDiagnosticSnapshot, type MetaDiagnostic } from "./meta.ts";
import type { DaggerLabel } from "./dagger.ts";

export type ResearchLabeler = (view: FighterView, features: readonly number[]) => DaggerLabel;

/** Shared deployment seam for teacher, DAgger and recurrent NEAT policies. */
export function researchLabelMind(name: string, labeler: ResearchLabeler,
  onDecision?: (view: FighterView, features: readonly number[], label: DaggerLabel) => void): Mind & {
    readonly selectedMovement: MovementName; readonly selectedAction: HandActionName;
    /** A frozen reading of the last decision. Reading it never runs the policy. */
    diagnostic(): MetaDiagnostic;
  } {
  const writer = new FeatureWriter(); let movement: MovementName = "hold"; let action: HandActionName = "recover";
  let option: CombatOption | null = null; let nextDecision = -Infinity;
  let persistenceSeconds = 0; let observedClock = 0;
  return { name, get selectedMovement() { return movement; }, get selectedAction() { return action; },
    /**
     * The window into a learned controller, and the reason it is here rather
     * than on the network that used to own it: session 17 deleted
     * `networkMetaMind`, which was the sole producer of the `learned-meta` name
     * `main.ts` gated on, and this seam is what every deployed research mind is
     * built through. A research labeler publishes no logits, so the readout is
     * the decision and its live persistence window and nothing invented beside
     * them.
     *
     * **It is not yet the page's window, and an earlier note here claimed it
     * was.** Nothing `main.ts` can construct reaches this function: the page
     * builds minds through `policyMind` and `splitMind` alone, and none of the
     * five `POLICIES` publishes a diagnostic, so the HUD panel is dark and was
     * dark before session 17 as well -- `learnedMetaMind`'s only two callers
     * were headless CLIs. `main.ts`'s gate was wrong on its own terms and was
     * fixed on its own terms. This becomes visible to a person when session 19
     * builds the page-side deployment path, which is the first thing that can
     * put a `researchLabelMind` in a bout somebody is watching.
     */
    diagnostic() { return metaDiagnosticSnapshot(action, movement, action, persistenceSeconds, Math.max(0, nextDecision - observedClock)); },
    decide(view, dt): Intent {
      observedClock = view.clock;
      // The same set `deployment.ts` argmaxes inside, asked for rather than
      // rebuilt: this is the seam that refuses by name, so a private copy here
      // would be the copy that decides what actually runs.
      const allowed = deployableActions(view);
      if (!allowed.size) return freshIntent();
      if (!option || option.done(view) || view.clock >= nextDecision || !allowed.has(action)) {
        writer.setTactic(movement, action, view.clock); const features = writer.write(view); const label = labeler(view, features);
        if (!(MOVEMENT_NAMES as readonly string[]).includes(label.movement)) throw new Error(`research policy produced unknown movement "${label.movement}"`);
        if (!(HAND_ACTION_NAMES as readonly string[]).includes(label.action) || !allowed.has(label.action as HandActionName)) {
          throw new Error(`research policy produced unsupported action "${label.action}" for unit "${view.self.unit}"`);
        }
        movement = label.movement as MovementName; action = label.action as HandActionName;
        // Effector, target and stance are named here rather than defaulted
        // inside the option, and in Stage B they are named as "whatever the
        // hand search would have found, at the aim the record was taken at":
        // a research labeler still produces three fields, not six. The seam is
        // ready for the other three the moment `DaggerLabel` carries them.
        const effector = chooseEffector(view, action);
        if (effector === null) throw new Error(`research policy produced unsupported action "${action}" for unit "${view.self.unit}"`);
        option = handActionOption(action, asMeasured(effector)); option.enter(view); writer.setTactic(movement, action, view.clock);
        persistenceSeconds = Math.max(MIN_PERSISTENCE, Math.min(MAX_PERSISTENCE, label.persistence));
        nextDecision = view.clock + persistenceSeconds;
        onDecision?.(view, features, label);
      }
      return composeTactic(view, movement, action, movementIntent(movement, view), option.decide(view, dt));
    },
  };
}
