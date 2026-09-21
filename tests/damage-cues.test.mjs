import test from 'node:test';
import assert from 'node:assert/strict';
import { DamageCues } from '../src/damage-cues.ts';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

const cue = (key, damage = 4, blocked = false) => ({ key, name: key, damage, blocked,
  severed: false, point: { x: 1, y: 2, z: 3 } });

test('simultaneous hits survive and same-part labels sum actual damage', () => {
  const cues = new DamageCues();
  cues.add(cue('head')); cues.add(cue('arm')); cues.add(cue('head', 3));
  assert.deepEqual(cues.labels.map(c => [c.key, c.damage]), [['head', 7], ['arm', 4]]);
  cues.add(cue('head', 0, true));
  assert.equal(cues.labels.length, 3, 'a block cannot turn into an injury');
  cues.update(.11); cues.add(cue('head', 2));
  assert.equal(cues.labels.length, 4, 'separate impacts retain separate labels');
});

test('labels own their point, carry severing, expire, and remain bounded', () => {
  const cues = new DamageCues(), source = { ...cue('head'), point: new Vector3(1,2,3) };
  cues.add(source); source.point.x = 99;
  assert.equal(cues.labels[0].point.x, 1);
  cues.add({ ...cue('head', 5), severed: true });
  assert.equal(cues.labels[0].severed, true);
  for (let i = 0; i < 100; i++) cues.add(cue(String(i)));
  assert.equal(cues.labels.length, 8);
  cues.update(.8); assert.equal(cues.labels.length, 0);
  cues.add(cue('arm')); cues.clear(); assert.equal(cues.labels.length, 0);
});
