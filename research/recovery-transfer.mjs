import { pathToFileURL } from 'node:url';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { toppled, riserOf } from './core-rise-trials.mjs';
import { riseLimbs } from '../src/core/mind/rise/limbs.ts';
import { stagedRise } from '../src/core/mind/rise/staged.ts';
import { RISE } from '../src/core/mind/rise/stages.ts';
import { uprightness } from '../src/core/control/ground.ts';
import { centreOfToRef, withinSupport } from '../src/core/control/support.ts';
import { patchCorners } from '../src/core/control/contact-wrench.ts';

/** A real hand release after acquiring four supports; no pose or velocity edits. */
export async function transferTrial({ hand = 'left' } = {}) {
  const at = RISE.rise.findIndex(s => s.name === 'fours'), fours = RISE.rise[at];
  const stage = { ...fours, name: 'transfer', pitch: .9,
    on: [{ limb: 'shin.left', share: .4 }, { limb: 'shin.right', share: .4 },
      { limb: `hand.${hand === 'left' ? 'right' : 'left'}`, share: .2 }], leave: [`hand.${hand}`], limit: 3 };
  const recipe = { ...RISE, rise: [...RISE.rise.slice(0, at + 1), stage] };
  const { world, built, body, dispose } = await toppled({ model: 'workshop-fighter', held: 'empty', degrees: 0 },
    [(own, view) => stagedRise(own, view, recipe)]);
  const made = riseLimbs({ spec: built.spec, built, muscles: body.muscles, assist: body.assist }, recipe);
  const upright = uprightness(built), riser = riserOf(body), c = new Vector3(), p = new Vector3(), v = new Vector3();
  const segments = [...built.segments.values()], mass = segments.reduce((s, part) => s + part.rigid.mass, 0);
  let projection = null, released = null, gapBefore = null, peak = 0, clearance = null;
  try {
    for (let i = 0; i < 16 * world.hz; i++) {
      if (riser.phase === 'rise' && riser.stage === at + 1) {
        made.read(upright.lowest(), false); c.setAll(0);
        for (const segment of segments) c.addInPlace(centreOfToRef(segment, p).scaleInPlace(segment.rigid.mass / mass));
        const supports = made.limbs.filter((_, k) => stage.on.some(on => on.limb === recipe.limbs[k].name))
          .map(limb => ({ corners: patchCorners(limb.work.patch) }));
        const [x, z] = withinSupport(supports, c.x, c.z);
        projection = Math.hypot(x - c.x, z - c.z);
        gapBefore ??= projection;
      }
      const was = riser.lifted;
      world.step();
      if (riser.phase === 'rise' && riser.stage === at + 1) {
        peak = Math.max(peak, ...segments.map(s => s.body.linearVelocityToRef(v).length()));
        if (!was && riser.lifted) released = { seconds: riser.time, projection,
          bearing: riser.bear.tasks.map(t => t.on && t.bearing) };
        if (released) {
          made.read(upright.lowest(), false);
          clearance = made.limbs[recipe.limbs.findIndex(l => l.name === `hand.${hand}`)].work.at.y - upright.lowest();
        }
      }
      if (riser.furthest === at + 1 && riser.phase !== 'rise') break;
    }
    return { harness: { kind: 'Node toppled Warrior', engine: world.physics.engine, revision: world.physics.revision,
      hz: world.hz, actuation: world.actuation, balance: 0, held: 'empty' }, hand, gapBefore, released, clearance, peak,
      phase: riser.phase, assist: { force: body.assist.meter.force, moment: body.assist.meter.moment } };
  } finally { dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  for (const hand of ['left', 'right']) console.log(JSON.stringify(await transferTrial({ hand })));
