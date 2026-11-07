import type { PhysicalBody } from "../../minds/seat/physical-body.ts";
import type { SkillReport } from "../../skills/framework/skills.ts";
import type { MindReport } from "../../minds/report.ts";

/**
 * A mind's public ownership and execution facts, with no executor-specific state: what holds the
 * body (its skills' report), and what the mind reports doing (`MindReport`). Plain data where a
 * worker sends it.
 */
export interface Inspected {
  readonly body: Pick<PhysicalBody, "has" | "level">;
  readonly skills?: { readonly report: Partial<Pick<SkillReport, "holders" | "defaultOwners" | "actions">> } | null;
  readonly report?: Pick<MindReport, "engagement" | "actions" | "ended"> | null;
}
