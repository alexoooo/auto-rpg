import notes from "../../assets/minds/notes.json" with { type: "json" };
import { loadoutKey, type Loadout } from "../core/items/held.ts";
import type { BodyModel } from "../core/models.ts";

/** A note at each level of a mind: its own, by what its hand holds, by its character, and by both. */
interface NoteTree {
  readonly note?: string;
  readonly loadouts?: Readonly<Record<string, string>>;
  readonly bodies?: Readonly<Partial<Record<BodyModel, { readonly note?: string; readonly loadouts?: Readonly<Record<string, string>> }>>>;
}

/** **The notes on each mind a person may pick**, by its id (`MINDS`): `assets/minds/notes.json`. */
const MIND_NOTES: Readonly<Record<string, NoteTree>> = notes;

/** A note's level, from the mind's own to its character's with its loadout. */
export type NoteLevel = "mind" | "loadout" | "body" | "body-loadout";

/** Every note `notes` gives mind `id` played by `model` carrying `loadout`, the most particular first. */
export function notesOf(id: string, model: BodyModel, loadout: Loadout, tree: Readonly<Record<string, NoteTree>> = MIND_NOTES): readonly { readonly level: NoteLevel; readonly note: string }[] {
  const mind = Object.hasOwn(tree, id) ? tree[id]! : {}, body = mind.bodies?.[model];
  const levels: [NoteLevel, string | undefined][] = [["body-loadout", body?.loadouts?.[loadoutKey(loadout)]], ["body", body?.note], ["loadout", mind.loadouts?.[loadoutKey(loadout)]], ["mind", mind.note]];
  return levels.flatMap(([level, note]) => note === undefined ? [] : [{ level, note }]);
}
