/**
 * Facing-held travel stride calibration on the Node stand, empty-handed in the guard, Balance 0.
 * The weakest direction's proxy rewards speed, pelvis facing and a quiet final stance together.
 * Three-second mean speed and final quiet speed are training proxies; confirmation must read
 * rolling speed, entry time, the corridor and the complete settling interval separately.
 *
 * node research/skills/locomotion/stride-search.mjs --out research/runs/warrior-travel/stride-search
 *   [--model workshop-fighter] [--ways 45,90,180] [--pace 1.2] [--start stride.json]
 *   [--generations 8] [--lambda 16] [--workers 8] [--sigma .08] [--score] [--resume]
 */
import { isMainThread, parentPort } from 'node:worker_threads';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { cmaSearch, workerPool } from '../../cma.mjs';
import { STANCE_GAIT } from '../../../src/control/stance-tuning.ts';
import { DEFAULT_ENGINE } from '../../../src/core/physics/engines.ts';
import { modelSpec } from '../../../src/core/bodies/models.ts';
import { recordingKey } from '../../../src/core/world/recording.ts';

process.env.CORE_ENGINE ??= DEFAULT_ENGINE;
await import('../../../tests/harness/preload-data.mjs');
const { walk } = await import('./stance/core-stance-trials.mjs');

const DIMS = {
  seconds: [.16, .38], lift: [.03, .1], width: [.15, .3], longest: [.6, 1.1], reserve: [.75, .98],
  effort: [.4, 1], accel: [.5, 2.5], crouch: [.05, .22], horizon: [.06, .16], transfer: [.02, .18],
  knee: [.1, .8], preswingSeconds: [.02, .12],
};
const FACING = 20 * Math.PI / 180, QUIET = .15, FLOOR = 1;

async function trial(recipe, stride) {
  const reading = await walk({ ...recipe, stride });
  const pace = Number.isFinite(reading.along) ? Math.max(0, reading.along) : 0;
  const yaw = Number.isFinite(reading.facing) ? reading.facing : Infinity;
  const quiet = Number.isFinite(reading.speed) ? reading.speed : Infinity;
  const credit = Math.min(1, pace / FLOOR) * Math.min(1, FACING / Math.max(FACING, yaw))
    * Math.min(1, QUIET / Math.max(QUIET, quiet)) * (reading.fell ? .02 : 1);
  return { recipe, reading, credit };
}

if (!isMainThread) {
  parentPort.on('message', async ({ id, x }) => {
    try { parentPort.postMessage({ id, r: await trial(x.recipe, x.stride) }); }
    catch (error) { parentPort.postMessage({ id, r: { error: String(error), credit: -1 } }); }
  });
} else {
  const { values: o } = parseArgs({ options: {
    out: { type: 'string' }, model: { type: 'string', default: 'workshop-fighter' },
    ways: { type: 'string', default: '45,90,180' }, pace: { type: 'string', default: '1.2' },
    start: { type: 'string' }, resume: { type: 'boolean' }, generations: { type: 'string', default: '8' }, lambda: { type: 'string', default: '16' },
    workers: { type: 'string', default: '8' }, sigma: { type: 'string', default: '.08' }, score: { type: 'boolean' },
  } });
  if (!o.out) throw Error('--out names the saved calibration');
  const saved = o.resume ? JSON.parse(readFileSync(o.out + '-checkpoint.json', 'utf8')) : null;
  const start = saved?.start ?? (o.start ? JSON.parse(readFileSync(o.start, 'utf8')) : STANCE_GAIT);
  const keys = Object.keys(DIMS), point = { ...start, knee: start.preswing?.knee ?? 0, preswingSeconds: start.preswing?.seconds ?? STANCE_GAIT.preswing.seconds };
  const unit = keys.map(key => (point[key] - DIMS[key][0]) / (DIMS[key][1] - DIMS[key][0]));
  const strideAt = u => {
    const values = Object.fromEntries(keys.map((key, i) => [key, DIMS[key][0] + Math.min(1, Math.max(0, u[i])) * (DIMS[key][1] - DIMS[key][0])]));
    const { knee, preswingSeconds, ...stride } = values;
    return { ...start, ...stride, preswing: { knee, seconds: preswingSeconds } };
  };
  const recipes = o.ways.split(',').map(Number).map(degrees => ({ model: o.model, degrees, speed: Number(o.pace),
    legs: 'walk-run', setOff: 11, rest: 4, balance: 0, held: 'empty' }));
  const hash = value => createHash('sha256').update(value).digest('hex');
  const trees = ['src', 'assets', 'vendor', 'tests'];
  const code = { trees: Object.fromEntries(trees.map(path => [path,
    execFileSync('git', ['rev-parse', `HEAD:${path}`], { encoding: 'utf8' }).trim()])),
    diff: execFileSync('git', ['diff', 'HEAD', '--', ...trees], { encoding: 'utf8' }), node: process.version,
    stand: hash(readFileSync(new URL('./stance/core-stance-trials.mjs', import.meta.url))),
    search: hash(readFileSync(new URL('../../cma.mjs', import.meta.url))),
    reader: hash(readFileSync(new URL(import.meta.url))) };
  const identity = recordingKey({ protocol: 'stride-facing-proxy', engine: process.env.CORE_ENGINE, hz: 120, delay: 1,
    body: hash(recordingKey(modelSpec(o.model))), code, recipes, start, ranges: DIMS, lambda: Number(o.lambda) });
  if (saved && saved.identity !== identity) throw Error('checkpoint cases, body, calibration or code differ');
  const rowsFile = o.out + '-rows.jsonl', cache = new Map();
  if (existsSync(rowsFile)) for (const line of readFileSync(rowsFile, 'utf8').trim().split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    if (row.identity === identity) cache.set(row.key, row.result);
  }
  const pool = workerPool(new URL(import.meta.url), null, Number(o.workers));
  const score = async u => {
    const stride = strideAt(u), trials = await Promise.all(recipes.map(async recipe => {
      const key = hash(recordingKey({ identity, recipe, stride }));
      if (cache.has(key)) return cache.get(key);
      const result = await pool.evaluate({ recipe, stride });
      cache.set(key, result);
      appendFileSync(rowsFile, JSON.stringify({ identity, key, recipe, stride, result }) + '\n');
      return result;
    }));
    if (trials.some(t => t.error)) return { score: -1, error: trials.find(t => t.error).error, trials };
    return { score: Math.min(...trials.map(t => t.credit)), trials };
  };
  try {
    const baseline = await score(unit);
    if (baseline.error) throw Error(baseline.error);
    if (!o.resume) writeFileSync(o.out + '-baseline.json', JSON.stringify({ identity, stride: strideAt(unit), ...baseline }) + '\n');
    console.log(JSON.stringify({ baseline: baseline.score, trials: baseline.trials }));
    if (!o.score) await cmaSearch({ n: keys.length, start: unit, sigma: Number(o.sigma), lambda: Number(o.lambda), generations: Number(o.generations), seed: 1, score, resume: saved?.checkpoint,
      onGeneration: (entry, { best, checkpoint }) => {
        const row = { ...entry, bestSoFar: best.score, stride: strideAt(best.u), trials: best.r?.trials };
        appendFileSync(o.out + '.jsonl', JSON.stringify(row) + '\n');
        writeFileSync(o.out + '-best.json', JSON.stringify(strideAt(best.u), null, 1) + '\n');
        writeFileSync(o.out + '-checkpoint.json', JSON.stringify({ identity, start, checkpoint }) + '\n');
        console.log(JSON.stringify(row));
      } });
  } finally { await pool.terminate(); }
}
