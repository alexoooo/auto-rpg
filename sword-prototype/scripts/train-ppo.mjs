import { readFile, rename, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { FEATURE_COLUMNS } from "../src/learning/features.ts";
import { ResearchArtifact, artifactChecksum, canonicalJson } from "../src/learning/artifact.ts";
import { GRU_UNITS, RecurrentPolicy, maskedCategorical, seededRandom } from "../src/learning/recurrent-network.ts";
import { META_OUTPUT_LAYOUT, PERSISTENCE_SECONDS } from "../src/learning/meta.ts";
import { decodePpoResume, encodePpoResume, equalBudgetPpoArms, freezeOpponentLeague, generalizedAdvantages,
  indexedLeagueOpponent, ppoHeadUpdate, PPO_GAMMA_PER_SECOND, PPO_POLICY_HEADS, PPO_TRACE_LAMBDA,
  selectPpoArm, tacticalBoundaryReward } from "../src/learning/ppo.ts";
import { researchMatrix } from "../src/learning/research-matrix.ts";
import { researchLabelMind } from "../src/learning/research-policy.ts";
import { predictDagger } from "../src/learning/dagger.ts";
import { argmaxHeadPick, recurrentTactic, RESEARCH_ARTIFACT_CONTRACT } from "../src/learning/deployment.ts";
import { EFFECTOR_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, STANCE_NAMES, TARGET_NAMES } from "../src/options.ts";
import { runResearchBout } from "./research-havok.mjs";

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

export async function loadLeagueArtifacts(paths) {
  const loaded = [];
  for (const path of paths) {
    const bytes = new Uint8Array(await readFile(resolve(path))); const artifact = ResearchArtifact.fromBytes(bytes, RESEARCH_ARTIFACT_CONTRACT);
    if (artifact.data.algorithm !== "dagger" && artifact.data.algorithm !== "ppo") {
      throw new Error(`league artifact "${path}" uses ${artifact.data.algorithm}, expected dagger or ppo`);
    }
    let payload; try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(artifact.data.payload))); }
    catch (error) { throw new Error(`league artifact "${path}" has invalid model payload`, { cause: error }); }
    const digest = artifactChecksum(new TextDecoder().decode(bytes)); const id = `${artifact.data.algorithm}:${digest}`;
    const controller = artifact.data.algorithm === "dagger" ? () => researchLabelMind(id,
      (_view, features) => predictDagger(payload, features)) : () => {
        const policy = new RecurrentPolicy(payload.weights); return researchLabelMind(id, (view, features) => {
          // `recurrentTactic`, which is the same conditional-mask decode
          // `deployment.ts`'s PPO branch runs. This was a sixth copy of the
          // legality rule -- `supportedOptions` plus the cover delete, character
          // for character -- sitting in the file that decides what a league
          // opponent does; C1 unified the action half and C2b unifies the rest,
          // so a frozen champion fights as the thing that was deployed.
          // Including the dwell, which was `UNLEARNED_PERSISTENCE` here for as
          // long as PPO had five heads. A frozen champion that decides its own
          // tuple and is handed somebody else's persistence is not the thing
          // that was deployed, which is the sentence above about the mask.
          const tactic = recurrentTactic(view, policy.step(features), argmaxHeadPick);
          return { movement: tactic.movement, action: tactic.action, effector: tactic.effector,
            target: tactic.target, stance: tactic.stance, persistence: tactic.persistenceSeconds };
        }); };
    loaded.push({ entry: { id, kind: artifact.data.algorithm, digest }, controller });
  }
  const dagger = loaded.filter(({ entry }) => entry.kind === "dagger"); const ppo = loaded.filter(({ entry }) => entry.kind === "ppo").slice(-4);
  const retained = [...dagger, ...ppo]; return { league: freezeOpponentLeague([...PPO_LEAGUE, ...retained.map(({ entry }) => entry)]),
    controllers: new Map(retained.map(({ entry, controller }) => [entry.id, controller])) };
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

export async function trainPpo(config) {
  if (config.workers !== undefined && config.workers !== 1) throw new Error("PPO --workers currently supports exactly 1; refusing ignored parallelism");
  const arms = equalBudgetPpoArms(config.seed, config.solverSteps); let rows = [];
  const leagueDigest = artifactChecksum(canonicalJson(config.league ?? PPO_LEAGUE));
  if (config.resumeBytes) {
    const resumed = decodePpoResume(config.resumeBytes);
    rows = [...resumed.rows];
    if (rows.some((row, index) => row.index !== index || row.seed !== config.seed ||
        row.requestedSolverSteps !== config.solverSteps || row.leagueDigest !== leagueDigest))
      throw new Error("PPO resume does not match this seed, budget, or indexed arm prefix");
    const consumed = rows.reduce((sum, row) => sum + row.solverSteps, 0);
    if (consumed !== resumed.optimizer.consumedSolverSteps) throw new Error("PPO resume solver-step accounting does not match its rows");
    if (rows.length >= arms.length) throw new Error("PPO resume is already complete; refusing to spend the fixed budget twice");
  }
  let completedThisRun = 0;
  for (const arm of arms.slice(rows.length)) {
    const trainSteps = Math.floor(arm.solverSteps / 8) * 4; const validationSteps = arm.solverSteps - trainSteps;
    if (trainSteps < 4 || validationSteps < 4) throw new Error("PPO per-arm budget must be at least eight solver steps");
    const trajectory = await collectPpoTrajectory({ ...arm, solverSteps: trainSteps, split: "train",
      league: config.league ?? PPO_LEAGUE, controllers: config.controllers ?? new Map() });
    const update = ppoHeadUpdate(trajectory.weights, ppoUpdateRows(trajectory), config.seed ^ arm.index);
    const validation = await collectPpoTrajectory({ ...arm, solverSteps: validationSteps, jobIndex: arm.index,
      weights: trajectory.weights, split: "validation", league: config.league ?? PPO_LEAGUE,
      controllers: config.controllers ?? new Map() });
    const reward = validation.rewards.reduce((a, b) => a + b, 0);
    rows.push({ index: arm.index, seed: config.seed, requestedSolverSteps: config.solverSteps, leagueDigest,
      initialization: arm.initialization, split: "validation",
      solverSteps: trajectory.result.solverSteps + validation.result.solverSteps,
      trainSolverSteps: trajectory.result.solverSteps, validationSolverSteps: validation.result.solverSteps,
      boundaries: trajectory.boundaries.length, reward, macro: reward, worstCell: reward,
      rewardComponents: { terminal: validation.boundaries.reduce((sum, row) => sum + row.terminal * 4, 0),
        vitalityDamage: validation.boundaries.reduce((sum, row) => sum + row.endVitalityPotential - row.startVitalityPotential, 0),
        nearProgress: validation.boundaries.reduce((sum, row) => sum + row.nearRangeProgress, 0), duration: 0, attempts: 0, contacts: 0,
      rangeOccupancy: 0 }, opponent: validation.opponent, update, fullWeights: trajectory.weights, weights: flattenHeads(trajectory.weights) });
    completedThisRun += 1;
    if (config.stopAfterJobs && completedThisRun >= config.stopAfterJobs && rows.length < arms.length) {
      const last = rows.at(-1); const optimizer = { update: rows.length, firstMoment: last.weights.map(() => 0),
        secondMoment: last.weights.map(() => 0), consumedSolverSteps: rows.reduce((sum, row) => sum + row.solverSteps, 0) };
      return { complete: false, resume: encodePpoResume(last.weights, optimizer, rows),
        report: new TextEncoder().encode(canonicalJson({ algorithm: "ppo", status: "interrupted", completedJobs: rows.length,
          solverSteps: optimizer.consumedSolverSteps })) };
    }
  }
  const selectedArm = selectPpoArm(rows.map((row) => ({ split: row.split, arm: row.initialization,
    macro: row.macro, worstCell: row.worstCell }))); const selected = rows.find((row) => row.initialization === selectedArm);
  const configDigest = artifactChecksum(canonicalJson({ seed: config.seed, solverSteps: config.solverSteps,
    league: config.league ?? PPO_LEAGUE }));
  const payload = [...new TextEncoder().encode(canonicalJson({ initialization: selected.initialization, weights: selected.fullWeights }))];
  // `producedOutputs` is all 26 of the contract now, and it is **not** the sum
  // of the six heads' logits -- that is `producedLogits`, and it is 33. Both are
  // recorded because a single number was right by coincidence while every head
  // was a categorical over a name table, and the sixth head is the one that
  // ends the coincidence: eight logits, one contract slot. `persistenceSeconds`
  // is the grid the eighth of those was drawn from, so a reader of the artifact
  // can tell which dwells the champion was ever able to name.
  const artifact = new ResearchArtifact({ algorithm: "ppo", ...RESEARCH_ARTIFACT_CONTRACT, payload,
    provenance: { seed: config.seed, solverSteps: selected.solverSteps, trainingSplit: "train", validationSplit: "validation",
      configDigest, producedOutputs: PPO_PRODUCED_OUTPUTS, producedLogits: PPO_PRODUCED_LOGITS,
      contractOutputs: META_OUTPUT_LAYOUT.width, persistenceSeconds: [...PERSISTENCE_SECONDS],
      gammaPerSecond: PPO_GAMMA_PER_SECOND, traceLambda: PPO_TRACE_LAMBDA } },
    RESEARCH_ARTIFACT_CONTRACT);
  const optimizer = { update: 1, firstMoment: selected.weights.map(() => 0), secondMoment: selected.weights.map(() => 0),
    consumedSolverSteps: rows.reduce((sum, row) => sum + row.solverSteps, 0) };
  return { complete: true, artifact: artifact.toBytes(), resume: encodePpoResume(selected.weights, optimizer, rows),
    report: new TextEncoder().encode(canonicalJson({ algorithm: "ppo", configDigest, rows: rows.map(({ weights: _, fullWeights: __, ...row }) => row),
      selected: selected.initialization })) };
}

export async function runPpoCli() {
  const arg = (name, fallback) => { const at = process.argv.indexOf(`--${name}`); return at < 0 ? fallback : process.argv[at + 1]; };
  const leaguePaths = process.argv.flatMap((value, index) => value === "--league-artifact" ? [process.argv[index + 1]] : []).filter(Boolean);
  const loaded = await loadLeagueArtifacts(leaguePaths);
  const config = { seed: Number(arg("seed", 310013)), solverSteps: Number(arg("solver-steps", 960)), workers: Number(arg("workers", 1)),
    stopAfterJobs: Number(arg("stop-after-jobs", 0)), league: loaded.league, controllers: loaded.controllers };
  if (!Number.isSafeInteger(config.solverSteps) || config.solverSteps < 4 || config.solverSteps % 4) throw new Error("--solver-steps must be a positive multiple of four");
  const resumeFrom = arg("resume-from", ""); if (resumeFrom) config.resumeBytes = new Uint8Array(await readFile(resolve(resumeFrom)));
  const output = await trainPpo(config);
  if (arg("artifact", "") && output.artifact) await writeAtomic(arg("artifact", ""), output.artifact);
  if (arg("resume", "")) await writeAtomic(arg("resume", ""), output.resume);
  if (arg("report", "")) await writeAtomic(arg("report", ""), output.report);
  process.stdout.write(new TextDecoder().decode(output.report) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runPpoCli();
