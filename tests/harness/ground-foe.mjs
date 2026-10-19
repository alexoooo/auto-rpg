/**
 * **A Warrior on its back near a foe**: the Node stand's body lying in its guard, with a ground
 * sub-mind and standing recovery, beside a fixed dummy that `moveFoe` puts elsewhere.
 */
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { coreStand } from './core-stand.mjs';
import { modelSpec } from '../../src/core/models.ts';
import { uprightness } from '../../src/core/control/ground.ts';
import { GUARD } from '../../src/core/skills/guard.ts';
import { createBody } from '../../src/core/body.ts';
import { subMindsOf } from '../../src/core/mind/sub-minds.ts';
import { createSenses } from '../../src/core/mind/senses.ts';
import { buildBody } from '../../src/core/build/build-body.ts';
import { dummySpec } from '../../src/lab/targets.ts';

export async function groundFoe(config, at = [.12, .35, -.25]) {
  const spec = modelSpec('workshop-fighter'), rotation = Quaternion.RotationAxis(Vector3.Right(), -Math.PI / 2).asArray();
  const initial = await coreStand(spec, { posture: GUARD, rotation });
  const height = .02 - uprightness(initial.built).lowest(); initial.dispose();
  const stand = await coreStand(spec, { posture: GUARD, rotation, position: [0, height, 0] });
  const hub = createSenses(stand.world), senses = hub.add({ id: 'own', side: 'a', built: stand.built, out: () => false });
  let target;
  const moveFoe = position => {
    if (target) { hub.remove('foe'); target.dispose(); }
    target = buildBody(dummySpec(spec), stand.world, { position });
    for (const part of target.segments.values()) part.body.setFixed(true);
    hub.add({ id: 'foe', side: 'b', built: target, out: () => false });
  };
  moveFoe(at);
  const body = createBody(stand.built, stand.world, { feedback: true, senses,
    subs: subMindsOf([config, { kind: 'stand-up', techniques: ['roll', 'roll-back', 'plant-up', 'sit-up', 'post-up'] }]),
    contactIdentity: other => [...target.segments.values()].some(part => part.body === other)
      ? { kind: 'body', body: 'foe', segment: 'head', guard: false } : null });
  return { ...stand, body, hub, moveFoe, states: { body: body.state, senses: hub.state },
    dispose() { body.dispose(); hub.dispose(); target.dispose(); stand.dispose(); } };
}
