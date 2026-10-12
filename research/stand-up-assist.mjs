import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { recoveryEnvironment } from './stand-up-environment.mjs';
import { guardPosture } from '../src/core/skills/guard.ts';
import {assistedPosture,recoveryFoldAngles,ASSISTED_RECOVERY} from '../src/core/control/recovery-posture.ts';
import { norm } from '../src/core/math/real.ts';
import { recoveryFeedback } from '../src/core/control/recovery-feedback.ts';
import { recoveryDesign } from './stand-up-design.mjs';

/** Bounded root feedback and ordinary joint targets, used as a control for learned recovery. */
export function assistControl(e, settings = {}) {
  const built = e.stand.built, root = built.segments.get('lowerTrunk'), guard = guardPosture(built.spec), staggered = assistedPosture(built.spec);
  return recoveryFeedback({ rest: root.rest.asArray(),
    rootHeight: e.observe().segments.find(s => s.name === 'lowerTrunk').centre[1],
    weight: [...built.segments.values()].reduce((sum,s) => sum+s.rigid.mass,0)*norm(e.stand.world.physics.gravity),
    angles: settings.posture === 'staggered' ? e.channels.map(c => Math.max(c.min,Math.min(c.max,staggered[c.name]??0))) : settings.angles ?? e.channels.map(c => Math.max(c.min,Math.min(c.max,guard[c.name]??0))),
    lateAngles:e.channels.map(c=>Math.max(c.min,Math.min(c.max,assistedPosture(built.spec,true)[c.name]??0))),
    foldAngles:recoveryFoldAngles(e.channels,settings.repositionKnee??ASSISTED_RECOVERY.settings.repositionKnee),
    forceLimit: e.body.assist.most.force }, settings);
}

export async function assistedTrial(configuration) {
  const e = await recoveryEnvironment({ ...configuration, spec: recoveryDesign(configuration) });
  const control = assistControl(e, configuration), rows = [], started = performance.now();
  try {
    const pristine = e.save(), attempts = []; let chargedSteps = 0;
    await e.fall(configuration);
    chargedSteps += e.stand.world.steps;
    attempts.push({impulse:configuration.impulse??60,separation:configuration.separation??.2,fell:e.result().fell});
    for (const impulse of configuration.fallback ? [90,120] : []) if (!e.result().fell) {
      e.restore(pristine);await e.fall({...configuration,impulse,separation:.2});chargedSteps+=e.stand.world.steps;
      attempts.push({impulse,separation:.2,fell:e.result().fell});
    }
    const atTakeover = e.stand.world.steps;
    const initial = e.measure(); let disturbed=false;
    if (e.result().fell) for (let i = 0; i < (configuration.seconds ?? 16)*120; i++) {
      if (configuration.disturbance && !disturbed && e.result().elapsed >= configuration.disturbance.after) {
        e.stance.shove(configuration.disturbance.impulse,configuration.disturbance.degrees);disturbed=true;
      }
      const action = configuration.control === 'legacy' ? undefined : control(e.measure());
      const row = e.step(action, { automaticHandover: false });
      if (i % 30 === 0) rows.push({ time: row.result.elapsed, height: row.observation.height, up: row.rootUp,
        soleUp: row.soleUp, ready: row.ready, force: e.body.assist.given.force.asArray(), moment: e.body.assist.given.moment.asArray() });
      if (row.result.success || row.result.failure) break;
    }
    return { configuration, identity: e.identity, result: e.result(), rows, attempts,
      ...(configuration.inspect ? {diagnosis:{measurement:e.measure(),controller:structuredClone(control.state),has:e.body.has,
        force:e.body.assist.given.force.asArray(),moment:e.body.assist.given.moment.asArray()}} : {}),
      assistance: structuredClone(e.experiment.assistance),
      initial: { height: initial.observation.height, up: initial.rootUp },
      host: { walkFrom: e.experiment.walkFrom, centre: e.observe().centre, stance: e.stance.frame() },
      steps: chargedSteps+e.stand.world.steps-atTakeover, milliseconds: performance.now()-started };
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
