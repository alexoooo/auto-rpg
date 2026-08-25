import { canonicalJson } from "./artifact.ts";
import { SeededRng } from "./rng.ts";

/**
 * One teacher decision, as a row carries it.
 *
 * Six fields since stage C2b, and every one of them `string` or `number` rather
 * than a frozen union: a row is decoded from JSON that a previous run wrote, so
 * the narrow types belong on `TacticalLabel`, which is authored, and the checks
 * belong in `validateDaggerRow`, which is what stands between the two.
 */
export interface DaggerLabel {
  readonly movement: string;
  readonly action: string;
  readonly effector: string;
  readonly target: string;
  readonly stance: string;
  readonly persistence: number;
}
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

/**
 * What a row has to be before it is trained on, including *which teacher wrote
 * it*.
 *
 * **`teacherVersion` had three writers and no reader**, which is a worse state
 * than an unchecked field: `collect-dagger.mjs` put it in the config digest and
 * in artifact provenance, `research-rollout-worker.mjs` stamped it on the row,
 * and this function checked only that it was a non-negative safe integer --
 * alongside the seed and the two step counters, in a loop about provenance
 * arithmetic. So a row labelled by the three-field teacher was indistinguishable
 * from one labelled by the six-field one to every consumer the moment the
 * feature version matched, and stage C2b is exactly the change that makes the two
 * mean different things. It is compared the way `featureVersion` is, and the
 * refusal names both numbers, because "teacher version mismatch" sends whoever
 * reads the log to look for which two.
 *
 * The 143 rows checked in under `asset-src/learning/research/session16-final-workers8/`
 * are `featureVersion` 3 against a runtime 4 and `teacherVersion` 1 against a
 * runtime 2, so they were already refused before this and are refused twice now.
 * Confirmed by reading the file rather than assumed.
 *
 * **The order of the checks below is load-bearing and was not chosen.** The
 * label-key comparison runs before the feature-version and finiteness ones, so
 * widening it changed which sentence a row with a stale label produces. Two
 * tests were asserting on the later messages while handing in a three-field
 * label; the fixture is a real six-field row now, which is the fix that leaves
 * each assertion reaching the check it names.
 */
export function validateDaggerRow(row: DaggerRow, featureVersion: number, featureCount: number, teacherVersion: number): void {
  const keys = Object.keys(row).sort(); const expected = ["featureVersion", "features", "iteration", "label", "sourceSeed",
    "sourceStep", "teacherVersion", "unitCell"].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error("DAgger row contains a privileged or unknown column");
  }
  const labelKeys = Object.keys(row.label).sort();
  if (labelKeys.join(",") !== "action,effector,movement,persistence,stance,target") throw new Error("DAgger label contains a privileged or unknown column");
  if (row.featureVersion !== featureVersion) throw new Error(`DAgger row feature version ${row.featureVersion} does not match ${featureVersion}`);
  if (row.teacherVersion !== teacherVersion) throw new Error(`DAgger row teacher version ${row.teacherVersion} does not match ${teacherVersion}`);
  if (row.features.length !== featureCount || row.features.some((value) => !Number.isFinite(value))) {
    throw new Error(`DAgger row must contain exactly ${featureCount} finite published features`);
  }
  if (!row.label.movement || !row.label.action || !row.label.effector || !row.label.target || !row.label.stance ||
      !Number.isFinite(row.label.persistence)) throw new Error("DAgger row has an invalid teacher label");
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

/**
 * Deterministic cap per unit/action stratum. Rare legal actions are retained
 * before common rows are truncated.
 *
 * **The key stays `unitCell\0movement\0action` and that is a decision rather
 * than an omission.** The label space grew about seventy-twofold in stage C2b
 * and this key did not follow it, on the measurement rather than on taste:
 * swept over the whole capability space, the teacher produces at most **three**
 * distinct `(effector, target, stance)` triples per `(unitCell, movement,
 * action)` group -- the aim is a function of the action for six of seven names
 * and the stance is a function of two booleans -- so keying on them would split
 * each stratum into a handful of near-duplicate ones and raise the *effective*
 * cap per action from 64 to 64 times that. That weakens the only thing this
 * function does, which is stop a common action drowning a rare one.
 *
 * The argument for the wide key is real and is why this needed deciding: an
 * effector head trained on a set where 95 % of the `cut` rows name the primary
 * hand learns the loadout rather than the decision. What that argues for is a
 * *second* balancing pass keyed on the tuple, not a wider key on this one, and
 * nothing has measured that it is needed -- the histogram in
 * `docs/measurements.md` under "Session 17 Stage C2b" is what somebody deciding
 * it should read first.
 */
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
/** The five categorical heads a DAgger model carries, in output-contract order. */
export const DAGGER_HEAD_NAMES = Object.freeze(["movement", "action", "effector", "target", "stance"] as const);
export type DaggerHeadName = typeof DAGGER_HEAD_NAMES[number];
export type DaggerLabelTables = Readonly<Record<DaggerHeadName, readonly string[]>>;
export interface DaggerModel extends Readonly<Record<DaggerHeadName, LinearHead>> {
  readonly featureCount: number; readonly hiddenCount: number;
  readonly hiddenWeights: readonly number[]; readonly hiddenBias: readonly number[];
  readonly persistenceWeights: readonly number[]; readonly persistenceBias: number;
}

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

const HEAD_FIELD: Readonly<Record<DaggerHeadName, (label: DaggerLabel) => string>> = Object.freeze({
  movement: (label) => label.movement, action: (label) => label.action, effector: (label) => label.effector,
  target: (label) => label.target, stance: (label) => label.stance,
});

export function trainDaggerModel(rows: readonly DaggerRow[], featureCount: number, labels: DaggerLabelTables,
  teacherVersion: number, epochs = 5, rate = 0.01, seed = 0, hiddenCount = 12): DaggerModel {
  if (!rows.length) throw new Error("DAgger training needs at least one row");
  const ordered = aggregateDaggerRows([rows]);
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(hiddenCount) || hiddenCount <= 0) throw new Error("invalid DAgger model seed or hidden size");
  const featureVersion = ordered[0]!.featureVersion;
  for (const row of ordered) validateDaggerRow(row, featureVersion, featureCount, teacherVersion);
  const rng = new SeededRng(seed); const hiddenWeights = Array.from({ length: hiddenCount * featureCount }, () => rng.signed(0.08));
  const hiddenBias = Array(hiddenCount).fill(0) as number[];
  const hiddenRows = ordered.map((row) => hiddenFor(row.features, hiddenWeights, hiddenBias, hiddenCount));
  const heads = Object.fromEntries(DAGGER_HEAD_NAMES.map((name) =>
    [name, trainHead(ordered, hiddenRows, labels[name], hiddenCount, HEAD_FIELD[name], epochs, rate, rng)])) as Record<DaggerHeadName, LinearHead>;
  const persistenceWeights = Array.from({ length: hiddenCount }, () => rng.signed(0.04)); let persistenceBias = 0;
  for (let epoch = 0; epoch < epochs; epoch += 1) for (let rowIndex = 0; rowIndex < ordered.length; rowIndex += 1) {
    const row = ordered[rowIndex] as DaggerRow; const hidden = hiddenRows[rowIndex] as readonly number[];
    const prediction = 1 / (1 + Math.exp(-(persistenceBias + hidden.reduce((sum, value, index) => sum + value * (persistenceWeights[index] as number), 0))));
    const error = prediction - row.label.persistence; persistenceBias -= rate * error;
    hidden.forEach((value, index) => { persistenceWeights[index] -= rate * error * value; });
  }
  return Object.freeze({ featureCount, hiddenCount, hiddenWeights: Object.freeze(hiddenWeights), hiddenBias: Object.freeze(hiddenBias),
    ...heads, persistenceWeights: Object.freeze(persistenceWeights), persistenceBias });
}

export function daggerModelDigest(model: DaggerModel): string { return canonicalJson(model); }

/**
 * One categorical head, argmaxed -- and refused by name when its matrix does not
 * match its label list.
 *
 * **The refusal is the point of this function and it had none.** The reduce
 * below scores each label from `weights[index * hidden.length + feature]`; on a
 * head whose matrix is shorter than its label list those reads are `undefined`,
 * every score is `NaN`, `NaN > best.score` is false for all of them, and the
 * reduce falls through to its seed -- returning `labels[0]` with no error
 * anywhere. Demonstrated: a `DaggerModel` with a **zero-row action head** passes
 * `canonicalJson`, passes `ResearchArtifact`'s envelope, passes
 * `deployment.ts`'s `exactNames` (which reads `labels`, which is intact) and
 * passes its all-zero deployment probe -- because `cover` is a legal answer --
 * and then answers `cover` for the whole of a tournament. `LinearHead` carries no
 * row count, so nothing above here can cross-check it either; stage C2b adds
 * three more matrices to the same blind spot, which is why it is closed here
 * rather than in one caller.
 *
 * Checked on every call rather than once at decode: two length comparisons
 * against a forward pass over `labels.length x hidden.length` weights is free,
 * and a check at the door is a check a second door can be built beside.
 */
const classify = (head: LinearHead, hidden: readonly number[], name: string): string => {
  if (head.weights.length !== head.labels.length * hidden.length || head.bias.length !== head.labels.length) {
    throw new Error(`DAgger ${name} head is ${head.weights.length} weights and ${head.bias.length} biases; ` +
      `${head.labels.length} labels over ${hidden.length} hidden units needs ${head.labels.length * hidden.length} and ${head.labels.length}`);
  }
  return head.labels.reduce((best, label, index) => {
    const score = (head.bias[index] as number) + hidden.reduce((sum, value, feature) => sum + value * (head.weights[index * hidden.length + feature] as number), 0);
    return score > best.score ? { label, score } : best;
  }, { label: head.labels[0] as string, score: Number.NEGATIVE_INFINITY }).label;
};

export function predictDagger(model: DaggerModel, features: readonly number[]): DaggerLabel {
  if (features.length !== model.featureCount || features.some((value) => !Number.isFinite(value))) throw new Error("DAgger inference feature contract mismatch");
  const hidden = hiddenFor(features, model.hiddenWeights, model.hiddenBias, model.hiddenCount);
  const persistence = 1 / (1 + Math.exp(-(model.persistenceBias + hidden.reduce((sum, value, index) =>
    sum + value * (model.persistenceWeights[index] as number), 0))));
  return Object.freeze({ movement: classify(model.movement, hidden, "movement"), action: classify(model.action, hidden, "action"),
    effector: classify(model.effector, hidden, "effector"), target: classify(model.target, hidden, "target"),
    stance: classify(model.stance, hidden, "stance"), persistence });
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

/** Macro-F1 for all five heads plus attack recall, which is the one class-conditional number. */
export function daggerClassificationMetrics(rows: readonly DaggerRow[], model: DaggerModel): Readonly<
Record<`${DaggerHeadName}MacroF1`, number> & { readonly attackRecall: number }> {
  const predictions = rows.map((row) => predictDagger(model, row.features));
  const attacks = new Set(["cut", "thrust", "punch", "shoot", "bite"]);
  let attackRows = 0; let recalled = 0;
  rows.forEach((row, index) => { if (attacks.has(row.label.action)) { attackRows += 1;
    if (predictions[index]?.action === row.label.action) recalled += 1; } });
  return Object.freeze({
    ...Object.fromEntries(DAGGER_HEAD_NAMES.map((name) => [`${name}MacroF1`,
      macroF1(rows.map((row) => HEAD_FIELD[name](row.label)), predictions.map((row) => HEAD_FIELD[name](row)), model[name].labels)])),
    attackRecall: attackRows ? recalled / attackRows : 0,
  } as Record<`${DaggerHeadName}MacroF1`, number> & { attackRecall: number });
}
