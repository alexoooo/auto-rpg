/**
 * The learned run's environments on worker threads, `each` to a thread, served to a trainer over
 * stdin and stdout as JSON lines (`research/run-train.py`): `{"op":"reset"}` answers every
 * environment's observation; `{"op":"step","actions":[[...],...]}` steps each with its action and
 * answers the observations, rewards, ends and infos, an ended environment reset at once and its
 * last observation in its info (`terminal`). `{"op":"close"}` answers and ends it, its workers with it.
 *
 *   node research/run-learning-server.mjs <configuration.json>
 *
 * The configuration is the environment's (`runEnvironment`, or the learned rise's
 * `riseEnvironment` with `"environment": "rise"`) with `workers`, `each`, and `models`, `holds`
 * and `hastes`, whose every combination the environments take in turn; environment i is seeded
 * `seed + i`.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';

if (!isMainThread) {
  console.log = (...args) => process.stderr.write(args.join(' ') + '\n');
  const make = workerData[0].environment === 'rise' ? (await import('./rise-learning-environment.mjs')).riseEnvironment : (await import('./run-learning-environment.mjs')).runEnvironment;
  const envs = [];
  for (const { environment: _, ...configuration } of workerData) envs.push(await make(configuration));
  parentPort.postMessage({ ready: true, observationSize: envs[0].observationSize, actionSize: envs[0].actionSize });
  parentPort.on('message', ({ op, actions }) => {
    try {
      if (op === 'reset') { parentPort.postMessage({ answers: envs.map((e) => ({ observation: e.reset() })) }); return; }
      if (op === 'close') { for (const e of envs) e.dispose(); parentPort.postMessage({ closed: true }); return; }
      parentPort.postMessage({ answers: envs.map((e, k) => {
        const r = e.step(actions[k]);
        const done = r.terminated || r.truncated;
        const info = { ...r.info, truncated: r.truncated && !r.terminated };
        if (done) info.terminal = r.observation;
        return { observation: done ? e.reset() : r.observation, reward: r.reward, done, info };
      }) });
    } catch (error) { parentPort.postMessage({ error: String(error.stack ?? error) }); }
  });
} else {
  const configuration = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const { workers: count = 8, each = 1, hastes = [0], environment = 'run', models = ['workshop-fighter'], holds = ['empty'], seed = 1, ...rest } = configuration;
  const kinds = models.flatMap((model) => holds.flatMap((held) => hastes.map((haste) => ({ model, held, haste }))));
  const workers = Array.from({ length: count }, (_, w) => {
    const configurations = Array.from({ length: each }, (_, k) => { const i = w * each + k; return { ...rest, environment, seed: seed + i, ...kinds[i % kinds.length] }; });
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
