/**
 * A learning environment's copies on worker threads, `each` to a thread, served to a trainer over
 * stdin and stdout as JSON lines (`research/run-train.py`): `{"op":"reset"}` answers every
 * environment's observation; `{"op":"step","actions":[[...],...]}` steps each with its action and
 * answers the observations, rewards, ends and infos, an ended environment reset at once and its
 * last observation in its info (`terminal`). `{"op":"progress","decisions":N}` tells each environment
 * that has a use for it the trainer's decisions in all (a curriculum's), and answers.
 * `{"op":"close"}` answers and ends it, its workers with it.
 * Between messages a worker gives its environments' `idle` work, where they have it, a slice at a
 * time, each slice yielding so that the next message waits for at most one.
 *
 *   node research/run-learning-server.mjs <configuration.json>
 *
 * The configuration names its environment's file (`environment`, in its owning research directory: its
 * `kind`, one of `KINDS`, and the kind's settings) and gives `workers`, `each` and `seed`; its other
 * keys override the file's settings. Environment i is seeded `seed + i`. Unset, 8 workers of 4
 * environments, the fastest on the 16-core development host.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { learningWorker } from './learning-worker.mjs';

/**
 * Each kind of environment's maker, by the `kind` its file names: an episode's shape, which its
 * settings fill in. `cases`: any learnable part of a mind played in an evaluation's cases
 * (`case-learning-environment.mjs`).
 */
const KINDS = {
  cases: async () => {
    const { caseEnvironment } = await import('./case-learning-environment.mjs');
    const { profileLearningMind } = await import('../src/minds/option/index.ts');
    const { GAME } = await import('../src/app/catalog.ts');
    return configuration => caseEnvironment(configuration, { configureMind: (preset, request) => profileLearningMind(GAME.partLookup, preset, request) });
  },
};

if (!isMainThread) {
  console.log = (...args) => process.stderr.write(args.join(' ') + '\n');
  const make = await KINDS[workerData[0].kind]();
  const envs = [];
  for (const { kind: _, ...configuration } of workerData) envs.push(await make(configuration));
  parentPort.postMessage({ ready: true, observationSize: envs[0].observationSize, actionSize: envs[0].actionSize });
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
  parentPort.on('message', async ({ op, actions, decisions }) => {
    busy = true;
    while (working) await new Promise((resolve) => setImmediate(resolve));
    try {
      const answers = [];
      if (op === 'reset') { for (const e of envs) answers.push({ observation: await e.reset() }); idled({ answers }); return; }
      if (op === 'close') { for (const e of envs) e.dispose(); parentPort.postMessage({ closed: true }); return; }
      if (op === 'progress') { for (const e of envs) e.progress?.(decisions); idled({ answers: [] }); return; }
      for (let k = 0; k < envs.length; k++) {
        const e = envs[k], r = await e.step(actions[k]);
        const done = r.terminated || r.truncated;
        const info = { ...r.info, truncated: r.truncated && !r.terminated };
        if (done) info.terminal = r.observation;
        answers.push({ observation: done ? await e.reset() : r.observation, reward: r.reward, done, info });
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
  send({ ready: ready.map(({ observationSize, actionSize }) => ({ observationSize, actionSize })), workers: count * each });
  const all = async (messages) => {
    const answers = await Promise.all(workers.map((w, i) => w.ask(messages(i))));
    const failed = answers.find((a) => a.error);
    if (failed) throw new Error(failed.error);
    return answers.flatMap((a) => a.answers ?? []);
  };
  input = createInterface({ input: process.stdin });
  for await (const line of input) {
    try {
      const { op, actions, decisions } = JSON.parse(line);
      if (op === 'reset') send({ observations: (await all(() => ({ op }))).map((a) => a.observation) });
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
