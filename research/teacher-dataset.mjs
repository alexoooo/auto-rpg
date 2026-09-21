/** Extract supervised decisions from executed reference trajectories, not imagined futures. */
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { LAB_VERSION, OBSERVATION_NAMES, actionSize, validateAction, validateNetwork } from "../src/golem/lab-policy.ts";
import { fingerprint, ROOT } from "./fingerprint.mjs";
import { digest, stable } from "./schedule.mjs";
import { atomicJson } from "./runner.mjs";

export function referenceDataset(references, expectedFingerprint) {
  const labels = [], sources = [], clockModels = [], seen = new Set();
  let baseline;
  for (const reference of references) {
    const record = reference.record, config = record?.config;
    if (reference.tier !== "privileged" || reference.status !== "finished" || record?.fingerprint !== expectedFingerprint
      || record.version !== LAB_VERSION || config?.hz !== 12
      || record.id !== digest({ config: record.config, steps: record.steps })
      || config?.surface !== "residual" || config.left.kind !== "baseline"
      || config.left.name !== config.controlBaseline || !["golem-driver", "golem-duelist"].includes(config.controlBaseline)
      || stable(record.observationNames) !== stable(OBSERVATION_NAMES)
      || !record.steps.length || !(record.steps.at(-1).terminated || record.steps.at(-1).truncated)) {
      throw new Error("dataset requires completed, matching-source residual reference fights with an identical control baseline");
    }
    if (baseline && baseline !== config.controlBaseline) throw new Error("mixed residual baselines");
    baseline = config.controlBaseline;
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    sources.push({ replayId: record.id, fingerprint: record.fingerprint, seed: config.seed,
      build: config.leftBuild, opponent: config.right, winner: record.steps.at(-1).winner });
    clockModels.push(clockResidual(record));
    // A row publishes the observation AFTER its action. Pair each action with the
    // previous row's observation. The initial pre-step observation was not recorded.
    for (let i = 1; i < record.steps.length; i++) {
      const previous = record.steps[i - 1], current = record.steps[i];
      if (previous.terminated || previous.truncated) throw new Error("trajectory continues after its verdict");
      const observation = previous.observation;
      if (observation.length !== OBSERVATION_NAMES.length || observation.some((v) => !Number.isFinite(v))) throw new Error("invalid teacher observation");
      // Here, and ONLY here, null is the exact named baseline, not a student or pilot.
      // Zero residual is therefore its legal supervised target.
      const action = current.action ?? Array(actionSize("residual")).fill(0);
      validateAction("residual", action);
      labels.push({ observation: [...observation], action: [...action], replayId: record.id, index: i,
        source: current.action === null ? "named-baseline-continuation" : "executed-reference-action" });
    }
  }
  if (!labels.length) throw new Error("empty reference dataset");
  // Constant-action behavior cloning is a deliberately simple control for a learned network.
  // It tests whether a fixed pose/movement bias explains any benefit of richer imitation.
  const constantModel = { version: LAB_VERSION, surface: "residual", hz: 12, baseline,
    observationNames: [...OBSERVATION_NAMES], layers: [{ activation: "linear",
      weights: Array.from({ length: actionSize("residual") }, () => Array(OBSERVATION_NAMES.length).fill(0)),
      bias: Array.from({ length: actionSize("residual") }, (_, i) => labels.reduce((sum, r) => sum + r.action[i], 0) / labels.length) }] };
  validateNetwork(constantModel);
  return { labels, constantModel, clockModels, manifest: { version: 1, baseline, surface: "residual", sources, rows: labels.length,
    labelsHash: digest(labels), constantModelHash: digest(constantModel),
    clockModelHashes: clockModels.map(digest),
    limitation: "Privileged executed trajectories, not ground truth or independent student evidence." } };
}

/** Analytic time-only imitation control, represented by the existing browser network format.
 * Sharp tanh steps sit between nominal decision instants. This is an approximate open-loop
 * opening, NOT exact replay or online search. It uses no opponent identity or future state. */
function clockResidual(record) {
  const width = actionSize("residual"), zero = Array(width).fill(0), changes = [];
  if (record.steps.some((r, i) => !Number.isFinite(r.clock) || r.clock <= (i ? record.steps[i - 1].clock : 0))) {
    throw new Error("invalid teacher clock");
  }
  let previous = zero;
  for (let i = 0; i <= record.steps.length; i++) {
    const action = i === record.steps.length ? zero : record.steps[i].action ?? zero;
    validateAction("residual", action);
    if (stable(action) !== stable(previous)) {
      const at = i === 0 ? 0 : i === record.steps.length
        ? Math.ceil((record.steps[i - 1].clock - 1e-8) * record.config.hz) / record.config.hz
        : record.steps[i - 1].clock;
      if (!Number.isFinite(at) || at < 0) throw new Error("invalid teacher clock");
      changes.push({ at: at - 0.5 / record.config.hz, delta: action.map((x, j) => x - previous[j]) });
    }
    previous = action;
  }
  // An all-baseline trace still gets a valid one-unit, zero-output network.
  if (!changes.length) changes.push({ at: 0, delta: zero });
  const clock = OBSERVATION_NAMES.indexOf("clock"), sharpness = 64 * record.config.hz;
  const model = { version: LAB_VERSION, surface: "residual", hz: record.config.hz,
    baseline: record.config.controlBaseline, observationNames: [...OBSERVATION_NAMES], layers: [
      { activation: "tanh", weights: changes.map(() => OBSERVATION_NAMES.map((_, j) => j === clock ? 150 * sharpness : 0)),
        bias: changes.map((c) => -c.at * sharpness) },
      { activation: "linear", weights: zero.map((_, j) => changes.map((c) => c.delta[j] / 2)),
        bias: zero.map((_, j) => changes.reduce((s, c) => s + c.delta[j] / 2, 0)) },
    ] };
  validateNetwork(model);
  return model;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const flags = {};
  for (let i = 2; i < process.argv.length; i += 2) flags[process.argv[i].slice(2)] = process.argv[i + 1];
  const directory = resolve(flags.out), scope = relative(join(ROOT, "research/runs"), directory);
  if (scope.startsWith("..") || scope.includes(":")) throw new Error("dataset output must stay under research/runs");
  const references = flags.runs.split(",").map((path) => JSON.parse(readFileSync(join(resolve(path), "reference-privileged.json"), "utf8")));
  const result = referenceDataset(references, fingerprint().hash);
  mkdirSync(directory, { recursive: true });
  atomicJson(join(directory, "labels.json"), result.labels);
  atomicJson(join(directory, "constant-model.json"), result.constantModel);
  result.clockModels.forEach((model, i) => atomicJson(join(directory, `clock-model-${i}.json`), model));
  atomicJson(join(directory, "dataset.json"), result.manifest);
  console.log(JSON.stringify(result.manifest));
}
