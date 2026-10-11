import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryDesign, recoveryDesignTable } from '../research/stand-up-design.mjs';
import { modelSpec } from '../src/core/models.ts';

test('explicit recovery body variants preserve the default and report every changed muscle envelope', () => {
  assert.equal(JSON.stringify(recoveryDesign()), JSON.stringify(modelSpec('workshop-fighter')));
  const row = recoveryDesignTable({ model: 'workshop-fighter', strength: 3, speed: 2, contact: 'shoe' });
  assert.equal(row.before.mass, row.after.mass);
  for (let i = 0; i < row.before.channels.length; i++) {
    const a = row.before.channels[i], b = row.after.channels[i];
    assert.deepEqual(b, { name: a.name, positive: a.positive * 3, negative: a.negative * 3,
      positiveSpeed: a.positiveSpeed * 2, negativeSpeed: a.negativeSpeed * 2 });
  }
  assert.throws(() => recoveryDesign({ strength: 4 }), /bounds/);
  assert.throws(() => recoveryDesign({ weight: NaN }), /bounds/);
  const lighter = recoveryDesign({ weight: .6 });
  assert.equal(lighter.mass.value, row.before.mass * .6);
  assert.ok(lighter.segments.find(s => s.name === 'foot.left').shape.size.value[0]
    < recoveryDesign().segments.find(s => s.name === 'foot.left').shape.size.value[0]);
});
