import type { Skills } from "../skills/framework/skills.ts";
import type { ActionStatus, Ended } from "../skills/framework/action.ts";
import type { KitEntry, MenuEntry } from "../skills/framework/menu.ts";
import type { NavigationReport } from "../navigation/navigator.ts";
import type { GaitLimits } from "../intent/travel.ts";
import type { Engagement } from "./engagement.ts";

/**
 * **What a mind publishes of itself** (`MindMade.report`), for a screen and its Commander, never
 * for the rules: what it reports doing (`Engagement`), and where it walks, its heading, its gait's
 * limits (`GaitLimits`) and its navigation's report; the actions its body has (`KitEntry`), those
 * under way and those ended, and its choices now (`MenuEntry`), read when asked and changing
 * nothing; null for what it does not say. A mind that runs the game's skills publishes theirs and
 * its decider's (`skillsReport`); any other may publish its own.
 */
export interface MindReport {
  readonly engagement: Engagement | null;
  readonly heading: number | null;
  readonly gait: GaitLimits | null;
  readonly navigation: NavigationReport | null;
  readonly kit: readonly KitEntry[] | null;
  readonly actions: readonly ActionStatus[] | null;
  readonly ended: readonly Ended[] | null;
  readonly menu: readonly MenuEntry[] | null;
}

/** What a mind says of itself, live (`MindReport`): what its `decider` reports doing, and the rest as its `skills` report it. */
export function skillsReport(skills: Skills, decider: { readonly engagement?: Engagement }): MindReport {
  return { get engagement() { return decider.engagement ?? null; }, get heading() { return skills.report.heading; }, gait: skills.gait,
    get navigation() { return skills.report.navigation ?? null; }, kit: skills.kit, get actions() { return skills.report.actions; },
    get ended() { return skills.report.ledger; }, get menu() { return skills.menu(); } };
}
