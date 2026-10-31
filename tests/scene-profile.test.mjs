import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { sceneProfile, visualGroup, isTactical } from "../src/render/scene-profile.ts";
import { solidGeometry } from "../src/render/solid-geometry.ts";

test("scene profiles restore presentation, apply late registrations and leave transform authority alone", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const light = new HemisphericLight("world", new Vector3(0,1,0), scene);
  const mesh = MeshBuilder.CreateBox("art", {}, scene), source = MeshBuilder.CreateBox("source", {}, scene);
  source.setEnabled(false);
  const geometry = solidGeometry(scene, [{ name: "floor", kind: "box", centre: [0,-.5,0], size: [10,1,10] }]);
  const profile = sceneProfile(scene);
  profile.register("world", visualGroup([mesh, source])); profile.register("tactical", geometry);
  const position = mesh.position.asArray();
  try {
    assert.equal(geometry.mesh.isEnabled(), false);
    for (let i = 0; i < 2; i++) {
      profile.setView("tactical");
      // Babylon can deliver a light's creation notification after the profile switches.
      for (const lamp of scene.lights) scene.onNewLightAddedObservable.notifyObservers(lamp);
      assert.deepEqual(scene.lights.filter(l => l.isEnabled()).map(l => l.name), ["tactical.fill"]);
      assert.equal(isTactical(scene), true);
      assert.equal(scene.imageProcessingConfiguration.isEnabled, false);
      assert.equal(mesh.isEnabled(), false); assert.equal(source.isEnabled(), false);
      assert.equal(geometry.mesh.isEnabled(), true);
      for (const key of ["texturesEnabled", "shadowsEnabled", "postProcessesEnabled", "renderTargetsEnabled", "particlesEnabled", "skeletonsEnabled"])
        assert.equal(scene[key], false, key);
      assert.deepEqual(mesh.position.asArray(), position);
      let enabled = true;
      const remove = profile.register("world", { setEnabled(value) { enabled = value; } });
      assert.equal(enabled, false); remove();
      profile.setView("world");
      assert.equal(light.isEnabled(), true);
      assert.equal(scene.imageProcessingConfiguration.isEnabled, true);
      assert.equal(mesh.isEnabled(), true); assert.equal(source.isEnabled(), false);
      assert.equal(geometry.mesh.isEnabled(), false); assert.equal(scene.texturesEnabled, true);
    }
    const count = geometry.mesh.getTotalIndices();
    geometry.show(() => false); assert.equal(geometry.mesh.getTotalIndices(), 0);
    geometry.show(() => true); assert.equal(geometry.mesh.getTotalIndices(), count);
  } finally { profile.dispose(); geometry.dispose(); scene.dispose(); engine.dispose(); }
});
