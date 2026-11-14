/**
 * **The results the build carries** (`assets/evaluations/<id>.json`, `src/evaluation/results.ts`),
 * fetched when an evaluation is first opened and kept for the tab; and a subject's cases as this
 * build makes them, by the names a result's trials are on.
 */
import { DEFAULT_ENGINE } from "../../../core/physics/engines.ts";
import { isRefused } from "../../../core/refusal.ts";
import type { CaseWorld, Evaluation, Json } from "../../../evaluation/evaluation.ts";
import { NO_RESULTS, caseName, type Results } from "../../../evaluation/results.ts";
import { casesOf } from "../../../evaluation/run.ts";

const FILES: Readonly<Record<string, string>> = import.meta.glob<string>("../../../../assets/evaluations/*.json", { query: "?url", import: "default", eager: true });

/** Each results file's address, by its evaluation's id. */
const URLS = new Map(Object.entries(FILES).map(([path, url]) => [path.split("/").at(-1)!.replace(/\.json$/, ""), url]));

/** Whether the build carries results of evaluation `id`. */
export const hasResults = (id: string): boolean => URLS.has(id);

const loaded = new Map<string, Promise<Results>>();

/** Evaluation `id`'s results, read once a tab; none where the build carries no file. */
export function resultsOf(id: string): Promise<Results> {
  let results = loaded.get(id);
  if (!results) {
    const url = URLS.get(id);
    results = url === undefined ? Promise.resolve(NO_RESULTS) : fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`${id}.json: ${response.status} ${response.statusText}`);
      return await response.json() as Results;
    });
    results.catch(() => loaded.delete(id));
    loaded.set(id, results);
  }
  return results;
}

/** A case as this build makes it. */
export interface CaseNow {
  readonly condition: Json;
  readonly world: CaseWorld;
}

/**
 * `subject`'s cases on `protocol` of `evaluation` as this build makes them, by name (`caseName`):
 * what a result's trial is played again from. The refusal's words where the build makes none.
 */
export function casesNow(evaluation: Evaluation, protocol: string, subject: string): ReadonlyMap<string, CaseNow> | { readonly fault: string } {
  const cases = evaluation.protocols[protocol];
  if (!cases) return { fault: `${evaluation.id} has no protocol ${protocol}` };
  try {
    const scheduled = casesOf(evaluation, protocol, evaluation.subjects([subject]), { engine: cases.engine ?? DEFAULT_ENGINE, schedule: { kind: "all" } });
    if (isRefused(scheduled)) return { fault: scheduled.refused };
    return new Map(scheduled.units.flat().filter((one) => one.subjects.length === 0 || one.subjects.includes(subject))
      .map((one) => [caseName(one.condition), { condition: one.condition, world: one.world }]));
  } catch (error) {
    // The catalogue throws for a subject it no longer has; the screen says so.
    return { fault: error instanceof Error ? error.message : String(error) };
  }
}
