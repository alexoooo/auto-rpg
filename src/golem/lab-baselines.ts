/** Frozen original-policy pool. It deliberately excludes learned policies, preventing recursive
 * mixtures and keeping deployed research factories independent of registry initialization. */
import type { Mind } from "../mind.ts";
import { golemBrawlerMind, golemChampionMind, golemDriverMind, golemDuelistMind, golemFencerMind,
  golemFormMind, golemGuardianMind, golemMiserMind, golemPlannerMind, golemReaperMind,
  golemSkirmisherMind, golemTacticianMind } from "./golem-policies.ts";
import { humanoidDuelist } from "./humanoid/policy.ts";
import { blankIntent, postureFor } from "../policies.ts";

export const LAB_BASELINES: Record<string, (seed: number) => Mind> = {
  "golem-duelist": golemDuelistMind, "golem-fencer": golemFencerMind,
  "golem-planner": golemPlannerMind, "golem-champion": golemChampionMind,
  "golem-form": golemFormMind, "golem-guardian": golemGuardianMind,
  "golem-brawler": golemBrawlerMind, "golem-skirmisher": golemSkirmisherMind,
  "golem-tactician": golemTacticianMind, "golem-driver": golemDriverMind,
  "golem-reaper": golemReaperMind, "golem-miser": golemMiserMind,
  // Hand-written like the rest; the only baseline built for a human body, so the lab can field one.
  "humanoid-duelist": humanoidDuelist,
};
export function originalMind(name: string, seed: number): Mind {
  if (name === "idle") { const intent = blankIntent(); return { name: "idle", decide: (view) => postureFor(view, "idle", intent) }; }
  const factory = LAB_BASELINES[name];
  if (!factory) throw new Error(`not an original lab baseline: ${name}`);
  return factory(seed);
}
