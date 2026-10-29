/**
 * **A steered punch's policy on held-out trials**: places drawn as its training environment draws
 * them (`case-learning-environment.mjs`, `drawCondition`), on a seed of their own, and its listed
 * places' conditions (a fight's moments), each of the half training holds out (`heldOut`), each played whole as
 * the Strike drill plays a trial (its world and its reader to the end, so a fall counts) at each of
 * `--rates`, the policy setting the punch's outputs at each of its decisions (`recoveryNetwork`, as
 * the core evaluates a learned network). With `--policy none`, the schedule alone. Prints a line a
 * trial, then the landed share by rate and body, and by the target's distance.
 *
 *   node research/punch-policy-check.mjs --config <environment.json> --policy <policy.json|none> [--trials 60] [--seed 1001] [--rates 120,480] [--workers 14]
 *
 * The body is the environment's `character` (`{ "toes": true }`: the toed foot).
 *
 * Harness: Node, the bout world (`buildBout`) on Rapier (`DEFAULT_ENGINE`), the drill's layout.
 */
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import '../tests/harness/preload-data.mjs';
import { recoveryNetwork } from '../src/core/control/recovery-network.ts';
import { STRIKE } from '../src/evaluation/strike/index.ts';
import { barScore } from '../src/evaluation/strike/score.ts';
import { BOUT_WORLD } from '../src/evaluation/bout.ts';
import { drawCondition, generator, heldOut, learnerIn, subjectFor } from './case-learning-environment.mjs';

/** One trial of `condition` on `protocol` at `hz`, steered by `act` (null: none): its reading's outcome and hit. */
async function trial(o, act, protocol, condition, hz) {
  const cases = STRIKE.protocols[protocol], value = subjectFor(o, condition), world = cases.world([value], condition, undefined, [o.character ?? {}]), built = await BOUT_WORLD.build(world, { hz });
  try {
    const reader = cases.read(built, condition), { learner } = learnerIn(BOUT_WORLD, built, value);
    BOUT_WORLD.start(built, world);
    let decided = learner.decisions;
    while (!reader.ended) {
      if (built.duel.clock > cases.seconds + 1) throw new Error('the trial ran past its seconds');
      built.world.step(); reader.afterStep();
      if (act && learner.running && learner.decisions !== decided) {
        decided = learner.decisions;
        const outputs = act(learner.inputs);
        learner.outputs.length = 0; learner.outputs.push(...outputs);
      }
    }
    const r = reader.reading(), h = r.hit;
    return { outcome: r.outcome, score: barScore(r, condition.hand), hit: h && { speed: h.speed, kg: h.kg, straight: h.straight, along: h.along, bend: h.bend, lean: h.lean } };
  } finally { built.dispose(); }
}

if (!isMainThread) {
  const act = workerData.policy ? recoveryNetwork(workerData.policy) : null;
  parentPort.on('message', async ({ id, protocol, condition, hz }) => {
    try { parentPort.postMessage({ id, r: await trial(workerData.o, act, protocol, condition, hz) }); } catch (error) { parentPort.postMessage({ id, error: String(error?.stack ?? error) }); }
  });
} else {
  const { values } = parseArgs({ options: { config: { type: 'string' }, policy: { type: 'string' }, trials: { type: 'string' }, seed: { type: 'string' }, rates: { type: 'string' }, workers: { type: 'string' } } });
  const o = JSON.parse(readFileSync(values.config, 'utf8'));
  const policy = values.policy && values.policy !== 'none' ? JSON.parse(readFileSync(values.policy, 'utf8')) : null;
  const random = generator(Number(values.seed ?? 1001)), rates = (values.rates ?? '120,480').split(',').map(Number);
  const jobs = [];
  const still = o.places.filter((place) => place.draw), fights = o.places.filter((place) => !place.draw);
  for (let k = 0; still.length && k < Number(values.trials ?? 60);) {
    const place = still[Math.floor(random() * still.length)], condition = drawCondition(place.draw, random);
    if (!heldOut(condition)) continue;
    for (const hz of rates) jobs.push({ id: jobs.length, protocol: place.protocol, condition, hz });
    k++;
  }
  for (const place of fights) for (const condition of STRIKE.protocols[place.protocol].conditions)
    if (Object.entries(place.where ?? {}).every(([key, value]) => JSON.stringify(condition[key]) === JSON.stringify(value)) && heldOut(condition))
      for (const hz of rates) jobs.push({ id: jobs.length, protocol: place.protocol, condition, hz });
  const results = new Array(jobs.length);
  const count = Math.min(jobs.length, Number(values.workers ?? Math.max(1, availableParallelism() - 4)));
  let next = 0;
  await Promise.all(Array.from({ length: count }, () => new Promise((resolve, reject) => {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { o, policy } });
    const give = () => { if (next >= jobs.length) { worker.terminate(); resolve(); return; } worker.postMessage(jobs[next++]); };
    worker.on('message', ({ id, r, error }) => { if (error) { reject(new Error(error)); return; } results[id] = r; give(); });
    worker.on('error', reject);
    give();
  })));
  for (const job of jobs) {
    const r = results[job.id], c = job.condition;
    console.log(JSON.stringify({ hz: job.hz, model: c.model, hand: c.hand, ...(c.foe ? { foe: c.foe, moment: c.moment } : { gap: +c.gap.toFixed(3), across: +c.across.toFixed(3) }), outcome: r.outcome, score: +r.score.toFixed(2),
      hit: r.hit && Object.fromEntries(Object.entries(r.hit).map(([k, v]) => [k, v === null ? null : +v.toFixed(3)])) }));
  }
  // By rate and body: the landed share, and by how far the target stands (its gap and offset across together).
  const tally = (mine) => `landed ${mine.filter((j) => results[j.id].outcome === 'landed').length} of ${mine.length}, fell ${mine.filter((j) => results[j.id].outcome === 'fell').length}`;
  for (const hz of rates) for (const model of [...new Set(jobs.filter((j) => j.condition.foe).map((j) => j.condition.model))]) {
    const mine = jobs.filter((j) => j.hz === hz && j.condition.model === model && j.condition.foe), outcomes = {};
    for (const j of mine) outcomes[results[j.id].outcome] = (outcomes[results[j.id].outcome] ?? 0) + 1;
    console.log(`${hz} Hz ${model} fights: ${tally(mine)}; ${Object.entries(outcomes).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  }
  for (const hz of rates) for (const model of [...new Set(jobs.filter((j) => !j.condition.foe).map((j) => j.condition.model))]) {
    const mine = jobs.filter((j) => j.hz === hz && j.condition.model === model && !j.condition.foe), landed = mine.filter((j) => results[j.id].outcome === 'landed').length, fell = mine.filter((j) => results[j.id].outcome === 'fell').length;
    const bins = {};
    for (const j of mine) { const b = (Math.floor(Math.sqrt(j.condition.gap * j.condition.gap + j.condition.across * j.condition.across) * 50) / 50).toFixed(2); bins[b] ??= [0, 0]; bins[b][1]++; if (results[j.id].outcome === 'landed') bins[b][0]++; }
    console.log(`${hz} Hz ${model}: landed ${landed} of ${mine.length}, fell ${fell}; by distance ${Object.entries(bins).sort().map(([b, [l, n]]) => `${b}:${l}/${n}`).join(' ')}`);
  }
}
