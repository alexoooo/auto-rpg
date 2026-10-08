import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { freshEngine, saveStand, loadStand } from '../tests/harness/core-stand.mjs';
import { boundedWork, linearWork, solveLinearTo, boundedLeastSquaresTo } from '../src/core/math/flat.ts';
import { createPostureHoldProbe } from '../src/core/tasks/posture-hold.ts';
import { postureStart } from './man-posture-starts.mjs';

/** Offline search settings, not anatomy: docs/reference/native-posture-control.md. */
const NUMERICS = Object.freeze({ epsilon: .001, trustRegion: .25, regularization: 1e-6,
  angularWeight: .1, rootWeight: 3, lineSearch: Object.freeze([1, .5, .25, .125]) });
/** The all-fours to half-kneel transfer, s: hold, smoothstep interpolation, hold. */
const TRANSFER = Object.freeze({ from: 'fours', to: 'half-kneel', before: 2, moving: 6, after: 10 });
const TRANSFER_STEPS = (TRANSFER.before + TRANSFER.moving + TRANSFER.after) * 120;
/** A hand's manifold point within this gap of the ground, m, is read as touching: a reading, not a solver setting. */
const TOUCHING = .001;
const HANDS = Object.freeze(['hand.left', 'hand.right']);

/** The reference at `step`: the start's segments, blended toward `end`'s (if any) by the transfer's smoothstep. */
function referenceAt(start, end, step) {
  if (!end) return start;
  const t = Math.max(0, Math.min(1, (step / 120 - TRANSFER.before) / TRANSFER.moving)), u = t * t * (3 - 2 * t);
  return { ...start, segments: start.segments.map((s, i) => {
    const e = end.segments[i], sign = s.rotation.reduce((sum, v, k) => sum + v * e.rotation[k], 0) < 0 ? -1 : 1;
    const q = new Quaternion(...s.rotation.map((v, k) => (1 - u) * v + u * sign * e.rotation[k])).normalize();
    return { ...s, centre: s.centre.map((v, k) => (1 - u) * v + u * e.centre[k]), position: s.position.map((v, k) => (1 - u) * v + u * e.position[k]), rotation: q.asArray() };
  }) };
}

/** Each hand's ground manifolds as they stand: whether the solver pushed, its touching points, their widest spread (m) and the push (N). */
function handsOf(world, built) {
  return Object.fromEntries(HANDS.map((name) => {
    const manifolds = world.physics.contactManifoldsOf(built.segments.get(name).body, (other) => other === null).filter((m) => m.impulse > 0);
    const points = manifolds.flatMap((m) => m.points.filter((p) => p.distance <= TOUCHING).map((p) => p.point));
    let spread = 0;
    for (const a of points) for (const b of points) spread = Math.max(spread, Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2));
    return [name, { bearing: manifolds.length > 0, points: points.length, spread, force: manifolds.reduce((sum, m) => sum + m.impulse, 0) / world.dt }];
  }));
}

/**
 * Offline engine rollouts choose bounded actuator actions on the shared installed-pose task: a hold
 * of `posture`, or with `transfer` the move from all fours to the half kneel (`TRANSFER`), whose
 * reference is blended between the two starts. `envelope` names the hands and feet
 * (`postureStart`).
 */
export async function nativePostureControl({ posture = 'half-kneel', envelope = 'boot', transfer = false, steps = transfer ? TRANSFER_STEPS : 1200, response = .1, iterations = 3, onStep } = {}) {
  if (!['fours', 'half-kneel', 'squat'].includes(posture) || typeof transfer !== 'boolean' || !['boot', 'barefoot'].includes(envelope)
    || !Number.isSafeInteger(steps) || steps < 1 || steps > (transfer ? TRANSFER_STEPS : 1200)
    || !(response > 0) || !Number.isFinite(response) || !Number.isSafeInteger(iterations) || iterations < 1 || iterations > 8) throw new Error('invalid native posture trial');
  if (transfer) posture = TRANSFER.from;
  const rendering = new NullEngine(), scene = new Scene(rendering);
  const task = (id) => ({ model: 'workshop-fighter', posture: id, hz: 120, actuation: 'directional', servoSeconds: .01, speed: 10, activation: 1, controller: 'actuator',
    ...postureStart(envelope, id) });
  const probe = createPostureHoldProbe(scene, await freshEngine('rapier-coordinate-coulomb'), task(posture));
  const { world, body } = probe, channels = probe.actuators.channels;
  const optimizer = { torque: channels.map(() => 0) };
  const states = { probe: probe.state, optimizer }, start = body.observe(), n = channels.length;
  let end = null;
  if (transfer) {
    const endScene = new Scene(rendering), other = createPostureHoldProbe(endScene, await freshEngine('rapier-coordinate-coulomb'), task(TRANSFER.to));
    end = other.body.observe(); other.dispose(); endScene.dispose();
  }
  const hands = Object.fromEntries(HANDS.map((name) => [name, { steps: 0, points: 0, spread: 0, force: 0 }]));
  let peakReferenceDrift = 0;
  const initial = saveStand(world, states), tape = [], trace = createHash('sha256'), samples = [];
  const linear = linearWork(n), bounded = boundedWork(n), { regularization } = NUMERICS;
  let totalEvaluations = 0;
  try {
    for (let step = 0; step < steps; step++) {
      const reference = referenceAt(start, end, step);
      const started = performance.now(), before = body.observe(), saved = saveStand(world, states), dt = world.dt;
      const scale = channels.map(j => Math.max(j.positive, j.negative, 1));
      const lo = channels.map((j, i) => -j.negative / scale[i]), hi = channels.map((j, i) => j.positive / scale[i]);
      const targets = before.segments.map((s, i) => {
        const q = new Quaternion(...reference.segments[i].rotation).multiply(Quaternion.Inverse(new Quaternion(...s.rotation)));
        const sign = q.w < 0 ? -1 : 1, rate = 1 / response;
        return { linear: s.velocity.map((v, k) => v + dt * (rate * rate * (reference.segments[i].centre[k] - s.centre[k]) - 2 * rate * v)),
          angular: s.spin.map((v, k) => v + dt * (2 * rate * rate * sign * [q.x, q.y, q.z][k] - 2 * rate * v)) };
      });
      let evaluations = 0;
      const evaluate = x => {
        loadStand(world, states, saved); optimizer.torque = x.map((v, i) => v * scale[i]); probe.act({ kind: 'torque', torque: optimizer.torque }); world.step(); evaluations++;
        const observation = body.observe();
        const residual = observation.segments.flatMap((s, i) => {
          const weight = s.name === 'lowerTrunk' ? NUMERICS.rootWeight : 1;
          return [...s.velocity.map((v, k) => weight * (v - targets[i].linear[k])), ...s.spin.map((v, k) => weight * NUMERICS.angularWeight * (v - targets[i].angular[k]))];
        });
        return { residual, observation, cost: residual.reduce((sum, v) => sum + v * v, 0) + regularization * x.reduce((sum, v) => sum + v * v, 0) };
      };
      let x = optimizer.torque.map((v, i) => Math.max(lo[i], Math.min(hi[i], v / scale[i]))), current = evaluate(x);
      for (let iteration = 0; iteration < iterations; iteration++) {
        const columns = [];
        for (let i = 0; i < n; i++) {
          const z = [...x], epsilon = x[i] + NUMERICS.epsilon <= hi[i] ? NUMERICS.epsilon : -NUMERICS.epsilon; z[i] += epsilon;
          const r = evaluate(z); columns.push(r.residual.map((v, k) => (v - current.residual[k]) / epsilon));
        }
        const H = new Float64Array(n * n), rhs = new Float64Array(n), free = new Float64Array(n), delta = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) H[i * n + j] = columns[i].reduce((sum, v, k) => sum + v * columns[j][k], 0) + (i === j ? regularization : 0);
          rhs[i] = -columns[i].reduce((sum, v, k) => sum + v * current.residual[k], 0) - regularization * x[i];
        }
        solveLinearTo(linear, H, rhs, n, free);
        boundedLeastSquaresTo(bounded, H, free, lo.map((v, i) => Math.max(v - x[i], -NUMERICS.trustRegion)), hi.map((v, i) => Math.min(v - x[i], NUMERICS.trustRegion)), n, delta);
        let accepted = false;
        for (const length of NUMERICS.lineSearch) {
          const z = x.map((v, i) => v + length * delta[i]), candidate = evaluate(z);
          if (candidate.cost < current.cost) { x = z; current = candidate; accepted = true; break; }
        }
        if (!accepted) break;
      }
      loadStand(world, states, saved); optimizer.torque = x.map((v, i) => v * scale[i]); probe.act({ kind: 'torque', torque: optimizer.torque }); world.step();
      tape.push([...optimizer.torque]);
      const actual = body.observe(); assert.deepEqual(actual, current.observation, 'selected rollout must reproduce the executed next step');
      trace.update(JSON.stringify(probe.observe()));
      const metric = probe.observe().task;
      totalEvaluations += evaluations;
      const referenceDrift = Math.max(...actual.segments.map((s, i) => {
        const d = s.position.map((v, k) => v - reference.segments[i].position[k]); return Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
      }));
      peakReferenceDrift = Math.max(peakReferenceDrift, referenceDrift);
      const touch = handsOf(world, probe.built);
      for (const name of HANDS) if (touch[name].bearing) {
        const h = hands[name]; h.steps++; h.points += touch[name].points; h.spread += touch[name].spread; h.force += touch[name].force;
      }
      const sample = { posture, envelope, transfer, step: step + 1, response, iterations, evaluations, cost: current.cost, drift: metric.finalDrift, peakDrift: metric.peakDrift,
        referenceDrift, peakReferenceDrift, peakEffortViolation: metric.peakEffortViolation, milliseconds: performance.now() - started, height: actual.height,
        contacts: [...new Set(actual.contacts.filter(c => c.fixed !== null && c.impulse > 0).map(c => c.segment))], hands: touch };
      onStep?.(structuredClone(sample)); if ((step + 1) % 120 === 0 || step === steps - 1) samples.push(sample);
    }

    const outcome = probe.observe().task, final = saveStand(world, { probe: probe.state }), digest = trace.digest('hex');
    loadStand(world, states, initial);
    const handTotals = Object.fromEntries(HANDS.map((name) => {
      const h = hands[name], mean = (v) => (h.steps ? v / h.steps : null);
      return [name, { bearingSteps: h.steps, points: mean(h.points), spread: mean(h.spread), force: mean(h.force) }];
    }));
    const replay = createHash('sha256');
    for (const torque of tape) { probe.act({ kind: 'torque', torque }); world.step(); replay.update(JSON.stringify(probe.observe())); }
    assert.equal(replay.digest('hex'), digest);
    assert.deepEqual(saveStand(world, { probe: probe.state }).state, final.state);
    const continuation = () => {
      const samples = [];
      probe.act({ kind: 'torque', torque: channels.map(() => 0) });
      for (let i = 0; i < 16; i++) { world.step(); samples.push(probe.observe()); }
      return { samples, state: saveStand(world, { probe: probe.state }).state };
    };
    const continued = continuation();
    loadStand(world, { probe: probe.state }, final); assert.deepEqual(continuation(), continued);
    return { harness: 'Node core World', configuration: probe.configuration,
      planner: { kind: 'offline-native-rollouts', access: 'privileged whole-world snapshots', response, iterations,
        horizonSteps: 1, ...NUMERICS },
      envelope, transfer: transfer ? { ...TRANSFER, peakReferenceDrift } : null, steps, seconds: steps / 120, outcome, hands: handTotals,
      touching: TOUCHING, totalEvaluations, digest, replay: true, samples, tape };
  } finally { probe.dispose(); scene.dispose(); rendering.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { posture: { type: 'string', default: 'half-kneel' }, envelope: { type: 'string', default: 'boot' },
    transfer: { type: 'boolean', default: false }, steps: { type: 'string' } } });
  console.log(JSON.stringify(await nativePostureControl({ posture: values.posture, envelope: values.envelope, transfer: values.transfer,
    ...(values.steps ? { steps: Number(values.steps) } : {}) })));
}
