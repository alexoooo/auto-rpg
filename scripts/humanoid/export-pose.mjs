import { readFile, writeFile } from 'node:fs/promises';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { createHeadlessArena } from '../../tests/harness/golem-headless-arena.mjs';
import { DungeonRun } from '../../src/dungeon/run.ts';
import { loadHumanAssets } from '../../src/golem/humanoid/appearance.ts';
import { neutralIntent } from '../../src/dungeon/commands.ts';
import { humanSetup } from '../../src/golem/humanoid/presets.ts';
// Export achieved, CPU-skinned geometry for repeatable close-up inspection in Blender.
const [output, terminal = 'blade', pose = 'guard'] = process.argv.slice(2);
const original = globalThis.fetch;
globalThis.fetch = async () => new Response(await readFile(new URL('../../public/assets/humanoid/warrior.glb', import.meta.url)));
try { await loadHumanAssets(); } finally { globalThis.fetch = original; }
const arena = await createHeadlessArena({ populateDefaultGeometry: false });
const run = new DungeonRun(arena.scene, 42, 'human-warrior', false, undefined, humanSetup(terminal, terminal === 'maul' ? 'maul' : 'plate'));
try {
  const command = neutralIntent();
  command.primary.pointerY = pose === 'raised' ? .8 : .25;
  command.primary.pointerX = pose === 'cross' ? -.45 : -.05;
  command.primary.reach = pose === 'thrust' ? .8 : -.4;
  command.primary.roll = pose === 'roll' ? 1 : 0;
  command.secondary.pointerY = .1; command.secondary.reach = -.65;
  const observer = arena.scene.onBeforePhysicsObservable.add(() => {
    run.step(1 / 240);
    for (const slot of ['primary', 'secondary']) {
      if (slot === 'secondary' && terminal === 'maul') continue;
      run.hero.body.effectors[slot]?.module.command(command[slot]);
    }
  });
  for (let i=0;i<300;i++) { arena.scene._renderId++; arena.scene._advancePhysicsEngineStep(1000/60); }
  arena.scene._frameId++; arena.scene._renderId++; arena.scene.onBeforeRenderObservable.notifyObservers(arena.scene);
  const parts = run.hero.body.visualParts();
  const owned = new Set(parts.flatMap(p => [p.host,...p.shells,...p.host.getChildMeshes()]));
  const origin = run.hero.body.feetPosition(); const meshes=[];
  for (const m of arena.scene.meshes) {
    if (!m.isVisible || !m.isEnabled() || (!m.metadata?.humanSlot && !owned.has(m))) continue;
    const positions=m.getVerticesData('position'), indices=m.getIndices(); if (!positions || !indices) continue;
    const matrix=m.computeWorldMatrix(true), vertices=[];
    for (let i=0;i<positions.length;i+=3) {
      const p=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),matrix).subtract(origin);
      vertices.push([p.x,p.z,p.y]);
    }
    const colour=m.material?.albedoColor ?? m.material?.diffuseColor;
    meshes.push({name:m.name,layer:m.metadata?.humanLayer ?? 'equipment',vertices,indices:Array.from(indices),colour:colour?.asArray() ?? [.3,.3,.3],metallic:m.material?.metallic ?? .4});
  }
  await writeFile(output,JSON.stringify(meshes));
  arena.scene.onBeforePhysicsObservable.remove(observer);
} finally {run.dispose();arena.dispose();}
