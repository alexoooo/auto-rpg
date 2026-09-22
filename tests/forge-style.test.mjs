import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import { createHeadlessArena } from './harness/golem-headless-arena.mjs';
import { Golem } from '../src/golem/golem.ts';
import { moduleFamily } from '../src/golem/family.ts';
import { defaultGolemSetup, GOLEM_EFFECTORS, golemLocomotionOptions, golemHeadOptions, golemTorsoOptions } from '../src/golem/build.ts';
import { stepProofGolem } from '../src/art-proof/motion.ts';
import { blankIntent } from '../src/policies.ts';
import { prepareTemplate } from '../src/art-proof/assets.ts';
import { forgeAppearance } from '../src/forge-models.ts';
import { installGolemAppearance } from '../src/golem/appearance.ts';
const manifest = JSON.parse(await readFile(new URL('../public/assets/art-proof/manifest.json', import.meta.url), 'utf8'));
const glb = await readFile(new URL('../public/assets/art-proof/golem.glb', import.meta.url));

test('forge art preserves every offered stone module, live wear, physical samples, and rebuild ownership', async () => {
  const setups = [defaultGolemSetup()];
  for (const [slot, options] of [['locomotion', golemLocomotionOptions("golem")], ['head', golemHeadOptions("golem")], ['torso', golemTorsoOptions("golem")]])
    for (const option of options) setups.push({ ...defaultGolemSetup(), [slot]: option.id });
  for (const option of GOLEM_EFFECTORS.filter(o => moduleFamily(o.chain) === "golem")) {
    const hand = { chain: option.chain, terminal: option.terminal ?? "none" };
    setups.push({ ...defaultGolemSetup(), primary: hand, secondary: option.sockets === 2 ? hand : defaultGolemSetup().secondary });
  }
  const runs = [];
  for (const styled of [false, true]) {
    const arena = await createHeadlessArena();
    try {
      const container = await LoadAssetContainerAsync(new Uint8Array(glb), arena.scene, { pluginExtension: '.glb' });
      container.addAllToScene();
      const templates = new Map();
      for (const mesh of container.meshes) if (mesh instanceof Mesh && mesh.getTotalVertices()) {
        prepareTemplate(mesh); templates.set(mesh.name, mesh);
      }
      if (styled) installGolemAppearance(arena.scene, forgeAppearance(templates, manifest, () => {}));
      const beforeMeshes = arena.scene.meshes.length;
      const beforeBodies = arena.scene.getPhysicsEngine().getPhysicsPlugin().numBodies;
      const samples = [];
      for (const [index, setup] of setups.entries()) {
        const golem = new Golem(arena.scene, { side: index % 2 ? 'right' : 'left', origin: Vector3.Zero(), facing: .3,
          setup, mind: { name: 'test', decide: blankIntent }, controlPolicies: [] });
        if (styled) {
          const modeled = golem.costume.filter(mesh => mesh.metadata?.forgeOriginal);
          assert.ok(modeled.length > 0, `build ${index} receives modeled art`);
          assert.ok(modeled.every(mesh => !mesh.physicsBody && mesh.isPickable && !mesh.hasVertexAlpha));
          assert.ok(modeled.every(mesh => mesh.metadata.golemSurfaceBinding), 'wear follows the visible replacement');
          const limb = golem.limbs.find(limb => modeled.some(mesh => mesh.parent === limb.part.mesh));
          limb.health *= .25;
          stepProofGolem(golem, 1 / 240, 0);
          assert.ok(modeled.filter(mesh => mesh.parent === limb.part.mesh).every(mesh =>
            Math.abs(mesh.metadata.golemSurfaceBinding.healthRatio - .25) < 1e-6), 'damage reaches visible stone');
          limb.health = limb.maxHealth;
        } else stepProofGolem(golem, 1 / 240, 0);
        for (let frame = 0; frame < 30; frame++) {
          stepProofGolem(golem, 1 / 60, frame / 60);
          arena.scene._renderId++;
          arena.scene._advancePhysicsEngineStep(1000 / 60);
        }
        samples.push(golem.limbs.map(limb => ({ id: limb.key, p: limb.part.mesh.position.asArray(),
          q: limb.part.mesh.rotationQuaternion.asArray(), mass: limb.part.body.getMassProperties().mass })));
        const detached = golem.limbs.find(limb => limb.key.includes('primary'));
        if (detached) golem.sever(detached, new Vector3(1, 0, 0));
        golem.dispose();
        assert.equal(arena.scene.meshes.length, beforeMeshes, `build ${index} leaves no cosmetic meshes`);
        assert.equal(arena.scene.getPhysicsEngine().getPhysicsPlugin().numBodies, beforeBodies);
      }
      runs.push(samples);
    } finally { arena.dispose(); }
  }
  assert.deepEqual(runs[1], runs[0], 'art cannot move a body or change its mass');
});
