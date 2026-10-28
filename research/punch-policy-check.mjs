/**
 * **A steered punch's policy on held-out trials**: places drawn as its training environment draws
 * them (`punch-learning-environment.mjs`), on a seed of their own, and every fight's moment it
 * holds out (`heldOut`), each played whole as the Strike
 * drill plays a trial (its world and its reader to the end, so a fall counts) at each of `--rates`,
 * the policy setting the punch's steer at each of its decisions (`recoveryNetwork`, as the core
 * evaluates a learned network). With `--policy none`, the schedule alone. Prints a line a trial,
 * then the landed share by rate and body, and by the target's distance.
 *
 *   node research/punch-policy-check.mjs --config <environment.json> --policy <policy.json|none> [--trials 60] [--seed 1001] [--rates 120,480] [--workers 14]
 *
 * Harness: Node, the bout world (`buildBout`) on Rapier (`DEFAULT_ENGINE`), the drill's layout.
 */
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { recoveryNetwork } from '../src/core/control/recovery-network.ts';
import { buildBout } from '../src/evaluation/bout.ts';
import { STRIKE_CASES } from '../src/evaluation/strike/cases.ts';
import { scoreOf } from './punch-drill.mjs';
import { drawn, heldOut, steeredSubjects } from './punch-learning-environment.mjs';

/** One trial of `condition` at `hz`, steered by `act` (null: none): its reading's outcome and hit. */
async function trial(subjects, act, condition, hz) {
  const cases = STRIKE_CASES[condition.foe ? 'fight' : 'still'], world = cases.world([subjects(condition.model, condition.hand)], condition, undefined, [{}]), built = await buildBout(world.recipe, { hz });
  try {
    const reader = cases.read(built, condition), motion = built.duel.duelists.left.minded.skills.state.actions.executors[0].motion;
    built.duel.play(world.tape);
    let decided = null;
    while (!reader.ended) {
      if (built.duel.clock > cases.seconds + 1) throw new Error('the trial ran past its seconds');
      built.world.step(); reader.afterStep();
      if (act && motion.phase === 'swing' && motion.decided !== decided && motion.features.length) {
        decided = motion.decided;
        const steer = act(motion.features);
        motion.steer.length = 0; motion.steer.push(...steer);
      }
    }
    const r = reader.reading(), h = r.hit;
    return { outcome: r.outcome, score: scoreOf(r, condition.hand), hit: h && { speed: h.speed, kg: h.kg, straight: h.straight, along: h.along, bend: h.bend, lean: h.lean } };
  } finally { built.dispose(); }
}

if (!isMainThread) {
  const subjects = steeredSubjects(workerData), act = workerData.policy ? recoveryNetwork(workerData.policy) : null;
  parentPort.on('message', async ({ id, condition, hz }) => {
    try { parentPort.postMessage({ id, r: await trial(subjects, act, condition, hz) }); } catch (error) { parentPort.postMessage({ id, error: String(error?.stack ?? error) }); }
  });
} else {
  const { values } = parseArgs({ options: { config: { type: 'string' }, policy: { type: 'string' }, trials: { type: 'string' }, seed: { type: 'string' }, rates: { type: 'string' }, workers: { type: 'string' } } });
  const config = JSON.parse(readFileSync(values.config, 'utf8')), o = { schedule: 'docs/reference/punch-body.json', hands: ['right'], marks: ['middle'], ...config };
  const policy = values.policy && values.policy !== 'none' ? JSON.parse(readFileSync(values.policy, 'utf8')) : null;
  let word = (Number(values.seed ?? 1001) * 2654435761) >>> 0;
  const random = () => ((word = (Math.imul(word, 1664525) + 1013904223) >>> 0) / 4294967296), pick = (list) => list[Math.floor(random() * list.length)];
  const between = ([lo, hi]) => lo + (hi - lo) * random(), rates = (values.rates ?? '120,480').split(',').map(Number);
  const jobs = [];
  const still = o.places.filter((place) => !place.foes), fights = o.places.filter((place) => place.foes);
  for (let k = 0; still.length && k < Number(values.trials ?? 60); k++) {
    const condition = drawn(pick(still), pick, between, o);
    for (const hz of rates) jobs.push({ id: jobs.length, condition, hz });
  }
  for (const place of fights) for (const foe of place.foes) for (const moment of place.moments) for (const mark of o.marks) for (const hand of o.hands) {
    const condition = { model: place.model, foe, mark, hand, moment };
    if (heldOut(condition)) for (const hz of rates) jobs.push({ id: jobs.length, condition, hz });
  }
  const results = new Array(jobs.length);
  const count = Math.min(jobs.length, Number(values.workers ?? Math.max(1, availableParallelism() - 4)));
  let next = 0;
  await Promise.all(Array.from({ length: count }, () => new Promise((resolve, reject) => {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { schedule: o.schedule, schedules: o.schedules ?? {}, windows: o.windows ?? {}, aim: o.aim ?? null, punch: o.punch ?? {}, policy } });
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
  for (const hz of rates) for (const model of [...new Set(fights.map((p) => p.model))]) {
    const mine = jobs.filter((j) => j.hz === hz && j.condition.model === model && j.condition.foe), outcomes = {};
    for (const j of mine) outcomes[results[j.id].outcome] = (outcomes[results[j.id].outcome] ?? 0) + 1;
    console.log(`${hz} Hz ${model} fights: ${tally(mine)}; ${Object.entries(outcomes).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  }
  for (const hz of rates) for (const model of [...new Set(still.map((p) => p.model))]) {
    const mine = jobs.filter((j) => j.hz === hz && j.condition.model === model && !j.condition.foe), landed = mine.filter((j) => results[j.id].outcome === 'landed').length, fell = mine.filter((j) => results[j.id].outcome === 'fell').length;
    const bins = {};
    for (const j of mine) { const b = (Math.floor(Math.sqrt(j.condition.gap * j.condition.gap + j.condition.across * j.condition.across) * 50) / 50).toFixed(2); bins[b] ??= [0, 0]; bins[b][1]++; if (results[j.id].outcome === 'landed') bins[b][0]++; }
    console.log(`${hz} Hz ${model}: landed ${landed} of ${mine.length}, fell ${fell}; by distance ${Object.entries(bins).sort().map(([b, [l, n]]) => `${b}:${l}/${n}`).join(' ')}`);
  }
}
