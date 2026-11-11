/**
 * **A subject's trials in an Arena link**: `?play=arena#reel=<evaluation>&protocol=<name>&subject=<id>&cases=<name,…>&at=<index>&auto=<0|1>&back=<address>`,
 * a reel of the bout cases of a subject's result by their conditions' names (`caseName`), the one at
 * `at` shown first; with auto-play each case plays after the last in the same screen. A single case
 * is a reel of one. The Arena plays each case's recipe and tape as this build's code builds them
 * (`reel.ts`); the address the case gives the pickers only shows its choices.
 */
import { MINDS } from "../../catalog.ts";
import { recordingKey } from "../../../core/world/recording.ts";
import { writeAttributes } from "../../../game/attribute-link.ts";
import { SIDES, type DuelRecipe } from "../../../game/arena/duel.ts";
import { matchupSearch } from "../../../game/arena/matchup.ts";
import { defaultControl, mindsSearch } from "../setup.ts";

/** A reel as a link carries it. */
export interface LinkedReel {
  /** The evaluation, the protocol and the subject whose result holds the trials. */
  readonly evaluation: string;
  readonly protocol: string;
  readonly subject: string;
  /** The cases, by their conditions' names, in the order played. */
  readonly cases: readonly string[];
  /** The case shown, by its index in `cases`. */
  readonly at: number;
  /** Whether each case plays on from the last. */
  readonly auto: boolean;
  /** The Ratings address to return to. */
  readonly back: string | null;
}

const REEL_KEY = "reel";

/** The fragment that opens `reel` (`readReel`). */
export function reelHash({ evaluation, protocol, subject, cases, at, auto, back }: LinkedReel): string {
  return `#${new URLSearchParams({ [REEL_KEY]: evaluation, protocol, subject, cases: cases.join(","), at: String(at), auto: auto ? "1" : "0", ...(back === null ? {} : { back }) })}`;
}

/** The reel `hash` carries; null where it carries none, and an error where what it carries is no reel. */
export function readReel(hash: string): LinkedReel | { readonly fault: string } | null {
  const fragment = new URLSearchParams(hash.replace(/^#/, "")), evaluation = fragment.get(REEL_KEY);
  if (evaluation === null) return null;
  const protocol = fragment.get("protocol"), subject = fragment.get("subject");
  if (protocol === null || subject === null) return { fault: "the reel names no protocol or subject" };
  const cases = (fragment.get("cases") ?? "").split(",").filter((name) => name.length > 0), at = Number(fragment.get("at") ?? 0);
  if (cases.length === 0) return { fault: "the reel names no case" };
  if (!Number.isSafeInteger(at) || at < 0 || at >= cases.length) return { fault: `the reel has no case ${fragment.get("at")}` };
  const back = fragment.get("back");
  return { evaluation, protocol, subject, cases, at, auto: fragment.get("auto") !== "0", back: back !== null && back.startsWith("?play=ratings") ? back : null };
}

/** The recipe's fields the pickers show (`caseSearch`). */
const SHOWN: ReadonlySet<string> = new Set(["left", "right", "level", "gap", "capSeconds", "loadouts", "attributes", "minds"] satisfies (keyof DuelRecipe)[]);

/** What `recipe` sets that the pickers do not show, by its field's name: every field but those they show. */
export const unshown = (recipe: DuelRecipe): string[] =>
  Object.entries(recipe).filter(([field, value]) => value !== undefined && !SHOWN.has(field)).map(([field]) => field);

/**
 * The Arena address that shows `recipe`'s choices in the pickers: characters, level, gap, cap,
 * loadouts, attributes, and each side's mind as its preset, or its whole tree where no
 * preset is it.
 */
export function caseSearch(recipe: DuelRecipe): string {
  const query = new URLSearchParams({ play: "arena", level: recipe.level ?? "open" });
  if (recipe.gap !== undefined) query.set("gap", String(recipe.gap));
  if (recipe.capSeconds !== undefined) query.set("cap", String(recipe.capSeconds));
  for (const side of SIDES) {
    const loadout = recipe.loadouts?.[side];
    if (loadout) query.set(`${side}.loadout`, `${loadout.left},${loadout.right}`);
    if (recipe.attributes) writeAttributes(query, side, recipe.attributes[side]);
  }
  const controls = SIDES.map((side) => {
    const mind = recipe.minds?.[side], loadout = recipe.loadouts?.[side];
    const preset = mind && Object.keys(MINDS).find((id) => recordingKey(MINDS[id]!.config) === recordingKey(mind));
    return preset ?? defaultControl(recipe[side], loadout);
  });
  query.set("control", controls.join(","));
  const search = matchupSearch(`?${query}`, { left: recipe.left, right: recipe.right });
  return recipe.minds ? mindsSearch(search, recipe.minds) : search;
}
