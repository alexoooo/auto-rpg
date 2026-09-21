import variants from "./researched-variants.json" with { type: "json" };
import { candidateMind, validateCandidate, type ResearchCandidate } from "./research-candidates.ts";
import { GOLEM_CONTROL_SURFACE } from "../control-surfaces.ts";
import { RESEARCHED_LAB_POLICIES } from "./researched-lab-policies.ts";

/** Only independently confirmed, visually reviewed candidates are published here. */
export const RESEARCHED_POLICIES = [...(variants as ResearchCandidate[]).map((candidate) => {
  validateCandidate(candidate);
  return { name: candidate.name, label: candidate.label, surface: GOLEM_CONTROL_SURFACE,
    create: (seed = (Math.random() * 0x100000000) >>> 0) => candidateMind(candidate, seed) };
}), ...RESEARCHED_LAB_POLICIES];
if (new Set(RESEARCHED_POLICIES.map((p) => p.name)).size !== RESEARCHED_POLICIES.length) {
  throw new Error("duplicate researched policy");
}
