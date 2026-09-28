import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { humanSetup } from '../src/golem/humanoid/presets.ts';
import { fixedAttributes } from '../src/golem/family.ts';
import { golemSetupRefusal, golemEffectorPlan } from '../src/golem/build.ts';
import { golemMatchup, withGolemAttribute, withGolemBuild, matchupQuery, matchupFromQuery } from '../src/bout.ts';
import { workshopArm, workshopGrips, WORKSHOP_SOURCE } from '../src/golem/humanoid/workshop-profile.ts';
import { armForward, solveArm, ARM_REST } from '../src/golem/humanoid/kinematics.ts';
import { solveTaskEndpoint } from '../src/golem/humanoid/task-kinematics.ts';
import { createHeadlessArena } from './harness/golem-headless-arena.mjs';
import { buildGolemStand, golemLayers } from '../src/golem/stand.ts';
import { neutralIntent } from '../src/dungeon/commands.ts';

const setup = (size = 1, primary = 'blade', secondary = 'plate') => ({ ...humanSetup(primary, secondary),
  human: { model: 'workshop-fighter', boots: true, armour: true }, attributes: { size } });
const sizes = Array.from({ length: 7 }, (_, i) => Number((.8 + .05 * i).toFixed(2)));

test('Size belongs to the workshop model and survives edits and URLs', () => {
  assert.ok(!('size' in fixedAttributes(setup())));
  for (const size of sizes) {
    const build = setup(size);
    assert.equal(golemSetupRefusal(build), null);
    const changed = withGolemAttribute(golemMatchup(setup()), 'left', 'size', size);
    assert.equal(changed.left.golem.attributes?.size ?? 1, size);
    assert.deepEqual(matchupFromQuery(matchupQuery(changed)).left.golem, changed.left.golem);
    const kit = withGolemBuild(changed, 'left', { ...setup(), attributes: undefined, human: { ...build.human, boots: false } }, 7);
    assert.equal(kit.left.golem.attributes?.size ?? 1, size);
  }
  for (const size of [.79, 1.11, NaN]) assert.ok(golemSetupRefusal(setup(size)));
});

test('scaled workshop IK and endpoint fallback use both actual arms and fixed weapon offsets', () => {
  const angles = [.3, -.8, .2, -1.2, .3, .1, .1];
  for (const size of sizes) for (const side of [-1, 1]) {
    const geometry = workshopArm(side, size), desired = armForward(angles, geometry);
    const reference = armForward(angles, workshopArm(side));
    assert.ok(Vector3.Distance(desired.point, reference.point.scale(size)) < 1e-12);
    const solved = armForward(solveArm(desired.point, desired.rotation, ARM_REST, 180, 0, false, geometry), geometry);
    assert.ok(Vector3.Distance(desired.point, solved.point) < .002);
    const offset = new Vector3(0, 0, .6), endpoint = p => p.point.add(offset.rotateByQuaternionToRef(p.rotation, new Vector3()));
    const target = endpoint(desired), seed = angles.map((v, i) => v + (i === 1 ? .12 : 0));
    const before = Vector3.Distance(endpoint(armForward(seed, geometry)), target);
    const q = solveTaskEndpoint(target, offset, seed, () => true, 100, geometry);
    const after = Vector3.Distance(endpoint(armForward(q, geometry)), target);
    assert.ok(after < .002 && after < before / 10, `size ${size}, side ${side}: ${before} -> ${after}`);
  }
});

test('size grip interpolation preserves x1 and changes only the occupied hand', () => {
  assert.deepEqual(workshopGrips('sword-shield', 1), WORKSHOP_SOURCE.grips['sword-shield']);
  for (let i = 0; i <= 24; i++) {
    const size = .8 + i * .0125;
    for (const kit of ['empty', 'sword', 'shield', 'sword-shield']) {
      const grips = workshopGrips(kit, size);
      for (const [name, q] of Object.entries(grips)) {
        assert.ok(q.every(Number.isFinite));
        assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-5);
        const occupied = name.endsWith('_r') ? kit.includes('sword') : kit.includes('shield');
        if (!occupied) assert.deepEqual(q, WORKSHOP_SOURCE.grips[kit][name]);
      }
    }
  }
  assert.notDeepEqual(workshopGrips('sword', .8), workshopGrips('sword', 1));
});

test('awake workshop arms scale physically and hold fixed-size equipment through a sweep', async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const { scene } = arena;
  try {
    for (const size of sizes) {
      const stand = buildGolemStand(scene, { side: 'left' });
      const build = setup(size), plan = golemEffectorPlan(build);
      const modules = ['primary', 'secondary'].map(slot => plan[slot].definition.build({ scene, side: 'left',
        name: `sized.${slot}`, socket: stand.socket(slot), layers: golemLayers('left'), materials: stand.materials,
        human: build.human, attributes: { size, weight: 1, armSpeed: 1 } }));
      const intent = neutralIntent(); let time = 0;
      const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
      for (const module of modules) for (const p of module.parts) plugin.setActivationControl(p.part.body, 1);
      const observer = scene.onBeforePhysicsObservable.add(() => {
        time += 1 / 120;
        const sweep = Math.max(0, Math.min(1, (time - 1) / .3));
        intent.primary.pointerX = .3 * sweep; intent.secondary.pointerX = -.3 * sweep;
        intent.primary.pointerY = intent.secondary.pointerY = .6 * sweep;
        modules.forEach((module, i) => { module.command(intent[i === 0 ? 'primary' : 'secondary']); module.step(1 / 120); });
      });
      try {
        for (const module of modules) {
          const upper = module.parts.find(p => p.id.endsWith('.upper')).part;
          assert.ok(Math.abs(upper.body.getMassProperties().mass - 2.8 * size ** 3) < 1e-6);
          assert.ok(Math.abs(module.envelope().reachable.reachMax - .65 * size) < 1e-6);
        }
        for (let frame = 0; frame < 360; frame++) { scene._renderId++; scene._advancePhysicsEngineStep(1000 / 60); }
        for (const module of modules) {
          const view = module.view();
          assert.ok(view.anchorStray < .03 * size, `size ${size}: hand stray ${view.anchorStray}`);
          assert.ok(view.axes.every(axis => Number.isFinite(axis.achieved)));
        }
        const plate = modules[1].parts.find(p => p.id.endsWith('.plate')).part;
        assert.ok(Math.abs(plate.body.getMassProperties().mass - 3.5) < 1e-6);
      } finally { scene.onBeforePhysicsObservable.remove(observer); modules.forEach(m => m.dispose()); stand.dispose(); }
    }
  } finally { arena.dispose(); }
});
