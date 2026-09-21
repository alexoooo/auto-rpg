import { replay } from "./environment.mjs";
import { mulberry32 } from "../../src/rng.ts";
import { actionSize, OBSERVATION_NAMES } from "../../src/golem/lab-policy.ts";

/** Finite-horizon heuristic, NOT a solved value or a ground-truth label. */
export function utility(state, initial) {
  if (state.terminated) return state.winner === "left" ? 10 : state.winner === "right" ? -10 : 0;
  return (state.vitality[0] - initial.vitality[0]) - (state.vitality[1] - initial.vitality[1]);
}
export function randomNormal(random) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random());
}

/** Privileged, replay-based receding-horizon oracle. Each alternative gets fresh wasm. */
export async function oracle(record, index, { candidates = 8, iterations = 2, horizon = 2, seed = 1,
  deadline = Infinity } = {}) {
  if (!Number.isInteger(index) || index < 1 || index > record.steps.length || candidates < 2 || candidates > 64
    || !Number.isInteger(candidates) || !Number.isInteger(iterations) || iterations < 1 || iterations > 8
    || !Number.isFinite(horizon) || horizon <= 0 || horizon > 8) throw new Error("invalid search configuration");
  const initial = record.steps[index - 1];
  if (initial.terminated || initial.truncated) throw new Error("cannot search a terminal scenario");
  const steps = Math.ceil(horizon * record.config.hz), width = actionSize(record.config.surface);
  // Four piecewise-constant controls. Replan after one environment step, not after the whole plan.
  const segments = Math.min(4, steps), dimension = segments * width;
  let mean = Array(dimension).fill(0), deviation = Array(dimension).fill(0.6);
  const random = mulberry32(seed), alternatives = [];
  const evaluate = async (parameters) => {
    if (Date.now() >= deadline) return false;
    const env = await replay(record, index, { deadline });
    try {
      let state = initial;
      for (let i = 0; i < steps && !state.terminated && !state.truncated; i++) {
        if (Date.now() >= deadline) return false;
        const segment = Math.min(segments - 1, Math.floor(i * segments / steps));
        state = env.step(parameters === null ? null : parameters.slice(segment * width, (segment + 1) * width));
      }
      alternatives.push({ parameters, action: parameters === null ? null : parameters.slice(0, width),
        value: utility(state, initial), clock: state.clock, winner: state.winner,
        terminated: state.terminated, truncated: state.truncated });
      return true;
    } finally { env.close(); }
  };
  if (!await evaluate(null)) throw new Error("oracle budget exhausted before baseline");
  const baseline = alternatives[0];
  for (let generation = 0; generation < iterations; generation++) {
    const batch = [];
    for (let i = 0; i < candidates; i++) {
      const p = mean.map((m, j) => Math.max(-1, Math.min(1, m + deviation[j] * randomNormal(random))));
      if (!await evaluate(p)) break;
      batch.push(alternatives.at(-1));
    }
    if (!batch.length) break;
    const elite = batch.sort((a, b) => b.value - a.value).slice(0, Math.max(1, Math.floor(candidates / 4)));
    mean = mean.map((_, j) => elite.reduce((sum, r) => sum + r.parameters[j], 0) / elite.length);
    deviation = deviation.map((_, j) => Math.max(0.1, Math.sqrt(elite.reduce((s, r) => s + (r.parameters[j] - mean[j]) ** 2, 0) / elite.length)));
  }
  const best = [...alternatives].sort((a, b) => b.value - a.value)[0];
  return { tier: "privileged", observation: initial.observation, replayId: record.id, index, seed,
    horizon, baselineValue: baseline.value, action: best.action, value: best.value, alternatives,
    uncertainty: "single known opponent and seed; no statistical confidence estimate",
    evaluations: alternatives.length, horizonLimited: true };
}

/** Observation-only nearest-neighbour ensemble; independent of replay or actual opponent identity. */
export function fitObservationModel(transitions) {
  const rows = transitions.filter((r) => r.action !== null && !r.terminated && !r.truncated);
  if (!rows.length || rows.some((r) => r.split !== "train" || r.observation.length !== OBSERVATION_NAMES.length
    || r.nextObservation.length !== OBSERVATION_NAMES.length)) throw new Error("model needs training-only controlled transitions");
  return { version: 2, tier: "fair", trainingSeeds: [...new Set(rows.map((r) => r.seed))],
    rows: rows.map(({ observation, action, nextObservation }) => ({ observation, action, nextObservation })) };
}
export function predictObservations(obs, action, model) {
    if (model.version !== 2 || model.tier !== "fair" || !model.rows.length) throw new Error("invalid observation model");
    const neighbors = model.rows.map((r) => ({ r, distance: r.observation.reduce((s, x, i) => s + (x - obs[i]) ** 2, 0)
      + r.action.reduce((s, x, i) => s + (x - action[i]) ** 2, 0) })).sort((a, b) => a.distance - b.distance).slice(0, 5);
    return neighbors.map(({ r }) => obs.map((x, i) => Math.max(-5, Math.min(5, x + r.nextObservation[i] - r.observation[i]))));
}
/** Independent episodes, not random rows from the training trajectory. */
export function calibrateObservationModel(model, rows) {
  if (!rows.length || rows.some((r) => r.split !== "model-validation" || model.trainingSeeds.includes(r.seed))) {
    throw new Error("calibration requires independent model-validation seeds");
  }
  const errors = [], persistence = [], vitality = [], spread = [];
  for (const r of rows.filter((r) => r.action !== null && !r.terminated && !r.truncated)) {
    const predictions = predictObservations(r.observation, r.action, model);
    const mean = r.observation.map((_, j) => predictions.reduce((s, p) => s + p[j], 0) / predictions.length);
    errors.push(mean.reduce((s, x, j) => s + (x - r.nextObservation[j]) ** 2, 0) / mean.length);
    persistence.push(r.observation.reduce((s, x, j) => s + (x - r.nextObservation[j]) ** 2, 0) / mean.length);
    const indices = [OBSERVATION_NAMES.indexOf("self.vitality"), OBSERVATION_NAMES.indexOf("opponent.vitality")];
    vitality.push(indices.reduce((s, j) => s + (mean[j] - r.nextObservation[j]) ** 2, 0) / 2);
    spread.push(predictions.reduce((s, p) => s + p.reduce((t, x, j) => t + (x - mean[j]) ** 2, 0) / mean.length, 0) / predictions.length);
  }
  if (!errors.length) throw new Error("no nonterminal validation transitions");
  const rmse = (xs) => Math.sqrt(xs.reduce((a, b) => a + b, 0) / xs.length);
  return { transitions: errors.length, seeds: [...new Set(rows.map((r) => r.seed))],
    rmse: rmse(errors), persistenceRmse: rmse(persistence), vitalityRmse: rmse(vitality),
    ensembleSpread: rmse(spread), beatsPersistence: rmse(errors) < rmse(persistence),
    limitation: "one-step held-out prediction error; not evidence of calibrated long-horizon value" };
}
export function fairPlan(observation, model, { seed = 1, candidates = 16, steps = 24 } = {}) {
  if (model.version !== 2 || model.tier !== "fair" || !model.rows.length) throw new Error("invalid observation model");
  const random = mulberry32(seed), width = model.rows[0].action.length;
  const predict = (obs, action) => predictObservations(obs, action, model);
  const value = (o) => o[OBSERVATION_NAMES.indexOf("self.vitality")] - o[OBSERVATION_NAMES.indexOf("opponent.vitality")];
  const alternatives = [];
  for (let i = 0; i < candidates; i++) {
    const action = Array.from({ length: width }, () => i === 0 ? 0 : random() * 2 - 1);
    let particles = [observation];
    for (let t = 0; t < steps; t++) {
      if (particles.length === 1) particles = predict(particles[0], action);
      else particles = particles.map((o, j) => { const predictions = predict(o, action); return predictions[j % predictions.length]; });
    }
    const values = particles.map(value), mean = values.reduce((a, b) => a + b, 0) / values.length;
    const spread = Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length);
    alternatives.push({ action, value: mean - spread, mean, spread });
  }
  const best = alternatives.sort((a, b) => b.value - a.value)[0];
  return { tier: "fair", observation, action: best.action, alternatives,
    uncertainty: "neighbour disagreement, not calibrated confidence; approximate dynamics" };
}
