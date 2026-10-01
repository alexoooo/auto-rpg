/**
 * **A workshop model**: one of the character workshop's exported GLBs (`public/assets/character-lab/`) in a
 * headless scene, stood at a frame of one of its clips and read from its bones and its skin.
 *
 * Babylon reads a node's place in the world out of a world matrix it caches, so `pose` works every node's
 * matrix out again, and `point` and `rotation` work the node's out once more before they read it.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/loaders/glTF/index.js";
import { CHARACTERS } from "../../src/character-lab/catalog.ts";
import { headlessScene } from "./scene.mjs";

/** The authored loop: its length, and the rate its clips are keyed at (`scripts/character-lab/realistic/motion.py`). */
export const LOOP = Object.freeze({ seconds: 12, framesPerSecond: 60 });

export async function workshopModel(id) {
  const stage = headlessScene();
  const bytes = await readFile(new URL(`../../public/assets/character-lab/${CHARACTERS[id].asset}`, import.meta.url));
  const asset = await LoadAssetContainerAsync(bytes, stage.scene, { pluginExtension: ".glb" });
  asset.addAllToScene();
  const named = (list, name, kind) => {
    const found = list.find((candidate) => candidate.name === name);
    assert.ok(found, `${id} has a ${kind} named ${name}`);
    return found;
  };
  const node = (name) => {
    const found = named(asset.transformNodes, name, "node");
    found.computeWorldMatrix(true);
    return found;
  };
  let playing;
  return Object.freeze({
    id,
    /** Every clip's name. */
    clips: asset.animationGroups.map((group) => group.name),
    /** The meshes that are drawn: the ones with vertices. */
    meshes: asset.meshes.filter((mesh) => mesh.getTotalVertices() > 0),
    mesh: (name) => named(asset.meshes, name, "mesh"),
    /** Stands the model at `frame` of the clip named `clip`, its bones and skin with it. */
    pose(clip, frame) {
      if (playing?.name !== clip) {
        for (const group of asset.animationGroups) group.stop();
        playing = named(asset.animationGroups, clip, "clip");
        playing.start(false);
        playing.pause();
      }
      playing.goToFrame(frame);
      stage.scene.incrementRenderId();
      for (const each of asset.transformNodes) each.computeWorldMatrix(true);
      for (const skeleton of asset.skeletons) skeleton.prepare(true);
    },
    /** Where the node `name` is in the world, as a vector of the caller's own. */
    point: (name) => node(name).getAbsolutePosition().clone(),
    /** How the node `name` is turned in the world, as a quaternion of the caller's own. */
    rotation: (name) => node(name).absoluteRotationQuaternion.clone(),
    dispose: stage.dispose,
  });
}

/** One model a character for a whole test file: `model(id)` loads it when it is first asked for, and `dispose`
 * frees every one that was. */
export function workshopModels() {
  const loading = new Map();
  return Object.freeze({
    model(id) {
      if (!loading.has(id)) loading.set(id, workshopModel(id));
      return loading.get(id);
    },
    async dispose() {
      for (const pending of loading.values()) (await pending).dispose();
    },
  });
}
