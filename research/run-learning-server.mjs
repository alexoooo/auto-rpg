/**
 * A learning environment's copies on worker threads, `each` to a thread, served to a trainer over
 * stdin and stdout as JSON lines (`research/run-train.py`): `{"op":"reset"}` answers every
 * environment's observation; `{"op":"step","actions":[[...],...]}` steps each with its action and
 * answers the observations, rewards, ends and infos, an ended environment reset at once and its
 * last observation in its info (`terminal`). `{"op":"close"}` answers and ends it, its workers with it.
 * Between messages a worker gives its environments' `idle` work, where they have it, a slice at a
 * time, each slice yielding so that the next message waits for at most one.
 *
 *   node research/run-learning-server.mjs <configuration.json>
 *
 * The configuration names its environment's file (`environment`, `research/environments/`: its
 * `kind`, one of `KINDS`, and the kind's settings) and gives `workers`, `each` and `seed`; its other
 * keys override the file's settings. Environment i is seeded `seed + i`.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';

/**
 * Each kind of environment's maker, by the `kind` its file names: an episode's shape, which its
 * settings fill in. `punch`: the steered punch from its drive's first step
 * (`punch-learning-environment.mjs`); `cases`: an evaluation's cases played by a bare mind
 * (`case-learning-environment.mjs`).
 */
const KINDS = {
  punch: async () => (await import('./punch-learning-environment.mjs')).punchEnvironment,
  cases: async () => (await import('./case-learning-environment.mjs')).caseEnvironment,
};

if (!isMainThread) {
  console.log = (...args) => process.stderr.write(args.join(' ') + '\n');
  const make = await KINDS[workerData[0].kind]();
  const envs = [];
  for (const { kind: _, ...configuration } of workerData) envs.push(await make(configuration));
  parentPort.postMessage({ ready: true, observationSize: envs[0].observationSize, actionSize: envs[0].actionSize });
  /** The idle work: each environment's next slice in turn, until none has any; `working` while a round is under way, `busy` while a message is. */
  let working = false, busy = false, turn = 0;
  const work = async () => {
    if (working || busy) return;
    working = true;
    try {
      for (let tried = 0; tried < envs.length && !busy; tried++) {
        const e = envs[turn];
        turn = (turn + 1) % envs.length;
        if (e.idle && await e.idle()) { tried = -1; await new Promise((resolve) => setImmediate(resolve)); }
      }
    } catch (error) { parentPort.postMessage({ error: String(error.stack ?? error) }); }
    working = false;
  };
  const idled = (message) => { busy = false; parentPort.postMessage(message); setImmediate(work); };
  parentPort.on('message', async ({ op, actions }) => {
    busy = true;
    while (working) await new Promise((resolve) => setImmediate(resolve));
    try {
      const answers = [];
      if (op === 'reset') { for (const e of envs) answers.push({ observation: await e.reset() }); idled({ answers }); return; }
      if (op === 'close') { for (const e of envs) e.dispose(); parentPort.postMessage({ closed: true }); return; }
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
  const { environment, workers: count = 8, each = 1, seed = 1, ...overrides } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  if (typeof environment !== 'string') throw new Error("a configuration names its environment's file");
  const settings = { ...JSON.parse(readFileSync(environment, 'utf8')), ...overrides };
  if (!Object.hasOwn(KINDS, settings.kind)) throw new Error(`no kind of learning environment ${settings.kind}: ${Object.keys(KINDS).join(', ')}`);
  const workers = Array.from({ length: count }, (_, w) => {
    const configurations = Array.from({ length: each }, (_, k) => ({ ...settings, seed: seed + w * each + k }));
    const worker = new Worker(new URL(import.meta.url), { workerData: configurations });
    let waiting = null;
    worker.on('message', (m) => { const w = waiting; waiting = null; w?.(m); });
    worker.on('error', (error) => { process.stderr.write(String(error.stack ?? error) + '\n'); process.exit(1); });
    const ask = (message) => new Promise((resolve) => { waiting = resolve; if (message) worker.postMessage(message); });
    return { worker, ask };
  });
  const ready = await Promise.all(workers.map((w) => w.ask(null)));
  const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
  send({ ready: ready.map(({ observationSize, actionSize }) => ({ observationSize, actionSize })), workers: count * each });
  const all = async (messages) => {
    const answers = await Promise.all(workers.map((w, i) => w.ask(messages(i))));
    const failed = answers.find((a) => a.error);
    if (failed) throw new Error(failed.error);
    return answers.flatMap((a) => a.answers ?? []);
  };
  for await (const line of createInterface({ input: process.stdin })) {
    const { op, actions } = JSON.parse(line);
    try {
      if (op === 'reset') send({ observations: (await all(() => ({ op }))).map((a) => a.observation) });
      else if (op === 'step') {
        const answers = await all((i) => ({ op, actions: actions.slice(i * each, (i + 1) * each) }));
        send({ observations: answers.map((a) => a.observation), rewards: answers.map((a) => a.reward), dones: answers.map((a) => a.done), infos: answers.map((a) => a.info) });
      } else if (op === 'close') { send({ closed: true }); process.exit(0); }
      else throw new Error(`no operation ${op}`);
    } catch (error) { send({ error: String(error.stack ?? error) }); break; }
  }
  for (const w of workers) await w.worker.terminate();
}
