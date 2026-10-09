import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { surfaceEntry, surfaceContains } from '../src/core/mind/openings.ts';
import { frameOf } from '../src/core/spec/body.ts';
import { sourced } from '../src/core/spec/quantity.ts';
import { coreStand } from './harness/core-stand.mjs';
import { lone } from './fixtures/lone.mjs';

const q = value => sourced(value, 'm', 'de-leva-1996', 'a collider ray fixture');
const close = (actual, expected, tolerance = 1e-7) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < tolerance, `${actual} != ${expected}`));

test('finite surface entries match posed physical sphere, capsule, box and hull colliders', async () => {
  const vertices = [];
  for (const x of [-.04, .04]) for (const y of [-.1, .1]) for (const z of [-.06, .06]) vertices.push(q([x, y, z]));
  const cases = [
    { shape: { kind: 'sphere', centre: q([0, 0, 0]), radius: q(.05) }, start: [0, 0, .2], at: [0, 0, .05], normal: [0, 0, 1] },
    { shape: { kind: 'capsule', from: q([0, -.1, 0]), to: q([0, .1, 0]), radius: q(.05) }, start: [0, .03, .2], at: [0, .03, .05], normal: [0, 0, 1] },
    { shape: { kind: 'capsule', from: q([0, -.1, 0]), to: q([0, .1, 0]), radius: q(.05) }, start: [0, .3, 0], at: [0, .15, 0], normal: [0, 1, 0] },
    { shape: { kind: 'box', centre: q([0, 0, 0]), size: q([.08, .2, .12]) }, start: [.02, .03, .2], at: [.02, .03, .06], normal: [0, 0, 1] },
    { shape: { kind: 'hull', points: vertices }, start: [.2, .03, .02], at: [.04, .03, .02], normal: [1, 0, 0] },
  ];
  for (const fixture of cases) {
    const base = lone('ray fixture', 'part', 1), leaf = { ...base.segments[0], shape: fixture.shape };
    const stand = await coreStand({ ...base, segments: [leaf] }, { gravity: false, ground: false, position: [.4, .7, -.3], rotation: Quaternion.RotationYawPitchRoll(.7, -.4, .2).asArray() });
    try {
      const segment = stand.built.segments.get('part'), frame = frameOf(leaf);
      const local = at => {
        const delta = at.map((v, i) => v - frame.origin[i]);
        return new Vector3(...[frame.x, frame.y, frame.z].map(axis => axis.reduce((sum, v, i) => sum + v * delta[i], 0)));
      };
      const world = at => {
        const p = local(at).applyRotationQuaternionToRef(segment.node.rotationQuaternion, new Vector3()).addInPlace(segment.node.position);
        return [p.x, p.y, p.z];
      };
      const normal = direction => {
        const p = new Vector3(...[frame.x, frame.y, frame.z].map(axis => axis.reduce((sum, v, i) => sum + v * direction[i], 0)))
          .applyRotationQuaternionToRef(segment.node.rotationQuaternion, new Vector3());
        return [p.x, p.y, p.z];
      };
      const sensed = { spec: stand.built.spec, segments: new Map([['part', { position: segment.node.position, rotation: segment.node.rotationQuaternion }]]) };
      const hit = surfaceEntry(sensed, 'part', world(fixture.start), world(fixture.at.map((v, i) => v - fixture.normal[i] * .08)));
      assert.ok(hit, fixture.shape.kind);
      close(hit.at, world(fixture.at)); close(hit.normal, normal(fixture.normal));
      assert.ok(segment.body.gapTo(hit.at) < 1e-6, 'the entry is on the physical collider');
      const outside = hit.at.map((v, i) => v + hit.normal[i] * .001);
      assert.ok(Math.abs(segment.body.gapTo(outside) - .001) < 1e-6, 'the normal points outward');
      assert.equal(surfaceEntry(sensed, 'part', world([0, 0, 0]), world(fixture.start)), null, 'an internal start supplies no exposed entry');
      assert.equal(surfaceContains(sensed, 'part', world([0, 0, 0])), true);
      assert.equal(surfaceContains(sensed, 'part', world(fixture.start)), false);
      assert.equal(surfaceEntry(sensed, 'part', world(fixture.start), world(fixture.start.map((v, i) => v - fixture.normal[i] * .01))), null, 'a short path misses');
      assert.equal(surfaceEntry(sensed, 'part', world([2, 2, 2]), world([2, 2, 1])), null, 'an offset path misses');
    } finally { stand.dispose(); }
  }
});

test('a protruding natural collider supplies the exposed entry before its primary segment', async () => {
  const base = lone('compound entry', 'part', 1), leaf = base.segments[0];
  const region = { name: 'tooth', shape: { kind: 'hull', points:
    [[-.02, -.02, .1], [.02, -.02, .1], [.02, .02, .1], [-.02, .02, .1], [0, 0, .15]].map(q) },
    surface: leaf.surface };
  const stand = await coreStand({ ...base, segments: [{ ...leaf, contacts: [region] }] },
    { gravity: false, ground: false, engine: 'rapier-coordinate' });
  try {
    const part = stand.built.segments.get('part');
    const sensed = { spec: stand.built.spec, segments: new Map([['part', {
      position: part.node.position, rotation: part.node.rotationQuaternion }]]) };
    const entry = surfaceEntry(sensed, 'part', [0, 0, .3], [0, 0, 0]);
    assert.ok(entry);
    close(entry.at, [0, 0, .15]);
    assert.ok(part.body.gapTo(entry.at) < 1e-6);
    assert.equal(surfaceEntry(sensed, 'part', [0, 0, .11], [0, 0, 0]), null,
      'a start inside a natural region has no fresh exposed entry');
    assert.equal(surfaceContains(sensed, 'part', [0, 0, .11]), true);
    assert.equal(surfaceContains(sensed, 'part', [0, 0, .16]), false);
  } finally { stand.dispose(); }
});
