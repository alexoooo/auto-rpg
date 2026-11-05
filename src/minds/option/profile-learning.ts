import { PROFILE_MODEL } from "./profile-contract.ts";
import type { Refused } from "../../core/refusal.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { MindConfig } from "../config.ts";
import type { OptionMindConfig } from "./mind.ts";
import { strikesIn } from "./kinds.ts";

/** The profile fighter's training adapter selects one configured strike and may steer its executor. */
export function profileLearningMind(parts: PartLookup, preset: MindConfig, request: { readonly skill: string; readonly steered?: true }): MindConfig | Refused {
  if (preset.kind !== "option") return { refused: `${preset.kind} is not a profile Option fighter` };
  const config = preset as OptionMindConfig, options = config.options ?? [];
  if (config.predictions && parts.of("predictions", config.predictions).model !== PROFILE_MODEL
    || options.some(option => parts.of("option", option).model !== PROFILE_MODEL))
    return { refused: "the selected mind does not use the profile Option protocol" };
  const strikes = strikesIn(parts, options);
  const selected = strikes.find(option => option.skill.kind === request.skill);
  if (!selected) return { refused: `the preset has no strike by ${request.skill}` };
  const alone = request.steered ? { ...selected, skill: { ...selected.skill, tuning: { steered: true } } } : selected;
  const configured: OptionMindConfig = { ...config, options: options.flatMap(option => option === selected ? [alone] : strikes.some(strike => strike === option) ? [] : [option]) };
  return configured;
}
