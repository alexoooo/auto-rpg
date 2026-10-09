import { commandable } from "../body.ts";
import { behaviourOf, behavioursTactics } from "./behaviours.ts";
import { standIntent } from "./intent.ts";
import type { BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import { BEHAVIOURS, OPENINGS, SEEK, type BehavioursConfig, type OpeningsConfig, type SeekConfig, type TacticsConfig } from "./config.ts";
import { choice, number, type PartField } from "./fields.ts";
import { validOpeningTuning } from "./openings.ts";
import { STRAFE } from "./ordered.ts";
import type { Orders } from "./orders.ts";
import { slotList, type Part } from "./parts.ts";
import { openingsOf, pathTactics } from "./path-tactics.ts";
import { validRangeLearning } from "./range-learning.ts";
import { recipeTactics, seekFoe } from "./recipe-tactics.ts";
import type { Abilities, Sight, Tactics } from "./tactics.ts";

/** The seeking tactics' settings: how a hand that does not attack guards, what it aims at and how near it comes. */
const SEEK_FIELDS: readonly PartField<SeekConfig>[] = Object.freeze([
  choice<SeekConfig, "guard">("guard", "Guard", [["pose", "Hold the pose"], ["cover", "Cover the threat"]]),
  choice<SeekConfig, "aim">("aim", "Aim", [["head", "The head"], ["body", "The body"], ["pays", "What pays"]]),
  choice<SeekConfig, "range">("range", "Range", [["close", "Walk in"], ["edge", "Hold at the edge"]]),
]);

/**
 * The opening tactics' settings. The spacing's bounds are a numeric setting, the most a panel
 * offers: what a fighter can do with them is `validRangeLearning`'s.
 */
const OPENINGS_FIELDS: readonly PartField<OpeningsConfig>[] = Object.freeze([
  choice<OpeningsConfig, "hands">("hands", "Hands", [["alternate", "Both in turn"], ["right", "Right"], ["left", "Left"]]),
  choice<OpeningsConfig, "strikes">("strikes", "Blows", [["linear", "Straight"], ["mixed", "Straight and hooks"], ["vertical", "With overhands"], ["boxing", "With uppercuts"]]),
  choice<OpeningsConfig, "prefers">("prefers", "Target", [["head", "The head"], ["body", "The body"]]),
  choice<OpeningsConfig, "defence">("defence", "Defence", [["cover", "Cover"], ["predictive", "Predictive cover"]]),
  choice<OpeningsConfig, "combinations">("combinations", "Combinations", [["none", "None"], ["follow-up", "Follow-up"], ["overlap", "Overlap"]]),
  number<OpeningsConfig, "spacing">("spacing", "Spacing", 0, 1, .05, "m"),
  number<OpeningsConfig, "spacingStep">("spacingStep", "Spacing learnt", 0, .2, .01, "m"),
]);

/** What is wrong with seeking tactics of `config`, each a sentence. */
function seekFaults(config: SeekConfig): readonly string[] {
  const edge = config.tuning?.edge;
  return edge && !(Number.isFinite(edge.band) && edge.band >= 0 && Number.isFinite(edge.patience) && edge.patience >= 0)
    ? ["the edge needs a finite nonnegative band and patience"] : [];
}

/** What is wrong with opening tactics of `config`, each a sentence. */
function openingsFaults(config: OpeningsConfig): readonly string[] {
  const faults: string[] = [];
  if (config.combinations !== "none" && config.hands !== "alternate") faults.push("combat combinations require alternate hands");
  if (!validRangeLearning(config.spacing, config.spacingStep)) faults.push("invalid combat range learning settings");
  if (!validOpeningTuning(openingsOf(config) ?? {})) faults.push("opening preferences must be finite and headLateral must be in [0,1]");
  return faults;
}

/** **Every kind of tactics** (`Part`): what a fighter's `tactics` slot may hold. */
export const TACTICS_PARTS: { readonly [K in TacticsConfig["kind"]]: Part<Extract<TacticsConfig, { kind: K }>> } = deepFreeze({
  seek: { role: "tactics", label: "Seek the foe", stage: "game", fields: SEEK_FIELDS, slots: [], defaults: SEEK, fits: commandable, faults: seekFaults },
  openings: { role: "tactics", label: "Choose openings", stage: "experimental", fields: OPENINGS_FIELDS, slots: [], defaults: OPENINGS, fits: commandable, faults: openingsFaults },
  script: { role: "tactics", label: "Follow the script", stage: "game", fields: [], slots: [], defaults: { kind: "script" }, needs: "script", fits: commandable, faults: () => [] },
  stand: { role: "tactics", label: "Stand in guard", stage: "game", fields: [], slots: [], defaults: { kind: "stand" }, fits: commandable, faults: () => [] },
  behaviours: { role: "tactics", label: "Behaviours", stage: "game", fields: [], slots: [slotList("list", "Behaviours", "behaviour")], defaults: BEHAVIOURS.tactics as BehavioursConfig,
    fits: commandable, faults: () => [] },
});

/**
 * **The tactics `config` names**, for a body of `spec`, planning by what its skills can do
 * (`abilities`) and carrying out `orders` when it has them. Seeking tactics left to themselves
 * seek the foe (`seekFoe`); scripted tactics are the screen's `script`, as written; behaviours
 * are each made for the body (`behaviourOf`).
 */
export function tacticsOf(config: TacticsConfig, spec: BodySpec, name: string, abilities: Abilities, orders: (sight: Sight) => Orders | null,
  script?: Tactics): Tactics {
  switch (config.kind) {
    case "seek": return recipeTactics(name, (sight) => orders(sight) ?? seekFoe(sight, config.aim, config.range, config.tuning?.edge), STRAFE, config.guard, config.tuning?.threat);
    case "openings": return pathTactics(spec, name, config, abilities, orders);
    case "script":
      if (!script) throw new Error("tactics of kind \"script\" need the screen's script");
      return script;
    case "stand": return { name: "guard", decide: ({ report }) => standIntent(report.heading) };
    case "behaviours": return behavioursTactics(name, config.list.map((behaviour) => behaviourOf(behaviour, spec, name, abilities, orders)));
    default: { const never: never = config; throw new Error(`no tactics of kind ${JSON.stringify((never as { kind?: unknown }).kind)}`); }
  }
}
