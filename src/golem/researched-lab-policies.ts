import entries from "./researched-lab.json" with { type: "json" };
import { labMind, BESPOKE, validateNetwork, type LabPolicy } from "./lab-policy.ts";
import { validateTerminalModel } from "./lab-model.ts";
import { GOLEM_CONTROL_SURFACE } from "../control-surfaces.ts";

export interface PublishedLabPolicy {
  name: string;
  label: string;
  spec: LabPolicy;
  admission: { evaluatedAt: string; reviewedAt: string; evidence: string; scope: string };
}
export function validatePublishedLabPolicy(entry: PublishedLabPolicy): void {
  if (!/^golem-researched-[a-z0-9-]+$/.test(entry.name) || !entry.label || /[<>&"']/.test(entry.label)
    || !entry.admission?.evaluatedAt || !entry.admission.reviewedAt || !entry.admission.evidence || !entry.admission.scope) {
    throw new Error("published lab policy requires an identity and admission evidence");
  }
  switch (entry.spec.kind) {
    case "bespoke": if (!BESPOKE.includes(entry.spec.name)) throw new Error("unknown published bespoke policy"); break;
    case "network": validateNetwork(entry.spec.model); break;
    case "terminal-model": validateTerminalModel(entry.spec.model); break;
    case "mixture": {
      const s = entry.spec;
      if (s.weights.length !== 4 || s.weights.some((r) => r.length !== 8 || r.some((v) => !Number.isFinite(v)))
        || !Number.isFinite(s.seconds) || s.seconds < 0.25 || s.seconds > 8) throw new Error("invalid published mixture");
      break;
    }
    default: throw new Error("unsupported published lab policy kind");
  }
}
export const RESEARCHED_LAB_POLICIES = (entries as PublishedLabPolicy[]).map((entry) => {
  // Validation is pure: factories must not run while the policy registry is initializing.
  validatePublishedLabPolicy(entry);
  const requirement = entry.spec.kind === "bespoke"
    ? entry.spec.name === "paired" ? "independent-hands" as const
      : entry.spec.name === "needle" ? "point-primary" as const : undefined
    : entry.spec.kind === "network" ? entry.spec.model.scope : undefined;
  return { name: entry.name, label: entry.label, surface: GOLEM_CONTROL_SURFACE,
    requirement, evidenceScope: entry.admission.scope,
    create: (seed = (Math.random() * 0x100000000) >>> 0) => ({ ...labMind(entry.spec, seed), name: entry.name }) };
});
