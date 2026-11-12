/**
 * **The run's checkpoints screened on its drill** ([the training recipe](../../../docs/recipes/training.md#choosing-a-checkpoint)):
 * each candidate of a manifest, a walk and run record's settings with a checkpoint's travel actor
 * in them, played as the run gait's research tuning (`move-drill.mjs`) on the training twin of the
 * body's run row at the game's rate, 120 Hz, the cell's own subject (`option-drill`), and ranked
 * by the seconds its trials lose against their orders (a fall at `FALL_PRICE`), then its falls.
 * With `--cell`, the row's own cases at 120 and 480 Hz, the worse counting: the confirmation, played
 * once on the chosen checkpoint.
 *
 *   node research/skills/locomotion/travel-screen.mjs --manifest <manifest.json> --out .tmp/<task>/screen [--cell] [--workers 14]
 *
 * A manifest: `{ "body"?: "workshop-fighter", "loadout"?: "empty,empty", "settings"?: <record settings file>,
 * "candidates": [{ "id", "settings"?, "policy"?: <policy.json>, "native"?: true, "reference"?: false }] }`.
 * A candidate's settings are its own file's, else the manifest's, else the body's record's
 * (`walk-run.json`); `policy` is its travel actor (`learned.travel`); `native` leaves the actor
 * unanswered, so the record's walk and run plays under its frozen reference with no correction;
 * `reference: false` silences the reference too.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { confirmRow, scoreOn, trialPool } from '../../drill-trials.mjs';
import { moveRow, valuesWith, walkRunRecord } from './move-drill.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const { values: o } = parseArgs({ options: { manifest: { type: 'string' }, out: { type: 'string' }, cell: { type: 'boolean' }, workers: { type: 'string' } } });
if (!o.manifest || !o.out) throw Error('Name the candidate manifest and disposable output folder');
const manifest = read(o.manifest), body = manifest.body ?? 'workshop-fighter';
const { cells, trials } = moveRow({ body, skill: 'run', ...(manifest.loadout ? { loadout: manifest.loadout } : {}) });

/** A candidate's run gait tuning: its record's settings, its travel actor in them, its reference silenced or its actor left unanswered where it says. */
function tuningOf(candidate) {
  const file = candidate.settings ?? manifest.settings, tuning = structuredClone(file ? read(file) : walkRunRecord(body));
  if (!tuning.learned) throw Error(`${candidate.id}: its settings have no learned corrections to screen`);
  if (candidate.policy) tuning.learned.travel = read(candidate.policy);
  if (candidate.reference === false) tuning.learned.referenceScale = 0;
  return candidate.native ? { ...tuning, steered: true } : tuning;
}

mkdirSync(o.out, { recursive: true });
const code = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() };
writeFileSync(`${o.out}/manifest.json`, JSON.stringify({ ...manifest, body, code, cases: o.cell ? 'cell' : 'twin' }) + '\n');
const pool = trialPool(Number(o.workers ?? Math.max(1, availableParallelism() - 4))), results = [];
try {
  for (const candidate of manifest.candidates) {
    const valueOf = valuesWith({ gaits: { run: tuningOf(candidate) } });
    const result = o.cell ? { id: candidate.id, ...await confirmRow(cells, valueOf, { play: pool.play }) }
      : (({ value, falls, trials: count, each }) => ({ id: candidate.id, lost: value, falls, trials: count, each }))(await scoreOn(trials, valueOf, { play: pool.play }));
    writeFileSync(`${o.out}/${candidate.id}.json`, JSON.stringify({ candidate, ...result }) + '\n');
    const { each: _each, cells: _cells, ...summary } = result;
    console.log(JSON.stringify(summary)); results.push(summary);
  }
} finally { await pool.terminate(); }
// Every phase the drill holds counts in the time lost, whichever stage trained it.
const lost = (r) => o.cell ? r.worse : r.lost;
results.sort((a, b) => (lost(a) ?? Infinity) - (lost(b) ?? Infinity) || (a.falls ?? 0) - (b.falls ?? 0));
writeFileSync(`${o.out}/ranking.json`, JSON.stringify({ rank: ['s lost against the orders, the mean', 'falls'], results }) + '\n');
