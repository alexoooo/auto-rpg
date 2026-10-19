/**
 * The learned run's environments on worker threads, one each, served to a trainer over stdin and
 * stdout as JSON lines (`research/run-train.py`): `{"op":"reset"}` answers every environment's
 * observation; `{"op":"step","actions":[[...],...]}` steps each with its action and answers the
 * observations, rewards, ends and infos, an ended environment reset at once and its last
 * observation in its info (`terminal`). `{"op":"close"}` ends it.
 *
 *   node research/run-learning-server.mjs <configuration.json>
 *
 * The configuration is the environment's (`runEnvironment`) with `workers`, and `hastes` and
 * `models` that the workers take in turn; worker i is seeded `seed + i`.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';

if (!isMainThread) {
  console.log = (...args) => process.stderr.write(args.join(' ') + '\n');
  const { runEnvironment } = await import('./run-learning-environment.mjs');
  const e = await runEnvironment(workerData);
  parentPort.postMessage({ ready: true, observationSize: e.observationSize, actionSize: e.actionSize });
  parentPort.on('message', ({ op, action }) => {
    try {
      if (op === 'reset') { parentPort.postMessage({ observation: e.reset() }); return; }
      if (op === 'close') { e.dispose(); parentPort.postMessage({ closed: true }); return; }
      const r = e.step(action);
      const done = r.terminated || r.truncated;
      const info = { ...r.info, truncated: r.truncated && !r.terminated };
      if (done) info.terminal = r.observation;
      parentPort.postMessage({ observation: done ? e.reset() : r.observation, reward: r.reward, done, info });
    } catch (error) { parentPort.postMessage({ error: String(error.stack ?? error) }); }
  });
} else {
  const configuration = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const { workers: count = 8, hastes = [0], models = ['workshop-fighter'], seed = 1, ...rest } = configuration;
  const workers = Array.from({ length: count }, (_, i) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { ...rest, seed: seed + i, haste: hastes[i % hastes.length], model: models[i % models.length] } });
    let waiting = null;
    worker.on('message', (m) => { const w = waiting; waiting = null; w?.(m); });
    worker.on('error', (error) => { process.stderr.write(String(error.stack ?? error) + '\n'); process.exit(1); });
    const ask = (message) => new Promise((resolve) => { waiting = resolve; if (message) worker.postMessage(message); });
    return { worker, ask };
  });
  const ready = await Promise.all(workers.map((w) => w.ask(null)));
  const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
  send({ ready: ready.map(({ observationSize, actionSize }) => ({ observationSize, actionSize })), workers: count });
  const all = async (messages) => {
    const answers = await Promise.all(workers.map((w, i) => w.ask(messages(i))));
    const failed = answers.find((a) => a.error);
    if (failed) throw new Error(failed.error);
    return answers;
  };
  for await (const line of createInterface({ input: process.stdin })) {
    const { op, actions } = JSON.parse(line);
    try {
      if (op === 'reset') send({ observations: (await all(() => ({ op }))).map((a) => a.observation) });
      else if (op === 'step') {
        const answers = await all((i) => ({ op, action: actions[i] }));
        send({ observations: answers.map((a) => a.observation), rewards: answers.map((a) => a.reward), dones: answers.map((a) => a.done), infos: answers.map((a) => a.info) });
      } else if (op === 'close') { await all(() => ({ op })); break; }
      else throw new Error(`no operation ${op}`);
    } catch (error) { send({ error: String(error.stack ?? error) }); break; }
  }
  for (const w of workers) await w.worker.terminate();
}
