/**
 * **Ratings as notes** (`assets/minds/notes.json`, `src/ui/mind-notes.ts`): each entrant's rating
 * at its leaf, and the means of the leaves above it, as `"<rating> <date>"`.
 */
import type { Rated } from "../rating.ts";

/** A note at each level of a mind: its own, by loadout, by character, and by both. */
interface NoteTree {
  note?: string;
  loadouts?: Record<string, string>;
  bodies?: Record<string, { note?: string; loadouts?: Record<string, string> }>;
}

/**
 * `notes` with each rating of `rated` whose id is a mind's entrant (`mind/character/left,right`,
 * the mind one of `minds`) written at its leaf, and the means above it; a note it does not rate is kept.
 */
export function ratedNotes(notes: Readonly<Record<string, NoteTree>>, rated: readonly Rated[], date: string, minds: readonly string[]): Record<string, NoteTree> {
  const text = (ratings: readonly number[]) => `${Math.round(ratings.reduce((t, x) => t + x, 0) / ratings.length)} ${date}`;
  const rows = rated.flatMap((one) => {
    const [mind, model, held] = one.id.split("/");
    return minds.includes(mind) && model && held ? [{ mind, model, held, rating: one.rating }] : [];
  });
  const out = structuredClone(notes) as Record<string, NoteTree>;
  for (const mind of [...new Set(rows.map((row) => row.mind))]) {
    const mine = rows.filter((row) => row.mind === mind), tree = out[mind] ??= {};
    tree.note = text(mine.map((row) => row.rating));
    for (const held of [...new Set(mine.map((row) => row.held))]) (tree.loadouts ??= {})[held] = text(mine.filter((row) => row.held === held).map((row) => row.rating));
    for (const model of [...new Set(mine.map((row) => row.model))]) {
      const body = (tree.bodies ??= {})[model] ??= {}, these = mine.filter((row) => row.model === model);
      body.note = text(these.map((row) => row.rating));
      for (const row of these) (body.loadouts ??= {})[row.held] = text([row.rating]);
    }
  }
  return out;
}
