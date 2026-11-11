/** Physical neutral-footing placement from a wide stance on each rated humanoid; a development screen. */
import '../../../tests/harness/preload-data.mjs';
import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { coreStand } from '../../../tests/harness/core-stand.mjs';
import { stockBody } from '../../../src/app/stock-body.ts';
import { modelSpec } from '../../../src/core/bodies/models.ts';
import { standingFooting } from '../../../src/control/support.ts';
import { uprightness } from '../../../src/control/ground.ts';
import { locomotion } from '../../../src/skills/locomotion/locomotion.ts';
import { stanceFeetOf, stanceSegmentsOf } from '../../../src/skills/locomotion/stance-feet.ts';
import { guardPosture } from '../../../src/skills/guard/guard.ts';
import { balanceCeiling, balancePercent, rulebook } from '../../../src/combat/rulebook.ts';
import { DEFAULT_ENGINE } from '../../../src/core/physics/engines.ts';
import { massCentreToRef, massOf } from '../../../src/core/bodies/read-motion.ts';
import { Vector3 } from '../../../src/core/math/vector.ts';

const { values: o } = parseArgs({ options: { out: { type: 'string' } } });
if (!o.out) throw Error('--out names the retained neutral-placement screen');
const rows = [];
for (const model of ['workshop-fighter', 'workshop-rogue', 'crypt-skeleton']) {
  const spec = modelSpec(model), guard = guardPosture(spec);
  const stand = await coreStand(spec, { ground: true, posture: { ...guard, 'hip.left abduction': .35, 'hip.right abduction': .35 }, engine: DEFAULT_ENGINE });
  const host = stockBody(stand.built, stand.world, { servoSeconds: .1, measuring: true,
    assist: balanceCeiling(0, balancePercent(rulebook('arena'))) });
  try {
    const body = host.commanded, parts = [...stand.built.segments.values()], mass = massOf(parts), physical = uprightness(stand.built);
    const legs = locomotion(stanceFeetOf(spec), null, { segments: stanceSegmentsOf(spec), idleFooting: standingFooting(stand.built) });
    const centre = new Vector3(), velocity = new Vector3(), work = new Vector3(), samples = [];
    let requested = false, fellAt = null;
    body.drive((view, dt) => {
      const drive = legs.goal(view, { walk: null, face: 0 }, dt);
      requested ||= drive.goal?.swing !== undefined && drive.goal.swing !== null;
      return { posture: guard, pushes: [], stance: drive.goal };
    });
    for (let i = 0; i < 12 * stand.world.hz; i++) {
      stand.step(1); massCentreToRef(parts, mass, centre, work, velocity);
      if (physical.fallen()) { fellAt = (i + 1) / stand.world.hz; break; }
      samples.push({ time: (i + 1) / stand.world.hz, speed: Math.hypot(velocity.x, velocity.z), phase: body.view.stance.phase,
        placing: legs.state.idle.target !== null, placed: legs.placed });
    }
    const row = { model, fixtureReached: requested, fellAt, peakShift: Math.max(0, ...samples.filter(s => s.placing && s.phase === 'shift').map(s => s.speed)),
      placed: legs.placed, samples };
    rows.push(row); console.log(JSON.stringify({ ...row, samples: undefined }));
  } finally { host.dispose(); stand.dispose(); }
}
writeFileSync(o.out, JSON.stringify({ harness: { name: 'Node core stand', engine: DEFAULT_ENGINE, hz: 120, balance: 0, loadout: 'empty', hipAbduction: .35 }, rows }) + '\n');
