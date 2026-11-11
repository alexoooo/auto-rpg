import '../harness/preload-data.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { caseNames, EVALUATIONS } from '../../src/app/node/evaluation.ts';
import { CONTROLLERS } from '../../src/app/catalog.ts';
import { DEFAULT_ENGINE } from '../../src/core/physics/engines.ts';
import { casesOf } from '../../src/evaluation/run.ts';
import { caseCoder, fileTable } from '../../scripts/build-identity.mjs';

test('Rise cases change key when an installed technique record changes', () => {
  const evaluation = EVALUATIONS.rise, files = fileTable();
  const keys = (table) => {
    const coder = caseCoder(table, 'src/evaluation/rise/cases.ts', Object.keys(CONTROLLERS));
    const result = casesOf(evaluation, 'placed-bodies', evaluation.subjects(['front-sit-back']), {
      engine: DEFAULT_ENGINE, code: world => coder.code(caseNames(world)).digest, schedule: { kind: 'all' },
    });
    assert.ok(!('refused' in result), 'the front-sit-back reaches its placed cases');
    return result.units.flat().map(one => one.key);
  };
  const baseline = keys(files);
  assert.ok(baseline.length > 0, 'there are cached case keys to distinguish');
  for (const record of ['step-up', 'sit-back']) {
    const path = `assets/skills/recovery/staged/${record}.json`;
    assert.ok(files[path], 'the installed record is a build input');
    const changed = keys({ ...files, [path]: { ...files[path], hash: `${files[path].hash}-changed` } });
    assert.ok(changed.every((key, k) => key !== baseline[k]), `${record} changes every case that reads it`);
  }
  const unrelated = 'assets/skills/recovery/righting/righting.json';
  assert.deepEqual(keys({ ...files, [unrelated]: { ...files[unrelated], hash: 'unrelated-change' } }), baseline,
    'an unread recovery record does not invalidate these cases');
});
