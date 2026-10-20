import notes from "../../assets/minds/notes.json" with { type: "json" };
import ratings from "../../assets/minds/ratings.json" with { type: "json" };
import { HELD, type Held } from "../core/items/held.ts";
import { MINDS } from "../core/mind/controllers.ts";
import { BODY_MODELS, type BodyModel } from "../core/models.ts";

/** A note at each level of a mind: its own, by what its hand holds, by its character, and by both. */
interface NoteTree {
  readonly note?: string;
  readonly held?: Readonly<Partial<Record<Held, string>>>;
  readonly bodies?: Readonly<Partial<Record<BodyModel, { readonly note?: string; readonly held?: Readonly<Partial<Record<Held, string>>> }>>>;
}

/** **The notes on each mind a person may pick**, by its id (`MINDS`): `assets/minds/notes.json`. */
export const MIND_NOTES: Readonly<Record<string, NoteTree>> = notes;

/** A note's level, from the mind's own to its character's with its loadout. */
export type NoteLevel = "mind" | "held" | "body" | "body-held";

/** Every note `notes` gives mind `id` played by `model` holding `held`, the most particular first. */
export function notesOf(id: string, model: BodyModel, held: Held, tree: Readonly<Record<string, NoteTree>> = MIND_NOTES): readonly { readonly level: NoteLevel; readonly note: string }[] {
  const mind = Object.hasOwn(tree, id) ? tree[id]! : {}, body = mind.bodies?.[model];
  const levels: [NoteLevel, string | undefined][] = [["body-held", body?.held?.[held]], ["body", body?.note], ["held", mind.held?.[held]], ["mind", mind.note]];
  return levels.flatMap(([level, note]) => note === undefined ? [] : [{ level, note }]);
}

/** The note that speaks for mind `id` played by `model` holding `held`: the most particular one it has (`notesOf`), or null. */
export const noteOf = (id: string, model: BodyModel, held: Held, tree: Readonly<Record<string, NoteTree>> = MIND_NOTES): string | null =>
  notesOf(id, model, held, tree)[0]?.note ?? null;

/** What in `tree` names no mind (`MINDS`), character (`BODY_MODELS`) or loadout (`HELD`), or is no text: each a sentence. */
export function noteFaults(tree: unknown): readonly string[] {
  const faults: string[] = [], object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
  const text = (value: unknown, at: string) => { if (value !== undefined && typeof value !== "string") faults.push(`${at}: a note is text`); };
  const byHeld = (value: unknown, at: string) => {
    if (value === undefined) return;
    if (!object(value)) { faults.push(`${at}: notes by loadout`); return; }
    for (const [held, note] of Object.entries(value)) if (HELD.includes(held as Held)) text(note, `${at}.${held}`); else faults.push(`${at}: no loadout ${held}`);
  };
  const known = (value: Record<string, unknown>, keys: readonly string[], at: string) => {
    for (const key of Object.keys(value)) if (!keys.includes(key)) faults.push(`${at}: no level ${key}`);
  };
  if (!object(tree)) return ["notes by mind"];
  for (const [id, mind] of Object.entries(tree)) {
    if (!Object.hasOwn(MINDS, id)) { faults.push(`${id}: no mind ${id}`); continue; }
    if (!object(mind)) { faults.push(`${id}: a mind's notes`); continue; }
    known(mind, ["note", "held", "bodies"], id); text(mind.note, id); byHeld(mind.held, `${id}.held`);
    if (mind.bodies === undefined) continue;
    if (!object(mind.bodies)) { faults.push(`${id}.bodies: notes by character`); continue; }
    for (const [model, body] of Object.entries(mind.bodies)) {
      const at = `${id}.bodies.${model}`;
      if (!BODY_MODELS.includes(model as BodyModel)) { faults.push(`${at}: no character ${model}`); continue; }
      if (!object(body)) { faults.push(`${at}: a character's notes`); continue; }
      known(body, ["note", "held"], at); text(body.note, at); byHeld(body.held, `${at}.held`);
    }
  }
  return faults;
}

/** One rated entrant of the last tournament: a mind on a character with a loadout. */
interface RatedEntrant {
  readonly mind: string;
  readonly model: BodyModel;
  readonly held: Held;
  /** On the Elo scale, the field's mean 1500 (`scripts/tournament.mjs`). */
  readonly rating: number;
  /** The rating's 95 % interval, low and high, from resampling the pairs. */
  readonly interval: readonly [number, number];
  readonly bouts: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
}

/** **The last tournament's ratings** (`assets/minds/ratings.json`): when, at which commit, how it was played, and each entrant's rating. */
interface Ratings {
  readonly date: string | null;
  readonly commit: string | null;
  readonly harness: string | null;
  readonly protocol: string | null;
  readonly entrants: readonly RatedEntrant[];
}

export const RATINGS: Ratings = ratings as Ratings;
