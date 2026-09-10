// League self-play: a main agent, a pool of its own frozen past, and exploiters that hunt it.
//
//   node scripts/league.mjs [--iterations 40] [--bouts 64] [--workers N] [--seed 20260914]
//     [--cap 60] [--random 40] [--terminals maul,mace|all] [--emphasise maul,mace] [--emphasis 3]
//     [--pool-every 4] [--pool-cap 8]
//     [--exploiters 2] [--exploiter-every 1] [--share-self 1] [--share-pool 2] [--share-exploiter 1]
//     [--anchor golem-driver] [--share-anchor 1]
//     [--reward-win 0.5] [--reward-clinch 0.004] [--reward-idle 0.004] [--reward-tick 0]
//     [--reset-gain 0.02] [--reset-patience 3] [--dir tournaments/league] [--resume]
//     [--from tournaments/some-run-checkpoint.json]
//     [--matrix] [--matrix-bouts 32] [--matrix-lag 1] [--matrix-cap 10] [--probe-bouts 4]
//     [--evaluate 5]
//     [--out src/golem/policy-weights.ts] [--ship 16|main] [--ship-bouts 400]
//
// **Why a pool and not a mirror.** Session 14's calibration measured what a mirrored self-play
// reward can pay for and the answer was: the two sides' bar margins are exactly negated, so the
// margin and the win bonus both sum to zero over a rollout, and the only terms left with a
// non-zero mean are charges for engaging. A fit under that objective is paid to stand out of
// range, and `docs/measurements.md` has the census of one doing exactly that. A pool of frozen
// past selves breaks the identity the same way `--opponent` did, and for the same reason: the
// opponent is not a copy of the policy taking the gradient, so beating it is worth something.
//
// **Why the past and not only the present.** Self-play against the current self cycles. A counter
// to a habit beats the habit, the habit returns to beat the counter, and the pair orbit forever
// with no monotone progress and no way to see it from inside. Playing frozen checkpoints makes
// progress checkable rather than assumed: the main agent must beat every checkpoint older than K,
// and `--matrix` plays every stored pair to say whether it does.
//
// **Why exploiters.** A pool is a distribution over minds that were once good, which is not the
// same as a distribution over minds that are good *against this one*. An exploiter is initialised
// from the main and trained against a frozen copy of it alone; it finds the current habit fast,
// and the main trains back against it. It is reset from the main when it stops gaining, because an
// exploiter that has stopped gaining is a stale opponent taking a share of every rollout.
//
// **Why shipping is its own mode.** `--out` at the end of a run ships whatever the main happened
// to be on the last iteration, and the reason to run a league is that the mind is not monotone --
// the rating and probe curves are read afterwards, and they can say that `pool-16` was the better
// mind. `--ship 16 --out <path>` writes that one instead, rating it on the run's own evaluation
// pool and taking the provenance -- knobs, anchor, emphasis, and the bouts and asks spent *by
// that iteration* -- from the run's own log rather than from whatever is retyped on the command
// line. It writes nothing back into the league, so it is safe beside a running arm.
//
// **The reward table became four flags in Session 04 of the learn set, and the argument against
// that is still on the record below.** It was refused here because a league's product is a
// checkpoint somebody ships, and a run paid under a table that is not `GOLEM_REWARD` cannot be
// shipped without lying in the module header. What changed is that Session 06 sweeps the table and
// the sweep runner's frozen choice is that an arm is a command line -- so a reward arm that could
// only be a `train-ppo` arm would be a reward answer taken in a harness the mind does not ship
// from. The flags are the trainer's own, spelled the same way, so one manifest reads across both
// scripts; and the refusal the old comment wanted is kept where it belongs: `--out` refuses a run
// paid under anything but the shipped table, and refuses it *before* the run rather than after it.
//
// **Adam's moments ride in `league.json` from the same session**, for the reason
// `scripts/train-ppo.mjs` gives: an overnight expects to die, the sweep runner restarts it, and a
// role that came back cold in Adam would spend its first iteration back taking the largest steps
// the rate allows. The main and every exploiter carry their own three blocks. A state file written
// before this carries none, which is read as "start cold" with a line saying so rather than as a
// refusal -- the league version is about what a reader would *misread*, and a missing block cannot
// be misread.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { availableParallelism } from "node:os";

import { armedTerminal, runJobs, scheduleJobs } from "./tournament.mjs";
import { formatIdleProbe, idleProbe } from "./idle-probe.mjs";
import {
  FIT_NAME, PPO_LEAGUE, REWARD_KEYS, episodeReturns, extendNormalisation, mergeRollouts,
  momentsFromJson, momentsToJson, parseTerminals, poolFor, policyTable, ppoFit, ratePolicy,
  renderPolicyModule,
} from "./train-ppo.mjs";
import {
  ACTION_AXES, POLICY_LAYOUT, POLICY_VERSION, VALUE_LAYOUT, freshNormalisation,
} from "../src/golem/policy.ts";
import { PILOT_FEATURES_VERSION } from "../src/golem/pilot.ts";
import { initWeights, netSize } from "../src/golem/neural-net.ts";
import { GOLEM_REWARD } from "../src/golem/reward.ts";

/** The agent that is being trained, and the only side a league rollout records. */
export const MAIN_NAME = "main";
/** A frozen copy of the main as it stood when the iteration began, so "itself" is not itself. */
export const SELF_NAME = "self";
/** A stored past self, named by the iteration it was taken at. */
export const poolName = (iteration) => `pool-${iteration}`;
/** One of the hunters, named by its slot rather than by its generation. */
export const exploiterName = (slot) => `exploiter-${slot}`;

const round5 = (x) => Math.round(x * 1e5) / 1e5;
const meanOf = (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * The opponent cycle an iteration plays, which is the declared distribution made exact.
 *
 * `scheduleJobs` walks `pairs` round-robin -- `cycle[pairing % cycle.length]` -- and emits both
 * corners of every pairing, so one entry a slot buys two bouts and the mix is the multiplicity of
 * the entries and nothing else. That is deliberate: a share drawn from a random stream would be
 * the declared share only in expectation, and an iteration is 32 pairings, so "half the bouts
 * against the pool" would be somewhere between a third and two thirds of them on any given day.
 * Here it is exactly half, and `shareOf` is how a test says so.
 *
 * `weights` are slot counts and not probabilities: whole numbers, so the cycle is finite and the
 * run is reproducible from the seed alone. An opponent with no weight is not in the cycle at all.
 *
 * `trained` is the side taking the gradient and is the left of every pair, because an exploiter's
 * turn is this same arrangement with a different name in that position. It may not appear among
 * the opponents: a role on both sides of a pair is the mirror whose reward sums to zero, and the
 * frozen copy that makes "against itself" mean something is the caller's to make.
 */
export function leaguePairs(opponents, trained = MAIN_NAME) {
  const cycle = [];
  for (const { name, weight } of opponents) {
    if (!Number.isInteger(weight) || weight < 0) throw new Error(`"${name}" has a weight of ${weight}; slots are whole numbers`);
    if (name === trained) throw new Error(`"${name}" is the side being trained and cannot also be its own opponent; freeze a copy first`);
    for (let i = 0; i < weight; i += 1) cycle.push([trained, name]);
  }
  if (cycle.length === 0) throw new Error("a league iteration needs at least one opponent with a slot");
  return cycle;
}

/** What share of a cycle's slots an opponent actually holds, which is what the declaration promised. */
export function shareOf(pairs, name) {
  if (pairs.length === 0) return 0;
  return pairs.filter(([, opponent]) => opponent === name).length / pairs.length;
}

/**
 * Thin the stored past to `cap` entries, keeping the ends and widening the gaps in the middle.
 *
 * The obvious rule -- keep the newest `cap` -- is the wrong one for the measurement this session
 * is for. The claim being checked is that the main beats *every* checkpoint older than K, and a
 * window that slides forward throws away the long baseline that makes the claim worth anything:
 * beating the mind you were four iterations ago is what a cycling pair does too. So the oldest
 * entry is never dropped, the newest is never dropped, and what goes is the middle entry sitting
 * closest to its predecessor, which leaves a spacing that widens with age.
 *
 * Returns a new array; the caller owns the files and deletes nothing, because a checkpoint that
 * has left the playing pool is still a row of the matrix.
 */
export function thinPool(entries, cap) {
  if (cap < 2) throw new Error(`a pool cap of ${cap} cannot keep both ends`);
  const kept = entries.slice().sort((a, b) => a.iteration - b.iteration);
  while (kept.length > cap) {
    let at = 1;
    let smallest = Infinity;
    for (let i = 1; i < kept.length - 1; i += 1) {
      const gap = kept[i].iteration - kept[i - 1].iteration;
      if (gap < smallest) { smallest = gap; at = i; }
    }
    kept.splice(at, 1);
  }
  return kept;
}

/**
 * Whether an exploiter has stopped gaining and should be re-seeded from the main.
 *
 * `history` is the exploiter's mean bar margin against the frozen main, one entry per time it was
 * trained, oldest first. It has stalled when the best of its last `patience` attempts does not
 * beat the best of everything before them by `gain`. Best-against-best rather than last-against-
 * last, because a single rollout of 64 bouts has a standard error worth several hundredths and a
 * rule on the last value alone would reset a healthy exploiter about as often as a stalled one.
 *
 * An exploiter with fewer than `patience + 1` entries has not been asked the question yet.
 */
export function exploiterStalled(history, { gain = 0.02, patience = 3 } = {}) {
  if (history.length < patience + 1) return false;
  const recent = history.slice(-patience);
  const before = history.slice(0, -patience);
  return Math.max(...recent) < Math.max(...before) + gain;
}

/**
 * The draw list with some weapon classes repeated, which is a weighting and not a filter.
 *
 * `poolFor`'s `--terminals` throws bodies away, and the calibration is clear about why that is the
 * right instrument and the wrong training set: thirty eight of the fifty two builds cannot decide
 * a bout inside the cap, so every action on them has the same return and the advantage over them
 * is the critic's residual, amplified by the batch normalisation to stand beside the real signal —
 * but the shipped mind fights every body, and a mind that never saw a blade is a mind with a hole
 * in it. Session 14's plan names the resolution: *"a weighting or a curriculum, not a filter"*.
 *
 * `scheduleJobs` draws a build uniformly from the list it is handed, so a list with the maul
 * builds in it three times is three times the maul bouts and every other body still present. The
 * weighting is therefore exact rather than sampled, for `leaguePairs`' reason.
 *
 * **A class the list does not carry is refused by name, and that refusal was bought by Session 01
 * of the learn set.** Every training pool in this file now draws through `viableMirror`, which
 * keeps the classes that can finish a copy of themselves -- `maul` and `mace` -- and drops the
 * other five. `--emphasise blade` was, from that session onwards, a flag that weighted a list the
 * mirror filter had already emptied of blades: it did nothing, said nothing, and left the run
 * looking exactly like the run that had been asked for. A flag that is quietly inert is the kind
 * of thing this directory writes traps about, so the classes the list actually carries are named
 * in the refusal -- which is also the shortest way to be told what the mirror filter left.
 */
export function emphasisedPool(pool, terminals, weight) {
  if (terminals.length === 0) return pool;
  const present = [...new Set(pool.map((build) => armedTerminal(build.setup)))].sort();
  const missing = terminals.filter((terminal) => !present.includes(terminal));
  if (missing.length > 0) {
    throw new Error(`--emphasise names ${missing.join(" and ")}, which no build in this pool carries; `
      + `it draws ${present.length === 0 ? "nothing at all" : present.join(", ")}`);
  }
  if (weight <= 1) return pool;
  const times = Math.round(weight);
  const out = [];
  for (const build of pool) {
    const repeats = terminals.includes(armedTerminal(build.setup)) ? times : 1;
    for (let i = 0; i < repeats; i += 1) out.push(build);
  }
  return out;
}

/**
 * The critic's shape, which is the league's and not `policy.ts`'s.
 *
 * `VALUE_LAYOUT` is 256x256 and `train-ppo.mjs`'s CLI has defaulted to 64x64 since Session 13
 * measured the two: 77 s a fit against 130 s for an explained variance of 0.923 against 0.913.
 * A league fits three or four roles an iteration rather than one, so the saving is three or four
 * times over, and the critic does not ship -- nothing outside a run ever reads these weights.
 */
export const LEAGUE_VALUE_LAYOUT = Object.freeze({ ...VALUE_LAYOUT, hidden: Object.freeze([64, 64]) });

/**
 * A role's numbers: what it plays with, what it predicts with, and what it has seen.
 *
 * Drawn rather than zeroed, and that is not a style choice: a ReLU net of zeros emits zeros from
 * every layer, so the gradient into every weight is zero as well and the thing never moves. It is
 * `train-ppo.mjs`'s `initWeights` and the same seed rule, so a league role and a trainer run from
 * one seed start life as the same mind.
 */
export function freshRole(seed) {
  return {
    weights: initWeights(POLICY_LAYOUT, seed),
    valueWeights: initWeights(LEAGUE_VALUE_LAYOUT, (seed ^ 0x1c) >>> 0),
    logSigma: Float64Array.from({ length: 9 }, () => -0.7),
    norm: freshNormalisation(),
    seed: seed >>> 0,
    history: [],
    bornAt: 0,
  };
}

/** A role as a contender: the greedy read, because an opponent is a fixed mind and not a rollout. */
export function contenderFor(role, sample = false) {
  return {
    pi: Array.from(role.weights, round5),
    logSigma: Array.from(role.logSigma, round5),
    normalisation: {
      count: role.norm.count,
      mean: Array.from(role.norm.mean, round5),
      variance: Array.from(role.norm.variance, round5),
    },
    sample,
  };
}

/** A role's numbers as JSON, and back. Adam moments are not here, for `train-ppo.mjs`'s reason. */
export function roleToJson(role) {
  return {
    weights: Array.from(role.weights, round5), valueWeights: Array.from(role.valueWeights, round5),
    logSigma: Array.from(role.logSigma, round5), norm: role.norm,
    seed: role.seed, history: role.history.slice(), bornAt: role.bornAt,
  };
}

export function roleFromJson(json) {
  return {
    weights: Float64Array.from(json.weights), valueWeights: Float64Array.from(json.valueWeights),
    logSigma: Float64Array.from(json.logSigma), norm: json.norm,
    seed: json.seed >>> 0, history: (json.history ?? []).slice(), bornAt: json.bornAt ?? 0,
  };
}

/** Copy a role's numbers into a new role, which is what seeding an exploiter from the main is. */
export function copyRole(role, seed, bornAt) {
  return {
    weights: Float64Array.from(role.weights), valueWeights: Float64Array.from(role.valueWeights),
    logSigma: Float64Array.from(role.logSigma),
    norm: { count: role.norm.count, mean: role.norm.mean.slice(), variance: role.norm.variance.slice() },
    seed: seed >>> 0, history: [], bornAt,
  };
}

/**
 * One role's rollout against a declared distribution of opponents.
 *
 * The shape is `collectRollouts`', with the one opponent widened into a cycle: the trained side is
 * the only one recorded, it plays drawn and every opponent plays its mean, and both corners of
 * every pairing are run so a side of the arena is not a variable. What is added is `byOpponent`,
 * the trained side's mean bar margin against each of them, which is how an exploiter's gain is
 * read and how a league says which opponent it is losing to rather than only that it is.
 *
 * An opponent is `{name, weight, contender}`; a `contender` left off names a shipped policy, which
 * is how a hand-coded mind can be an anchor in the mix.
 */
export async function collectLeague({
  builds, role, opponents, seed, bouts, workers, cap, reward = GOLEM_REWARD,
  name = MAIN_NAME, onProgress = null,
}) {
  const contenders = { [name]: contenderFor(role, true) };
  for (const opponent of opponents) contenders[opponent.name] = opponent.contender;
  const pairs = leaguePairs(opponents, name);
  // Rounded up to a whole number of cycles, which is what makes the declared mix the realised
  // one. `scheduleJobs` walks the cycle with `pairing % cycle.length`, so a run of 32 pairings
  // over a cycle of 5 gives the first two entries seven slots and the last three six, and the
  // shares an iteration promised would be off by a fifth in a way that changes as the pool grows.
  // Buying a few extra bouts is much cheaper than reasoning about that afterwards.
  const wanted = Math.max(1, Math.ceil(bouts / 2));
  const jobs = scheduleJobs({
    pool: builds, policies: [name, ...opponents.map((o) => o.name)],
    pairings: Math.ceil(wanted / pairs.length) * pairs.length, seed, cap, mirror: true, contenders, pairs,
  });
  const rows = await runJobs(jobs, { workers, contenders, record: [name], onProgress });
  const parts = [];
  const margins = new Map();
  let margin = 0;
  let decided = 0;
  for (const row of rows) {
    if (row === null) continue;
    if (row.winner !== null) decided += 1;
    const mine = row.left.policy === name ? "left" : "right";
    const theirs = mine === "left" ? "right" : "left";
    const pack = row.samples?.[mine];
    if (!pack || pack.logp.length === 0) continue;
    if (pack.kind !== "pilot") throw new Error(`a league rollout collected ${pack.kind} samples; PPO reads the pilot columns`);
    parts.push({ ...pack, side: mine });
    margin += pack.margin;
    const against = row[theirs].policy;
    if (!margins.has(against)) margins.set(against, []);
    margins.get(against).push(pack.margin);
  }
  const rollout = mergeRollouts(parts, reward);
  rollout.bouts = rows.length;
  rollout.decided = rows.length === 0 ? 0 : decided / rows.length;
  rollout.margin = parts.length === 0 ? 0 : margin / parts.length;
  rollout.byOpponent = Object.fromEntries([...margins].map(([k, v]) => [k, meanOf(v)]));
  // The counts beside the means, because the declared mix and the realised one are two different
  // things and a run that only reported the means could not tell you which it had.
  rollout.boutsByOpponent = Object.fromEntries([...margins].map(([k, v]) => [k, v.length]));
  return rollout;
}

/**
 * One role's turn: collect against its opponents, fit, and freeze the normalisation afterwards.
 *
 * The normalisation is extended *after* the fit and not before, which is `train-ppo.mjs`'s rule
 * and matters more here than it did there: a league has several roles walking their own column
 * statistics, and a rollout's log-probabilities belong to the observation the collecting head
 * actually saw. Adam's moments live in `moments` and are the caller's, so a role keeps them
 * across its turns and a reset exploiter starts cold in the same way a fresh run does.
 */
export async function trainRole({
  builds, role, opponents, moments, seed, bouts, workers, cap, reward = GOLEM_REWARD,
  name = MAIN_NAME, onProgress = null, fit: knobs = {},
}) {
  const rollout = await collectLeague({
    builds, role, opponents, seed, bouts, workers, cap, reward, name, onProgress,
  });
  if (rollout.count === 0) throw new Error(`${name} collected no asks at all`);
  const summary = episodeReturns(rollout);
  const fit = ppoFit(rollout, {
    weights: role.weights, logSigma: role.logSigma, valueWeights: role.valueWeights,
    norm: role.norm, seed: (seed ^ 0x1ea9e0) >>> 0, valueLayout: LEAGUE_VALUE_LAYOUT,
    ...knobs, actor: moments.actor, spread: moments.spread, critic: moments.critic,
  });
  moments.actor = fit.actor;
  moments.spread = fit.spread;
  moments.critic = fit.critic;
  role.norm = extendNormalisation(role.norm, rollout);
  return { rollout, summary, fit };
}

/**
 * A role over a `train-ppo.mjs` checkpoint, which is how a league starts from a fit rather than
 * from noise.
 *
 * The checkpoint carries the actor, the critic, the spreads and the frozen normalisation and does
 * not carry Adam's moments, which is exactly a role minus its history -- so this is a rename and
 * not a conversion. A league seeded this way begins where a trainer left off and spends its
 * overnight on the question the league is for, rather than on the twenty iterations of finding
 * the weapon that a single-opponent run has already paid for.
 *
 * The critic is the one thing that may not fit: `train-ppo.mjs`'s CLI defaults to a 64x64 value
 * net and so does this file, but a checkpoint written under `--value-hidden` something else has a
 * different number of value weights and there is nothing sensible to do with them. That case
 * starts the critic over rather than guessing, and says so.
 */
export function roleFromCheckpoint(json, seed) {
  const valueWeights = Float64Array.from(json.valueWeights ?? []);
  const fitted = valueWeights.length === netSize(LEAGUE_VALUE_LAYOUT);
  return {
    role: {
      weights: Float64Array.from(json.weights),
      valueWeights: fitted ? valueWeights : initWeights(LEAGUE_VALUE_LAYOUT, (seed ^ 0x1c) >>> 0),
      logSigma: Float64Array.from(json.logSigma),
      norm: json.normalisation,
      seed: seed >>> 0, history: [], bornAt: 0,
    },
    critic: fitted,
  };
}

/**
 * How a group's slots are spread over the members of that group, rotating with the offset.
 *
 * The pool's share is declared for the *group* and not per entry, because a per-entry weight
 * would mean the past crowds out the present as the pool grows: eight checkpoints at one slot
 * each is eight ninths of an iteration spent on frozen minds. So `--share-pool` is the whole
 * pool's, and this hands it out.
 *
 * When there are more members than slots some members get none this iteration, and `offset` is
 * what stops that being the same members every time: passing the iteration number walks the
 * window forward, so over a few iterations everything in the pool is played. It does mean the
 * mix an iteration actually ran is a property of the iteration and not of the flags, which is
 * why the log line carries the realised shares rather than the declared ones.
 */
export function spreadSlots(count, total, offset = 0) {
  if (count <= 0) return [];
  const slots = new Array(count).fill(Math.floor(total / count));
  const spare = total % count;
  for (let i = 0; i < spare; i += 1) slots[(((offset + i) % count) + count) % count] += 1;
  return slots;
}

/** The league's own version, bumped when a saved state stops meaning what a reader thinks. */
export const LEAGUE_VERSION = 1;

export const statePath = (dir) => resolve(dir, "league.json");
export const poolPath = (dir, iteration) => resolve(dir, poolName(iteration) + ".json");

/**
 * Save the league so a killed run resumes rather than restarts.
 *
 * This is not a convenience. An overnight league is hours of a machine's time and the harness has
 * taken a V8 fatal out of a long run before now; a run that cannot be resumed is a run whose worst
 * case is the whole night. The main and the exploiters ride in the state file and the pool does
 * not, because a pool entry is written once and read many times and `--matrix` wants to load one
 * without loading the rest.
 *
 * **Adam's moments were what this file did not save, and Session 04 of the learn set changed
 * that.** The old argument was that they are the shape of the last few gradients and not the mind,
 * and that a resumed role spends an iteration getting its second moments back -- which is true and
 * is the whole objection: an arm the sweep runner restarts three times overnight pays that
 * iteration three times, and each one is a pass in which every weight moves by exactly the rate in
 * whatever direction one minibatch chose. `moments` is a map from role name to the three blocks,
 * the caller's object, and is optional: a state written without it reads back as cold.
 */
export function saveLeague(dir, state, moments = null) {
  mkdirSync(dir, { recursive: true });
  const text = JSON.stringify({
    version: LEAGUE_VERSION, policy: POLICY_VERSION, features: PILOT_FEATURES_VERSION,
    seed: state.seed, date: state.date, iteration: state.iteration,
    bouts: state.bouts, steps: state.steps,
    main: roleToJson(state.main),
    exploiters: state.exploiters.map(roleToJson),
    pool: state.pool.map(({ iteration }) => ({ iteration })),
    taken: state.taken.slice(),
    adam: moments === null ? null : {
      main: momentsToJson(moments[MAIN_NAME] ?? null),
      exploiters: state.exploiters.map((_, slot) => momentsToJson(moments[exploiterName(slot)] ?? null)),
    },
  });
  // Written aside and renamed into place, because this file is rewritten every iteration and a
  // kill during a two megabyte write leaves JSON that `--resume` cannot parse -- which turns a
  // crash the watchdog would have restarted into a lost night. The rename is atomic and replaces
  // the old file on both platforms this runs on.
  const temp = statePath(dir) + ".tmp";
  writeFileSync(temp, text);
  renameSync(temp, statePath(dir));
}

/** Read it back, refusing a state whose policy version is not this build's. */
export function loadLeague(dir) {
  const json = JSON.parse(readFileSync(statePath(dir), "utf8"));
  if (json.version !== LEAGUE_VERSION) throw new Error(`${statePath(dir)} is league version ${json.version}, not ${LEAGUE_VERSION}`);
  if (json.policy !== POLICY_VERSION) throw new Error(`${statePath(dir)} was written under policy version ${json.policy}, not ${POLICY_VERSION}`);
  if (json.features !== PILOT_FEATURES_VERSION) throw new Error(`${statePath(dir)} was written over feature version ${json.features}, not ${PILOT_FEATURES_VERSION}`);
  return {
    seed: json.seed >>> 0, date: json.date, iteration: json.iteration,
    bouts: json.bouts ?? 0, steps: json.steps ?? 0,
    main: roleFromJson(json.main),
    exploiters: (json.exploiters ?? []).map(roleFromJson),
    pool: (json.pool ?? []).map(({ iteration }) => ({ iteration })),
    // Every snapshot ever written, playing or thinned out. `thinPool` takes entries out of the
    // cycle and this list is why nothing is lost by that: the matrix reads `taken`, so a mind
    // that stopped being sparred with is still a row of the progress check.
    taken: (json.taken ?? (json.pool ?? []).map(({ iteration }) => iteration)).slice(),
    adam: json.adam ?? null,
  };
}

/**
 * The saved Adam blocks as a map from role name to the three of them, with what did not come back.
 *
 * Every role is answered, whether or not the file had anything for it, so the caller's `moments`
 * map is complete after one call and a role that a later session adds to a league cannot end up
 * without an entry. The warnings are named by role, because "the critic started cold" is a
 * different fact about the main than about `exploiter-1`. A state file with no `adam` at all is
 * every league written before Session 04 of the learn set: `saved` says so once, and the per-block
 * warnings are held back, because three lines a role saying the same thing is noise.
 */
export function momentsFromLeague(json, roles) {
  const sizes = {
    actor: netSize(POLICY_LAYOUT), spread: ACTION_AXES, critic: netSize(LEAGUE_VALUE_LAYOUT),
  };
  const moments = {};
  const warnings = [];
  const saved = json?.adam !== null && json?.adam !== undefined;
  const read = (name, block) => {
    const got = momentsFromJson(block ?? null, sizes);
    moments[name] = got.moments;
    if (saved) for (const warning of got.warnings) warnings.push(`${name}: ${warning}`);
  };
  read(MAIN_NAME, json?.adam?.main ?? null);
  for (let slot = 0; slot < roles; slot += 1) read(exploiterName(slot), json?.adam?.exploiters?.[slot] ?? null);
  return { moments, warnings, saved };
}

/** A pool entry is a role written once; the loader caches, since an iteration reads all of them. */
export function poolLoader(dir) {
  const cache = new Map();
  return (iteration) => {
    if (!cache.has(iteration)) cache.set(iteration, roleFromJson(JSON.parse(readFileSync(poolPath(dir, iteration), "utf8"))));
    return cache.get(iteration);
  };
}

// ---------------------------------------------------------------- shipping a league's own mind

/**
 * The run's own log, rows in order, tolerating a half-written last line.
 *
 * `log()` appends one whole line at a time, so the only line a kill can leave truncated is the
 * last one. Refusing the whole file over it would mean an arm that died at the wrong instant
 * could not be read or shipped from, which is the opposite of what the log is kept for.
 */
export function readLog(dir) {
  const lines = readFileSync(resolve(dir, "league.jsonl"), "utf8")
    .split("\n").map((line) => line.trim()).filter(Boolean);
  const rows = [];
  lines.forEach((line, i) => {
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      if (i !== lines.length - 1) throw error;
    }
  });
  return rows;
}

/**
 * Which mind `--ship` means, checked against the snapshots the arm actually took.
 *
 * `main` is the live main. A number must be an iteration a snapshot was written at, and the
 * refusal lists the ones there are -- because the failure it replaces is an `ENOENT` raised
 * inside a `readFileSync` on a pool file nobody wrote, which reads as a corrupt arm.
 */
export function shippedIteration(state, which) {
  if (which === null || which === undefined || which === MAIN_NAME) return state.iteration;
  const iteration = Number(which);
  if (!Number.isInteger(iteration) || !state.taken.includes(iteration)) {
    throw new Error(`iteration ${which} is not a snapshot of this league; it took `
      + `${state.taken.length === 0 ? "none" : state.taken.join(", ")}`);
  }
  return iteration;
}

/**
 * What the run had spent by an iteration, summed from the log's own rows.
 *
 * `state.bouts` and `state.steps` are the totals at the arm's *current* iteration, so quoting
 * them in a module shipped from an older snapshot credits that snapshot with training it never
 * saw. A provenance line that is wrong in a generated artifact is wrong for as long as the file
 * exists, and nobody re-derives it.
 */
export function spentBy(rows, upTo) {
  let bouts = 0;
  let steps = 0;
  for (const row of rows) {
    if (row.type === "iteration" && row.iteration <= upTo) {
      bouts += row.bouts;
      steps += row.steps;
    }
  }
  return { bouts, steps };
}

/**
 * The sentence a reader of the generated module gets, which the renderer cannot build itself.
 *
 * `renderPolicyModule` knows `--terminals` and nothing about a league's opponent mix, and it
 * writes "on the whole pool" directly after this sentence. So the anchor and the emphasis are
 * said here or nowhere -- and the emphasis clause has to read correctly *before* that "on the
 * whole pool", because the pool really is the whole pool and the emphasis is only how often
 * each of its builds comes up.
 *
 * `upTo` is the iteration being shipped, and the pool it names is the pool as it stood *before*
 * that iteration: a snapshot from iteration 8 of a run that has since taken five past selves
 * sparred with none of them, and saying otherwise credits it with opponents it never met.
 */
export function opponentSentence(state, head, upTo = Infinity) {
  const selves = state.taken.filter((iteration) => iteration < upTo).length;
  const exploiters = state.exploiters.length;
  const parts = [];
  if (selves > 0) parts.push(`${selves} of its own past selves`);
  if (exploiters > 0) parts.push(`${exploiters} exploiter${exploiters === 1 ? "" : "s"}`);
  if (head.anchor !== null && head.anchor !== undefined) parts.push(head.anchor);
  // A league with an empty pool, no exploiters and no anchor is the mirror the league exists to
  // get away from, and the module should say so rather than announce a league of nothing.
  if (parts.length === 0) return "itself";
  const emphasise = head.emphasise ?? [];
  const drawn = emphasise.length === 0 ? ""
    : `, with ${emphasise.join(" and ")} builds drawn ${head.emphasis} times as often,`;
  const mix = parts.length === 1 ? parts[0]
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `a league of ${mix}${drawn}`;
}

/**
 * The shipped table: the mind's numbers, and its provenance read off the run rather than retyped.
 *
 * Every field here is one `PolicyWeights` declares, and no field is one it does not. That is not
 * tidiness: the generated module assigns an object literal to that type, so a spare knob in the
 * header is an excess property and `npm run check` refuses the file the ship just wrote.
 */
export function shipTable(role, { state, head, iteration, spent, rated, date }) {
  const baselines = {};
  for (const name of rated.names) if (name !== FIT_NAME) baselines[name] = rated.results[name].score;
  return policyTable(role.weights, role.logSigma, {
    seed: state.seed, date, iterations: iteration, bouts: spent.bouts, steps: spent.steps,
    halfLife: head.halfLife, lambda: head.lambda, clip: head.clip, entropy: head.entropy,
    reward: head.reward ?? GOLEM_REWARD,
    opponent: opponentSentence(state, head, iteration), terminals: head.terminals ?? [],
    normalisation: {
      count: role.norm.count,
      mean: Array.from(role.norm.mean, round5),
      variance: Array.from(role.norm.variance, round5),
    },
    score: rated.results[FIT_NAME].score, baselines,
  });
}

/**
 * Every stored pair played against every other, which is the session's monotonicity check.
 *
 * The claim a league makes and a mirror cannot is that progress happened rather than cycled, and
 * the only honest form of that claim is a matrix: for every pair of checkpoints, who beat whom
 * and by how much of a bar. A run whose later minds beat their earlier ones reads as a lower
 * triangle of one sign; a cycling pair reads as a sign that changes as you walk the diagonal, and
 * that is visible here and nowhere else.
 *
 * Nothing is recorded and nothing is fitted: both sides play their mean command, both corners of
 * every pairing are run, and the number is the end-of-bout vitality difference. `entries` is a
 * list of `{name, role}` in the order the matrix should read.
 *
 * `bouts` is per *pair* and not for the run, unlike everywhere else in this file, because a cell
 * is the number being read and a total would quietly shrink every cell as the pool grew. Ten
 * minds are forty five pairs, so the run is forty five times what is asked for.
 */
export async function leagueMatrix({ builds, entries, seed, bouts, workers, cap, onProgress = null }) {
  if (entries.length < 2) throw new Error("a matrix wants at least two minds");
  const contenders = {};
  for (const { name, role } of entries) contenders[name] = contenderFor(role, false);
  const names = entries.map((e) => e.name);
  const pairs = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) pairs.push([names[i], names[j]]);
  }
  const jobs = scheduleJobs({
    pool: builds, policies: names, pairings: pairs.length * Math.max(1, Math.ceil(bouts / 2)),
    seed, cap, mirror: true, contenders, pairs,
  });
  const rows = await runJobs(jobs, { workers, contenders, onProgress });
  const cells = new Map();
  const columns = new Map(names.map((n) => [n, { bouts: 0, decided: 0, strokes: 0, blows: [], started: 0, aborts: 0, damage: [] }]));
  for (const row of rows) {
    if (row === null) continue;
    const key = `${row.left.policy}|${row.right.policy}`;
    const back = `${row.right.policy}|${row.left.policy}`;
    const margin = row.left.vitality - row.right.vitality;
    if (!cells.has(key)) cells.set(key, []);
    if (!cells.has(back)) cells.set(back, []);
    cells.get(key).push(margin);
    cells.get(back).push(-margin);
    for (const name of ["left", "right"]) {
      const c = columns.get(row[name].policy);
      if (c === undefined) continue;
      c.bouts += 1;
      if (row.winner !== null) c.decided += 1;
      c.strokes += row[name].strokes ?? 0;
      if ((row[name].strokes ?? 0) > 0) c.blows.push(row[name].blows ?? 0);
      c.started += row[name].strokesStarted ?? 0;
      c.aborts += row[name].aborts ?? 0;
      c.damage.push(row[name].damage);
    }
  }
  // The tripwire's own columns, taken off the same rows the matrix is. A league that climbs its
  // matrix by never committing climbs it all the same, and the matrix cannot see that; these can.
  // Every one is a ratio of two sums rather than a mean of ratios, because a bout with no strokes
  // has no abort fraction and averaging over it would invent one.
  const structural = {};
  for (const [name, c] of columns) {
    structural[name] = {
      bouts: c.bouts,
      decided: c.bouts === 0 ? 0 : round5(c.decided / c.bouts),
      strokes: c.bouts === 0 ? 0 : round5(c.strokes / c.bouts),
      blows: round5(meanOf(c.blows)),
      strokesStarted: c.bouts === 0 ? 0 : round5(c.started / c.bouts),
      abortFraction: c.started === 0 ? 0 : round5(c.aborts / c.started),
      damage: round5(meanOf(c.damage)),
    };
  }
  const matrix = {};
  for (const a of names) {
    matrix[a] = {};
    for (const b of names) {
      if (a === b) { matrix[a][b] = null; continue; }
      const xs = cells.get(`${a}|${b}`) ?? [];
      matrix[a][b] = { bouts: xs.length, margin: round5(meanOf(xs)) };
    }
  }
  return { names, matrix, structural, bouts: rows.length };
}

/**
 * Does the matrix read as progress, or as a cycle?
 *
 * `names` are in age order, so the claim is that every mind beats every mind older than `lag`
 * places. Returns the pairs that break it, which is a list a reader can act on rather than a
 * fraction they cannot. `lag` is 1 by default -- adjacent checkpoints are four iterations apart
 * and a pair inside noise of each other is not evidence either way, so a run reads its own
 * output with a larger lag when the adjacent cells are small.
 */
export function matrixBreaks({ names, matrix }, { lag = 1, margin = 0 } = {}) {
  const breaks = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = 0; j + lag <= i; j += 1) {
      const cell = matrix[names[i]]?.[names[j]];
      if (cell && cell.margin <= margin) breaks.push({ newer: names[i], older: names[j], margin: cell.margin });
    }
  }
  return breaks;
}

// ------------------------------------------------------------------------------------- main

const isMain = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
  };
  const has = (name) => argv.includes(`--${name}`);
  const seed = Number(flag("seed", 20260914)) >>> 0;
  const iterations = Math.max(1, Number(flag("iterations", 40)));
  const bouts = Math.max(2, Number(flag("bouts", 64)));
  const exploiterBouts = Math.max(2, Number(flag("exploiter-bouts", bouts)));
  const cap = Number(flag("cap", 60));
  const random = Math.max(0, Number(flag("random", 40)));
  const workers = Math.max(1, Number(flag("workers", Math.max(1, availableParallelism() - 2))));
  // Absent is the viable set since Session 01 of the learn set; `--terminals all` is every build.
  const terminals = parseTerminals(flag("terminals", null));
  // The weighting, which is what a league is supposed to use where the calibration used a filter.
  const emphasise = flag("emphasise", "").split(",").map((t) => t.trim()).filter(Boolean);
  const emphasis = Math.max(1, Number(flag("emphasis", 3)));
  const poolEvery = Math.max(1, Number(flag("pool-every", 4)));
  const poolCap = Math.max(2, Number(flag("pool-cap", 8)));
  const exploiters = Math.max(0, Number(flag("exploiters", 2)));
  const exploiterEvery = Math.max(1, Number(flag("exploiter-every", 1)));
  const shareSelf = Math.max(0, Number(flag("share-self", 1)));
  const sharePool = Math.max(0, Number(flag("share-pool", 2)));
  const shareExploiter = Math.max(0, Number(flag("share-exploiter", 1)));
  // A hand-coded mind as a fixed anchor in the mix, off by default. The plan freezes the league's
  // three roles and this is not one of them; it is here because the machinery is the same -- an
  // opponent with no contender is a shipped policy -- and because a league whose pool turns out
  // to be too weak an opponent has exactly one cheap thing to try next, and this is it. A night
  // run with it on says so in its header.
  const anchor = flag("anchor", null);
  const shareAnchor = Math.max(0, Number(flag("share-anchor", 1)));
  const resetGain = Number(flag("reset-gain", 0.02));
  const resetPatience = Math.max(1, Number(flag("reset-patience", 3)));
  const dir = resolve(flag("dir", "tournaments/league"));
  const resume = has("resume");
  // A `train-ppo.mjs` checkpoint to start the main from, so an overnight does not re-learn what a
  // day of single-opponent runs already paid for. Only read when a league is created.
  const from = flag("from", null);
  // The shipped module, written from the main at the end of the run. The reward is `GOLEM_REWARD`
  // and cannot be moved from here, so `train-ppo.mjs`'s refusal has nothing to refuse.
  const write = flag("out", null);
  const matrixOnly = has("matrix");
  // Ship a mind that is not the live main. `--ship 16` writes the module from `pool-16`, which is
  // the answer whenever the rating curve says an older snapshot is the better mind -- and the
  // curve is read after the run, when `--out` is long gone. It reads the arm and never writes to
  // it, so unlike `--matrix` there is nothing it can do to a league in flight.
  const ship = flag("ship", null);
  const shipOnly = ship !== null;
  const every = Math.max(0, Number(flag("evaluate", 5)));
  const evalBouts = Math.max(2, Number(flag("eval-bouts", 96)));
  const finalBouts = Math.max(2, Number(flag("final-bouts", evalBouts * 4)));
  const shipBouts = Math.max(2, Number(flag("ship-bouts", finalBouts)));
  const matrixBouts = Math.max(2, Number(flag("matrix-bouts", 32)));
  const matrixLag = Math.max(1, Number(flag("matrix-lag", 1)));
  const matrixCap = Math.max(2, Number(flag("matrix-cap", 10)));
  // The probe is over the *whole* pool and not the training filter, deliberately: a fit that
  // trained on mauls alone is still asked what it does on a blade, and a tripwire that only
  // looked where the run was trained could not see a mind that had specialised into a corner.
  const probeBouts = Math.max(2, Number(flag("probe-bouts", 4)));
  // The fit's knobs are `train-ppo.mjs`'s, with its defaults, and are passed through unread: a
  // league that quietly fitted under different numbers than the trainer would make the two runs
  // incomparable, which is the whole reason the trainer's numbers were swept.
  const knobs = {
    halfLife: Number(flag("half-life", 4)), lambda: Number(flag("lambda", 0.95)),
    clip: Number(flag("clip", 0.2)), entropy: Number(flag("entropy", 0.003)),
    rate: Number(flag("rate", 1e-4)), valueRate: Number(flag("value-rate", 1e-3)),
    sigmaRate: Number(flag("sigma-rate", Number(flag("rate", 1e-4)) * 10)),
    epochs: Math.max(1, Number(flag("epochs", 4))), batch: Math.max(1, Number(flag("batch", 4096))),
    targetKl: Math.max(0, Number(flag("target-kl", 0.03))),
    sigmaFloor: Number(flag("sigma-floor", -3)), sigmaRoof: Number(flag("sigma-roof", 0.5)),
  };
  // The reward table, four flags spelled exactly as `scripts/train-ppo.mjs` spells them so that
  // one sweep manifest reads across both scripts. The old refusal's argument is kept and moved:
  // what may not happen is *shipping* a run paid under a table that is not `GOLEM_REWARD`, because
  // `renderPolicyModule` writes the shipped table's name into the module and a header saying
  // `reward: GOLEM_REWARD` over weights fitted to something else is a lie nothing in the tree can
  // catch. So the refusal is on `--out`, and it fires before the run rather than after it.
  const reward = Object.freeze({
    win: Number(flag("reward-win", GOLEM_REWARD.win)),
    clinch: Number(flag("reward-clinch", GOLEM_REWARD.clinch)),
    idle: Number(flag("reward-idle", GOLEM_REWARD.idle)),
    tick: Number(flag("reward-tick", GOLEM_REWARD.tick)),
  });
  const shippedReward = REWARD_KEYS.every((key) => reward[key] === GOLEM_REWARD[key]);
  if (write !== null && !shippedReward) {
    throw new Error(`--out refuses a run paid under ${JSON.stringify(reward)}, which is not GOLEM_REWARD; `
      + "move the table in src/golem/reward.ts first, or ship from the checkpoint instead");
  }
  // A run with no rating cannot write a module either, and finding that out after the last
  // iteration is finding it out after the night. `--evaluate 0` is what the sweep runner passes.
  if (write !== null && every === 0 && !shipOnly) {
    throw new Error("--out wants a rating to put in the module header; run with --evaluate above zero");
  }

  mkdirSync(dir, { recursive: true });
  const out = resolve(dir, "league.jsonl");
  const log = (line) => writeFileSync(out, JSON.stringify(line) + "\n", { flag: "a" });
  const progress = (label) => ({ done, total, seconds }) => {
    if (done % 128 === 0 || done === total) console.log(`  ${label}: ${done}/${total} bouts, ${seconds.toFixed(0)} s`);
  };
  const printDifferences = (name, differences) => {
    for (const [other, d] of Object.entries(differences)) {
      console.log(`    ${name} - ${other.padEnd(8)} points ${d.points >= 0 ? "+" : ""}${d.points.toFixed(4)} `
        + `+- ${d.pointsSem.toFixed(4)}  bar ${d.bar >= 0 ? "+" : ""}${d.bar.toFixed(4)} `
        + `+- ${d.barSem.toFixed(4)}  d ${d.d >= 0 ? "+" : ""}${d.d.toFixed(3)}`);
    }
  };
  const date = new Date().toISOString().slice(0, 10);

  let state;
  if (shipOnly && matrixOnly) {
    throw new Error("--ship and --matrix are two read-only modes; run one and then the other");
  }
  if (resume || matrixOnly || shipOnly) {
    if (!existsSync(statePath(dir))) throw new Error(`${statePath(dir)} does not exist; drop --resume to start a league there`);
    if (from !== null) throw new Error("--from starts a new league; a resumed one already has a main");
    state = loadLeague(dir);
    if (has("exploiters") && state.exploiters.length !== exploiters) {
      throw new Error(`${statePath(dir)} carries ${state.exploiters.length} exploiters and --exploiters says `
        + `${exploiters}; a role cannot be added to or taken from a league in flight`);
    }
    console.log(matrixOnly || shipOnly
      ? `  read ${statePath(dir)} at iteration ${state.iteration}`
      : `  resuming at iteration ${state.iteration + 1} from ${statePath(dir)}`);
  } else {
    if (existsSync(statePath(dir))) throw new Error(`${statePath(dir)} exists; a league does not overwrite another league, pass --resume or --dir`);
    let main = freshRole(seed);
    if (from !== null) {
      const started = roleFromCheckpoint(JSON.parse(readFileSync(resolve(from), "utf8")), seed);
      main = started.role;
      console.log(`  starting the main from ${from}`
        + `${started.critic ? "" : " -- its critic is a different width and was started over"}`);
    }
    state = {
      seed, date, iteration: 0, bouts: 0, steps: 0, main,
      // The exploiters begin as copies of the main rather than as noise. An exploiter's job is to
      // find *this* mind's habit, and one that spends its first ten turns learning to hold a
      // weapon is ten turns of the main's rollout spent on an opponent that cannot punish
      // anything -- which is a share of every iteration paid for nothing.
      exploiters: Array.from({ length: exploiters }, (_, slot) => copyRole(main, (seed ^ (0xe0 + slot * 0x101)) >>> 0, 0)),
      pool: [], taken: [],
    };
  }
  // Adam's moments, one block a role, read back off the state file since Session 04 of the learn
  // set. A league written before that has none and starts cold, which is said once rather than
  // per role: an arm the runner restarted is meant to be the same run, and the one way to tell it
  // is not is that nobody printed a line.
  const read = momentsFromLeague(state, state.exploiters.length);
  const moments = read.moments;
  if (!read.saved && (resume || matrixOnly || shipOnly)) {
    console.log(`  ${statePath(dir)} carries no Adam moments; every role starts cold`);
  }
  for (const warning of read.warnings) console.log(`  ${warning}`);
  const load = poolLoader(dir);

  if (shipOnly) {
    if (write === null) throw new Error("--ship writes a module and needs somewhere to put it; pass --out <path>");
    const rows = readLog(dir);
    const head = rows.find((row) => row.type === "header");
    if (head === undefined) throw new Error(`${out} has no header row, so the run's own knobs cannot be read`);
    const iteration = shippedIteration(state, ship);
    const role = ship === MAIN_NAME
      ? state.main
      : roleFromJson(JSON.parse(readFileSync(poolPath(dir, iteration), "utf8")));
    const eseed = (state.seed ^ 0xc0f1c0f1) >>> 0;
    const rated = await ratePolicy({
      weights: role.weights, logSigma: role.logSigma, norm: role.norm,
      // The evaluation pool is the run's own, derived from the state seed exactly as the in-run
      // rating derives it, so a shipped number and a rating row are the same measurement. Mirrored,
      // so it is drawn through `viableMirror` and not merely through the class table.
      pool: poolFor({ seed: eseed, random: head.random ?? random, terminals, mirror: true }),
      seed: eseed, terminals,
      bouts: Math.max(2, Math.ceil(shipBouts / PPO_LEAGUE.length / 2) * 2), workers, cap, mirror: true,
      onProgress: progress(`rate ${ship}`),
    });
    console.log(`  === ${ship} of ${dir}: ${rated.per} bouts a contender ===`);
    printDifferences(ship, rated.differences);
    const spent = spentBy(rows, iteration);
    const table = shipTable(role, { state, head, iteration, spent, rated, date });
    const text = renderPolicyModule(table, "scripts/league.mjs");
    writeFileSync(resolve(write), text);
    console.log(`  wrote ${write} (${(text.length / 1024).toFixed(1)} KB)`);
    console.log(`  ${table.iterations} iterations, ${table.bouts} bouts, ${table.steps} asks, `
      + `against ${table.opponent}`);
  } else if (matrixOnly) {
    // A matrix is quadratic in its rows and a night at `--pool-every 4` takes thirty of them,
    // which is 435 pairs and three hours of bouts to read one table. `thinPool` is the right
    // thinning here for the same reason it is the right one in the sparring cycle: it keeps the
    // oldest and the newest, so the longest baseline in the run is always a row of the answer.
    const rows = thinPool(state.taken.map((iteration) => ({ iteration })), Math.max(2, matrixCap))
      .map((e) => e.iteration);
    const entries = rows.map((iteration) => ({ name: poolName(iteration), role: load(iteration) }));
    // The main goes in as the newest row unless the newest snapshot *is* the main, which it is
    // whenever the run stopped on a snapshot iteration. Playing a mind against a byte-identical
    // copy of itself would put a cell of exactly zero on the diagonal-but-one and read as a
    // broken pair, which is the one reading a progress check must not invent.
    if (!rows.includes(state.iteration)) entries.push({ name: MAIN_NAME, role: state.main });
    // `leagueMatrix` schedules with `mirror: true`, so the pool is the mirrored one: a cell of the
    // matrix is two minds on one body, and a body neither of them can finish is a cell of zero.
    const builds = poolFor({ seed: (seed ^ 0xa11) >>> 0, random, terminals, mirror: true });
    const result = await leagueMatrix({
      builds, entries, seed: (seed ^ 0xc0f1c0f1) >>> 0, bouts: matrixBouts, workers, cap,
      onProgress: progress("matrix"),
    });
    const breaks = matrixBreaks(result, { lag: matrixLag });
    console.log(`  matrix over ${result.names.length} minds, ${result.bouts} bouts:`);
    const width = Math.max(...result.names.map((n) => n.length));
    console.log(`    ${"".padEnd(width)}  ${result.names.map((n) => n.padStart(9)).join(" ")}`);
    for (const a of result.names) {
      const cells = result.names.map((b) => {
        const cell = result.matrix[a][b];
        return (cell === null ? "--" : `${cell.margin >= 0 ? "+" : ""}${cell.margin.toFixed(4)}`).padStart(9);
      });
      console.log(`    ${a.padEnd(width)}  ${cells.join(" ")}`);
    }
    console.log(`  ${breaks.length} pair${breaks.length === 1 ? "" : "s"} where a newer mind does not `
      + `beat one at least ${matrixLag} place${matrixLag === 1 ? "" : "s"} older`);
    for (const b of breaks) console.log(`    ${b.newer} vs ${b.older}: ${b.margin >= 0 ? "+" : ""}${b.margin.toFixed(4)}`);
    // The tripwire, which the plan puts here and not beside the training loop: a matrix says who
    // beat whom and is blind to a league that got better at not fighting, and these four columns
    // are what that would look like. The first three come off the matrix's own rows and cost
    // nothing; the fourth is a separate probe against a motionless dummy and is the one that
    // caught Session 13's fit, so it is worth the bouts.
    console.log("");
    console.log(`    ${"mind".padEnd(width)}  ${["bouts", "decided", "strokes", "blows", "started", "abort%", "damage"].map((h) => h.padStart(8)).join(" ")}`);
    for (const a of result.names) {
      const c = result.structural[a];
      console.log(`    ${a.padEnd(width)}  ${[
        String(c.bouts), `${(c.decided * 100).toFixed(0)} %`, c.strokes.toFixed(1), c.blows.toFixed(2),
        c.strokesStarted.toFixed(1), `${(c.abortFraction * 100).toFixed(0)} %`, c.damage.toFixed(1),
      ].map((v) => v.padStart(8)).join(" ")}`);
    }
    const probe = await idleProbe({
      // The probe is a build against a motionless copy of *itself*, which is a mirror, so it draws
      // the mirrored pool: the classes whose kill rate this table is worth reading.
      pool: poolFor({ seed: (seed ^ 0xc0f1c0f1) >>> 0, random, terminals, mirror: true }), name: MAIN_NAME,
      contender: contenderFor(state.main, false), bouts: probeBouts, workers, cap,
      seed: (seed ^ 0xc0f1c0f1) >>> 0, onProgress: progress("idle probe"),
    });
    console.log("");
    console.log(formatIdleProbe({ ...probe, name: `main at iteration ${state.iteration}, greedy` }));
    log({
      type: "matrix", at: state.iteration, lag: matrixLag, bouts: result.bouts, names: result.names,
      matrix: result.matrix, breaks, structural: result.structural,
      probe: { kills: probe.kills, bouts: probe.bouts, killRate: probe.killRate, always: probe.alwaysBuilds, ever: probe.everBuilds, byTerminal: probe.byTerminal },
    });
    console.log(`log: ${out}`);
  } else {
    // Held as an object rather than logged inline, because `--out` builds the shipped module's
    // provenance out of exactly this row -- the same one `--ship` reads back off disk later --
    // so the two paths cannot drift into quoting different knobs for the same run.
    const header = {
      seed, date, version: LEAGUE_VERSION, policy: POLICY_VERSION,
      features: PILOT_FEATURES_VERSION, layout: POLICY_LAYOUT, valueLayout: LEAGUE_VALUE_LAYOUT,
      reward, iterations, bouts, exploiterBouts, cap, random, workers, terminals, from,
      emphasise, emphasis,
      poolEvery, poolCap, exploiters, exploiterEvery,
      shareSelf, sharePool, shareExploiter, anchor, shareAnchor, resetGain, resetPatience,
      evaluate: every, evalBouts, finalBouts, resumedAt: resume ? state.iteration : null, ...knobs,
    };
    log({ type: "header", ...header });
    console.log(`league: seed ${seed}, iterations ${state.iteration + 1}..${iterations} of ${bouts} bouts, `
      + `${state.exploiters.length} exploiters, pool cap ${poolCap}, ${workers} workers`);

    let rated = null;
    const ratePoint = async (iteration, wanted) => {
      const eseed = (seed ^ 0xc0f1c0f1) >>> 0;
      const result = await ratePolicy({
        // The same pool the iteration collected on, which is what changed in Session 01 of the
        // learn set. It used to be the whole fifty-two on the argument that a session's number is
        // what the mind does against the bodies it will actually meet -- and the bodies it will
        // actually meet are the ones the screen now draws, which are the viable ones. A rating on
        // a pool the rollout never saw is two instruments; `--terminals all` is still there for
        // the close-out's table on everything.
        weights: state.main.weights, logSigma: state.main.logSigma, norm: state.main.norm,
        pool: poolFor({ seed: eseed, random, terminals, mirror: true }), seed: eseed, terminals,
        // `wanted` is the whole budget and `ratePolicy` spends it per contender per opponent, so
        // it is divided by the league's length the way the trainer divides it.
        bouts: Math.max(2, Math.ceil(wanted / PPO_LEAGUE.length / 2) * 2), workers, cap, mirror: true,
        onProgress: progress(`rate ${iteration}`),
      });
      console.log(`  === rating after iteration ${iteration}: ${result.per} bouts a contender ===`);
      printDifferences(MAIN_NAME, result.differences);
      log({ type: "rating", iteration, per: result.per, differences: result.differences, structural: result.results });
      return result;
    };
    if (every > 0 && state.iteration === 0) rated = await ratePoint(0, evalBouts);

    for (let iteration = state.iteration + 1; iteration <= iterations; iteration += 1) {
      const started = Date.now();
      // Mirrored, like the trainer's own rollouts: `collectLeague` puts one build in both
      // corners, so the pool is the bodies that can finish themselves. The emphasis is a weighting
      // over whatever survives that, which is why it is applied outside and not instead.
      const builds = emphasisedPool(
        poolFor({ seed: (seed ^ iteration) >>> 0, random, terminals, mirror: true }), emphasise, emphasis);
      // The present, frozen: the main as it stood when the iteration began. Both the main and the
      // exploiters play *this* copy rather than each other's moving weights, so an iteration is
      // one experiment and not a sequence of them, and the exploiters' margins are comparable
      // across a turn because they were all measured against the same opponent.
      const frozen = copyRole(state.main, (seed ^ 0x5e1f ^ iteration) >>> 0, iteration);
      const opponents = [];
      if (shareSelf > 0) opponents.push({ name: SELF_NAME, weight: shareSelf, contender: contenderFor(frozen) });
      const slots = spreadSlots(state.pool.length, sharePool, iteration);
      state.pool.forEach((entry, i) => {
        if (slots[i] > 0) {
          opponents.push({ name: poolName(entry.iteration), weight: slots[i], contender: contenderFor(load(entry.iteration)) });
        }
      });
      if (shareExploiter > 0) {
        for (let slot = 0; slot < state.exploiters.length; slot += 1) {
          opponents.push({ name: exploiterName(slot), weight: shareExploiter, contender: contenderFor(state.exploiters[slot]) });
        }
      }
      if (anchor !== null && shareAnchor > 0) opponents.push({ name: anchor, weight: shareAnchor });
      const turn = await trainRole({
        builds, role: state.main, opponents, moments: moments.main,
        seed: (seed + iteration * 7919) >>> 0, bouts, workers, cap, reward,
        name: MAIN_NAME, fit: knobs, onProgress: progress(`iteration ${iteration}`),
      });
      state.bouts += turn.rollout.bouts;
      state.steps += turn.rollout.count;

      // The exploiters' turn, against the same frozen main the league just played. An exploiter
      // that has stopped gaining on it is re-seeded from the *current* main and its Adam moments
      // are dropped with it, which is the one place in the run where a role starts over.
      const hunts = [];
      if (iteration % exploiterEvery === 0) {
        for (let slot = 0; slot < state.exploiters.length; slot += 1) {
          const name = exploiterName(slot);
          const hunt = await trainRole({
            builds, role: state.exploiters[slot], moments: moments[name],
            opponents: [{ name: SELF_NAME, weight: 1, contender: contenderFor(frozen) }],
            seed: (seed + iteration * 7919 + 104_729 * (slot + 1)) >>> 0,
            bouts: exploiterBouts, workers, cap, reward, name, fit: knobs,
            onProgress: progress(`${name} ${iteration}`),
          });
          const gain = round5(hunt.rollout.byOpponent[SELF_NAME] ?? hunt.rollout.margin);
          state.exploiters[slot].history.push(gain);
          const stalled = exploiterStalled(state.exploiters[slot].history, { gain: resetGain, patience: resetPatience });
          if (stalled) {
            state.exploiters[slot] = copyRole(state.main, (seed ^ (0xe0 + slot * 0x101) ^ (iteration * 31)) >>> 0, iteration);
            moments[name] = { actor: null, spread: null, critic: null };
          }
          state.bouts += hunt.rollout.bouts;
          state.steps += hunt.rollout.count;
          hunts.push({ slot, gain, decided: round5(hunt.rollout.decided), reset: stalled, steps: hunt.rollout.count });
        }
      }

      // The snapshot, taken after the turn so `pool-N` is the mind that finished iteration N.
      let snapshot = null;
      if (iteration % poolEvery === 0) {
        writeFileSync(poolPath(dir, iteration), JSON.stringify(roleToJson(state.main)));
        state.taken.push(iteration);
        state.pool = thinPool([...state.pool, { iteration }], poolCap);
        snapshot = iteration;
      }
      state.iteration = iteration;
      saveLeague(dir, state, moments);

      const line = {
        type: "iteration", iteration, bouts: turn.rollout.bouts, steps: turn.rollout.count,
        episodes: turn.summary.returns.length, decided: round5(turn.rollout.decided),
        margin: round5(turn.rollout.margin), byOpponent: turn.rollout.byOpponent,
        boutsByOpponent: turn.rollout.boutsByOpponent,
        shares: Object.fromEntries(opponents.map((o) => [o.name, round5(shareOf(leaguePairs(opponents), o.name))])),
        ret: round5(meanOf(turn.summary.returns)), bare: round5(turn.summary.bare),
        length: round5(meanOf(turn.summary.lengths)), penaltyShare: round5(turn.summary.share),
        kl: round5(turn.fit.kl), clipFraction: round5(turn.fit.clipFraction),
        entropy: round5(turn.fit.entropy), explained: round5(turn.fit.explainedAfter),
        advantageSd: round5(turn.fit.advantageSd), updates: turn.fit.updates,
        logSigma: Array.from(state.main.logSigma, round5),
        exploiters: hunts, snapshot, pool: state.pool.map((e) => e.iteration),
        seconds: round5((Date.now() - started) / 1000),
      };
      log(line);
      const against = Object.entries(turn.rollout.byOpponent)
        .map(([name, m]) => `${name} ${m >= 0 ? "+" : ""}${m.toFixed(3)}`).join("  ");
      console.log(`  it ${String(iteration).padStart(2)}: margin ${line.margin >= 0 ? "+" : ""}${line.margin.toFixed(4)}  `
        + `decided ${(turn.rollout.decided * 100).toFixed(0)}%  KL ${turn.fit.kl.toFixed(5)}  `
        + `H ${turn.fit.entropy.toFixed(2)}  EV ${turn.fit.explainedAfter.toFixed(3)}  `
        + `sigma ${Math.exp(state.main.logSigma[0]).toFixed(3)}  ${turn.fit.updates} steps  `
        + `${line.seconds.toFixed(0)} s`);
      console.log(`         vs ${against}`);
      for (const hunt of hunts) {
        console.log(`         ${exploiterName(hunt.slot)} ${hunt.gain >= 0 ? "+" : ""}${hunt.gain.toFixed(4)} `
          + `against the frozen main${hunt.reset ? " -- stalled, re-seeded" : ""}`);
      }

      const last = iteration === iterations;
      if (every > 0 && (last || iteration % every === 0)) rated = await ratePoint(iteration, last ? finalBouts : evalBouts);
    }
    if (write !== null) {
      if (rated === null) {
        throw new Error("--out wants a rating to put in the module header; run with --evaluate above zero");
      }
      const table = shipTable(state.main, {
        state, head: header, iteration: state.iteration, date, rated,
        spent: { bouts: state.bouts, steps: state.steps },
      });
      const text = renderPolicyModule(table, "scripts/league.mjs");
      writeFileSync(resolve(write), text);
      console.log(`  wrote ${write} (${(text.length / 1024).toFixed(1)} KB)`);
    }
    console.log(`state: ${statePath(dir)}`);
    console.log(`log: ${out}`);
    if (rated !== null) console.log(`  run --matrix over ${state.taken.length} snapshots to read whether it progressed`);
  }
}
