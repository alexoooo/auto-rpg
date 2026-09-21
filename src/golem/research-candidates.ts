import type { Mind } from "../mind.ts";
import { FORM, golemForm } from "./styles/form.ts";
import { GUARDIAN, golemGuardian } from "./styles/guardian.ts";
import { SKIRMISHER, golemSkirmisher } from "./styles/skirmisher.ts";

export const SEARCH_FIELDS = ["standOffFraction", "patience", "strikeBite", "recoverSeconds", "closeGain", "turnGain"] as const;
export type SearchField = typeof SEARCH_FIELDS[number];
export type CandidateParent = "golem-form" | "golem-guardian" | "golem-skirmisher";
export interface ResearchCandidate {
  name: string;
  label: string;
  parent: CandidateParent;
  parameters: Record<SearchField, number>;
}
export const SEARCH_PARENTS = { "golem-form": FORM, "golem-guardian": GUARDIAN, "golem-skirmisher": SKIRMISHER };

/** Research only changes six policy parameters, never executor or motor constants. */
export function candidateBounds(parent: CandidateParent, field: SearchField): readonly [number, number] {
  const value = SEARCH_PARENTS[parent][field];
  return [value * 0.75, field === "strikeBite" ? Math.min(1, value * 1.25) : value * 1.25];
}
export function validateCandidate(candidate: ResearchCandidate): void {
  if (!Object.hasOwn(SEARCH_PARENTS, candidate.parent) || !/^golem-researched-[a-z0-9-]+$/.test(candidate.name)
    || !candidate.label || /[<>&"']/.test(candidate.label)) throw new Error("invalid research candidate identity");
  if (Object.keys(candidate.parameters).sort().join() !== [...SEARCH_FIELDS].sort().join()) {
    throw new Error("candidate must supply exactly the six search parameters");
  }
  for (const field of SEARCH_FIELDS) {
    const value = candidate.parameters[field];
    const [low, high] = candidateBounds(candidate.parent, field);
    if (!Number.isFinite(value) || value < low || value > high) throw new Error(`invalid candidate ${field}`);
  }
}
export function candidateMind(candidate: ResearchCandidate, seed: number): Mind {
  validateCandidate(candidate);
  const parameters = candidate.parameters;
  const body = candidate.parent === "golem-form" ? golemForm(seed, { ...FORM, ...parameters })
    : candidate.parent === "golem-guardian" ? golemGuardian(seed, { ...GUARDIAN, ...parameters })
    : golemSkirmisher(seed, { ...SKIRMISHER, ...parameters });
  return { name: candidate.name, decide: (view, dt) => body.decide(view, dt) };
}
