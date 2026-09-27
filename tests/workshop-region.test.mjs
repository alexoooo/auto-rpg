import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import { compactWorkshopRegion } from '../src/golem/humanoid/workshop-region.ts';

test('workshop surface partitions retain every source attribute, including high-index skin weights', async () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const bytes = await readFile(new URL('../public/assets/humanoid/workshop-fighter.glb', import.meta.url));
    const asset = await LoadAssetContainerAsync(bytes, scene, { pluginExtension: '.glb' });
    let checked = 0;
    for (const source of asset.meshes.filter(mesh => mesh.skeleton && mesh.getTotalVertices())) {
      // A small patch at the end of the actual exported buffer: the old loop
      // shortened subsequent reads to the patch size, losing these vertices.
      const faces = Array.from(source.getIndices()).slice(-18);
      const vertices = [...new Set(faces)];
      const expected = source.getVerticesDataKinds().map(kind => {
        const stride = source.getVertexBuffer(kind).getSize(), data = source.getVerticesData(kind);
        return [kind, new Float32Array(vertices.flatMap(vertex => Array.from(data.slice(vertex * stride, (vertex + 1) * stride))))];
      });
      const region = source.clone(`${source.name}.test`, source.parent, true);
      region.makeGeometryUnique();
      compactWorkshopRegion(region, faces);
      assert.equal(region.getTotalVertices(), vertices.length);
      assert.deepEqual(Array.from(region.getIndices()), faces.map(vertex => vertices.indexOf(vertex)));
      for (const [kind, values] of expected) {
        const actual = region.getVerticesData(kind);
        assert.ok(actual.every(Number.isFinite), `${source.name}: ${kind} must remain finite`);
        assert.deepEqual(Array.from(actual), Array.from(values), `${source.name}: ${kind} must match the original vertices`);
      }
      region.dispose(false, false);
      checked++;
    }
    assert.ok(checked > 20, 'exercise the real skin, clothing and equipment buffers');
  } finally { scene.dispose(); engine.dispose(); }
});
