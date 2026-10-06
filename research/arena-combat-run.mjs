import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { combatFingerprint, combatPairs, combatRating, combatTrial } from './arena-combat.mjs';

if (!isMainThread) {
  parentPort.on('message', async ({ job, fingerprint }) => {
    try {
      if (combatFingerprint() !== fingerprint) throw new Error('combat source changed before a physical trial');
      const result = await combatTrial(job.config);
      if (combatFingerprint() !== fingerprint) throw new Error('combat source changed during a physical trial');
      parentPort.postMessage({ ...job, result });
    } catch (error) { parentPort.postMessage({ ...job, error: error.stack }); }
  });
} else {
  const args = process.argv.slice(2), value = (name, fallback) => {
    const at = args.indexOf(name); return at === -1 ? fallback : args[at + 1];
  };
  const count = Number(value('--pairs', 100)), concurrency = Number(value('--workers', 2));
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error('invalid combat worker count');
  const policy = name => name.endsWith('.json') ? JSON.parse(readFileSync(name, 'utf8')) : name;
  const jobsFile = value('--jobs', null), jobs = jobsFile ? JSON.parse(readFileSync(jobsFile, 'utf8'))
    : combatPairs({ candidate: policy(value('--candidate', 'point')), opponent: policy(value('--opponent', 'classic')), count,
      split: value('--split', 'development'), capSeconds: Number(value('--cap', 60)) });
  if (!Array.isArray(jobs) || !jobs.length || jobs.some(j => !j.config)) throw new Error('combat run requires physical jobs');
  const fingerprint = combatFingerprint(), rows = [], output = value('--output', 'research/runs/arena-combat.json');
  mkdirSync(dirname(output), { recursive: true });
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, () => new Worker(new URL(import.meta.url)));
  const started = Date.now(); let next = 0;
  try {
    await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
      worker.on('error', reject);
      const feed = () => {
        if (next >= jobs.length) { resolve(); return; }
        const job = jobs[next++];
        worker.once('message', row => {
          rows.push(row);
          writeFileSync(output, JSON.stringify({ fingerprint, complete: false, rows }, null, 2) + '\n');
          if (row.error) { reject(new Error(row.error)); return; }
          console.log(JSON.stringify({ id: row.id, verdict: row.result.verdict,
            driven: [row.result.sides.left.driven, row.result.sides.right.driven],
            damage: [row.result.sides.left.drivenDamage, row.result.sides.right.drivenDamage] }));
          feed();
        });
        worker.postMessage({ job, fingerprint });
      }; feed();
    })));
    if (combatFingerprint() !== fingerprint) throw new Error('combat source changed before rating publication');
    rows.sort((a, b) => jobs.findIndex(j => j.id === a.id) - jobs.findIndex(j => j.id === b.id));
    const rating = jobs.every(j => j.candidateSide && Number.isInteger(j.pair)) ? combatRating(rows) : null;
    const summary = { fingerprint, complete: true, secondsElapsed: (Date.now() - started) / 1000, rating, rows };
    writeFileSync(output, JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify({ output, rating, secondsElapsed: summary.secondsElapsed }));
  } finally { await Promise.all(workers.map(w => w.terminate())); }
}
