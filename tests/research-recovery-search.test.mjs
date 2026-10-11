import test from 'node:test';
import assert from 'node:assert/strict';
import { cmaSearch, workerPool } from '../research/cma.mjs';
import { recoveryScore, trajectoryAction } from '../research/stand-up-search.mjs';
import { checkRecoveryAction } from '../research/stand-up-environment.mjs';
import { modelSpec } from '../src/core/models.ts';

test('CMA resumes the exact population and optimum with complete optimizer and random state', async () => {
  const run = async (generations, resume) => {
    const populations = [];
    const result = await cmaSearch({ n: 4, lambda: 8, start: [.2, .3, .4, .5], seed: 17, generations, resume,
      score: async u => { populations.push(u); return { score: -u.reduce((sum, v) => sum + (v - .8) ** 2, 0) }; } });
    return { result, populations };
  };
  const whole = await run(12), first = await run(5), rest = await run(12, first.result.checkpoint);
  assert.deepEqual([...first.populations, ...rest.populations], whole.populations);
  assert.deepEqual(rest.result, whole.result);
  await assert.rejects(cmaSearch({ n: 3, lambda: 8, generations: 1, resume: first.result.checkpoint }), /incompatible/);
  await assert.rejects(cmaSearch({ n: 1, lambda: 2, generations: 1, score: () => ({ score: NaN }) }), /finite/);
});

test('target trajectories at both edges of the search cube stay within actual joint bounds', () => {
  const channels = modelSpec('workshop-fighter').joints.flatMap(j => j.dofs.map(d => ({ min: d.min.value, max: d.max.value })));
  const seed = { identity: { channels } }, config = { start: 0, length: 720, knots: 4, rateRange: [.5, 1], representation: 'targets' };
  for (const edge of [0, 1]) {
    const u = Array(1 + 4 * (channels.length + 2)).fill(edge);
    for (let step = 0; step < 1140; step++) assert.doesNotThrow(() => checkRecoveryAction(trajectoryAction(seed, config, u, step), channels));
  }
});

test('worker errors reject every queued request and explicit cancellation settles pending work', async () => {
  const broken = workerPool(new URL('data:text/javascript,throw new Error("worker failed")'), {}, 1);
  try { await assert.rejects(Promise.all([broken.evaluate(1), broken.evaluate(2)]), /worker failed/); }
  finally { await broken.terminate(); }
  const waiting = workerPool(new URL('data:text/javascript,import {parentPort} from "node:worker_threads";parentPort.on("message",()=>{});'), {}, 1);
  const rejected = assert.rejects(waiting.evaluate(1), /cancelled/);
  await waiting.terminate(); await rejected;
});

test('verified success outranks optimistic unfinished motion, and invalid execution cannot win', () => {
  const result = { failure: null, assisted: false, effortViolation: 0, success: false, seconds: null, quiet: .49 };
  const measurement = { rootUp: 1, soleUp: [1, 1], observation: { height: 1, segments: [{ velocity: [0, 0, 0] }] } };
  assert.ok(recoveryScore({ ...result, success: true, seconds: 45 }, measurement) > recoveryScore(result, measurement));
  for (const change of [{ failure: 'fell after handover' }, { assisted: true }, { effortViolation: 1 }, { effortViolation: NaN }])
    assert.equal(recoveryScore({ ...result, ...change, success: true, seconds: 1 }, measurement), -1000000);
});

test('zero trajectory residual preserves action channels, and retiming leaves the prefix and suffix intact', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ action: { kind: 'muscles', velocity: [i, '+inf'], activation: [.2, .8], handPoses: { left: 'open' } } }));
  const seed = { rows, identity: { channels: [1, 2] } };
  const config = { start: 4, length: 8, knots: 2, rateRange: [.5, 1], velocityRadius: 3, activationRadius: .3 };
  const u = Array(9).fill(.5); u[0] = 1;
  for (let k = 0; k < 20; k++) assert.deepEqual(trajectoryAction(seed, config, u, k), rows[k].action);
  u[0] = 0;
  for (let k = 0; k < 4; k++) assert.deepEqual(trajectoryAction(seed, config, u, k), rows[k].action);
  for (let k = 8; k < 16; k++) assert.deepEqual(trajectoryAction(seed, config, u, k), rows[k + 4].action);
  const long = { ...seed, rows: Array.from({ length: 3392 }, (_, i) => ({ action: { ...rows[0].action, velocity: [i, '+inf'] } })) };
  const unchanged = { ...config, start: 0, length: long.rows.length };
  u[0] = 1;
  for (let k = 0; k < long.rows.length; k++) assert.deepEqual(trajectoryAction(long, unchanged, u, k), long.rows[k].action);
});
