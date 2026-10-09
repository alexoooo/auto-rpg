import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { combatCheckpoint, appendCombatRow, combatGroups } from './combat-records.mjs';
import { combatFingerprint, combatPairs, combatTrial } from './arena-combat.mjs';

if (!isMainThread) {
  parentPort.on('message', async ({ job, fingerprint }) => {
    try {
      if (combatFingerprint() !== fingerprint) console.warn('combat source changed before a physical trial: the results may mix two versions of the code');
      const result = await combatTrial(job.config);
      if (combatFingerprint() !== fingerprint) console.warn('combat source changed during a physical trial: the results may mix two versions of the code');
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
  const fingerprint = combatFingerprint(), output = value('--output', 'research/runs/arena-combat.json');
  const previous = args.includes('--resume') && existsSync(output) ? JSON.parse(readFileSync(output,'utf8')) : null;
  const record = combatCheckpoint(jobs,fingerprint,previous), completed = new Set(record.rows.map(r=>r.id));
  const remaining = jobs.filter(j=>!completed.has(j.id));
  mkdirSync(dirname(output), { recursive: true });
  const write = () => {writeFileSync(output+'.next',JSON.stringify(record,null,2)+'\n');renameSync(output+'.next',output);};
  const rate = () => {record.groups=jobs.every(j=>j.candidateSide&&Number.isInteger(j.pair))?combatGroups(record.rows):null;record.rating=record.groups?.length===1?record.groups[0].rating:null;};
  if(!remaining.length){rate();write();console.log(JSON.stringify({output,resumed:completed.size,remaining:0,groups:record.groups}));process.exit(0);}
  write();
  const workers = Array.from({ length: Math.min(concurrency, remaining.length) }, () => new Worker(new URL(import.meta.url)));
  const started = Date.now(), elapsed = record.secondsElapsed; let next = 0;
  try {
    await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
      worker.on('error', reject);
      const feed = () => {
        if (next >= remaining.length) { resolve(); return; }
        const job = remaining[next++];
        worker.once('message', row => {
          try {
          appendCombatRow(record,row);
          record.secondsElapsed = elapsed + (Date.now()-started)/1000;write();
          if (row.error) { reject(new Error(row.error)); return; }
          console.log(JSON.stringify({ id: row.id, verdict: row.result.verdict,
            driven: [row.result.sides.left.driven, row.result.sides.right.driven],
            damage: [row.result.sides.left.drivenDamage, row.result.sides.right.drivenDamage] }));
          feed();
          } catch(error) {reject(error);}
        });
        worker.postMessage({ job, fingerprint });
      }; feed();
    })));
    if (combatFingerprint() !== fingerprint) console.warn('combat source changed before rating publication: the results may mix two versions of the code');
    record.complete = true;rate();
    record.secondsElapsed = elapsed + (Date.now()-started)/1000;write();
    console.log(JSON.stringify({output,resumed:completed.size,groups:record.groups,secondsElapsed:record.secondsElapsed}));
  } finally { await Promise.all(workers.map(w => w.terminate())); }
}
