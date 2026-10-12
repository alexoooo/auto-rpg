import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { recoveryEnvironment } from './stand-up-environment.mjs';
import { guardPosture } from '../src/core/skills/guard.ts';
import { spinBetweenToRef, turnAboutToRef } from '../src/core/math/turn.ts';
import { recoveryDesign } from './stand-up-design.mjs';

/** Bounded root feedback and ordinary joint targets, used as a control for learned recovery. */
export function assistControl(e, { lift = 1, turn = .12, damping = .055, height = 1, horizontal = 0, response = .15, speed = 6,
  yawLock = true, verticalPriority = false } = {}) {
  const built = e.stand.built, root = built.segments.get('lowerTrunk');
  const reference = e.observe().segments.find(s => s.name === 'lowerTrunk').centre[1];
  const weight = [...built.segments.values()].reduce((sum, s) => sum + s.rigid.mass, 0) * 9.81;
  const guard = guardPosture(built.spec);
  const angles = e.channels.map(c => Math.max(c.min, Math.min(c.max, (guard[c.name] ?? 0) - c.bind)));
  const q = new Quaternion(), yaw = new Quaternion(), target = new Quaternion(), error = new Vector3();
  const up = new Vector3(), across = new Vector3(), inverse = Quaternion.Inverse(root.rest);
  const state = { heading: null, released: false };
  const control = measurement => {
    if (state.released) return { kind: 'host' };
    const r = measurement.observation.segments.find(s => s.name === 'lowerTrunk');
    q.set(...r.rotation).multiplyToRef(inverse, target);
    across.set(1, 0, 0).applyRotationQuaternionToRef(target, across);
    state.heading ??= Math.atan2(-across.z, across.x);
    up.set(0, 1, 0).applyRotationQuaternionToRef(target, up);
    turnAboutToRef(Vector3.UpReadOnly, state.heading, yaw).multiplyToRef(root.rest, target);
    spinBetweenToRef(q, target, 1, error);
    if (!yawLock) {
      const tilt = Math.atan2(Math.hypot(up.x,up.z),up.y), size = Math.hypot(up.x,up.z);
      if (size > 1e-8) error.set(-up.z*tilt/size, 0, up.x*tilt/size);
    }
    if (up.y > .95 && measurement.soleUp.every(v => v > .8) && r.centre[1] > .9*reference) {
      state.released = true; return { kind: 'host' };
    }
    const unload = Math.max(0, Math.min(1, (height * reference - r.centre[1]) / .25));
    const feet = measurement.observation.segments.filter(s => s.name.startsWith('foot.'));
    const centre = [0, 1, 2].map(k => feet.reduce((sum,f) => sum+f.centre[k],0)/feet.length);
    const force = [weight*horizontal*(2*(centre[0]-r.centre[0])-.5*r.velocity[0]),
      weight * Math.max(0, lift * unload - .3 * r.velocity[1]),
      weight*horizontal*(2*(centre[2]-r.centre[2])-.5*r.velocity[2])];
    if (verticalPriority) {
      force[1] = Math.min(e.body.assist.most.force,force[1]);
      const available = Math.sqrt(Math.max(0,e.body.assist.most.force*e.body.assist.most.force-force[1]*force[1]));
      const scale = Math.min(1,available/Math.max(1e-9,Math.hypot(force[0],force[2])));
      force[0] *= scale; force[2] *= scale;
    }
    const moment = [error.x, error.y, error.z].map((v, i) => weight * (turn*v-damping*r.spin[i]));
    if (up.y > .98 && measurement.soleUp.every(v => v > .95) && unload < .05) {
      force.fill(0); moment.fill(0);
    }
    return { kind: 'targets', angles, response, speed, activation: 1, assist: { force, moment } };
  };
  return Object.assign(control, { state });
}

export async function assistedTrial(configuration) {
  const e = await recoveryEnvironment({ ...configuration, spec: recoveryDesign(configuration) });
  const control = assistControl(e, configuration), rows = [], started = performance.now();
  try {
    await e.fall(configuration);
    const initial = e.measure();
    if (e.result().fell) for (let i = 0; i < (configuration.seconds ?? 16)*120; i++) {
      const action = configuration.control === 'legacy' ? undefined : control(e.measure());
      const row = e.step(action, { automaticHandover: true });
      if (i % 30 === 0) rows.push({ time: row.result.elapsed, height: row.observation.height, up: row.rootUp,
        soleUp: row.soleUp, ready: row.ready, force: e.body.assist.given.force.asArray(), moment: e.body.assist.given.moment.asArray() });
      if (row.result.success || row.result.failure) break;
    }
    return { configuration, identity: e.identity, result: e.result(), rows,
      assistance: structuredClone(e.experiment.assistance),
      initial: { height: initial.observation.height, up: initial.rootUp },
      host: { walkFrom: e.experiment.walkFrom, centre: e.observe().centre, stance: e.stance.frame() },
      steps: e.stand.world.steps, milliseconds: performance.now()-started };
  } finally { e.dispose(); }
}

if (!isMainThread && workerData?.assist) parentPort.on('message', async ({ id, x }) => {
  try { parentPort.postMessage({ id, r: await assistedTrial(x) }); }
  catch (error) { parentPort.postMessage({ id, r: { configuration: x, error: String(error.stack ?? error) } }); }
});
else if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: Object.fromEntries(['balance','degrees','seconds','lift','turn','damping','height','horizontal','response','speed','impulse','control','output','model','held','contact'].map(k => [k, { type: 'string' }])) });
  const c = Object.fromEntries(Object.entries(values).filter(([k]) => k !== 'output').map(([k,v]) => [k,
    ['control','model','held','contact'].includes(k) ? v : Number(v)]));
  const result = await assistedTrial(c);
  if (values.output) { mkdirSync(dirname(values.output), { recursive: true }); writeFileSync(values.output, JSON.stringify(result,null,2)); }
  console.log(JSON.stringify(result));
}
