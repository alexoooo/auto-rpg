import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { serialize } from 'node:v8';
import { recordRecovery, replayRecovery } from '../research/stand-up-search.mjs';
import { nativeRecovery } from '../research/stand-up-native.mjs';
import { recoverySoleTrial } from '../research/stand-up-sole.mjs';

test('native recovery preserves nominal execution, resumes and counts counterfactual steps outside the episode clock', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'auto-rpg-recovery-')), input = join(directory, 'seed.trace'), output = join(directory, 'native.trace');
  try {
    const seed = await recordRecovery(); writeFileSync(input, gzipSync(serialize(seed)));
    await nativeRecovery({ input, output, iterations: 0, maximumSteps: 60 });
    const resumed = await nativeRecovery({ input, output, iterations: 0, maximumSteps: 120 });
    assert.deepEqual(resumed.rows.map(r => r.observation), seed.rows.slice(0, 120).map(r => r.observation));
    assert.equal(resumed.compute.steps, 360);
    const accelerated = await nativeRecovery({ input, seconds: 6, iterations: 1, maximumSteps: 8 });
    assert.equal(accelerated.rows.length, 8);
    assert.ok(accelerated.compute.steps > 8 * 35);
    assert.equal(accelerated.result.success, false);
    assert.equal(accelerated.result.assisted, false);
    assert.ok(accelerated.result.effortViolation < .0001);
    assert.ok(Math.abs(accelerated.rows.at(-1).observation.time - seed.before.observation.time - 8 / 120) < 1e-12);
    await replayRecovery(accelerated);
  } finally {
    for (const path of [input, output, `${output}.checkpoint`]) { try { unlinkSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
    rmdirSync(directory);
  }
});

test('the actual shoe sole carries and releases both character loads without energy growth', async () => {
  for (const model of ['workshop-fighter', 'workshop-rogue']) {
    const row = await recoverySoleTrial({ model, weightShare: 1 });
    assert.equal(row.pass, true, JSON.stringify(row));
    assert.equal(row.replay, true);
    assert.ok(row.loaded.compression > row.final.compression);
    assert.ok(row.loaded.compression < row.sole.depth);
  }
});
