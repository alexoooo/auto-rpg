/**
 * A learning environment's copies on worker threads, `each` to a thread, served to a trainer over
 * stdin and stdout as JSON lines (`research/run-train.py`). Ready, it names each environment's sizes
 * and layout (`{ inputs, outputs, interval }`, its learner's decision interval in seconds, which
 * every environment must name). `{"op":"reset"}` answers every
 * environment's observation; `{"op":"step","actions":[[...],...]}` steps each with its action and
 * answers the observations, rewards, ends and infos, an ended environment reset at once and its
 * last observation in its info (`terminal`). `{"op":"progress","decisions":N}` tells each environment
 * that has a use for it the trainer's decisions in all (a curriculum's), and answers.
 * `{"op":"collect","steps":N,"policy":{...}}` plays a rollout of `steps` decisions on every
 * environment, each worker's on its own with the policy given (`rollout.mjs`), and answers each
 * environment's, its arrays as base64 little-endian `float32` or `uint8`.
 * `{"op":"close"}` answers and ends it, its workers with it.
 * Between messages a worker gives its environments' `idle` work, where they have it, a slice at a
 * time, each slice yielding so that the next message waits for at most one.
 *
 *   node research/run-learning-server.mjs <configuration.json>
 *
 * The configuration names its environment's file (`environment`, in its owning research directory: its
 * `kind`, one of `KINDS`, and the kind's settings) and gives `workers`, `each` and `seed`; its other
 * keys override the file's settings. Environment i is seeded `seed + i`. Unset, 8 workers of 4
 * environments.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { learningWorker } from './learning-worker.mjs';
import { collect, normalDraws } from './rollout.mjs';
import { generator } from './case-learning-environment.mjs';

/**
 * Each kind of environment's maker, by the `kind` its file names: an episode's shape, which its
 * settings fill in. `cases`: any learnable part of a mind played in an evaluation's cases
 * (`case-learning-environment.mjs`), a strike the preset has no Option for given its own (`owning`),
 * a gait steered on Move's stock gaits (`gaitLearningMind`); `travel`: residual control around the retained running gait
 * (`skills/locomotion/residual-environment.mjs`), for pretraining and development screens;
 * `travel-orders`: one travel actor through scripted Option Mind orders and physically reached starts.
 */
const KINDS = {
  travel: async () => (await import('./skills/locomotion/residual-environment.mjs')).residualEnvironment,
  'travel-orders': async () => (await import('./skills/locomotion/travel-environment.mjs')).travelEnvironment,
  cases: async () => {
    const { caseEnvironment, owning } = await import('./case-learning-environment.mjs');
    const { profileLearningMind, gaitLearningMind } = await import('../src/minds/option/index.ts');
    const { GAME } = await import('../src/app/catalog.ts');
    return configuration => caseEnvironment(configuration, { configureMind: (preset, request) => request.gait !== undefined ? gaitLearningMind(preset, request)
      : profileLearningMind(GAME.partLookup, owning(GAME, preset, request.skill), request) });
  },
};

if (!isMainThread) {
  console.log = (...args) => process.stderr.write(args.join(' ') + '\n');
  const make = await KINDS[workerData[0].kind]();
  const envs = [];
  for (const { kind: _, ...configuration } of workerData) envs.push(await make(configuration));
  parentPort.postMessage({ ready: true, observationSize: envs[0].observationSize, actionSize: envs[0].actionSize, layout: envs[0].layout });
  /** Each environment's observation now, its episode's return and length so far, and the rollouts' draws (seeded by the worker's first environment). */
  const current = envs.map(() => null), episodes = envs.map(() => ({ r: 0, l: 0 })), normal = normalDraws(generator(workerData[0].seed * 7919 + 17));
  /** The idle work: each environment's next slice in turn, until none has any; `working` while a round is under way, `busy` while a message is. */
  let working = false, busy = false, turn = 0, failed = false;
  const work = async () => {
    if (working || busy || failed) return;
    working = true;
    try {
      for (let tried = 0; tried < envs.length && !busy; tried++) {
        const e = envs[turn];
        turn = (turn + 1) % envs.length;
        if (e.idle && await e.idle()) { tried = -1; await new Promise((resolve) => setImmediate(resolve)); }
      }
    } catch (error) { failed = true; parentPort.postMessage({ error: String(error.stack ?? error) }); }
    working = false;
  };
  const idled = (message) => { busy = false; parentPort.postMessage(message); setImmediate(work); };
  parentPort.on('message', async ({ op, actions, decisions, steps, policy }) => {
    busy = true;
    while (working) await new Promise((resolve) => setImmediate(resolve));
    try {
      const answers = [];
      if (op === 'reset') {
        for (let k = 0; k < envs.length; k++) { current[k] = await envs[k].reset(); episodes[k].r = 0; episodes[k].l = 0; answers.push({ observation: current[k] }); }
        idled({ answers }); return;
      }
      if (op === 'collect') { idled({ answers: await collect(envs, current, episodes, policy, steps, normal) }); return; }
      if (op === 'close') { for (const e of envs) e.dispose(); parentPort.postMessage({ closed: true }); return; }
      if (op === 'progress') { for (const e of envs) e.progress?.(decisions); idled({ answers: [] }); return; }
      for (let k = 0; k < envs.length; k++) {
        const e = envs[k], r = await e.step(actions[k]);
        const done = r.terminated || r.truncated;
        const info = { ...r.info, truncated: r.truncated && !r.terminated };
        if (done) info.terminal = r.observation;
        episodes[k].r = done ? 0 : episodes[k].r + r.reward; episodes[k].l = done ? 0 : episodes[k].l + 1;
        current[k] = done ? await e.reset() : r.observation;
        answers.push({ observation: current[k], reward: r.reward, done, info });
      }
      idled({ answers });
    } catch (error) { parentPort.postMessage({ error: String(error.stack ?? error) }); }
  });
} else {
  const { environment, workers: count = 8, each = 4, seed = 1, ...overrides } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  if (typeof environment !== 'string') throw new Error("a configuration names its environment's file");
  const settings = { ...JSON.parse(readFileSync(environment, 'utf8')), ...overrides };
  if (!Object.hasOwn(KINDS, settings.kind)) throw new Error(`no kind of learning environment ${settings.kind}: ${Object.keys(KINDS).join(', ')}`);
  const workers = [];
  const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
  let input;
  try {
  if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(each) || each < 1) throw new Error("learning workers and environments per worker must be positive integers");
  for (let w = 0; w < count; w++) {
    const configurations = Array.from({ length: each }, (_, k) => ({ ...settings, seed: seed + w * each + k }));
    const worker = new Worker(new URL(import.meta.url), { workerData: configurations });
    workers.push(learningWorker(worker));
  }
  const ready = await Promise.all(workers.map((w) => w.ask(null)));
  const startupFailure = ready.find(answer => answer.error);
  if (startupFailure) throw new Error(startupFailure.error);
  if (!ready.every(({ layout }) => layout?.interval > 0 && Number.isFinite(layout.interval))) throw new Error("a learning environment's layout names its decision interval");
  send({ ready: ready.map(({ observationSize, actionSize, layout }) => ({ observationSize, actionSize, layout })), workers: count * each });
  const all = async (messages) => {
    const answers = await Promise.all(workers.map((w, i) => w.ask(messages(i))));
    const failed = answers.find((a) => a.error);
    if (failed) throw new Error(failed.error);
    return answers.flatMap((a) => a.answers ?? []);
  };
  input = createInterface({ input: process.stdin });
  for await (const line of input) {
    try {
      const message = JSON.parse(line), { op, actions, decisions } = message;
      if (op === 'reset') send({ observations: (await all(() => ({ op }))).map((a) => a.observation) });
      else if (op === 'collect') {
        const { steps, policy } = message, packed = (array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString('base64');
        const rollouts = await all(() => ({ op, steps, policy }));
        send({ rollouts: rollouts.map(({ observations, actions, rewards, dones, truncated, cuts, ended, worldSteps, worldSeconds, last }) =>
          ({ observations: packed(observations), actions: packed(actions), rewards: packed(rewards), dones: packed(dones), truncated: packed(truncated), cuts, ended, worldSteps, worldSeconds, last: packed(last) })) });
      }
      else if (op === 'step') {
        const answers = await all((i) => ({ op, actions: actions.slice(i * each, (i + 1) * each) }));
        send({ observations: answers.map((a) => a.observation), rewards: answers.map((a) => a.reward), dones: answers.map((a) => a.done), infos: answers.map((a) => a.info) });
      } else if (op === 'progress') { await all(() => ({ op, decisions })); send({ progressed: decisions }); }
      else if (op === 'close') { send({ closed: true }); break; }
      else throw new Error(`no operation ${op}`);
    } catch (error) { send({ error: String(error.stack ?? error) }); break; }
  }
  } catch (error) { send({ error: String(error.stack ?? error) }); }
  finally {
    input?.close(); process.stdin.destroy();
    await Promise.all(workers.map(w => w.worker.terminate()));
  }
}
