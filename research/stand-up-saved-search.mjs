import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serialize, deserialize } from 'node:v8';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { parseArgs } from 'node:util';
import { cmaSearch, workerPool } from './cma.mjs';

const frozen = new URL('../.tools/stand-up-frozen/', import.meta.url);
const { recoveryEnvironment } = await import(new URL('research/stand-up-environment.mjs', frozen));
const { recoveryDesign } = await import(new URL('research/stand-up-design.mjs', frozen));
const { feedbackRecipe, FEEDBACK_PARAMETERS } = await import(new URL('src/lab/recovery-recipe.ts', frozen));
const { unassistedAudit, unassistedResult } = await import(new URL('research/stand-up-unassisted.mjs', frozen));
const { frozenRevision } = await import(new URL('research/stand-up-acceptance.mjs', frozen));
const seed = JSON.parse(readFileSync(new URL('research/stand-up-feedback-seed.json', frozen)));
const manifest = JSON.parse(readFileSync(new URL('research/stand-up-acceptance/cases.json', frozen)));
const digest = data => createHash('sha256').update(data).digest('hex');
const write = (path, value) => { mkdirSync(dirname(resolve(path)), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + '\n'); };

/** Only the controller recipe changes; saved physics, body, host and controller state retain their captured values. */
async function trial(u, { capture = false, seconds = 24, mode = 'feedback', base = seed.feedback.u } = {}) {
  const c = manifest.cases[0], spec = recoveryDesign(c.configuration);
  let recipe = feedbackRecipe(spec, mode === 'feedback' ? u : base);
  if (mode === 'stages') {
    recipe = structuredClone(recipe);
    const poses = [...Object.values(recipe.roll).flat(), ...recipe.rise.filter(s => s.kind === 'pose')];
    poses.forEach((s, i) => { s.seconds *= .2 + 1.6 * u[i]; });
  }
  const e = await recoveryEnvironment({ ...c.configuration, spec, recipe, comparison: true });
  let audit, steps = 0;
  const rows = [], timeline = [], hash = createHash('sha256'), started = performance.now();
  try {
    const bytes = readFileSync(new URL(`research/stand-up-acceptance/${c.file}`, frozen));
    assert.equal(digest(bytes), c.sha256);
    const checkpoint = deserialize(gunzipSync(bytes));
    assert.deepEqual({ ...e.identity, recipeSha: c.identity.recipeSha }, c.identity);
    checkpoint.identity = e.identity;
    e.restore(serialize(checkpoint));
    const initial = e.observe();
    assert.equal(digest(JSON.stringify(initial)), c.observationSha256);
    audit = unassistedAudit(e.stand.built, () => e.stand.world.steps);
    let last;
    while (e.result().elapsed < seconds) {
      const row = e.step(); steps++;
      if (capture) rows.push(row);
      hash.update(JSON.stringify(row.observation));
      const state = e.legacy.state.policies.optimized;
      const key = `${state.phase}/${state.rise.phase}/${state.rise.stage}/${state.rise.tries}`;
      if (key !== last) { timeline.push({ seconds: row.result.elapsed, key, height: row.observation.height }); last = key; }
      if (row.result.success || row.result.failure || audit.events.length) break;
    }
    const result = unassistedResult(e.result(), audit.events), m = e.measure();
    const score = result.success ? 1000000 - 1000 * result.seconds : -1000000 + 100 * m.observation.height + 40 * m.rootUp;
    return { u, mode, base, score, result, steps, milliseconds: performance.now() - started, traceSha256: hash.digest('hex'), timeline,
      ...(capture ? { initial, rows, recipe, identity: e.identity, checkpointSha256: c.sha256,
        geometry: JSON.parse(JSON.stringify([...e.stand.built.segments.values()].map(s => ({ name: s.spec.name, frame: s.frame,
          shapes: s.rigid.shapes, poses: s.poses && Object.fromEntries(Object.entries(s.poses).map(([name, pose]) => [name, pose.rigid.shapes])) })))) } : {}) };
  } catch (error) { return { u, mode, score: -2000000, error: String(error.stack), steps, milliseconds: performance.now() - started }; }
  finally { audit?.dispose(); e.dispose(); }
}

if (!isMainThread && workerData?.savedSearch) parentPort.on('message', async ({ id, x }) => {
  parentPort.postMessage({ id, r: await trial(x, workerData.options) });
});
else if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values: v } = parseArgs({ options: Object.fromEntries(['out','mode','seconds','wall','sigma','seed','start','record','base','algorithm'].map(k => [k, { type: 'string' }])) });
  const revision = frozenRevision(), mode = v.mode ?? 'feedback', seconds = Number(v.seconds ?? 24), out = v.out;
  assert.ok(out);
  const poseCount = (() => { const r = feedbackRecipe(recoveryDesign(manifest.cases[0].configuration), seed.feedback.u); return Object.values(r.roll).flat().length + r.rise.filter(s => s.kind === 'pose').length; })();
  const startRecord = v.start && JSON.parse(readFileSync(v.start));
  const start = startRecord ? startRecord.u : mode === 'stages' ? new Array(poseCount).fill(.5) : seed.feedback.u;
  const base = v.base ? JSON.parse(readFileSync(v.base)).u : startRecord?.base ?? seed.feedback.u;
  mkdirSync(dirname(resolve(out)), { recursive: true });
  if (v.record) {
    const r = await trial(start, { mode, seconds, base, capture: true });
    writeFileSync(out + '.trace.gz', gzipSync(serialize(r)));
    const { rows, initial, geometry, ...report } = r; write(out + '.json', report);
    console.log(JSON.stringify({ result: r.result, error: r.error, timeline: r.timeline, steps: r.steps }));
  } else {
    const deadline = Date.now() + Number(v.wall ?? 600) * 1000, pool = workerPool(new URL(import.meta.url), { savedSearch: true, options: { mode, seconds, base } }, 3);
    let best, steps = 0, evaluations = 0;
    const begun = Date.now();
    const score = async u => {
      if (Date.now() >= deadline) return { score: -2000000, error: 'search wall limit' };
      const r = await pool.evaluate(u); steps += r.steps; evaluations++;
      appendFileSync(out + '.jsonl', JSON.stringify(r) + '\n');
      if (!best || r.score > best.score) { best = r; write(out + '.best.json', { ...best, revision }); console.log(JSON.stringify({ evaluations, steps, best: best.result, error: best.error })); }
      return r;
    };
    try {
      if (v.algorithm === 'coordinate') {
        await score(start);
        for (let round = 0; round < 20 && Date.now() < deadline - 15000; round++) {
          const distance = Number(v.sigma ?? .1) / (1 + Math.floor(round / 3));
          for (let j = 0; j < start.length && Date.now() < deadline - 15000; j++) {
            const origin = [...best.u];
            await Promise.all([-2, -1, 1].map(factor => {
              const u = [...origin]; u[j] = Math.max(0, Math.min(1, u[j] + distance * factor)); return score(u);
            }));
            write(out + '.progress.json', { round, coordinate:j, steps, evaluations, wallSeconds:(Date.now()-begun)/1000 });
          }
        }
      } else {
      await cmaSearch({ n: start.length, start, sigma: Number(v.sigma ?? .04), lambda: 12, generations: 10000, seed: Number(v.seed ?? 123),
        score,
        onGeneration(entry, state) {
          write(out + '.progress.json', { entry, steps, evaluations, wallSeconds: (Date.now() - begun) / 1000, optimizer: state.checkpoint });
          return Date.now() < deadline - 15000;
        } });
      }
    } finally { await pool.terminate(); write(out + '.summary.json', { best, steps, evaluations, wallSeconds: (Date.now() - begun) / 1000, revision, parameters: mode === 'feedback' ? FEEDBACK_PARAMETERS : 'pose duration factors .2 + 1.6*u' }); }
  }
}
