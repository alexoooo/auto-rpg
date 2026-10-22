/**
 * **A bout case in an Arena link**: `?play=arena#case=<the case's world>`, the world as a record
 * keeps it (`CaseWorld`: engine, recipe, tape), with the record's commit (`&commit=`) and the
 * Ratings address it was opened from (`&back=`). The page plays the recipe and the tape as this
 * build's code builds them; the address the case gives the pickers only shows its choices.
 */
import { BODY_MODELS } from "../core/models.ts";
import { isEngineName } from "../core/engine/engines.ts";
import { MINDS } from "../core/mind/controllers.ts";
import { recordingKey } from "../core/recording.ts";
import type { CaseWorld } from "../evaluation/evaluation.ts";
import { writeAttributes } from "../ui/attribute-link.ts";
import { isOrdersEntry, SIDES, type DuelRecipe } from "./duel.ts";
import { defaultControl, matchupSearch, mindsSearch } from "./matchup.ts";

/** A bout case's world: the one kind the Arena opens, bit-equal between JavaScript engines. */
type BoutWorld = Extract<CaseWorld, { readonly kind: "bout" }>;

/** A case as a link carries it. */
export interface LinkedCase {
  readonly world: BoutWorld;
  /** The commit of the record that holds it, as the record names it. */
  readonly commit: string | null;
  /** The Ratings address to return to. */
  readonly back: string | null;
}

const CASE_KEY = "case";

/** The fragment that opens `world` (`readCase`). */
export function caseHash(world: BoutWorld, { commit, back }: { commit: string; back: string }): string {
  return `#${new URLSearchParams({ [CASE_KEY]: JSON.stringify(world), commit, back })}`;
}

/** The case `hash` carries; null where it carries none, and an error where what it carries is no bout case. */
export function readCase(hash: string): LinkedCase | null {
  const fragment = new URLSearchParams(hash.replace(/^#/, "")), text = fragment.get(CASE_KEY);
  if (text === null) return null;
  let world: Partial<BoutWorld>;
  try { world = JSON.parse(text) as Partial<BoutWorld>; }
  catch { throw new Error("the case is not valid JSON"); }
  if (world?.kind !== "bout") throw new Error("the Arena opens bout cases only: a fall is not yet the same in every JavaScript engine");
  if (typeof world.engine !== "string" || !isEngineName(world.engine)) throw new Error(`the case's engine ${String(world.engine)} is not one this build has`);
  const recipe = world.recipe;
  if (!recipe || !BODY_MODELS.includes(recipe.left) || !BODY_MODELS.includes(recipe.right)) throw new Error("the case's recipe names no character this build has");
  if (!Array.isArray(world.tape) || !world.tape.every((entry, k, tape) => isOrdersEntry(entry) && (k === 0 || entry.step >= tape[k - 1]!.step)))
    throw new Error("the case's tape has invalid or unordered orders");
  const back = fragment.get("back");
  return { world: world as BoutWorld, commit: fragment.get("commit"), back: back !== null && back.startsWith("?play=ratings") ? back : null };
}

/** What `recipe` sets that the pickers do not show, by its field's name. */
export const unshown = (recipe: DuelRecipe): string[] =>
  (["balance", "haste", "senseDelay", "balancePercent", "rules", "surfaces"] as const).filter((field) => recipe[field] !== undefined);

/**
 * The Arena address that shows `recipe`'s choices in the pickers: characters, level, gap, cap,
 * recovery, loadouts, attributes, and each side's mind as its preset, or its whole tree where no
 * preset is it.
 */
export function caseSearch(recipe: DuelRecipe): string {
  const query = new URLSearchParams({ play: "arena", level: recipe.level ?? "open" });
  if (recipe.gap !== undefined) query.set("gap", String(recipe.gap));
  if (recipe.capSeconds !== undefined) query.set("cap", String(recipe.capSeconds));
  query.set("recovery", recipe.recoverySeconds === null ? "continue" : String(recipe.recoverySeconds ?? 0));
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
