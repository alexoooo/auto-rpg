import { readFile, rename, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

import { FEATURE_COLUMNS } from "../src/learning/features.ts";
import { CONFIG } from "../src/config.ts";
import { ResearchArtifact, artifactChecksum, canonicalDigest, canonicalJson } from "../src/learning/artifact.ts";
import { GRU_UNITS, RecurrentPolicy, maskedCategorical, seededRandom } from "../src/learning/recurrent-network.ts";
import { META_OUTPUT_LAYOUT, PERSISTENCE_SECONDS } from "../src/learning/meta.ts";
import { decodePpoResume, encodePpoResume, equalBudgetPpoArms, freezeOpponentLeague, generalizedAdvantages,
  indexedLeagueOpponent, ppoHeadUpdate, PPO_GAMMA_PER_SECOND, PPO_POLICY_HEADS, PPO_TRACE_LAMBDA,
  PPO_ROLLOUT_BUNDLE_SIZE, PPO_TRAINING_SEMANTICS_VERSION, selectPpoArm, tacticalBoundaryReward } from "../src/learning/ppo.ts";
import { researchMatrix } from "../src/learning/research-matrix.ts";
import { researchLabelMind } from "../src/learning/research-policy.ts";
import { predictDagger } from "../src/learning/dagger.ts";
import { argmaxHeadPick, decodeResearchArtifact, inProgressResearchArtifact, recurrentTactic,
  refuseInProgressResearchRegistration,
  RESEARCH_ARTIFACT_CONTRACT } from "../src/learning/deployment.ts";
import { EFFECTOR_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, STANCE_NAMES, TARGET_NAMES } from "../src/options.ts";
import { ENGAGEMENT_INSTRUMENT_VERSION } from "../src/recorder.ts";
import { runResearchBout } from "./research-havok.mjs";
import { checkpointJobDue, checkpointRun, DEFAULT_PLATEAU_EPSILON, DEFAULT_PLATEAU_ROWS, digestContract, engagementGates,
  finalizeRun, ledgerStopDecision, makeLedgerRow, readLedger, refuseFinalizedResume } from "./research-ledger.mjs";
import { BALANCE_CONFIG_DIGEST, contractDigestArgument, FROZEN_RESEARCH_CONTRACT_DIGEST,
  refuseStaleResearchResume, requiredResearchContractDigest } from "./research-preflight.mjs";

const layer = (rows, columns, random, scale = 0.08) => ({ rows, columns,
  weights: Array.from({ length: rows * columns }, () => (random() * 2 - 1) * scale), bias: Array(rows).fill(0) });
/**
 * Two counts per head, and separating them is not tidiness.
 *
 * `HEAD_LOGITS` is how many rows a head's matrix owes the runtime.
 * `HEAD_CONTRACT_SLOTS` is how much of the 26-wide output contract that head
 * decides. For the five categorical-over-a-name-table heads the two are the same
 * number, because a categorical over n names occupies n contract outputs -- and
 * that coincidence is exactly why one table was enough to record
 * `producedOutputs: 25` correctly for as long as there were five heads.
 *
 * **The persistence head breaks it: eight logits, one contract slot.** Summing
 * `HEAD_LOGITS` over `PPO_POLICY_HEADS` now answers **33**, and an artifact
 * recording 33 of 26 would look every bit as derived-from-the-frozen-tables as
 * 25 of 26 did. `an_artifact_counts_contract_slots_rather_than_logits` is what
 * would notice, and it asserts both numbers so a session that collapses these
 * two tables back into one is told which one it broke.
 */
const HEAD_LOGITS = { movement: MOVEMENT_NAMES.length, action: HAND_ACTION_NAMES.length,
  effector: EFFECTOR_NAMES.length, target: TARGET_NAMES.length, stance: STANCE_NAMES.length,
  persistence: PERSISTENCE_SECONDS.length };
const HEAD_CONTRACT_SLOTS = { movement: MOVEMENT_NAMES.length, action: HAND_ACTION_NAMES.length,
  effector: EFFECTOR_NAMES.length, target: TARGET_NAMES.length, stance: STANCE_NAMES.length,
  persistence: 1 };
export const PPO_PRODUCED_OUTPUTS = PPO_POLICY_HEADS.reduce((sum, name) => sum + HEAD_CONTRACT_SLOTS[name], 0);
export const PPO_PRODUCED_LOGITS = PPO_POLICY_HEADS.reduce((sum, name) => sum + HEAD_LOGITS[name], 0);
export { PPO_ROLLOUT_BUNDLE_SIZE, PPO_TRAINING_SEMANTICS_VERSION };
export function initialPpoWeights(seed, initialization) {
  const random = seededRandom(seed ^ (initialization === "dagger" ? 0xda66e2 : 0x51f15e));
  const inputSize = FEATURE_COLUMNS.length; const combined = inputSize + GRU_UNITS;
  const result = { inputSize, units: GRU_UNITS, update: layer(GRU_UNITS, combined, random),
    reset: layer(GRU_UNITS, combined, random), candidate: layer(GRU_UNITS, combined, random),
    ...Object.fromEntries(PPO_POLICY_HEADS.map((name) => [name, layer(HEAD_LOGITS[name], GRU_UNITS, random)])),
    value: layer(1, GRU_UNITS, random) };
  // The DAgger arm is a frozen, deterministic distillation prior, not a live
  // teacher. It biases `hold`, `cut` and `thrust`, and deliberately biases none
  // of the three new heads: the teacher's own aim is `vital` for every action it
  // can emit, so a prior on the target head would be a prior toward the one
  // constant this stage is trying to find out whether the network moves off.
  if (initialization === "dagger") { result.movement.bias[0] = 0.35; result.action.bias[1] = 0.25; result.action.bias[2] = 0.2; }
  return result;
}

export const PPO_LEAGUE = freezeOpponentLeague([
  { id: "shipped:specialist", kind: "specialist", digest: "shipped-specialist-v1" },
  { id: "shipped:scripted-meta", kind: "scripted-meta", digest: "scripted-meta-v1" },
  { id: "shipped:random-meta", kind: "random-meta", digest: "random-meta-v1" },
]);

/** Learned league entries must carry a decoded controller. Silently substituting the specialist changes the experiment. */
export function opponentRoute(opponent, controllers = new Map()) {
  if (opponent.kind === "dagger" || opponent.kind === "ppo") {
    const controller = controllers.get(opponent.id);
    if (!controller) throw new Error(`frozen league opponent "${opponent.id}" has no decoded champion artifact`);
    return { opponent: "specialist", controller };
  }
  return { opponent: opponent.kind, controller: null };
}

/** Rebuild cloneable learned league payloads into the exact controller factories used in-process. */
export function leagueControllers(models) {
  return new Map(models.map(({ id, algorithm, payload }) => [id, algorithm === "dagger" ? () => researchLabelMind(id,
    (_view, features) => predictDagger(payload, features)) : () => {
      const policy = new RecurrentPolicy(payload.weights); return researchLabelMind(id, (view, features) => {
        const tactic = recurrentTactic(view, policy.step(features), argmaxHeadPick);
        return { movement: tactic.movement, action: tactic.action, effector: tactic.effector,
          target: tactic.target, stance: tactic.stance, persistence: tactic.persistenceSeconds };
      });
    }]));
}

export async function loadLeagueArtifacts(paths) {
  const loaded = [];
  for (const path of paths) {
    const bytes = new Uint8Array(await readFile(resolve(path))); const artifact = ResearchArtifact.fromBytes(bytes, RESEARCH_ARTIFACT_CONTRACT);
    refuseInProgressResearchRegistration(artifact, "league registration");
    if (artifact.data.algorithm !== "dagger" && artifact.data.algorithm !== "ppo") {
      throw new Error(`league artifact "${path}" uses ${artifact.data.algorithm}, expected dagger or ppo`);
    }
    let payload; try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(artifact.data.payload))); }
    catch (error) { throw new Error(`league artifact "${path}" has invalid model payload`, { cause: error }); }
    const digest = artifactChecksum(new TextDecoder().decode(bytes)); const id = `${artifact.data.algorithm}:${digest}`;
    loaded.push({ entry: { id, kind: artifact.data.algorithm, digest },
      model: { id, algorithm: artifact.data.algorithm, payload } });
  }
  const dagger = loaded.filter(({ entry }) => entry.kind === "dagger"); const ppo = loaded.filter(({ entry }) => entry.kind === "ppo").slice(-4);
  const retained = [...dagger, ...ppo]; const models = retained.map(({ model }) => model);
  return { league: freezeOpponentLeague([...PPO_LEAGUE, ...retained.map(({ entry }) => entry)]),
    controllers: leagueControllers(models), models };
}

// The resume encoding's flat vector, in exactly `ppoHeadUpdate`'s buffer order:
// every policy head's weights then bias, then the value head's. Derived from
// `PPO_POLICY_HEADS` for the reason that array's own note gives -- it was three
// hand-written pairs, which is three chances to disagree with the descent loop
// about a layout neither of them names.
export const flattenHeads = (weights) => [...PPO_POLICY_HEADS, "value"]
  .flatMap((name) => [...weights[name].weights, ...weights[name].bias]);

/** One deterministic actual-Havok trajectory; returns are emitted only at tactic boundaries. */
export async function collectPpoTrajectory({ seed, initialization, solverSteps, jobIndex = 0, weights = null,
  league = PPO_LEAGUE, controllers = new Map(), split = "train" }) {
  weights = weights ?? initialPpoWeights(seed, initialization); const policy = new RecurrentPolicy(weights); const random = seededRandom(seed ^ jobIndex);
  const boundaries = []; let previous = null;
  const mind = researchLabelMind(`ppo-${initialization}`, (view, features) => {
    if (previous) {
      previous.endVitalityPotential = view.self.vitality - view.opponent.vitality;
      previous.nearRangeProgress = Math.max(-0.2, Math.min(0.2, previous.measure - view.measure));
      // **The dwell that happened, never the dwell that was asked for.**
      // `researchLabelMind` re-decides at `min(persistence, the skill
      // finishing)`, so the requested number is an upper bound the bout mostly
      // does not reach -- measured, a 0.80 s request buys 0.34 s of mean dwell
      // and only 4.4 % of boundaries end on the timer. Discounting by the
      // request would be discounting by an intention.
      previous.durationSeconds = view.clock - previous.startClock; boundaries.push(previous);
    }
    // **The mask a trajectory is collected under is the mask it will be deployed
    // under, and this line was the seventh copy where it was not.** It read bare
    // `supportedOptions` -- without even the cover delete the league branch
    // above kept -- while `deployment.ts`'s PPO branch argmaxes through
    // `deployableActions`. That is the train/deploy split C1 closed for the
    // action half; C2b closes the rest by sampling through the same
    // `recurrentTactic` the deployment branch argmaxes through, so the only
    // difference between the two is the picker handed in.
    //
    // The masks are **conditioned in contract order** -- the effector's on the
    // action that was just sampled, the aim's on the same -- so the tuple is a
    // member of `deployableTactics` by construction and the `supported` lists
    // stored below are the exact conditionals `ppoHeadUpdate` renormalizes over.
    const previousHidden = policy.snapshot(); const step = policy.step(features);
    const tactic = recurrentTactic(view, step, (logits, supported, label) =>
      maskedCategorical(logits, supported, random(), label));
    previous = { startVitalityPotential: view.self.vitality - view.opponent.vitality, endVitalityPotential: 0,
      nearRangeProgress: 0, terminal: 0, measure: view.measure, value: step.value,
      startClock: view.clock, durationSeconds: 0,
      oldValue: step.value, hidden: step.hidden, input: [...features], previousHidden,
      ...Object.fromEntries(PPO_POLICY_HEADS.flatMap((name) => [[name, tactic.indices[name]],
        [`${name}Supported`, [...tactic.supported[name]]],
        [`old${name[0].toUpperCase()}${name.slice(1)}Probability`, tactic.probabilities[name]]])) };
    return { movement: tactic.movement, action: tactic.action, effector: tactic.effector,
      target: tactic.target, stance: tactic.stance, persistence: tactic.persistenceSeconds };
  });
  const matrixJob = researchMatrix(split, seed)[jobIndex % researchMatrix(split, seed).length];
  const opponent = indexedLeagueOpponent(league, seed, jobIndex); const route = opponentRoute(opponent, controllers);
  const result = await runResearchBout({ ...matrixJob, index: jobIndex,
    opponent: route.opponent }, () => mind, solverSteps, route.controller);
  if (previous) { previous.endVitalityPotential = result.lastPublished ?
      result.lastPublished.selfVitality - result.lastPublished.opponentVitality : previous.startVitalityPotential;
    // `lastClock` is the last view the bout published, so the final boundary is
    // closed against the same clock every other boundary is. It can be zero
    // long: the last decision may land on that very sample.
    previous.durationSeconds = Math.max(0, result.lastClock - previous.startClock);
    previous.terminal = result.result.winner === null ? 0 : (result.result.winner === matrixJob.actorSide ? 1 : -1); boundaries.push(previous); }
  const rewards = boundaries.map((boundary) => tacticalBoundaryReward(boundary));
  // Per **second**, not per boundary, and the two coincided for exactly as long
  // as every boundary was `UNLEARNED_PERSISTENCE` long. `generalizedAdvantages`
  // carries the measurement of what a flat gamma pays a persistence head for.
  const advantages = generalizedAdvantages(boundaries.map((boundary, index) => ({ reward: rewards[index], value: boundary.value,
    nextValue: boundaries[index + 1]?.value ?? 0, terminal: index === boundaries.length - 1,
    durationSeconds: boundary.durationSeconds })), PPO_GAMMA_PER_SECOND, PPO_TRACE_LAMBDA);
  return { result, weights, boundaries, rewards, advantages, opponent: { ...opponent } };
}

/** A fixed graph: worker count may schedule these budgets, never choose them. */
export function ppoRolloutBundle(solverSteps, rowIndex) {
  if (!Number.isSafeInteger(solverSteps) || solverSteps < 4 || solverSteps % 4 ||
      !Number.isSafeInteger(rowIndex) || rowIndex < 0) throw new Error("invalid PPO rollout bundle request");
  // Below eight quanta there is no eight-way graph to expose. Keeping that tail
  // as one job also preserves the exact small-budget resume fixtures used to
  // test the trainer. At and above eight quanta, the bundle is always eight --
  // it does not contract to the requested worker count.
  const count = solverSteps < PPO_ROLLOUT_BUNDLE_SIZE * 4 ? 1 : PPO_ROLLOUT_BUNDLE_SIZE;
  const quanta = solverSteps / 4; const base = Math.floor(quanta / count); const extra = quanta % count;
  return Object.freeze(Array.from({ length: count }, (_, shard) => Object.freeze({
    shard, solverSteps: (base + (shard < extra ? 1 : 0)) * 4,
    jobIndex: rowIndex * PPO_ROLLOUT_BUNDLE_SIZE + shard,
  })));
}

const mergeEngagement = (trajectories) => {
  const records = trajectories.map(({ result }) => result.engagement).filter(Boolean);
  if (!records.length) return null;
  return { viableOpportunities: records.reduce((sum, row) => sum + row.viableOpportunities, 0),
    attacksInWindow: records.reduce((sum, row) => sum + row.attacksInWindow, 0),
    damagingContactsInWindow: records.reduce((sum, row) => sum + row.damagingContactsInWindow, 0),
    nearRangeStallSeconds: records.reduce((sum, row) => sum + row.nearRangeStallSeconds, 0),
    firstAttackSeconds: records.map((row) => row.firstAttackSeconds) };
};

export async function collectPpoBundle(collectTrajectory, request) {
  const jobs = ppoRolloutBundle(request.solverSteps, request.jobIndex);
  const trajectories = await Promise.all(jobs.map((job) => collectTrajectory({ ...request, ...job })));
  // Promise order is input order, not completion order. Every concatenated
  // gradient row and every report field therefore has the fixed shard order.
  // Each shard is a separately reset recurrent episode. Preserve that seam in
  // the ordered row stream so truncated BPTT cannot train through it.
  const boundaries = trajectories.flatMap((row) => row.boundaries.map((boundary, index) =>
    index === 0 ? { ...boundary, episodeStart: true } : boundary));
  return { result: { ...trajectories.at(-1).result,
      solverSteps: trajectories.reduce((sum, row) => sum + row.result.solverSteps, 0),
      result: { ...trajectories.at(-1).result.result,
        seconds: trajectories.reduce((sum, row) => sum + row.result.result.seconds, 0) },
      engagement: mergeEngagement(trajectories) },
    weights: request.weights, boundaries, rewards: trajectories.flatMap((row) => row.rewards),
    advantages: trajectories.flatMap((row) => row.advantages),
    opponent: trajectories.length === 1 ? trajectories[0].opponent : trajectories.map((row) => row.opponent),
    rolloutJobs: jobs };
}

export class PpoRolloutPool {
  constructor(size, models, workerUrl = new URL("./ppo-rollout-worker.mjs", import.meta.url)) {
    this.next = 0; this.queue = []; this.failed = null; this.closing = false;
    this.workers = Array.from({ length: size }, () => {
      const worker = new Worker(workerUrl, { workerData: { models } });
      const slot = { worker, ready: false, busy: false };
      worker.on("message", (message) => {
        if (this.failed || this.closing) return;
        if (message.ready) { slot.ready = true; this.dispatch(); return; }
        const pending = slot.pending; slot.pending = null; slot.busy = false;
        if (!pending) { this.fail(new Error("PPO rollout worker sent a result with no pending job")); return; }
        if (message.error) pending.reject(new Error(message.error)); else pending.resolve(message.value);
        this.dispatch();
      });
      worker.on("error", (error) => this.fail(error));
      // Exit 0 without a result is not success. The NEAT/DAgger worker trap in
      // AGENTS.md applies here too, and aborting the whole pool is safer than
      // silently rescheduling a job whose solver-side effects are unknown.
      worker.on("exit", (code) => { if (!this.closing) this.fail(new Error(`PPO rollout worker exited ${code} before pool shutdown`)); });
      return slot;
    });
  }
  fail(error) {
    if (this.failed || this.closing) return; this.failed = error;
    for (const slot of this.workers) { if (slot.pending) slot.pending.reject(error); slot.pending = null; slot.busy = false; }
    for (const pending of this.queue.splice(0)) pending.reject(error);
    this.closing = true;
    for (const { worker } of this.workers) void worker.terminate();
  }
  dispatch() {
    if (this.failed || this.closing) return;
    for (const slot of this.workers) if (slot.ready && !slot.busy && this.queue.length) {
      const pending = this.queue.shift(); slot.busy = true; slot.pending = pending;
      slot.worker.postMessage({ id: pending.id, request: pending.request });
    }
  }
  run(request) {
    if (this.failed) return Promise.reject(this.failed);
    if (this.closing) return Promise.reject(new Error("PPO rollout pool is closed"));
    return new Promise((resolve, reject) => { this.queue.push({ id: this.next++, request: { ...request, controllers: undefined }, resolve, reject }); this.dispatch(); });
  }
  async close() { this.closing = true; await Promise.all(this.workers.map(({ worker }) => worker.terminate())); }
}

/**
 * The rows `ppoHeadUpdate` descends on, lifted out of `trainPpo` so the value
 * head's regression target is a thing a test can read.
 *
 * **It was inline and nothing asserted it.** Replacing `row.oldValue + advantage`
 * with `row.oldValue` -- the value head told to predict what it already predicts,
 * so it learns nothing at all and `valueLoss` collapses toward zero -- left the
 * whole suite green. `the_value_head_regresses_the_advantage_corrected_return`
 * is what notices now.
 *
 * `oldValue + advantage` is the standard GAE value target and it is not the same
 * quantity it was before this change: the advantage is now a **time**-discounted
 * return over unevenly spaced boundaries, so the number the value head is asked
 * to predict has changed meaning even where its magnitude has not.
 * `valueEpsilon`'s 0.2 clip in `ppoHeadUpdate` is an absolute bound on how far a
 * prediction may move per update and was chosen against the old flat horizon; it
 * has **not** been re-derived against the longer one, and the register carries
 * that with the measured spread of `|valueTarget - oldValue|` beside it.
 */
export const ppoUpdateRows = (trajectory) => trajectory.boundaries.map((row, index) => ({ ...row,
  valueTarget: row.oldValue + (trajectory.advantages[index] ?? 0), advantage: trajectory.advantages[index] ?? 0 }));

const writeAtomic = async (path, bytes) => { const target = resolve(path); await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`; await writeFile(temporary, bytes); await rename(temporary, target); };

const snapshotPpoWeights = (weights) => ({ ...weights,
  ...Object.fromEntries(["update", "reset", "candidate", ...PPO_POLICY_HEADS, "value"].map((name) => [name,
    { ...weights[name], weights: [...weights[name].weights], bias: [...weights[name].bias] }])) });

/**
 * PPO spends an arm's ceiling through repeated collect-update-validation jobs.
 *
 * A research bout may end on death long before the requested limit. Passing the
 * whole remaining ceiling to one bout therefore cannot spend it; the caller has
 * to keep scheduling independently indexed bouts until their *actual* solver
 * steps add up to the ceiling. The split keeps four steps available for
 * validation, and the one-quantum tail is validation-only because another
 * collect-update-validation pair cannot honestly fit in it.
 */
export function ppoIterationBudget(remainingSolverSteps) {
  if (!Number.isSafeInteger(remainingSolverSteps) || remainingSolverSteps < 4 || remainingSolverSteps % 4) {
    throw new Error(`invalid PPO remaining arm budget ${remainingSolverSteps}`);
  }
  if (remainingSolverSteps === 4) return Object.freeze({ train: 0, validation: 4 });
  // The research matrix's largest bout is 45 seconds and the harness advances
  // 240 solver steps a second. Making that existing physical cap explicit here
  // guarantees a ceiling larger than one bout buys another gradient update even
  // when neither fighter dies early.
  const iterationSteps = Math.min(remainingSolverSteps, 2 * PPO_TRAJECTORY_SOLVER_STEP_CAP);
  const train = Math.max(4, Math.floor(iterationSteps / 8) * 4);
  return Object.freeze({ train, validation: iterationSteps - train });
}

const rowRank = (a, b) => b.macro - a.macro || a.index - b.index;
const resumeTrainingState = (armWeights, champions, identity) => ({
  engagementInstrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
  contractDigest: identity.contractDigest, configDigest: identity.configDigest,
  trainingSemanticsVersion: PPO_TRAINING_SEMANTICS_VERSION, rolloutBundleSize: PPO_ROLLOUT_BUNDLE_SIZE,
  armWeights: [...armWeights].sort(([a], [b]) => a - b).map(([armIndex, fullWeights]) =>
    ({ armIndex, fullWeights: snapshotPpoWeights(fullWeights) })),
  champions: [...champions.values()].sort((a, b) => a.armIndex - b.armIndex)
    .map((entry) => ({ ...entry, fullWeights: snapshotPpoWeights(entry.fullWeights) })) });

const researchBoutCaps = ["train", "validation"].flatMap((split) => researchMatrix(split, 0).map((job) => job.boutCapSeconds));
/** The actual largest matrix bout at the actual solver frequency used by `runResearchBout`. */
export const PPO_TRAJECTORY_SOLVER_STEP_CAP = Math.max(...researchBoutCaps) * CONFIG.world.physicsHz;
if (!Number.isSafeInteger(PPO_TRAJECTORY_SOLVER_STEP_CAP) || PPO_TRAJECTORY_SOLVER_STEP_CAP < 4 ||
    PPO_TRAJECTORY_SOLVER_STEP_CAP % 4) throw new Error("PPO research-matrix bout cap is not a solver-step quantum");

async function trainPpoCore(config, runtime) {
  if (!Number.isSafeInteger(config.solverSteps) || config.solverSteps < 8 || config.solverSteps % 4) {
    throw new Error("PPO per-arm budget must be at least eight solver steps and divisible by four");
  }
  if (config.runId !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(config.runId)) throw new Error("invalid PPO --run-id");
  const collectTrajectory = runtime.collectTrajectory ?? collectPpoTrajectory;
  const updateHeads = runtime.updateHeads ?? ppoHeadUpdate;
  const arms = equalBudgetPpoArms(config.seed, config.solverSteps); let rows = [];
  const champions = new Map(); const armWeights = new Map();
  const leagueDigest = artifactChecksum(canonicalJson(config.league ?? PPO_LEAGUE));
  const configDigest = canonicalDigest({ seed: config.seed, solverSteps: config.solverSteps,
    league: config.league ?? PPO_LEAGUE, engagementInstrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
    balanceConfigDigest: config.balanceConfigDigest ?? BALANCE_CONFIG_DIGEST,
    contractDigest: config.contractDigest,
    trainingSemanticsVersion: PPO_TRAINING_SEMANTICS_VERSION, rolloutBundleSize: PPO_ROLLOUT_BUNDLE_SIZE });
  if (config.resumeBytes) {
    const resumed = decodePpoResume(config.resumeBytes);
    rows = [...resumed.rows];
    if (rows.some((row, index) => row.index !== index || row.seed !== config.seed ||
        row.requestedSolverSteps !== config.solverSteps || row.leagueDigest !== leagueDigest ||
        row.runId !== (config.runId ?? null)))
      throw new Error("PPO resume does not match this seed, budget, or indexed arm prefix");
    const consumed = rows.reduce((sum, row) => sum + row.solverSteps, 0);
    if (consumed !== resumed.optimizer.consumedSolverSteps) throw new Error("PPO resume solver-step accounting does not match its rows");
    if (resumed.optimizer.update !== rows.filter((row) => row.update !== null).length) {
      throw new Error("PPO resume update accounting does not match its rows");
    }
    if (!resumed.training || typeof resumed.training !== "object" || Array.isArray(resumed.training) ||
        resumed.training.engagementInstrumentVersion !== ENGAGEMENT_INSTRUMENT_VERSION ||
        !Array.isArray(resumed.training.armWeights) || !Array.isArray(resumed.training.champions)) {
      throw new Error("PPO resume is missing or predates the current engagement instrument");
    }
    refuseStaleResearchResume("PPO", resumed.training.contractDigest, config.contractDigest);
    if (resumed.training.trainingSemanticsVersion !== PPO_TRAINING_SEMANTICS_VERSION ||
        resumed.training.rolloutBundleSize !== PPO_ROLLOUT_BUNDLE_SIZE) {
      throw new Error("PPO resume refused: training semantics version or rollout bundle size changed or is missing");
    }
    if (resumed.training.configDigest !== configDigest) throw new Error("PPO resume refused: config digest changed or is missing");
    for (const entry of resumed.training.armWeights) {
      if (!entry || !arms.some((arm) => arm.index === entry.armIndex) || !entry.fullWeights || armWeights.has(entry.armIndex)) {
        throw new Error("PPO resume has invalid per-arm weights");
      }
      armWeights.set(entry.armIndex, snapshotPpoWeights(entry.fullWeights));
    }
    for (const champion of resumed.training.champions) {
      if (!champion || !Number.isSafeInteger(champion.armIndex) || !Number.isSafeInteger(champion.rowIndex) ||
          !Number.isFinite(champion.macro) || !champion.fullWeights || champions.has(champion.armIndex)) {
        throw new Error("PPO resume has an invalid arm champion");
      }
      champions.set(champion.armIndex, { ...champion, fullWeights: snapshotPpoWeights(champion.fullWeights) });
    }
    const lastWeights = armWeights.get(rows.at(-1)?.armIndex);
    if (!lastWeights) throw new Error("PPO resume has no weights for its last indexed row");
    const activeFlat = flattenHeads(lastWeights);
    if (activeFlat.length !== resumed.weights.length || activeFlat.some((value, index) => value !== resumed.weights[index])) {
      throw new Error("PPO resume flat weights do not match its active network");
    }
    for (const arm of arms) {
      const armRows = rows.filter((row) => row.armIndex === arm.index);
      if (armRows.some((row, iteration) => row.initialization !== arm.initialization || row.iteration !== iteration)) {
        throw new Error("PPO resume does not match this seed, budget, or indexed arm prefix");
      }
      let armPrefix = 0;
      if (armRows.some((row) => { armPrefix += row.solverSteps; return row.armSolverSteps !== armPrefix; })) {
        throw new Error("PPO resume cumulative arm steps do not match its rows");
      }
      if (armRows.reduce((sum, row) => sum + row.solverSteps, 0) > arm.solverSteps) {
        throw new Error("PPO resume exceeds its per-arm solver-step ceiling");
      }
    }
    for (const arm of arms) if (!armWeights.has(arm.index)) throw new Error("PPO resume is missing one arm's active weights");
    for (const champion of champions.values()) {
      const row = rows[champion.rowIndex];
      if (!row || row.armIndex !== champion.armIndex || row.macro !== champion.macro) {
        throw new Error("PPO resume champion does not match its indexed row");
      }
    }
    if (!runtime.terminalStop && arms.every((arm) => rows.filter((row) => row.armIndex === arm.index)
        .reduce((sum, row) => sum + row.solverSteps, 0) === arm.solverSteps)) {
      throw new Error("PPO resume is already complete; refusing to spend the fixed budget twice");
    }
  } else for (const arm of arms) armWeights.set(arm.index, initialPpoWeights(arm.seed, arm.initialization));

  const armRows = arms.map((arm) => rows.filter((row) => row.armIndex === arm.index));
  const armConsumed = arms.map((arm) => armRows[arm.index].reduce((sum, row) => sum + row.solverSteps, 0));
  const resumeBytes = () => {
    const lastWeights = armWeights.get(rows.at(-1).armIndex); const flat = flattenHeads(lastWeights);
    const optimizer = { update: rows.filter((row) => row.update !== null).length,
      firstMoment: flat.map(() => 0), secondMoment: flat.map(() => 0),
      consumedSolverSteps: rows.reduce((sum, row) => sum + row.solverSteps, 0) };
    return { optimizer, bytes: encodePpoResume(flat, optimizer, rows,
      resumeTrainingState(armWeights, champions, { contractDigest: config.contractDigest, configDigest })) };
  };
  const selectedSoFar = () => {
    const selectedArm = selectPpoArm(rows.map((row) => ({ split: row.split, arm: row.initialization, macro: row.macro })));
    const selected = rows.filter((row) => row.initialization === selectedArm).sort(rowRank)[0];
    const champion = champions.get(selected.armIndex);
    if (!champion || champion.rowIndex !== selected.index) throw new Error("PPO selected row has no matching weight snapshot");
    return { selected, champion };
  };
  const artifactFor = (selected, champion) => {
    const payload = [...new TextEncoder().encode(canonicalJson({ initialization: selected.initialization, weights: champion.fullWeights }))];
    return new ResearchArtifact({ algorithm: "ppo", ...RESEARCH_ARTIFACT_CONTRACT, payload,
      provenance: { seed: config.seed, runId: config.runId ?? null, solverSteps: selected.armSolverSteps,
        selectedIteration: selected.iteration, trainingSplit: "train", validationSplit: "validation",
        configDigest, engagementInstrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
        producedOutputs: PPO_PRODUCED_OUTPUTS, producedLogits: PPO_PRODUCED_LOGITS,
        contractOutputs: META_OUTPUT_LAYOUT.width, persistenceSeconds: [...PERSISTENCE_SECONDS],
        gammaPerSecond: PPO_GAMMA_PER_SECOND, traceLambda: PPO_TRACE_LAMBDA,
        trainingSemanticsVersion: PPO_TRAINING_SEMANTICS_VERSION,
        rolloutBundleSize: PPO_ROLLOUT_BUNDLE_SIZE } }, RESEARCH_ARTIFACT_CONTRACT).toBytes();
  };

  if (runtime.terminalStop != null && !["stopped: plateau", "stopped: ceiling"].includes(runtime.terminalStop)) {
    throw new Error(`PPO terminal reconstruction received invalid stop reason "${runtime.terminalStop}"`);
  }
  let completedThisRun = 0; let stopped = runtime.terminalStop ?? null; let pendingStop = null;
  while (arms.some((arm) => armConsumed[arm.index] < arm.solverSteps) && !stopped) {
    // Resume may land between the two arms in a round. The shorter prefix goes
    // first so re-entry completes that round before starting another one.
    const scheduled = [...arms].sort((a, b) => armRows[a.index].length - armRows[b.index].length || a.index - b.index);
    for (const arm of scheduled) {
      if (armConsumed[arm.index] >= arm.solverSteps) continue;
      const weights = armWeights.get(arm.index); const iteration = armRows[arm.index].length;
      const index = rows.length; const budget = ppoIterationBudget(arm.solverSteps - armConsumed[arm.index]);
      let trajectory = null; let update = null;
      if (budget.train) {
        trajectory = await collectPpoBundle(collectTrajectory, { ...arm, solverSteps: budget.train, jobIndex: index, weights, split: "train",
          league: config.league ?? PPO_LEAGUE, controllers: config.controllers ?? new Map() });
        if (!Number.isSafeInteger(trajectory.result.solverSteps) || trajectory.result.solverSteps < 4 ||
            trajectory.result.solverSteps > budget.train || trajectory.result.solverSteps % 4) {
          throw new Error(`PPO train job ${index} reported invalid solver-step consumption ${trajectory.result.solverSteps}`);
        }
        armWeights.set(arm.index, trajectory.weights);
        update = updateHeads(trajectory.weights, ppoUpdateRows(trajectory), config.seed ^ index);
      }
      const updatedWeights = armWeights.get(arm.index);
      const validation = await collectPpoBundle(collectTrajectory, { ...arm, solverSteps: budget.validation, jobIndex: index,
        weights: updatedWeights, split: "validation", league: config.league ?? PPO_LEAGUE,
        controllers: config.controllers ?? new Map() });
      if (!Number.isSafeInteger(validation.result.solverSteps) || validation.result.solverSteps < 4 ||
          validation.result.solverSteps > budget.validation || validation.result.solverSteps % 4) {
        throw new Error(`PPO validation job ${index} reported invalid solver-step consumption ${validation.result.solverSteps}`);
      }
      const reward = validation.rewards.reduce((a, b) => a + b, 0);
      const solverSteps = (trajectory?.result.solverSteps ?? 0) + validation.result.solverSteps;
      const fullWeights = snapshotPpoWeights(updatedWeights); const cumulativeArmSteps = armConsumed[arm.index] + solverSteps;
      const engagement = validation.result.engagement;
      const row = { index, armIndex: arm.index, iteration, seed: config.seed, requestedSolverSteps: config.solverSteps,
        leagueDigest, runId: config.runId ?? null, initialization: arm.initialization, split: "validation", solverSteps,
        armSolverSteps: cumulativeArmSteps,
        requestedTrainSolverSteps: budget.train, requestedValidationSolverSteps: budget.validation,
        trainSolverSteps: trajectory?.result.solverSteps ?? 0, validationSolverSteps: validation.result.solverSteps,
        boundaries: trajectory?.boundaries.length ?? 0, reward, macro: reward,
        rewardComponents: { terminal: validation.boundaries.reduce((sum, row) => sum + row.terminal * 4, 0),
          vitalityDelta: validation.boundaries.reduce((sum, row) => sum + row.endVitalityPotential - row.startVitalityPotential, 0),
          nearRangeProgress: validation.boundaries.reduce((sum, row) => sum + row.nearRangeProgress, 0) },
        engagement: engagement ? { opportunities: engagement.viableOpportunities,
          attacksInWindow: engagement.attacksInWindow, contactsInWindow: engagement.damagingContactsInWindow,
          nearRangeStallSeconds: engagement.nearRangeStallSeconds, seconds: validation.result.result.seconds,
          firstAttackSeconds: Array.isArray(engagement.firstAttackSeconds)
            ? engagement.firstAttackSeconds : [engagement.firstAttackSeconds] } : null,
        opponent: validation.opponent, update };
      const champion = champions.get(arm.index);
      if (!champion || reward > champion.macro) champions.set(arm.index,
        { armIndex: arm.index, rowIndex: index, macro: reward, fullWeights });
      rows.push(row); armRows[arm.index].push(row); armConsumed[arm.index] = cumulativeArmSteps; completedThisRun += 1;
      const state = resumeBytes(); const { selected: checkpointSelected, champion: checkpointChampion } = selectedSoFar();
      const fairRound = armRows.every((entries) => entries.length === armRows[0].length);
      if (runtime.onCheckpoint) {
        const requestedStop = await runtime.onCheckpoint({ row, resume: state.bytes,
          championArtifact: artifactFor(checkpointSelected, checkpointChampion),
          champion: { armIndex: checkpointSelected.armIndex, initialization: checkpointSelected.initialization,
            iteration: checkpointSelected.iteration, rowIndex: checkpointSelected.index, macro: checkpointSelected.macro },
          progress: { completedJobs: rows.length, completedUpdates: state.optimizer.update,
            consumedSolverSteps: state.optimizer.consumedSolverSteps,
            armSolverSteps: Object.fromEntries(arms.map((entry) => [entry.initialization, armConsumed[entry.index]])), fairRound } });
        if (requestedStop !== undefined && requestedStop !== null && requestedStop !== "stopped: plateau") {
          throw new Error(`PPO checkpoint returned invalid stop reason "${requestedStop}"`);
        }
        pendingStop = requestedStop ?? pendingStop;
      }
      if (config.stopAfterJobs && completedThisRun >= config.stopAfterJobs &&
          arms.some((entry) => armConsumed[entry.index] < entry.solverSteps)) {
        return { complete: false, resume: state.bytes,
          report: new TextEncoder().encode(canonicalJson({ algorithm: "ppo", runId: config.runId ?? null,
            status: "interrupted", completedJobs: rows.length, completedUpdates: state.optimizer.update,
            solverSteps: state.optimizer.consumedSolverSteps })) };
      }
      if (pendingStop && fairRound) { stopped = pendingStop; break; }
    }
  }
  stopped = stopped ?? "stopped: ceiling";
  const { selected, champion: selectedChampion } = selectedSoFar();
  // `producedOutputs` is all 26 of the contract now, and it is **not** the sum
  // of the six heads' logits -- that is `producedLogits`, and it is 33. Both are
  // recorded because a single number was right by coincidence while every head
  // was a categorical over a name table, and the sixth head is the one that
  // ends the coincidence: eight logits, one contract slot. `persistenceSeconds`
  // is the grid the eighth of those was drawn from, so a reader of the artifact
  // can tell which dwells the champion was ever able to name.
  const state = resumeBytes();
  return { complete: true, artifact: artifactFor(selected, selectedChampion), resume: state.bytes,
    report: new TextEncoder().encode(canonicalJson({ algorithm: "ppo", runId: config.runId ?? null, configDigest,
      engagementInstrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
      trainingSemanticsVersion: PPO_TRAINING_SEMANTICS_VERSION, rolloutBundleSize: PPO_ROLLOUT_BUNDLE_SIZE,
      rows, selected: selected.initialization, selectedIteration: selected.iteration,
      ledgerFile: "ledger.jsonl", stopping: { plateauEpsilon: config.plateauEpsilon ?? DEFAULT_PLATEAU_EPSILON,
        plateauRows: config.plateauRows ?? DEFAULT_PLATEAU_ROWS, stepCeiling: config.solverSteps * 2 }, stopped })) };
}

export async function trainPpo(config, runtime = {}) {
  const workers = config.workers ?? 1;
  if (!Number.isSafeInteger(workers) || workers <= 0 || workers > 64) {
    throw new Error(`PPO --workers must be a positive integer at most 64, not ${JSON.stringify(workers)}`);
  }
  const contractDigest = requiredResearchContractDigest(config.contractDigest ?? FROZEN_RESEARCH_CONTRACT_DIGEST);
  config = { ...config, workers, contractDigest };
  if (runtime.collectTrajectory) return trainPpoCore(config, runtime);
  const controllerCount = config.controllers?.size ?? 0;
  if (controllerCount && !Array.isArray(config.learnedLeagueModels)) {
    throw new Error("PPO parallel rollout refused: learned league controllers are missing cloneable model payloads");
  }
  // Lazy construction is a resume-safety property, not merely startup thrift:
  // `trainPpoCore` decodes and validates the complete saved identity before its
  // first collector call, so a stale state cannot start even an idle worker.
  let pool = null; const createPool = runtime.createRolloutPool ??
    (() => new PpoRolloutPool(workers, config.learnedLeagueModels ?? []));
  try { return await trainPpoCore(config, { ...runtime, collectTrajectory: (request) => {
    pool ??= createPool(); return pool.run(request);
  } }); }
  finally { if (pool) await pool.close(); }
}

export function assertPpoLedgerPrefix(resumeBytes, ledgerRows) {
  const resumed = decodePpoResume(resumeBytes); const last = ledgerRows.at(-1);
  if (!last) return;
  const matched = resumed.rows.find((row) => row.index === last.jobIndex);
  const consumedAtMatch = resumed.rows.filter((row) => row.index <= last.jobIndex)
    .reduce((sum, row) => sum + row.solverSteps, 0);
  if (!matched || last.stepsConsumed !== consumedAtMatch) {
    throw new Error("PPO resume state does not match the run ledger prefix");
  }
}

export function assertPpoStoppingContract(ledgerRows, plateauEpsilon, plateauRows) {
  const frozen = ledgerRows[0]?.stopping;
  if (frozen && (frozen.plateauEpsilon !== plateauEpsilon || frozen.plateauRows !== plateauRows)) {
    throw new Error("PPO resume refused: plateau contract changed");
  }
}

export function ppoPendingAction(pending, ledgerRows) {
  if (ledgerRows.length === pending.row.row) return "append";
  if (JSON.stringify(ledgerRows.at(-1)) === JSON.stringify(pending.row)) return "already-appended";
  throw new Error("PPO pending ledger row does not match the complete ledger prefix");
}

export async function runPpoCli() {
  const arg = (name, fallback) => { const at = process.argv.indexOf(`--${name}`); return at < 0 ? fallback : process.argv[at + 1]; };
  const contractDigest = requiredResearchContractDigest(contractDigestArgument(process.argv));
  const leaguePaths = process.argv.flatMap((value, index) => value === "--league-artifact" ? [process.argv[index + 1]] : []).filter(Boolean);
  const loaded = await loadLeagueArtifacts(leaguePaths);
  const config = { seed: Number(arg("seed", 310013)), solverSteps: Number(arg("solver-steps", 960)), workers: Number(arg("workers", 1)),
    stopAfterJobs: Number(arg("stop-after-jobs", 0)), runId: arg("run-id", undefined),
    league: loaded.league, controllers: loaded.controllers, learnedLeagueModels: loaded.models, contractDigest };
  if (!Number.isSafeInteger(config.solverSteps) || config.solverSteps < 8 || config.solverSteps % 4) {
    throw new Error("--solver-steps must be at least eight and divisible by four");
  }
  if (!Number.isSafeInteger(config.stopAfterJobs) || config.stopAfterJobs < 0) throw new Error("--stop-after-jobs must be a non-negative integer");
  const checkpointEveryJobs = Number(arg("checkpoint-every-jobs", 1));
  if (!Number.isSafeInteger(checkpointEveryJobs) || checkpointEveryJobs <= 0) {
    throw new Error("--checkpoint-every-jobs must be a positive integer");
  }
  const plateauEpsilon = Number(arg("plateau-epsilon", DEFAULT_PLATEAU_EPSILON));
  const plateauRows = Number(arg("plateau-rows", DEFAULT_PLATEAU_ROWS));
  if (!Number.isFinite(plateauEpsilon) || plateauEpsilon < 0) throw new Error("--plateau-epsilon must be a non-negative number");
  if (!Number.isSafeInteger(plateauRows) || plateauRows <= 0) throw new Error("--plateau-rows must be a positive integer");
  config.plateauEpsilon = plateauEpsilon; config.plateauRows = plateauRows;
  config.balanceConfigDigest = BALANCE_CONFIG_DIGEST;
  const configDigest = canonicalDigest({ seed: config.seed, solverSteps: config.solverSteps,
    league: config.league, engagementInstrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
    balanceConfigDigest: config.balanceConfigDigest, contractDigest,
    trainingSemanticsVersion: PPO_TRAINING_SEMANTICS_VERSION, rolloutBundleSize: PPO_ROLLOUT_BUNDLE_SIZE });
  config.runId ??= `ppo-${config.seed}-${configDigest}`;
  const runDir = new URL(`../asset-src/learning/research/${config.runId}/`, import.meta.url);
  const runPath = fileURLToPath(runDir); await mkdir(runPath, { recursive: true });
  const statePath = resolve(arg("resume", fileURLToPath(new URL("state.json", runDir))));
  const encodeCliState = (resume, pending = null) => new TextEncoder().encode(canonicalJson({ version: 1,
    plateauEpsilon, plateauRows, contractDigest, configDigest,
    trainingSemanticsVersion: PPO_TRAINING_SEMANTICS_VERSION, rolloutBundleSize: PPO_ROLLOUT_BUNDLE_SIZE,
    resume: Buffer.from(resume).toString("base64"), pending: pending ? { row: pending.row,
      champion: Buffer.from(pending.champion).toString("base64") } : null }));
  const decodeCliState = (bytes) => { let value; try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { return { resume: bytes, pending: null }; }
    if (value?.version !== 1 || typeof value.resume !== "string") return { resume: bytes, pending: null };
    if (value.contractDigest !== contractDigest || value.configDigest !== configDigest) {
      throw new Error("PPO resume refused: research contract or config digest changed or is missing");
    }
    if (value.trainingSemanticsVersion !== PPO_TRAINING_SEMANTICS_VERSION || value.rolloutBundleSize !== PPO_ROLLOUT_BUNDLE_SIZE) {
      throw new Error("PPO resume refused: training semantics version or rollout bundle size changed or is missing");
    }
    if (value.plateauEpsilon !== plateauEpsilon || value.plateauRows !== plateauRows) {
      throw new Error("PPO resume refused: plateau contract changed");
    }
    return { resume: new Uint8Array(Buffer.from(value.resume, "base64")), pending: value.pending ? {
      row: value.pending.row, champion: new Uint8Array(Buffer.from(value.pending.champion, "base64")) } : null }; };
  const resumeFrom = arg("resume-from", ""); let cliState = null;
  await refuseFinalizedResume(runPath, "PPO", Boolean(resumeFrom));
  if (resumeFrom) { cliState = decodeCliState(new Uint8Array(await readFile(resolve(resumeFrom)))); config.resumeBytes = cliState.resume; }
  let ledgerRows = await readLedger(resolve(runPath, "ledger.jsonl"));
  if (!config.resumeBytes && ledgerRows.length) throw new Error(`PPO run "${config.runId}" already has a ledger; use --resume-from or a new --run-id`);
  if (cliState?.pending) {
    const action = ppoPendingAction(cliState.pending, ledgerRows);
    if (action === "append") {
      await checkpointRun({ runDir: runPath, row: cliState.pending.row, championBytes: cliState.pending.champion });
      ledgerRows.push(cliState.pending.row);
    }
    await writeAtomic(statePath, encodeCliState(cliState.resume));
  }
  if (config.resumeBytes) assertPpoLedgerPrefix(config.resumeBytes, ledgerRows);
  if (config.resumeBytes) assertPpoStoppingContract(ledgerRows, plateauEpsilon, plateauRows);
  const terminalStop = ledgerStopDecision(ledgerRows);
  const baseWallSeconds = ledgerRows.at(-1)?.wallSeconds ?? 0; const started = performance.now();
  const output = await trainPpo(config, { terminalStop, onCheckpoint: async (checkpoint) => {
    const terminalBoundary = checkpoint.progress.consumedSolverSteps >= config.solverSteps * 2 ||
      config.stopAfterJobs > 0 && checkpoint.progress.completedJobs >= config.stopAfterJobs;
    if (!checkpointJobDue(checkpoint.progress.completedJobs, checkpointEveryJobs) && !terminalBoundary) {
      await writeAtomic(statePath, encodeCliState(checkpoint.resume)); return null;
    }
    const championBytes = inProgressResearchArtifact(decodeResearchArtifact(checkpoint.championArtifact), config.runId).toBytes();
    const wallSeconds = baseWallSeconds + (performance.now() - started) / 1000;
    const update = checkpoint.row.update;
    const ppoRows = decodePpoResume(checkpoint.resume).rows;
    const objectiveValue = checkpoint.progress.fairRound
      ? ["random", "dagger"].map((name) => [...ppoRows].reverse().find((entry) => entry.initialization === name).macro)
        .reduce((sum, value) => sum + value, 0) / 2 : null;
    const row = makeLedgerRow({ previousRows: ledgerRows, direction: "ppo", jobIndex: checkpoint.row.index,
      stepsConsumed: checkpoint.progress.consumedSolverSteps, wallSeconds,
      stepsPerSecond: (checkpoint.progress.consumedSolverSteps - (ledgerRows.at(-1)?.stepsConsumed ?? 0)) /
        Math.max(0.001, wallSeconds - (ledgerRows.at(-1)?.wallSeconds ?? baseWallSeconds)),
      configDigest, contractDigest, validationMacro: objectiveValue, validationWorstCell: null,
      objective: { name: "validationMacroReward", direction: "higher",
        observed: checkpoint.progress.fairRound, value: objectiveValue },
      gates: engagementGates(checkpoint.row.engagement), gateScope: "checkpoint-observation",
      directionData: { initialization: checkpoint.row.initialization, iteration: checkpoint.row.iteration,
        championMacro: checkpoint.champion.macro,
        rewardComponents: checkpoint.row.rewardComponents,
        headEntropies: update ? update.headEntropies : { status: "unavailable", reason: "validation-only tail has no policy update" },
        armSolverSteps: checkpoint.progress.armSolverSteps, fairRound: checkpoint.progress.fairRound },
      championBytes, championMetric: { name: "championMacroReward", value: checkpoint.champion.macro },
      stepCeiling: config.solverSteps * 2, plateauEpsilon, plateauRows });
    await writeAtomic(statePath, encodeCliState(checkpoint.resume, { row, champion: championBytes }));
    await checkpointRun({ runDir: runPath, row, championBytes }); ledgerRows.push(row);
    await writeAtomic(statePath, encodeCliState(checkpoint.resume)); process.stdout.write(`${row.summary}\n`);
    return ledgerStopDecision(ledgerRows) === "stopped: plateau" ? "stopped: plateau" : null;
  } });
  if (output.artifact) await finalizeRun({ runDir: runPath, championBytes: output.artifact, reportBytes: output.report });
  await writeAtomic(statePath, encodeCliState(output.resume));
  if (arg("artifact", "") && output.artifact) await writeAtomic(arg("artifact", ""), output.artifact);
  if (arg("report", "")) await writeAtomic(arg("report", ""), output.report);
  process.stdout.write(new TextDecoder().decode(output.report) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runPpoCli();
