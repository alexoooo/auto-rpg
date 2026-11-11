import type { GaitLimits } from "../skills/framework/locomotion-part.ts";
import type { Skills } from "../skills/framework/skills.ts";
import type { ActionStatus, Ended } from "../skills/framework/action.ts";
import type { KitEntry, MenuEntry } from "../skills/framework/menu.ts";
import type { NavigationReport } from "../skills/framework/navigation.ts";
import type { Engagement } from "./engagement.ts";
import { loadState, saveState } from "../core/state.ts";

/**
 * **What a body expects of a fight with one foe**, at reach: the share of the foe's full life it
 * expects to deal it a second (`dealt`), and of its own it expects to take (`taken`).
 */
export interface Prospect {
  readonly foe: string;
  readonly dealt: number;
  readonly taken: number;
}

/**
 * **What a mind publishes of itself** (`MindMade.report`), for a screen and its Commander, never
 * for the rules: what it reports doing (`Engagement`), what it expects of each foe it has priced
 * (`Prospect`), and where it walks, its heading, each of its gaits' limits (`GaitLimits`) and its
 * navigation's report; the actions its body has (`KitEntry`), those under way and those ended, and
 * its choices now (`MenuEntry`), read when asked and changing nothing of it; null for what it does not
 * say. A mind that runs the game's skills publishes theirs and its decider's (`skillsReport`); any
 * other may publish its own.
 */
export interface MindReport {
  readonly engagement: Engagement | null;
  readonly prospects: readonly Prospect[] | null;
  readonly heading: number | null;
  readonly gaits: readonly GaitLimits[] | null;
  readonly navigation: NavigationReport | null;
  readonly kit: readonly KitEntry[] | null;
  readonly actions: readonly ActionStatus[] | null;
  readonly ended: readonly Ended[] | null;
  readonly menu: readonly MenuEntry[] | null;
}

/**
 * What a mind says of itself, live (`MindReport`): what its `decider` reports doing, and the rest as
 * its `skills` report it. Its menu is read with the mind's `state` put back as it was after: what
 * a reading asks (an aim's held opening) moves nothing a mind keeps, whoever reads it and when.
 */
export function skillsReport(skills: Skills, decider: { readonly engagement?: Engagement; readonly prospects?: readonly Prospect[] }, state: object): MindReport {
  const menu = (): readonly MenuEntry[] => {
    const saved = saveState(state);
    try { return skills.actions.menu(); } finally { loadState(state, saved); }
  };
  return { get engagement() { return decider.engagement ?? null; }, get prospects() { return decider.prospects ?? null; }, get heading() { return skills.report.legs.heading; }, gaits: skills.legs.gaits,
    get navigation() { return skills.report.navigation ?? null; }, kit: skills.actions.kit, get actions() { return skills.report.actions; },
    get ended() { return skills.report.ledger; }, get menu() { return menu(); } };
}
