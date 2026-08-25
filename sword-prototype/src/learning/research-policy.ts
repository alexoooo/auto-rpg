import { freshIntent } from "../action-primitives.ts";
import type { FighterView, Intent, Mind } from "../mind.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES, composeTactic, handActionOption, movementIntent,
  type CombatOption, type EffectorName, type HandActionName, type MovementName, type StanceName,
  type TacticAim } from "../options.ts";
import { FeatureWriter } from "./features.ts";
import { MAX_PERSISTENCE, MIN_PERSISTENCE, deployableActions, metaDiagnosticSnapshot,
  type MetaDiagnostic } from "./meta.ts";
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
        // **The whole tuple, executed or refused -- and there is deliberately no
        // second copy of the legality rule here.** Stage B named the other three
        // fields at this line as "whatever the hand search would have found, at
        // the aim the record was taken at" -- `asMeasured(chooseEffector(...))`.
        // A labeler produces six fields now, and `chooseEffector` searching
        // `[preferred, other]` under a label that already named a hand would be
        // exactly the silent redirection tactic v2 exists to remove.
        //
        // The action check above stays because `deployableActions` is *stricter*
        // than the executor -- it refuses `cover` on a handless body and refuses
        // everything on a body with no capability at all -- so there is something
        // it says that nothing below repeats. The tuple check is not like that:
        // `handActionOption` refuses an unknown effector, target or stance at
        // construction and an illegal `(action, effector, target)` at `enter`,
        // through `unsupportedTactic`, which is the same `tacticEffectors` and
        // `AIMED_TARGETS` that `deployableTactics` is built from. A pre-check
        // here would be that rule spelled twice, with the two copies free to
        // drift -- which is what `deployableActions`' own note records happening
        // seven times. It also refuses more usefully: `a punch target of vital,
        // high, not "low"` names the part that was wrong.
        //
        // `TacticAim` rather than `TargetName`: `"as-measured"` is deliberately
        // outside `TARGET_NAMES`, so no learned output can name it and
        // `deployableTactics` has no row for it, while a *scripted* labeler may
        // still ask for the opponent's own shoulder line. The readers are
        // `probeLabel` in `tests/fixtures/label.mjs`, `randomMetaMind` and
        // `scriptedMetaMind`, all through `asMeasured`.
        //
        // **This said the aim was widened for look-ahead's sake and that
        // `collectTacticalTrace` names `"as-measured"` explicitly, and stage C2c
        // made both false.** The look-ahead model is keyed on the effector and the
        // aim now, so the schedule enumerates the aim and `"as-measured"` has left
        // that path entirely -- the trace is taken at the aim the planner will
        // name. The type stays for the scripted readers above; the reason it was
        // written down for does not.
        option = handActionOption(action, { effector: label.effector as EffectorName,
          target: label.target as TacticAim, stance: label.stance as StanceName });
        option.enter(view); writer.setTactic(movement, action, view.clock);
        persistenceSeconds = Math.max(MIN_PERSISTENCE, Math.min(MAX_PERSISTENCE, label.persistence));
        nextDecision = view.clock + persistenceSeconds;
        onDecision?.(view, features, label);
      }
      return composeTactic(view, movement, action, movementIntent(movement, view), option.decide(view, dt));
    },
  };
}
