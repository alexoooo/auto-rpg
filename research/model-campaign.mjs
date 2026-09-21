/** Episode-separated calibration over the full training body/opponent matrix. */
import { collect, SPLITS } from "./lab/experiments.mjs";
import { fitObservationModel, calibrateObservationModel } from "./lab/planning.mjs";

export function modelCases(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 1000000000) throw new Error("invalid model campaign seed");
  return SPLITS.train.builds.flatMap((build, b) => SPLITS.train.opponents.map((opponent, o) =>
    ({ build, opponent, seed: seed + b * 100 + o })));
}
export function spacedRows(rows, limit = 64) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("invalid row limit");
  if (rows.length <= limit) return rows;
  return Array.from({ length: limit }, (_, i) => rows[Math.floor(i * rows.length / limit)]);
}
export async function modelCampaign({ deadline, seed = 12001, seconds = 30, previous = null,
  onCheckpoint = () => {}, collectEpisode = collect }) {
  const protocol = { seed, seconds, rowsPerEpisode: 64, surface: "pilot", version: 1 };
  const result = previous ?? { protocol, episodes: [], status: "running" };
  if (JSON.stringify(result.protocol) !== JSON.stringify(protocol)) throw new Error("model campaign protocol mismatch");
  if (result.status === "complete") return result;
  const cases = ["train", "model-validation"].flatMap((split, phase) =>
    modelCases(seed + phase * 100000).map((c) => ({ ...c, split })));
  for (const fixture of cases) {
    if (result.episodes.some((e) => e.seed === fixture.seed)) continue;
    if (Date.now() >= deadline) { result.status = "budget"; onCheckpoint(result); return result; }
    const rows = [];
    const record = await collectEpisode({ ...fixture, deadline, surface: "pilot", seconds,
      onTransition: (row) => rows.push({ ...row, split: fixture.split }) });
    const last = record.steps.at(-1);
    // A deadline-cut trajectory is not silently treated as a completed episode.
    if (!last?.terminated && !last?.truncated) { result.status = "budget"; onCheckpoint(result); return result; }
    result.episodes.push({ ...fixture, replayId: record.id, seconds: last.clock,
      rows: spacedRows(rows.filter((r) => r.action !== null && !r.terminated && !r.truncated), 64) });
    onCheckpoint(result);
  }
  const training = result.episodes.filter((e) => e.split === "train");
  const validation = result.episodes.filter((e) => e.split === "model-validation");
  const model = fitObservationModel(training.flatMap((e) => e.rows));
  const perEpisode = [];
  for (const episode of validation) {
    if (Date.now() >= deadline) { result.status = "budget"; onCheckpoint(result); return result; }
    perEpisode.push({ build: episode.build, opponent: episode.opponent,
      ...calibrateObservationModel(model, episode.rows) });
  }
  const balanced = (key) => Math.sqrt(perEpisode.reduce((sum, e) => sum + e[key] ** 2, 0) / perEpisode.length);
  result.calibration = { perEpisode, balancedRmse: balanced("rmse"),
    balancedPersistenceRmse: balanced("persistenceRmse"), balancedVitalityRmse: balanced("vitalityRmse"),
    beatsPersistence: balanced("rmse") < balanced("persistenceRmse"),
    limitation: "Equal episode weight; independent seeds but same training opponent/body families. One-step prediction, not long-horizon strength." };
  result.model = model;
  result.status = "complete";
  onCheckpoint(result);
  return result;
}
