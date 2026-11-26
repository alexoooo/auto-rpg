import type { Refused } from "../../../core/refusal.ts";
import type { PartLookup } from "../../../parts/lookup.ts";
import type { MindConfig } from "../../catalog/config.ts";
import { optionsOf, type OptionMindConfig } from "./config.ts";
import { strikesIn, type StrikeConfig } from "../options/strike-kinds.ts";

/** An Option Mind's training adapter: `preset` with one configured strike, by `request.skill`, its executor steered where asked. */
export function profileLearningMind(parts: PartLookup, preset: MindConfig, request: { readonly skill: string; readonly steered?: true }): MindConfig | Refused {
  if (preset.kind !== "option") return { refused: `${preset.kind} is not an Option Mind` };
  const config = preset as OptionMindConfig, options = optionsOf(config, parts);
  const strikes = strikesIn(parts, options);
  const selected = strikes.find(option => option.skill.kind === request.skill);
  if (!selected) return { refused: `the preset has no strike by ${request.skill}` };
  // Steering is a research tuning of the executors that take it (`Part.tuning`); on another it is a fault of the tree.
  const alone = request.steered ? { ...selected, skill: { ...selected.skill, tuning: { steered: true } } } as StrikeConfig : selected;
  const configured: OptionMindConfig = { ...config, options: options.flatMap(option => option === selected ? [alone] : strikes.some(strike => strike === option) ? [] : [option]) };
  return configured;
}
