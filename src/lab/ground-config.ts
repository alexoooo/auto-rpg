import type { FighterConfig } from "../core/mind/config.ts";

/** Supply recovery for a ground scenario's default mind; an explicitly edited tree stays the owner's. */
export function groundMind(chosen: FighterConfig): FighterConfig {
  return chosen.subs.length === 1 && chosen.subs[0]!.kind === "lie"
    ? { ...chosen, subs: [{ kind: "support-recovery" }] } : chosen;
}
