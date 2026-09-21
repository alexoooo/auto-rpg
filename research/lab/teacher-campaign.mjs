import { collect, scenarios } from "./experiments.mjs";
import { oracle } from "./planning.mjs";

/** Matched-prefix branch-budget curves. Finite-search labels are not ground truth. */
export async function teacherCampaign({ deadline, seed = 4001, previous = null, onCheckpoint = () => {} }) {
  const result = previous ?? { version: 1, seed, corpus: [], queries: [], status: "running" };
  if (result.seed !== seed || result.version !== 1) throw new Error("teacher campaign identity mismatch");
  const builds = ["default", "two-blades", "mace", "fists"];
  for (let i = result.corpus.length; i < builds.length && Date.now() < deadline; i++) {
    const record = await collect({ deadline, seed: seed + i, build: builds[i], seconds: 40, surface: "residual" });
    result.corpus.push({ build: builds[i], record, scenarios: scenarios(record) });
    onCheckpoint(result);
  }
  for (const item of result.corpus) for (const point of item.scenarios) for (const candidates of [4, 16, 64]) {
    if (result.queries.some((q) => q.replayId === item.record.id && q.index === point.index && q.candidates === candidates
      && q.evaluations === candidates + 1)) continue;
    if (Date.now() >= deadline) { result.status = "budget"; onCheckpoint(result); return result; }
    const start = Date.now();
    try {
      const label = await oracle(item.record, point.index, { candidates, iterations: 1, horizon: 2, seed: point.index, deadline });
      result.queries.push({ ...label, candidates, scenario: point.kind, build: item.build, wallSeconds: (Date.now() - start) / 1000 });
      onCheckpoint(result);
      if (label.evaluations !== candidates + 1) { result.status = "budget"; onCheckpoint(result); return result; }
    } catch (error) {
      if (!String(error).includes("deadline") && !String(error).includes("budget exhausted")) throw error;
      result.status = "budget"; onCheckpoint(result); return result;
    }
  }
  result.status = "complete";
  onCheckpoint(result); return result;
}
