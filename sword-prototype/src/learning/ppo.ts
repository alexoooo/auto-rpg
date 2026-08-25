export interface AdvantageStep {
  readonly reward: number;
  readonly value: number;
  readonly nextValue: number;
  readonly terminal: boolean;
}

export function generalizedAdvantages(steps: readonly AdvantageStep[], gamma: number, lambda: number): number[] {
  if (![gamma, lambda].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error("GAE gamma and lambda must be finite within 0..1");
  }
  const advantages = Array(steps.length).fill(0) as number[]; let next = 0;
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index] as AdvantageStep;
    if (![step.reward, step.value, step.nextValue].every(Number.isFinite)) throw new Error(`GAE step ${index} is non-finite`);
    const continuation = step.terminal ? 0 : 1;
    const delta = step.reward + gamma * step.nextValue * continuation - step.value;
    next = delta + gamma * lambda * continuation * next; advantages[index] = next;
  }
  return advantages;
}

export function clippedPolicyTerm(oldProbability: number, newProbability: number, advantage: number, epsilon: number): number {
  if (!(oldProbability > 0) || !Number.isFinite(newProbability) || !Number.isFinite(advantage) || epsilon < 0) {
    throw new Error("invalid PPO policy sample");
  }
  const ratio = newProbability / oldProbability;
  const clipped = Math.max(1 - epsilon, Math.min(1 + epsilon, ratio));
  return Math.min(ratio * advantage, clipped * advantage);
}

export function clippedValueLoss(oldValue: number, newValue: number, target: number, epsilon: number): number {
  const clipped = oldValue + Math.max(-epsilon, Math.min(epsilon, newValue - oldValue));
  return 0.5 * Math.max((newValue - target) ** 2, (clipped - target) ** 2);
}

export function clipGradientNorm(gradient: readonly number[], maximum: number): number[] {
  if (!(maximum > 0) || !Number.isFinite(maximum) || gradient.some((value) => !Number.isFinite(value))) {
    throw new Error("invalid gradient or clipping maximum");
  }
  const norm = Math.hypot(...gradient); const scale = norm > maximum ? maximum / norm : 1;
  return gradient.map((value) => value * scale);
}

/** Fisher-Yates driven only by seed and index, so worker completion order is irrelevant. */
export function deterministicMinibatchOrder(length: number, seed: number): number[] {
  if (!Number.isSafeInteger(length) || length < 0) throw new Error(`invalid minibatch length ${length}`);
  let state = seed >>> 0; const next = (): number => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0;
  };
  const order = Array.from({ length }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const other = next() % (index + 1); [order[index], order[other]] = [order[other] as number, order[index] as number];
  }
  return order;
}

export interface TacticalBoundary {
  readonly startVitalityPotential: number;
  readonly endVitalityPotential: number;
  readonly nearRangeProgress: number;
  readonly terminal: -1 | 0 | 1;
  /** Diagnostic only. Time alive is intentionally absent from reward. */
  readonly durationSeconds?: number;
}

export function tacticalBoundaryReward(boundary: TacticalBoundary, progressLimit = 0.2): number {
  if (!Number.isFinite(progressLimit) || progressLimit < 0) throw new Error("progress reward limit must be non-negative");
  const progress = Math.max(-progressLimit, Math.min(progressLimit, boundary.nearRangeProgress));
  return boundary.terminal * 4 + (boundary.endVitalityPotential - boundary.startVitalityPotential) + progress;
}

export interface FrozenLeagueEntry { readonly id: string; readonly kind: "specialist" | "scripted-meta" | "random-meta" | "dagger" | "ppo";
  readonly digest: string }

/** A league is copied all the way down: training workers never receive a live champion array. */
export function freezeOpponentLeague(entries: readonly FrozenLeagueEntry[]): readonly Readonly<FrozenLeagueEntry>[] {
  const ids = new Set<string>();
  const frozen = entries.map((entry) => {
    if (!entry.id || !entry.digest || ids.has(entry.id)) throw new Error(`invalid or duplicate frozen league entry "${entry.id}"`);
    ids.add(entry.id); return Object.freeze({ ...entry });
  });
  return Object.freeze(frozen);
}

export function indexedLeagueOpponent(league: readonly FrozenLeagueEntry[], seed: number, jobIndex: number): FrozenLeagueEntry {
  if (!league.length) throw new Error("opponent league is empty");
  if (!Number.isSafeInteger(jobIndex) || jobIndex < 0) throw new Error(`invalid league job index ${jobIndex}`);
  let mixed = (seed ^ Math.imul(jobIndex + 1, 0x9e3779b1)) >>> 0;
  mixed = (mixed ^ (mixed >>> 16)) >>> 0; return league[mixed % league.length] as FrozenLeagueEntry;
}

export type PpoInitialization = "random" | "dagger";
export interface PpoArmJob { readonly index: number; readonly seed: number; readonly initialization: PpoInitialization;
  readonly solverSteps: number }
export function equalBudgetPpoArms(seed: number, solverSteps: number): readonly PpoArmJob[] {
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(solverSteps) || solverSteps <= 0) throw new Error("invalid PPO arm budget");
  return Object.freeze((["random", "dagger"] as const).map((initialization, index) =>
    Object.freeze({ index, seed, initialization, solverSteps })));
}

export interface PpoOptimizerState { readonly update: number; readonly firstMoment: readonly number[];
  readonly secondMoment: readonly number[]; readonly consumedSolverSteps: number }
export function encodePpoResume(weights: readonly number[], optimizer: PpoOptimizerState, rows: readonly unknown[]): Uint8Array {
  const finite = [...weights, ...optimizer.firstMoment, ...optimizer.secondMoment];
  if (finite.some((value) => !Number.isFinite(value)) || !Number.isSafeInteger(optimizer.update) || optimizer.update < 0 ||
      !Number.isSafeInteger(optimizer.consumedSolverSteps) || optimizer.consumedSolverSteps < 0) throw new Error("invalid PPO resume state");
  const stable = (value: unknown): string => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
  };
  return new TextEncoder().encode(stable({ optimizer, rows, weights }));
}

export function selectPpoArm(rows: readonly { readonly split: string; readonly arm: PpoInitialization;
  readonly macro: number; readonly worstCell: number }[]): PpoInitialization {
  if (rows.some((row) => row.split === "test")) throw new Error("PPO arm selection cannot read test rows");
  const validation = rows.filter((row) => row.split === "validation");
  if (!validation.length) throw new Error("PPO arm selection requires validation rows");
  return [...validation].sort((a, b) => b.worstCell - a.worstCell || b.macro - a.macro || a.arm.localeCompare(b.arm))[0]!.arm;
}

export interface PpoHeadLayer { readonly rows: number; readonly columns: number; weights: number[]; bias: number[] }

/**
 * The categorical heads PPO trains, in output-contract order.
 *
 * **Five, and every size, offset and divisor below is derived from this array
 * rather than written beside it.** The entropy report was `entropy /
 * (rows.length * 2)` -- the head count spelled as a literal, correct for exactly
 * as long as `headGradient` was called twice per row -- and the only assertion
 * on it anywhere in the tree was `report.entropy > 0`, which any positive
 * divisor satisfies. Adding three heads without moving the 2 would have reported
 * two and a half times the mean per-head entropy under a name that says
 * otherwise, and nothing would have gone red.
 *
 * **Persistence is deliberately not here, and PPO therefore produces 25 of the
 * 26 outputs.** It is a *continuous* action: a Gaussian or Beta head with a
 * different log-probability in the importance ratio, a different entropy term
 * and a different clipping story. That is an algorithm change wearing a contract
 * change's clothes, and PPO emits a *label* rather than a raw 26-vector, so the
 * width contract does not bind it. The constant is `UNLEARNED_PERSISTENCE` in
 * `meta.ts`, which `train-ppo.mjs` reads at both its decode sites and which
 * `lookahead.ts` and `train-lookahead.mjs` import as well.
 *
 * **This said it lived in `deployment.ts` and that the two look-ahead files still
 * spelled `0.4` out, and all three claims went stale in the commit after they were
 * written.** Stage C2c moved it down to `meta.ts` -- `deployment.ts` imports
 * `lookaheadMind`, so importing back would have been a cycle -- and pointed both
 * look-ahead files at it. `ppo.ts` was not in that diff, which is how a comment
 * describing three other files came to be wrong about all three: a note about where
 * somebody *else* keeps a constant is a note with no test.
 *
 * The artifact records `producedOutputs: 25` beside its provenance so a reader of
 * the artifact does not have to know any of that.
 */
export const PPO_POLICY_HEADS = Object.freeze(["movement", "action", "effector", "target", "stance"] as const);
export type PpoPolicyHeadName = typeof PPO_POLICY_HEADS[number];

export interface PpoTrainableHeads extends Record<PpoPolicyHeadName, PpoHeadLayer> { value: PpoHeadLayer }
export interface PpoTrainableNetwork extends PpoTrainableHeads {
  update?: PpoHeadLayer; reset?: PpoHeadLayer; candidate?: PpoHeadLayer;
}
/**
 * One option boundary: what was sampled from each head, what it was legal to
 * sample, and what it cost.
 *
 * **The value regression target is `valueTarget` and used to be `target`.** That
 * name is standard RL and it collided head-on with the aim head the moment there
 * was one: `row.target` would have meant "the value to regress toward" beside
 * `row.targetSupported` meaning "the aim indices that were legal". Renamed here
 * rather than spelling the aim head something it is not called anywhere else in
 * the contract.
 */
export interface PpoPolicyBoundary {
  readonly input?: readonly number[]; readonly previousHidden?: readonly number[];
  readonly hidden: readonly number[];
  readonly movement: number; readonly action: number; readonly effector: number;
  readonly target: number; readonly stance: number;
  readonly movementSupported: readonly number[]; readonly actionSupported: readonly number[];
  readonly effectorSupported: readonly number[]; readonly targetSupported: readonly number[];
  readonly stanceSupported: readonly number[];
  readonly oldMovementProbability: number; readonly oldActionProbability: number;
  readonly oldEffectorProbability: number; readonly oldTargetProbability: number;
  readonly oldStanceProbability: number;
  readonly oldValue: number; readonly valueTarget: number; readonly advantage: number;
}
/** What one head contributed to one boundary, read by name so a typo is a compile error. */
const HEAD_SAMPLE: Readonly<Record<PpoPolicyHeadName, (row: PpoPolicyBoundary) =>
Readonly<{ index: number; supported: readonly number[]; oldProbability: number }>>> = Object.freeze({
  movement: (row) => ({ index: row.movement, supported: row.movementSupported, oldProbability: row.oldMovementProbability }),
  action: (row) => ({ index: row.action, supported: row.actionSupported, oldProbability: row.oldActionProbability }),
  effector: (row) => ({ index: row.effector, supported: row.effectorSupported, oldProbability: row.oldEffectorProbability }),
  target: (row) => ({ index: row.target, supported: row.targetSupported, oldProbability: row.oldTargetProbability }),
  stance: (row) => ({ index: row.stance, supported: row.stanceSupported, oldProbability: row.oldStanceProbability }),
});
export interface PpoUpdateReport { readonly policyLoss: number; readonly valueLoss: number;
  readonly entropy: number; readonly recurrentGradientNorm: number;
  readonly unclippedGradientNorm: number; readonly clippedGradientNorm: number }

const distribution = (layer: PpoHeadLayer, hidden: readonly number[], supported: readonly number[]): number[] => {
  const logits = Array(layer.rows).fill(Number.NEGATIVE_INFINITY);
  for (const row of supported) { let value = layer.bias[row] as number;
    for (let column = 0; column < layer.columns; column += 1) value += (layer.weights[row * layer.columns + column] as number) * (hidden[column] as number);
    logits[row] = value; }
  const peak = Math.max(...supported.map((index) => logits[index] as number)); const masses = logits.map((value) => Math.exp(value - peak));
  const total = supported.reduce((sum, index) => sum + (masses[index] as number), 0);
  return masses.map((mass, index) => supported.includes(index) ? mass / total : 0);
};

/** One deterministic PPO epoch over the trainable policy/value heads. */
export function ppoHeadUpdate(heads: PpoTrainableNetwork, rows: readonly PpoPolicyBoundary[], seed: number,
  learningRate = 0.002, epsilon = 0.2, valueEpsilon = 0.2, entropyCoefficient = 0.01,
  gradientMaximum = 0.5): PpoUpdateReport {
  if (!rows.length) throw new Error("PPO update needs at least one option-boundary row");
  // Sizes and offsets accumulated over `PPO_POLICY_HEADS` rather than named one
  // by one: the two `offset` arguments, the value offset and the final descent
  // loop were four separate places that had to agree about the buffer's layout,
  // and three of them spelled it as arithmetic on two head sizes.
  const policyLayers = PPO_POLICY_HEADS.map((name) => heads[name]);
  const offsets: number[] = []; let cursor = 0;
  for (const layer of policyLayers) { offsets.push(cursor); cursor += layer.weights.length + layer.bias.length; }
  const valueOffset = cursor;
  const valueSize = heads.value.weights.length + heads.value.bias.length;
  const gradient = Array(valueOffset + valueSize).fill(0);
  const hiddenGradient = rows.map((row) => Array(row.hidden.length).fill(0));
  let policyLoss = 0; let valueLoss = 0; let entropy = 0;
  const headGradient = (layer: PpoHeadLayer, probabilities: readonly number[], supported: readonly number[], selected: number,
    oldProbability: number, advantage: number, offset: number): void => {
    const probability = probabilities[selected] as number; const ratio = probability / oldProbability;
    const clipped = Math.max(1 - epsilon, Math.min(1 + epsilon, ratio)); const usePolicyGradient = ratio * advantage <= clipped * advantage;
    policyLoss -= Math.min(ratio * advantage, clipped * advantage);
    const headEntropy = -supported.reduce((sum, index) => sum + (probabilities[index] as number) * Math.log(Math.max(1e-12, probabilities[index] as number)), 0);
    entropy += headEntropy;
    for (const output of supported) {
      const probabilityOutput = probabilities[output] as number;
      const policyDerivative = usePolicyGradient ? -advantage * ratio * ((output === selected ? 1 : 0) - probabilityOutput) : 0;
      const entropyDerivative = entropyCoefficient * probabilityOutput * (Math.log(Math.max(1e-12, probabilityOutput)) + headEntropy);
      const derivative = policyDerivative + entropyDerivative;
      const weightOffset = offset + output * layer.columns;
      for (let column = 0; column < layer.columns; column += 1) {
        gradient[weightOffset + column] += derivative * (rows[currentRow]!.hidden[column] as number);
        hiddenGradient[currentRow]![column] += derivative * (layer.weights[output * layer.columns + column] as number);
      }
      gradient[offset + layer.weights.length + output] += derivative;
    }
  };
  let currentRow = 0;
  for (const index of deterministicMinibatchOrder(rows.length, seed)) {
    currentRow = index; const row = rows[index] as PpoPolicyBoundary;
    PPO_POLICY_HEADS.forEach((name, head) => {
      const layer = heads[name]; const sample = HEAD_SAMPLE[name](row);
      const probabilities = distribution(layer, row.hidden, sample.supported);
      headGradient(layer, probabilities, sample.supported, sample.index, sample.oldProbability, row.advantage, offsets[head] as number);
    });
    let prediction = heads.value.bias[0] as number;
    for (let column = 0; column < heads.value.columns; column += 1) prediction += (heads.value.weights[column] as number) * (row.hidden[column] as number);
    const clippedPrediction = row.oldValue + Math.max(-valueEpsilon, Math.min(valueEpsilon, prediction - row.oldValue));
    const rawLoss = 0.5 * (prediction - row.valueTarget) ** 2; const clippedLoss = 0.5 * (clippedPrediction - row.valueTarget) ** 2;
    valueLoss += Math.max(rawLoss, clippedLoss); const derivative = rawLoss >= clippedLoss ? prediction - row.valueTarget :
      Math.abs(prediction - row.oldValue) <= valueEpsilon ? clippedPrediction - row.valueTarget : 0;
    for (let column = 0; column < heads.value.columns; column += 1) gradient[valueOffset + column] += derivative * (row.hidden[column] as number);
    for (let column = 0; column < heads.value.columns; column += 1) hiddenGradient[index]![column] +=
      derivative * (heads.value.weights[column] as number);
    gradient[valueOffset + heads.value.weights.length] += derivative;
  }
  const recurrentLayers = heads.update && heads.reset && heads.candidate ?
    [heads.update, heads.reset, heads.candidate] as const : null;
  const recurrentGradient = recurrentLayers ? recurrentLayers.map((layer) =>
    Array(layer.weights.length + layer.bias.length).fill(0)) : [];
  if (recurrentLayers) {
    if (rows.some((row) => !row.input || !row.previousHidden)) throw new Error("recurrent PPO rows require input and previousHidden");
    const units = rows[0]!.hidden.length; const truncate = 16;
    for (let chunkEnd = rows.length; chunkEnd > 0; chunkEnd -= truncate) {
      const chunkStart = Math.max(0, chunkEnd - truncate); let nextHiddenGradient = Array(units).fill(0);
      for (let index = chunkEnd - 1; index >= chunkStart; index -= 1) {
        const row = rows[index]!; const input = row.input!; const previous = row.previousHidden!; const joined = [...input, ...previous];
        const denseGate = (layer: PpoHeadLayer, values: readonly number[]) => Array.from({ length: layer.rows }, (_, output) =>
          (layer.bias[output] as number) + values.reduce((sum, value, column) =>
            sum + value * (layer.weights[output * layer.columns + column] as number), 0));
        const update = denseGate(heads.update!, joined).map((value) => 1 / (1 + Math.exp(-Math.max(-60, Math.min(60, value)))));
        const reset = denseGate(heads.reset!, joined).map((value) => 1 / (1 + Math.exp(-Math.max(-60, Math.min(60, value)))));
        const candidateInput = [...input, ...previous.map((value, unit) => value * (reset[unit] as number))];
        const candidate = denseGate(heads.candidate!, candidateInput).map(Math.tanh);
        const dh = hiddenGradient[index]!.map((value, unit) => value + (nextHiddenGradient[unit] as number));
        const daCandidate = dh.map((value, unit) => value * (update[unit] as number) * (1 - (candidate[unit] as number) ** 2));
        const daUpdate = dh.map((value, unit) => value * ((candidate[unit] as number) - (previous[unit] as number)) *
          (update[unit] as number) * (1 - (update[unit] as number)));
        const candidateInputGradient = Array(candidateInput.length).fill(0); const joinedGradient = Array(joined.length).fill(0);
        const accumulate = (layer: PpoHeadLayer, layerGradient: number[], activationGradient: readonly number[], values: readonly number[],
          inputGradient: number[]) => activationGradient.forEach((derivative, output) => {
            for (let column = 0; column < layer.columns; column += 1) {
              layerGradient[output * layer.columns + column] += derivative * (values[column] as number);
              inputGradient[column] += derivative * (layer.weights[output * layer.columns + column] as number);
            }
            layerGradient[layer.weights.length + output] += derivative;
          });
        accumulate(heads.candidate!, recurrentGradient[2]!, daCandidate, candidateInput, candidateInputGradient);
        const daReset = previous.map((value, unit) => (candidateInputGradient[input.length + unit] as number) * value *
          (reset[unit] as number) * (1 - (reset[unit] as number)));
        accumulate(heads.reset!, recurrentGradient[1]!, daReset, joined, joinedGradient);
        accumulate(heads.update!, recurrentGradient[0]!, daUpdate, joined, joinedGradient);
        nextHiddenGradient = previous.map((_, unit) => dh[unit]! * (1 - (update[unit] as number)) +
          (candidateInputGradient[input.length + unit] as number) * (reset[unit] as number) +
          (joinedGradient[input.length + unit] as number));
      }
    }
  }
  const scale = 1 / rows.length; const recurrentAveraged = recurrentGradient.flat().map((value) => value * scale);
  const averaged = [...recurrentAveraged, ...gradient.map((value) => value * scale)];
  const recurrentGradientNorm = Math.hypot(...recurrentAveraged); const unclippedGradientNorm = Math.hypot(...averaged);
  const clippedGradient = clipGradientNorm(averaged, gradientMaximum); let at = 0;
  if (recurrentLayers) for (const layer of recurrentLayers) {
    layer.weights = layer.weights.map((value) => value - learningRate * (clippedGradient[at++] as number));
    layer.bias = layer.bias.map((value) => value - learningRate * (clippedGradient[at++] as number));
  }
  for (const layer of [...policyLayers, heads.value]) {
    layer.weights = layer.weights.map((value) => value - learningRate * (clippedGradient[at++] as number));
    layer.bias = layer.bias.map((value) => value - learningRate * (clippedGradient[at++] as number));
  }
  // `PPO_POLICY_HEADS.length` is exactly the number of `headGradient` calls per
  // row, which is what makes this the *mean per-head* entropy the field name
  // claims. It was a literal `2`.
  return Object.freeze({ policyLoss: policyLoss / rows.length, valueLoss: valueLoss / rows.length,
    entropy: entropy / (rows.length * PPO_POLICY_HEADS.length), recurrentGradientNorm,
    unclippedGradientNorm, clippedGradientNorm: Math.hypot(...clippedGradient) });
}

export function decodePpoResume(bytes: Uint8Array): Readonly<{ weights: readonly number[]; optimizer: PpoOptimizerState; rows: readonly unknown[] }> {
  let parsed: unknown; try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch (error) { throw new Error("PPO resume is not valid UTF-8 JSON", { cause: error }); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("PPO resume root must be an object");
  const state = parsed as { weights?: unknown; optimizer?: unknown; rows?: unknown };
  if (!Array.isArray(state.weights) || !state.optimizer || typeof state.optimizer !== "object" || !Array.isArray(state.rows)) {
    throw new Error("PPO resume is missing weights, optimizer or report rows");
  }
  const optimizer = state.optimizer as PpoOptimizerState;
  encodePpoResume(state.weights as number[], optimizer, state.rows);
  return Object.freeze({ weights: Object.freeze([...(state.weights as number[])]), optimizer: Object.freeze({ ...optimizer,
    firstMoment: Object.freeze([...optimizer.firstMoment]), secondMoment: Object.freeze([...optimizer.secondMoment]) }), rows: Object.freeze([...state.rows]) });
}
