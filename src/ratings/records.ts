/**
 * **The records the build carries** (`assets/evaluations/<id>/*.jsonl`), fetched when an
 * evaluation is first opened and kept for the tab. An imported run's source rows
 * (`assets/evaluations/imports/`) are not records.
 */
import type { Kept } from "../evaluation/history.ts";
import { readRecord } from "../evaluation/record.ts";

const FILES: Readonly<Record<string, string>> = import.meta.glob<string>(
  ["../../assets/evaluations/*/*.jsonl", "!../../assets/evaluations/imports/**"], { query: "?url", import: "default", eager: true });

/** Each record file, by evaluation id, oldest first: the names sort by date, then commit. */
const BY_EVALUATION = (() => {
  const files = new Map<string, { name: string; url: string }[]>();
  for (const [path, url] of Object.entries(FILES)) {
    const [id, name] = path.split("/").slice(-2) as [string, string];
    if (!files.has(id)) files.set(id, []);
    files.get(id)!.push({ name, url });
  }
  for (const list of files.values()) list.sort((a, b) => a.name < b.name ? -1 : 1);
  return files;
})();

/** The names of evaluation `id`'s records, oldest first. */
export const recordNames = (id: string): readonly string[] => (BY_EVALUATION.get(id) ?? []).map(({ name }) => name);

const loaded = new Map<string, Promise<Kept[]>>();

/** Evaluation `id`'s records, read once a tab (`readRecord`), oldest first. */
export function recordsOf(id: string): Promise<Kept[]> {
  let records = loaded.get(id);
  if (!records) {
    records = Promise.all((BY_EVALUATION.get(id) ?? []).map(async ({ name, url }) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${name}: ${response.status} ${response.statusText}`);
      return { name, ...readRecord(await response.text(), name) };
    }));
    records.catch(() => loaded.delete(id));
    loaded.set(id, records);
  }
  return records;
}
