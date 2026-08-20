import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";

import type { V3 } from "../fight/trace.js";
import { scenePoint, type ScenePoint } from "./geometry.js";

export const HAND_GUIDE_COLOUR = Color3.FromHexString("#f0c96a");

export function handGuidePoints(bodyGround: V3, desired: V3): Readonly<{
  floor: readonly [ScenePoint, ScenePoint];
  vertical: readonly [ScenePoint, ScenePoint];
  endpoint: ScenePoint;
}> {
  const projected: V3 = [desired[0], desired[1], bodyGround[2]];
  return Object.freeze({
    floor: Object.freeze([scenePoint(bodyGround), scenePoint(projected)] as const),
    vertical: Object.freeze([scenePoint(projected), scenePoint(desired)] as const),
    endpoint: scenePoint(desired),
  });
}

/** Three presentation-only nodes owned by the arena scene. */
export class HandGuide {
  readonly floor: LinesMesh;
  readonly vertical: LinesMesh;
  readonly endpoint: Mesh;
  readonly #material: StandardMaterial;

  constructor(scene: Scene, layerMask: number) {
    const seed = [Vector3.Zero(), Vector3.Zero()];
    this.floor = MeshBuilder.CreateDashedLines("arena-hand-guide-floor", {
      points: seed, dashSize: 0.08, gapSize: 0.06, dashNb: 24, updatable: true,
    }, scene);
    this.vertical = MeshBuilder.CreateDashedLines("arena-hand-guide-vertical", {
      points: seed, dashSize: 0.08, gapSize: 0.06, dashNb: 16, updatable: true,
    }, scene);
    this.endpoint = MeshBuilder.CreateSphere("arena-hand-guide-endpoint", {
      diameter: 0.08, segments: 8,
    }, scene);
    this.#material = new StandardMaterial("arena-hand-guide-material", scene);
    this.#material.disableLighting = true;
    this.#material.emissiveColor = HAND_GUIDE_COLOUR;
    this.endpoint.material = this.#material;
    for (const mesh of [this.floor, this.vertical, this.endpoint]) {
      mesh.layerMask = layerMask;
      mesh.isPickable = false;
      mesh.setEnabled(false);
    }
    this.floor.color = HAND_GUIDE_COLOUR;
    this.vertical.color = HAND_GUIDE_COLOUR;
  }

  update(bodyGround: V3, desired: V3): void {
    if (![...bodyGround, ...desired].every(Number.isFinite)) { this.clear(); return; }
    const points = handGuidePoints(bodyGround, desired);
    MeshBuilder.CreateDashedLines("arena-hand-guide-floor", {
      points: points.floor.map((point) => new Vector3(...point)), instance: this.floor,
    });
    MeshBuilder.CreateDashedLines("arena-hand-guide-vertical", {
      points: points.vertical.map((point) => new Vector3(...point)), instance: this.vertical,
    });
    this.endpoint.position.set(...points.endpoint);
    for (const mesh of [this.floor, this.vertical, this.endpoint]) mesh.setEnabled(true);
  }

  clear(): void {
    for (const mesh of [this.floor, this.vertical, this.endpoint]) mesh.setEnabled(false);
  }

  dispose(): void {
    this.floor.dispose();
    this.vertical.dispose();
    this.endpoint.dispose();
    this.#material.dispose();
  }
}
