import { canonicalJson } from "./artifact.ts";
import { SeededRng } from "./rng.ts";

export interface DaggerLabel { readonly movement: string; readonly action: string; readonly persistence: number }
export interface DaggerRow {
  readonly featureVersion: number;
  readonly features: readonly number[];
  readonly label: DaggerLabel;
  readonly unitCell: string;
  readonly sourceSeed: number;
  readonly sourceStep: number;
  readonly iteration: number;
  readonly teacherVersion: number;
}

export function validateDaggerRow(row: DaggerRow, featureVersion: number, featureCount: number): void {
  const keys = Object.keys(row).sort(); const expected = ["featureVersion", "features", "iteration", "label", "sourceSeed",
    "sourceStep", "teacherVersion", "unitCell"].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error("DAgger row contains a privileged or unknown column");
  }
  const labelKeys = Object.keys(row.label).sort();
  if (labelKeys.join(",") !== "action,movement,persistence") throw new Error("DAgger label contains a privileged or unknown column");
  if (row.featureVersion !== featureVersion) throw new Error(`DAgger row feature version ${row.featureVersion} does not match ${featureVersion}`);
  if (row.features.length !== featureCount || row.features.some((value) => !Number.isFinite(value))) {
    throw new Error(`DAgger row must contain exactly ${featureCount} finite published features`);
  }
  if (!row.label.movement || !row.label.action || !Number.isFinite(row.label.persistence)) throw new Error("DAgger row has an invalid teacher label");
  if (!row.unitCell) throw new Error("DAgger row must name its source unit cell");
  for (const value of [row.sourceSeed, row.sourceStep, row.iteration, row.teacherVersion]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("DAgger row provenance must contain non-negative integers");
  }
}

export function aggregateDaggerRows(iterations: readonly (readonly DaggerRow[])[]): DaggerRow[] {
  return iterations.flat().map((row) => Object.freeze({ ...row, features: Object.freeze([...row.features]),
    label: Object.freeze({ ...row.label }) })).sort((a, b) => a.iteration - b.iteration ||
      a.unitCell.localeCompare(b.unitCell) || a.sourceSeed - b.sourceSeed || a.sourceStep - b.sourceStep ||
      a.label.movement.localeCompare(b.label.movement) || a.label.action.localeCompare(b.label.action));
}

/** Deterministic cap per unit/action stratum. Rare legal actions are retained before common rows are truncated. */
export function balancedDaggerRows(rows: readonly DaggerRow[], maximumPerStratum: number): DaggerRow[] {
  if (!Number.isSafeInteger(maximumPerStratum) || maximumPerStratum <= 0) throw new Error("DAgger stratum cap must be positive");
  const grouped = new Map<string, DaggerRow[]>();
  for (const row of aggregateDaggerRows([rows])) {
    const key = `${row.unitCell}\0${row.label.movement}\0${row.label.action}`;
    const group = grouped.get(key) ?? []; group.push(row); grouped.set(key, group);
  }
  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).flatMap(([, group]) => group.slice(0, maximumPerStratum));
}

export interface LinearHead { readonly labels: readonly string[]; readonly weights: readonly number[]; readonly bias: readonly number[] }
export interface DaggerModel { readonly featureCount: number; readonly hiddenCount: number;
  readonly hiddenWeights: readonly number[]; readonly hiddenBias: readonly number[];
  readonly movement: LinearHead; readonly action: LinearHead;
  readonly persistenceWeights: readonly number[]; readonly persistenceBias: number }

const hiddenFor = (features: readonly number[], weights: readonly number[], bias: readonly number[], count: number): number[] =>
  Array.from({ length: count }, (_, hidden) => Math.tanh((bias[hidden] as number) + features.reduce((sum, value, feature) =>
    sum + value * (weights[hidden * features.length + feature] as number), 0)));

const trainHead = (rows: readonly DaggerRow[], hiddenRows: readonly (readonly number[])[], labels: readonly string[], hiddenCount: number,
  select: (label: DaggerLabel) => string, epochs: number, rate: number, rng: SeededRng): LinearHead => {
  const weights = Array.from({ length: labels.length * hiddenCount }, () => rng.signed(0.04));
  const bias = Array(labels.length).fill(0) as number[];
  for (let epoch = 0; epoch < epochs; epoch += 1) for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] as DaggerRow; const hidden = hiddenRows[rowIndex] as readonly number[];
    const logits = labels.map((_, label) => bias[label] + hidden.reduce((sum, value, feature) =>
      sum + value * (weights[label * hiddenCount + feature] as number), 0));
    const maximum = Math.max(...logits); const exponential = logits.map((value) => Math.exp(value - maximum));
    const total = exponential.reduce((sum, value) => sum + value, 0); const expected = labels.indexOf(select(row.label));
    if (expected < 0) throw new Error(`DAgger label "${select(row.label)}" is absent from its output table`);
    for (let label = 0; label < labels.length; label += 1) {
      const gradient = exponential[label] / total - (label === expected ? 1 : 0); bias[label] -= rate * gradient;
      for (let feature = 0; feature < hiddenCount; feature += 1) weights[label * hiddenCount + feature] -=
        rate * gradient * (hidden[feature] as number);
    }
  }
  return Object.freeze({ labels: Object.freeze([...labels]), weights: Object.freeze(weights), bias: Object.freeze(bias) });
};

export function trainDaggerModel(rows: readonly DaggerRow[], featureCount: number, movementLabels: readonly string[],
  actionLabels: readonly string[], epochs = 5, rate = 0.01, seed = 0, hiddenCount = 12): DaggerModel {
  if (!rows.length) throw new Error("DAgger training needs at least one row");
  const ordered = aggregateDaggerRows([rows]);
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(hiddenCount) || hiddenCount <= 0) throw new Error("invalid DAgger model seed or hidden size");
  const featureVersion = ordered[0]!.featureVersion;
  for (const row of ordered) validateDaggerRow(row, featureVersion, featureCount);
  const rng = new SeededRng(seed); const hiddenWeights = Array.from({ length: hiddenCount * featureCount }, () => rng.signed(0.08));
  const hiddenBias = Array(hiddenCount).fill(0) as number[];
  const hiddenRows = ordered.map((row) => hiddenFor(row.features, hiddenWeights, hiddenBias, hiddenCount));
  const movement = trainHead(ordered, hiddenRows, movementLabels, hiddenCount, (label) => label.movement, epochs, rate, rng);
  const action = trainHead(ordered, hiddenRows, actionLabels, hiddenCount, (label) => label.action, epochs, rate, rng);
  const persistenceWeights = Array.from({ length: hiddenCount }, () => rng.signed(0.04)); let persistenceBias = 0;
  for (let epoch = 0; epoch < epochs; epoch += 1) for (let rowIndex = 0; rowIndex < ordered.length; rowIndex += 1) {
    const row = ordered[rowIndex] as DaggerRow; const hidden = hiddenRows[rowIndex] as readonly number[];
    const prediction = 1 / (1 + Math.exp(-(persistenceBias + hidden.reduce((sum, value, index) => sum + value * (persistenceWeights[index] as number), 0))));
    const error = prediction - row.label.persistence; persistenceBias -= rate * error;
    hidden.forEach((value, index) => { persistenceWeights[index] -= rate * error * value; });
  }
  return Object.freeze({ featureCount, hiddenCount, hiddenWeights: Object.freeze(hiddenWeights), hiddenBias: Object.freeze(hiddenBias),
    movement, action, persistenceWeights: Object.freeze(persistenceWeights), persistenceBias });
}

export function daggerModelDigest(model: DaggerModel): string { return canonicalJson(model); }

const classify = (head: LinearHead, hidden: readonly number[]): string => head.labels.reduce((best, label, index) => {
  const score = (head.bias[index] as number) + hidden.reduce((sum, value, feature) => sum + value * (head.weights[index * hidden.length + feature] as number), 0);
  return score > best.score ? { label, score } : best;
}, { label: head.labels[0] as string, score: Number.NEGATIVE_INFINITY }).label;

export function predictDagger(model: DaggerModel, features: readonly number[]): DaggerLabel {
  if (features.length !== model.featureCount || features.some((value) => !Number.isFinite(value))) throw new Error("DAgger inference feature contract mismatch");
  const hidden = hiddenFor(features, model.hiddenWeights, model.hiddenBias, model.hiddenCount);
  const persistence = 1 / (1 + Math.exp(-(model.persistenceBias + hidden.reduce((sum, value, index) =>
    sum + value * (model.persistenceWeights[index] as number), 0))));
  return Object.freeze({ movement: classify(model.movement, hidden), action: classify(model.action, hidden), persistence });
}

export interface DaggerValidation { readonly iteration: number; readonly validationLoss: number; readonly testLoss?: number }
export function selectDaggerIteration(rows: readonly DaggerValidation[]): DaggerValidation {
  if (!rows.length || rows.some((row) => !Number.isSafeInteger(row.iteration) || !Number.isFinite(row.validationLoss))) {
    throw new Error("DAgger validation selection requires finite validation rows");
  }
  return [...rows].sort((a, b) => a.validationLoss - b.validationLoss || a.iteration - b.iteration)[0] as DaggerValidation;
}

export function requireTeacherEngagement(opportunityConversion: number, floor: number): void {
  if (![opportunityConversion, floor].every(Number.isFinite) || opportunityConversion < floor) {
    throw new Error(`DAgger teacher engagement ${opportunityConversion} is below frozen floor ${floor}`);
  }
}

const macroF1 = (expected: readonly string[], predicted: readonly string[], labels: readonly string[]): number =>
  labels.reduce((sum, label) => { let tp = 0; let fp = 0; let fn = 0;
    expected.forEach((value, index) => { if (value === label && predicted[index] === label) tp += 1;
      else if (value !== label && predicted[index] === label) fp += 1; else if (value === label) fn += 1; });
    const denominator = 2 * tp + fp + fn; return sum + (denominator ? 2 * tp / denominator : 0);
  }, 0) / Math.max(1, labels.length);

export function daggerClassificationMetrics(rows: readonly DaggerRow[], model: DaggerModel): {
  readonly movementMacroF1: number; readonly actionMacroF1: number; readonly attackRecall: number;
} {
  const predictions = rows.map((row) => predictDagger(model, row.features));
  const attacks = new Set(["cut", "thrust", "punch", "shoot", "bite"]);
  let attackRows = 0; let recalled = 0;
  rows.forEach((row, index) => { if (attacks.has(row.label.action)) { attackRows += 1;
    if (predictions[index]?.action === row.label.action) recalled += 1; } });
  return Object.freeze({
    movementMacroF1: macroF1(rows.map((row) => row.label.movement), predictions.map((row) => row.movement), model.movement.labels),
    actionMacroF1: macroF1(rows.map((row) => row.label.action), predictions.map((row) => row.action), model.action.labels),
    attackRecall: attackRows ? recalled / attackRows : 0,
  });
}
