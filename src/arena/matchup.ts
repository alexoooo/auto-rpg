import { CORE_MODELS, type CoreModel } from "../core/human/spec.ts";
import type { Side } from "./duel.ts";

/** The arena link's parameter: `?matchup=left,right`, each a core model. */
export const MATCHUP_PARAM = "matchup";

export type Matchup = Readonly<Record<Side, CoreModel>>;

/** The Warrior against the Rogue unless a link or a person picks another pair. */
export const DEFAULT_MATCHUP: Matchup = Object.freeze({ left: "workshop-fighter", right: "workshop-rogue" });

/** What each model is called on the page. */
export const MODEL_LABELS: Readonly<Record<CoreModel, string>> = Object.freeze({
  "workshop-fighter": "Warrior", "workshop-rogue": "Rogue", "crypt-skeleton": "Skeleton",
});

const isModel = (text: string | undefined): text is CoreModel => CORE_MODELS.includes(text as CoreModel);

/** The matchup an address names; a side it does not name, or names wrongly (an old arena link), is the default's. */
export function readMatchup(search: string): Matchup {
  const [left, right] = (new URLSearchParams(search).get(MATCHUP_PARAM) ?? "").split(",");
  return { left: isModel(left) ? left : DEFAULT_MATCHUP.left, right: isModel(right) ? right : DEFAULT_MATCHUP.right };
}

/** `search` with its matchup replaced by `matchup`. */
export function matchupSearch(search: string, matchup: Matchup): string {
  const query = new URLSearchParams(search);
  query.set(MATCHUP_PARAM, `${matchup.left},${matchup.right}`);
  return `?${query.toString().replace(/%2C/g, ",")}`;
}
