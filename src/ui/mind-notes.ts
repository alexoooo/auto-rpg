import notes from "../../assets/minds/notes.json" with { type: "json" };
import ratings from "../../assets/minds/ratings.json" with { type: "json" };
import { BUILD_IDENTITY } from "../build-identity.ts";
import { requireRecordingIdentity, type RecordingIdentity } from "../core/recording.ts";
import { LOADOUTS, loadoutKey, type Loadout } from "../core/items/held.ts";
import { MINDS } from "../core/mind/controllers.ts";
import { BODY_MODELS, type BodyModel } from "../core/models.ts";

/** A note at each level of a mind: its own, by what its hand holds, by its character, and by both. */
interface NoteTree {
  readonly note?: string;
  readonly loadouts?: Readonly<Record<string, string>>;
  readonly bodies?: Readonly<Partial<Record<BodyModel, { readonly note?: string; readonly loadouts?: Readonly<Record<string, string>> }>>>;
}

/** **The notes on each mind a person may pick**, by its id (`MINDS`): `assets/minds/notes.json`. */
export const MIND_NOTES: Readonly<Record<string, NoteTree>> = notes;

/** A note's level, from the mind's own to its character's with its loadout. */
export type NoteLevel = "mind" | "loadout" | "body" | "body-loadout";

/** Every note `notes` gives mind `id` played by `model` carrying `loadout`, the most particular first. */
export function notesOf(id: string, model: BodyModel, loadout: Loadout, tree: Readonly<Record<string, NoteTree>> = MIND_NOTES): readonly { readonly level: NoteLevel; readonly note: string }[] {
  const mind = Object.hasOwn(tree, id) ? tree[id]! : {}, body = mind.bodies?.[model];
  const levels: [NoteLevel, string | undefined][] = [["body-loadout", body?.loadouts?.[loadoutKey(loadout)]], ["body", body?.note], ["loadout", mind.loadouts?.[loadoutKey(loadout)]], ["mind", mind.note]];
  return levels.flatMap(([level, note]) => note === undefined ? [] : [{ level, note }]);
}

/** The note that speaks for mind `id` played by `model` carrying `loadout`: the most particular one it has (`notesOf`), or null. */
export const noteOf = (id: string, model: BodyModel, loadout: Loadout, tree: Readonly<Record<string, NoteTree>> = MIND_NOTES): string | null =>
  notesOf(id, model, loadout, tree)[0]?.note ?? null;

/** What in `tree` names no mind (`MINDS`), character (`BODY_MODELS`) or loadout (`LOADOUTS`), or is no text: each a sentence. */
export function noteFaults(tree: unknown): readonly string[] {
  const faults: string[] = [], object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
  const text = (value: unknown, at: string) => { if (value !== undefined && typeof value !== "string") faults.push(`${at}: a note is text`); };
  const byLoadout = (value: unknown, at: string) => {
    if (value === undefined) return;
    if (!object(value)) { faults.push(`${at}: notes by loadout`); return; }
    for (const [held, note] of Object.entries(value)) if (LOADOUTS.some((loadout) => loadoutKey(loadout) === held)) text(note, `${at}.${held}`); else faults.push(`${at}: no loadout ${held}`);
  };
  const known = (value: Record<string, unknown>, keys: readonly string[], at: string) => {
    for (const key of Object.keys(value)) if (!keys.includes(key)) faults.push(`${at}: no level ${key}`);
  };
  if (!object(tree)) return ["notes by mind"];
  for (const [id, mind] of Object.entries(tree)) {
    if (!Object.hasOwn(MINDS, id)) { faults.push(`${id}: no mind ${id}`); continue; }
    if (!object(mind)) { faults.push(`${id}: a mind's notes`); continue; }
    known(mind, ["note", "loadouts", "bodies"], id); text(mind.note, id); byLoadout(mind.loadouts, `${id}.loadouts`);
    if (mind.bodies === undefined) continue;
    if (!object(mind.bodies)) { faults.push(`${id}.bodies: notes by character`); continue; }
    for (const [model, body] of Object.entries(mind.bodies)) {
      const at = `${id}.bodies.${model}`;
      if (!BODY_MODELS.includes(model as BodyModel)) { faults.push(`${at}: no character ${model}`); continue; }
      if (!object(body)) { faults.push(`${at}: a character's notes`); continue; }
      known(body, ["note", "loadouts"], at); text(body.note, at); byLoadout(body.loadouts, `${at}.loadouts`);
    }
  }
  return faults;
}

/** One rated entrant of the last tournament: a mind on a character with a loadout. */
interface RatedEntrant {
  readonly mind: string;
  readonly model: BodyModel;
  readonly loadout: Loadout;
  /** On the Elo scale, the field's mean 1500 (`scripts/tournament.mjs`). */
  readonly rating: number;
  /** The rating's 95 % interval, low and high, from resampling the pairs. */
  readonly interval: readonly [number, number];
  readonly bouts: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
}

/** One mind on a character with a loadout no mind is rated on, and its score against the tournament's unseen opponent. */
interface UnseenEntrant {
  readonly mind: string;
  readonly model: BodyModel;
  readonly loadout: Loadout;
  /** The opponent's mind (`MINDS`), with sword and buckler (`UNSEEN_OPPONENT`, `scripts/tournament.mjs`). */
  readonly against: string;
  readonly bouts: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
}

/** **The last tournament's ratings** (`assets/minds/ratings.json`): when, at which commit, how it was played, and each entrant's rating. */
interface Ratings {
  readonly unavailable: string | null;
  readonly date: string | null;
  readonly commit: string | null;
  readonly harness: string | null;
  readonly protocol: string | null;
  readonly entrants: readonly RatedEntrant[];
  /** How each mind carried to the loadouts it was not rated on, beside the ratings. */
  readonly unseen: readonly UnseenEntrant[];
}

/** A table made on different inputs cannot describe the available minds and physical recipes. */
export function readRatings(record: Omit<Ratings, "unavailable"> & { readonly identity?: RecordingIdentity }): Ratings {
  if (record.entrants.length > 0 || record.unseen.length > 0) {
    try { requireRecordingIdentity(record.identity, { build: BUILD_IDENTITY, protocol: "arena-tournament/1", configuration: record.identity?.configuration ?? "" }); }
    catch (error) { return { ...record, entrants: [], unseen: [], unavailable: error instanceof Error ? error.message : String(error) }; }
  }
  return { ...record, unavailable: null, entrants: record.entrants.map(entrant => ({ ...entrant,
    interval: [entrant.interval[0]!, entrant.interval[1]!] as const })) };
}

/** The shipped table is read by the same compatibility rule as any supplied result. */
export const RATINGS: Ratings = readRatings(ratings as unknown as Parameters<typeof readRatings>[0]);
