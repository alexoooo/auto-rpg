import test from 'node:test';
import assert from 'node:assert/strict';
import { modelSpec } from '../src/core/models.ts';
import { convexHull } from '../src/core/spec/hull.ts';
import { dot } from '../src/core/spec/vec.ts';
import { handsSpec } from '../research/man-hands.mjs';
import { punchCalibration } from '../research/punch-calibration.mjs';
import { PLANTED_PUNCH_EXECUTION } from '../src/core/skills/combat.ts';
import { specProvenanceFaults } from './fixtures/spec.mjs';

const hand = (spec, side) => spec.segments.find(s => s.name === `hand.${side}`);
/** How far a point stands outside a hull, m: its largest signed distance past a face's plane. */
const outside = (shape, point) => Math.max(...convexHull(shape.points.map(p => p.value)).planes.map(({ normal, offset }) => dot(normal, point) - offset));

test("Man's hands replace only the empty hand's open and fist shapes, sourced, with the strike on the fist's surface", () => {
  const spec = modelSpec('workshop-fighter'), man = handsSpec(spec, 'hull');
  assert.equal(handsSpec(spec, 'capsule'), spec);
  assert.throws(() => handsSpec(spec, 'mitten'), /no hand geometry/);
  assert.throws(() => handsSpec({ ...spec, held: [{ segment: 'hand.right' }] }, 'hull'), /measured empty/);
  assert.deepEqual(specProvenanceFaults(man), []);
  for (const [i, segment] of man.segments.entries())
    if (!segment.name.startsWith('hand.')) assert.equal(segment, spec.segments[i], segment.name);
  for (const side of ['left', 'right']) {
    const before = hand(spec, side), after = hand(man, side);
    assert.equal(after.shape.kind, 'hull');
    assert.equal(after.shape, after.handPoses.open);
    assert.equal(after.handPoses.fist.kind, 'hull');
    assert.equal(after.handPoses.grip, before.handPoses.grip);
    for (const key of ['mass', 'centreOfMass', 'inertia', 'proximal', 'distal', 'surface']) assert.equal(after[key], before[key], key);
    assert.equal(after.points.knuckles, before.points.knuckles);
    assert.notDeepEqual(after.points.strike.value, before.points.strike.value);
    assert.ok(Math.abs(outside(after.handPoses.fist, after.points.strike.value)) < 1e-4, `${side} strike on the fist's surface`);
    assert.ok(outside(after.handPoses.fist, before.points.strike.value) > .002, `${side}: the capsule's strike stands outside Man's fist`);
    assert.ok(outside(after.handPoses.open, after.points.knuckles.value) < 0, `${side}: the open palm holds the knuckle`);
  }
});

test("the closed fist strikes the pad with Man's fist hull, within its penetration of the surface and away from its strike point", async () => {
  const r = await punchCalibration({ hand: 'right', family: 'straight', hz: 120, seconds: 8, armExtension: .5, hands: 'hull',
    actuation: 'directional', ahead: .55, height: 1.55,
    execution: PLANTED_PUNCH_EXECUTION, matchedFeedback: true, paths: { elbowExtension: .5 }, pad: { face: 'compliant' } });
  assert.equal(r.harness.hands, 'hull');
  assert.equal(r.fell, false);
  const fist = hand(handsSpec(modelSpec('workshop-fighter'), 'hull'), 'right').handPoses.fist;
  const clean = r.impacts.filter(e => e.eligible);
  assert.ok(clean.length >= 3);
  for (const e of clean) {
    assert.equal(e.preImpact.pose, 'fist');
    // The pad reads its deepest point, which the hull reaches by the face's penetration.
    const depth = Math.max(...e.samples.flatMap(s => s.materialContacts.map(c => c.penetration))), at = outside(fist, e.contactGeometry.rest);
    assert.ok(at < .001 && at > -depth - .001, `contact ${e.contactGeometry.rest} ${at} m from the fist hull, penetration ${depth}`);
    assert.ok(e.contactGeometry.offset > .02, 'the hull lands off the artifact strike point');
  }
});
