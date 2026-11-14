/**
 * **The run gait's walking stride searched on its drill** (`GaitTuning`, the walk and run's
 * `tuning.stride` over its body's record, `move-drill.mjs`): CMA-ES in the unit cube of `DIMS`,
 * each candidate played on the training twin of the body's run row (`--loadout`, one cell) at the
 * game's rate, 120 Hz, the cell's own subject (`option-drill`) with the stride as the run gait's,
 * and scored by the seconds its trials lose against their orders (`-lost`, a fall at `FALL_PRICE`).
 * `--score` plays the start alone; `--resume` goes on from `<out>-checkpoint.json`; `--confirm
 * <out>-best.json` plays the best and the record on the row's own cases at 120 and 480 Hz, the
 * worse counting.
 *
 * node research/skills/locomotion/stride-search.mjs --out .tmp/<task>/stride [--body man] [--loadout empty,empty]
 *   [--start stride.json] [--generations 8] [--lambda 16] [--workers 8] [--sigma .08] [--resume] [--score] [--confirm <out>-best.json]
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { parseArgs } from 'node:util';
import { cmaSearch } from '../../cma.mjs';
import { scoreOn, trialPool } from '../../drill-trials.mjs';
import { STANCE_GAIT } from '../../../src/control/stance/stance-tuning.ts';
import { confirmMove, moveRow, valuesWith, walkRunRecord } from './move-drill.mjs';

/** Each setting searched and its range. */
const DIMS = {
  seconds: [.16, .38], lift: [.03, .1], width: [.15, .3], longest: [.6, 1.1], reserve: [.75, .98],
  effort: [.4, 1], accel: [.5, 2.5], crouch: [.05, .22], horizon: [.06, .16], transfer: [.02, .18],
  knee: [.1, .8], preswingSeconds: [.02, .12],
};

const { values: o } = parseArgs({ options: {
  out: { type: 'string' }, body: { type: 'string', default: 'man' }, loadout: { type: 'string' },
  start: { type: 'string' }, generations: { type: 'string', default: '8' }, lambda: { type: 'string', default: '16' },
  workers: { type: 'string' }, sigma: { type: 'string', default: '.08' }, score: { type: 'boolean' }, resume: { type: 'boolean' }, confirm: { type: 'string' },
} });
const row = { body: o.body, skill: 'run', ...(o.loadout ? { loadout: o.loadout } : {}) };
const settingsOf = (stride) => ({ gaits: { run: { stride } } });
const pool = trialPool(Number(o.workers ?? Math.max(1, availableParallelism() - 4)));
try {
  if (o.confirm) {
    const found = JSON.parse(readFileSync(o.confirm, 'utf8'));
    console.log(JSON.stringify(await confirmMove(moveRow(found.row).cells, settingsOf(found.stride), { play: pool.play })));
  } else {
    if (!o.out) throw Error('--out names the search\'s files');
    const saved = o.resume ? JSON.parse(readFileSync(o.out + '-checkpoint.json', 'utf8')) : null;
    if (saved && JSON.stringify(saved.row) !== JSON.stringify(row)) throw Error('the checkpoint searched another row');
    const start = saved?.start ?? (o.start ? JSON.parse(readFileSync(o.start, 'utf8')) : walkRunRecord(o.body).stride ?? STANCE_GAIT);
    const keys = Object.keys(DIMS), point = { ...start, knee: start.preswing?.knee ?? 0, preswingSeconds: start.preswing?.seconds ?? STANCE_GAIT.preswing.seconds };
    const unit = keys.map(key => (point[key] - DIMS[key][0]) / (DIMS[key][1] - DIMS[key][0]));
    const strideAt = u => {
      const values = Object.fromEntries(keys.map((key, i) => [key, DIMS[key][0] + Math.min(1, Math.max(0, u[i])) * (DIMS[key][1] - DIMS[key][0])]));
      const { knee, preswingSeconds, ...stride } = values;
      return { ...start, ...stride, preswing: { knee, seconds: preswingSeconds } };
    };
    const { trials } = moveRow(row);
    console.error(`the run's stride on ${o.body}: ${trials.length} trials of the twin a candidate`);
    // A candidate is scored by the time it loses; one none of whose trials counts scores below every one that has one.
    const score = async u => { const r = await scoreOn(trials, valuesWith(settingsOf(strideAt(u))), { play: pool.play }); return { ...r, score: r.value === null ? -1e3 : -r.value, each: undefined }; };
    const baseline = await score(unit);
    if (!o.resume) writeFileSync(o.out + '-baseline.json', JSON.stringify({ row, stride: strideAt(unit), ...baseline }) + '\n');
    console.log(JSON.stringify({ baseline: baseline.value, falls: baseline.falls, trials: baseline.trials }));
    if (!o.score) await cmaSearch({ n: keys.length, start: unit, sigma: Number(o.sigma), lambda: Number(o.lambda), generations: Number(o.generations), seed: 1, score, resume: saved?.checkpoint,
      onGeneration: (entry, { best, checkpoint }) => {
        const line = { ...entry, lost: best.r?.value, falls: best.r?.falls, stride: strideAt(best.u) };
        appendFileSync(o.out + '.jsonl', JSON.stringify(line) + '\n');
        writeFileSync(o.out + '-best.json', JSON.stringify({ row, stride: strideAt(best.u), lost: best.r?.value }, null, 1) + '\n');
        writeFileSync(o.out + '-checkpoint.json', JSON.stringify({ row, start, checkpoint }) + '\n');
        console.log(JSON.stringify(line));
      } });
  }
} finally { await pool.terminate(); }
