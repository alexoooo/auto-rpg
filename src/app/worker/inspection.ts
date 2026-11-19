import type { PhysicalBody } from "../../minds/seat/physical-body.ts";
import type { SkillReport } from "../../skills/framework/skills.ts";
import type { MindReport } from "../../minds/report.ts";
import type { Combatant } from "../../game/combatant.ts";

/**
 * A mind's public ownership and execution facts, with no executor-specific state: what holds the
 * body (its skills' report), and what the mind reports doing (`MindReport`). Plain data where a
 * worker sends it.
 */
export interface Inspected {
  readonly body: Pick<PhysicalBody, "has" | "level">;
  readonly skills: { readonly report: Pick<SkillReport, "holders" | "defaultOwners" | "actions"> } | null;
  readonly report: Pick<MindReport, "engagement" | "actions" | "ended"> | null;
}

/** **What an inspector is shown of `fighter`'s mind** as it stands (`Inspected`). */
export function inspectedOf({ body, minded }: Pick<Combatant, "body" | "minded">): Inspected {
  const { skills } = minded, report = minded.report ?? null;
  return { body: { has: body.has, level: body.level },
    skills: skills ? { report: { holders: skills.report.holders, defaultOwners: skills.report.defaultOwners, actions: skills.report.actions } } : null,
    report: report ? { engagement: report.engagement, actions: report.actions, ended: report.ended } : null };
}
