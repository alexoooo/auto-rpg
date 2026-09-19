// Run with Node >=22.13 before build-assets.py. Geometry comes from the real default body.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHeadlessArena } from '../../tests/harness/golem-headless-arena.mjs';
import { Golem } from '../../src/golem/golem.ts';
import { defaultGolemSetup } from '../../src/golem/build.ts';
import { blankIntent } from '../../src/policies.ts';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
const arena = await createHeadlessArena();
const golem = new Golem(arena.scene, { side: 'left', origin: Vector3.Zero(), facing: 0,
  setup: defaultGolemSetup(), mind: { name: 'asset-source', decide: blankIntent }, controlPolicies: [] });
const parts = [];
for (const binding of golem.visualParts()) {
  const meshes = [...new Set([binding.host, ...binding.shells])].filter(m => m.isVisible);
  for (const [index, mesh] of meshes.entries()) {
    const positions = [...mesh.getVerticesData('position')];
    const extents = [0, 1, 2].map(axis => {
      const points = positions.filter((_, i) => i % 3 === axis);
      return Math.max(...points) - Math.min(...points);
    });
    let family = mesh.material?.metadata?.golemSurfaceFamily ?? 'carvedStone';
    if (family === 'functionalMetal' && Math.max(...extents) / Math.min(...extents) > 20) family = 'steel';
    parts.push({ key: `${binding.slot}:${binding.moduleId}:${binding.id.replace('left.', '')}:${index}`,
      asset: `part_${parts.length}`, family, positions, indices: [...mesh.getIndices()], extents });
  }
}
await mkdir('assets/art-proof', { recursive: true });
await writeFile('assets/art-proof/source.json', JSON.stringify({ version: 1, setup: defaultGolemSetup(), parts }, null, 2));
console.log(`Exported ${parts.length} visible meshes from ${golem.visualParts().length} physical parts`);
golem.dispose(); arena.dispose();
