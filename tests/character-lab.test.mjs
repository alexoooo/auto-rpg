import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import { visiblePart, clipFor, CHARACTERS } from '../src/character-lab/catalog.ts';

for (const id of ['fighter', 'rogue']) test(`character lab: ${id} exported kit and actual pose bindings`, async () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const bytes = await readFile(new URL(`../public/assets/character-lab/${id}.glb`, import.meta.url));
    const asset = await LoadAssetContainerAsync(bytes, scene, { pluginExtension: '.glb' });
    asset.addAllToScene();
    const meshes = asset.meshes.filter(m => m.getTotalVertices() > 0);
    const groups = new Set(meshes.map(m => m.name.split('__')[0]));
    assert.deepEqual(groups, new Set(['base', 'bare', 'boots', 'armour', 'sword', 'shield', 'bow']));
    for (const mesh of meshes) assert.ok(mesh.skeleton, `${mesh.name} has skin bindings`);
    for (const boots of [false, true]) for (const armour of [false, true]) for (const weapon of ['empty', 'sword', 'shield', 'sword-shield', 'bow']) {
      const kit = { boots, armour, weapon };
      const actual = new Set(meshes.filter(m => visiblePart(m.name, kit)).map(m => m.name.split('__')[0]));
      const expected = new Set(['base', boots ? 'boots' : 'bare']);
      if (armour) expected.add('armour');
      if (weapon === 'sword-shield') { expected.add('sword'); expected.add('shield'); }
      else if (weapon !== 'empty') expected.add(weapon);
      assert.deepEqual(actual, expected, JSON.stringify(kit));
      for (const pose of ['inspection', 'ready', 'raised', 'crouched']) {
        assert.ok(asset.animationGroups.some(a => a.name === clipFor(pose, kit)), `${pose}/${weapon} exported`);
      }
    }
    function sample(pose) {
      for (const a of asset.animationGroups) a.stop();
      const clip = asset.animationGroups.find(a => a.name === pose); clip.start(false); clip.goToFrame(clip.from); clip.pause();
      const result = {};
      for (const name of ['pelvis', 'hand.L', 'hand.R', 'foot.L', 'foot.R']) {
        const node = asset.transformNodes.find(n => n.name === name); assert.ok(node, name);
        node.computeWorldMatrix(true); result[name] = node.getAbsolutePosition().clone();
      }
      return result;
    }
    const rest = sample('inspection'); const crouch = sample('crouched');
    assert.ok(Math.abs(rest.pelvis.y - crouch.pelvis.y - .17) < .001, 'crouch actually lowers pelvis');
    for (const foot of ['foot.L', 'foot.R']) assert.ok(rest[foot].subtract(crouch[foot]).length() < .001, `${foot} remains planted`);
    const raised = sample('raised');
    for (const hand of ['hand.L', 'hand.R']) assert.ok(raised[hand].y - rest[hand].y > .6, `${hand} really rises`);
    const bow = sample('ready-bow');
    assert.ok(bow['hand.L'].subtract(bow['hand.R']).length() < .09, 'bow hands converge on grip and adjacent string');
    assert.equal(CHARACTERS[id].asset, `${id}.glb`);
  } finally { scene.dispose(); engine.dispose(); }
});
