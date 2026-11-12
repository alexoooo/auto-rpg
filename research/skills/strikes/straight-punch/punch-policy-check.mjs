import { isRefused } from "../../../../src/core/refusal.ts";
import { GAME } from "../../../../src/app/catalog.ts";
import { profileLearningMind } from "../../../../src/minds/option/index.ts";
import { workerJobs } from "../../../worker-jobs.mjs";
/**
 * **A steered strike's policy on its drill** (the straight punch's, a held blow's or a swing's):
 * its training environment's places (`case-learning-environment.mjs`: the conditions of a drill's
 * training twin its `where` picks, as the drill's own admission gives them the subject,
 * `subjectFor`), each played whole as the Strike drill plays a trial (its world and its reader to
 * the end, so a fall counts) at the game's rate, the policy answering each of the strike's requests
 * (`recoveryNetwork`, as the core evaluates a learned network). With `--policy none`, the schedule
 * alone: each request answered with no steer. With `--cell`, the cells' own cases instead, the
 * protocols the places' twins are of (`Cases.twin`), at 120 and 480 Hz, the worse counting: the
 * confirmation ([the skill recipe](../../../../docs/recipes/skill.md#an-options-code)). Each trial is
 * valued as its cell values it (`trialValue`) and scored as a search scores it (`searchScore`).
 * Prints a line a trial, then by rate and body the landed share, the falls, the mean value and the
 * mean score; with `--cell`, the worse rate's value.
 *
 *   node research/skills/strikes/straight-punch/punch-policy-check.mjs --config <environment.json> --policy <policy.json|none> [--cell] [--workers 14]
 *
 * The body is the environment's `character` (its attributes; none, the model's own). `--config` is
 * an environment file or a training run's configuration (`environment` and its overrides, its
 * curriculum unread).
 *
 * Harness: Node, the bout world (`buildBout`) on Rapier (`DEFAULT_ENGINE`), 120 Hz; with `--cell`,
 * 120 and 480 Hz.
 */
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import '../../../../tests/harness/preload-data.mjs';
import { recoveryNetwork } from "../../../../src/core/math/learning/recovery-network.ts";
import { answer, pending } from "../../../../src/core/math/learning/learner.ts";
import { STRIKE } from "../../../../src/app/node/evaluation.ts";
import { BOUT_WORLD } from "../../../../src/app/node/evaluation.ts";
import { FALL_PRICE, keep, trialValue } from "../../../../src/evaluation/table/judge.ts";
import { learnerIn, owning, subjectFor } from '../../../case-learning-environment.mjs';
import { CONFIRM_RATES, meanValue, searchScore } from '../../../drill-trials.mjs';

/** The game's rate, research's. */
const GAME_RATE = 120;

/** One trial of `condition` on `protocol` at `hz`, steered by `act` (null: no steer): its outcome, its value as the cell values it and its search score. */
async function trial(o, act, protocol, condition, hz) {
  const cases = STRIKE.protocols[protocol], value = subjectFor(o, condition, (preset, request) => profileLearningMind(GAME.partLookup, owning(GAME, preset, request.skill), request)), world = cases.world([value], condition, undefined, [o.character ?? {}]);
  if (isRefused(world)) throw new Error(world.refused);
  const built = await BOUT_WORLD.build(world, { hz });
  if (isRefused(built)) throw new Error(built.refused);
  try {
    const reader = cases.read(built, condition), { learner } = learnerIn(BOUT_WORLD, built, value);
    BOUT_WORLD.start(built, world);
    while (!reader.ended) {
      if (built.duel.clock > cases.seconds + 1) throw new Error('the trial ran past its seconds');
      built.world.step(); reader.afterStep();
      if (pending(learner)) answer(learner, act ? act(learner.inputs) : []);
    }
    const r = reader.reading(), outcome = STRIKE.outcome(r).label, worth = trialValue("strike", { kept: keep({ judge: "strike" }, r), outcome }, FALL_PRICE);
    return { outcome, began: r.began, down: r.down, value: worth, score: searchScore({ judge: { judge: "strike" }, condition }, { value: worth, reading: r, outcome }) };
  } finally { built.dispose(); }
}

if (!isMainThread) {
  const act = workerData.policy ? recoveryNetwork(workerData.policy) : null;
  parentPort.on('message', async ({ id, protocol, condition, hz }) => {
    try { parentPort.postMessage({ id, r: await trial(workerData.o, act, protocol, condition, hz) }); } catch (error) { parentPort.postMessage({ id, error: String(error?.stack ?? error) }); }
  });
} else {
  const { values } = parseArgs({ options: { config: { type: 'string' }, policy: { type: 'string' }, cell: { type: 'boolean' }, workers: { type: 'string' } } });
  const given = JSON.parse(readFileSync(values.config, 'utf8'));
  const { environment, workers: _w, each: _e, seed: _s, ...overrides } = given;
  const o = typeof environment === 'string' ? { ...JSON.parse(readFileSync(environment, 'utf8')), ...overrides } : given;
  const policy = values.policy && values.policy !== 'none' ? JSON.parse(readFileSync(values.policy, 'utf8')) : null;
  if (o.places.some((place) => !place.where)) throw new Error('a place is a drill twin\'s conditions its `where` picks; a drawn place is no drill\'s');
  const rates = values.cell ? CONFIRM_RATES : [GAME_RATE];
  /** The protocol `twin` is the training twin of: a cell's own. */
  const ownOf = (twin) => {
    const own = Object.keys(STRIKE.protocols).find((name) => STRIKE.protocols[name].twin === twin);
    if (!own) throw new Error(`${twin} is no protocol's training twin`);
    return own;
  };
  const matches = (condition, where) => Object.entries(where).every(([key, value]) => JSON.stringify(condition[key]) === JSON.stringify(value));
  const jobs = [];
  for (const place of o.places) {
    const protocol = values.cell ? ownOf(place.protocol) : place.protocol, cases = STRIKE.protocols[protocol];
    for (const condition of cases.conditions.filter((one) => matches(one, place.where))) {
      const value = subjectFor(o, condition, (preset, request) => profileLearningMind(GAME.partLookup, owning(GAME, preset, request.skill), request));
      if ((cases.faults?.(value, condition, { id: 'learner', label: 'learner', value, character: o.character ?? {} }) ?? []).length) continue;
      for (const hz of rates) jobs.push({ id: jobs.length, protocol, condition, hz });
    }
  }
  const results = new Array(jobs.length);
  const count = Math.min(jobs.length, Number(values.workers ?? Math.max(1, availableParallelism() - 4)));
  await workerJobs(jobs, { lanes: count,
    create: () => new Worker(fileURLToPath(import.meta.url), { workerData: { o, policy } }),
    result: ({ id, r }) => { results[id] = r; return r; },
  });
  for (const job of jobs) {
    const r = results[job.id], c = job.condition;
    console.log(JSON.stringify({ began: r.began, hz: job.hz, protocol: job.protocol, model: c.model, ...Object.fromEntries(['hand', 'foot', 'mark', 'target', 'gap', 'across', 'start'].filter((k) => k in c).map((k) => [k, c[k]])),
      outcome: r.outcome, value: r.value === null ? null : +r.value.toFixed(3), score: r.score === null ? null : +r.score.toFixed(3) }));
  }
  const mean = (list) => { const counted = list.filter((one) => one !== null); return counted.length ? counted.reduce((a, b) => a + b, 0) / counted.length : null; };
  const byRate = {};
  for (const hz of rates) for (const model of [...new Set(jobs.map((j) => j.condition.model))]) {
    const mine = jobs.filter((j) => j.hz === hz && j.condition.model === model).map((j) => results[j.id]);
    const value = meanValue(mine), score = mean(mine.map((r) => r.score));
    byRate[hz] = meanValue(jobs.filter((j) => j.hz === hz).map((j) => results[j.id]));
    console.log(`${hz} Hz ${model}: landed ${mine.filter((r) => r.outcome === 'landed').length} of ${mine.length}, fell ${mine.filter((r) => r.down).length}; value ${value?.toFixed(3) ?? '-'} hp a second, score ${score?.toFixed(3) ?? '-'}`);
  }
  if (values.cell) {
    const all = Object.values(byRate);
    console.log(`the cells' cases: value ${all.includes(null) ? '-' : Math.min(...all).toFixed(3)} hp a second at the worse rate`);
  }
}
