import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  FURNITURE_DOOR, FURNITURE_DOOR_OPEN, FURNITURE_DOOR_SHUT, FURNITURE_TORCH,
  MAP_OPEN, MAP_SOLID, TORCH_FACE_POS_X, TORCH_FACE_POS_Y,
} from "../protocol/abi.generated.js";
import type { RendererDebugRegistry } from "./debug.js";
import type { PresentationFurniture, PresentationSnapshot } from "./presentation.js";
import { decideFurniturePresence, decideTilePresence } from "./visibility.js";

const MAX_TORCH_LIGHTS = 8;
const FLOOR_HEIGHT = 0.04;
const WALL_HEIGHT = 0.9;

type GeometryMaterial = "current" | "remembered";
type GeometryKind = "floor" | "wall";

type FurnitureNode = {
  readonly key: string;
  readonly kind: number;
  readonly mesh: InstancedMesh;
  shadow: boolean;
};

export type EnvironmentCounts = Readonly<{
  geometry: number;
  furniture: number;
  instances: number;
  lights: number;
  shadowCasters: number;
  triangles: number;
}>;

/** Procedural room presentation. It never owns or inspects a worker lease. */
export class EnvironmentPresentation {
  readonly #scene: Scene;
  readonly #debug: RendererDebugRegistry;
  readonly #materials: readonly StandardMaterial[];
  readonly #sources = new Map<string, Mesh>();
  readonly #geometry: InstancedMesh[] = [];
  readonly #furniture = new Map<string, FurnitureNode>();
  readonly #torchLights = new Map<string, PointLight>();
  readonly #shadowCasters = new Set<AbstractMesh>();
  readonly #key: DirectionalLight;
  readonly #shadows: ShadowGenerator;
  #geometryRevision = "";
  #disposed = false;

  constructor(scene: Scene, debug: RendererDebugRegistry) {
    this.#scene = scene;
    this.#debug = debug;
    const current = this.#material("environment-current", new Color3(0.34, 0.39, 0.43));
    const remembered = this.#material("environment-remembered", new Color3(0.13, 0.15, 0.17));
    const door = this.#material("environment-door", new Color3(0.38, 0.22, 0.10));
    const torch = this.#material("environment-torch", new Color3(0.95, 0.45, 0.08));
    this.#materials = Object.freeze([current, remembered, door, torch]);

    this.#sources.set("floor:current", this.#floorSource("current", current));
    this.#sources.set("floor:remembered", this.#floorSource("remembered", remembered));
    this.#sources.set("wall:current", this.#wallSource("current", current));
    this.#sources.set("wall:remembered", this.#wallSource("remembered", remembered));
    this.#sources.set("furniture:door", this.#furnitureSource("door", door));
    this.#sources.set("furniture:torch", this.#furnitureSource("torch", torch));

    this.#key = new DirectionalLight(
      "environment:directional-key", new Vector3(-0.45, -1, -0.35), scene,
    );
    this.#key.position = new Vector3(12, 24, 16);
    this.#key.intensity = 1.15;
    this.#shadows = new ShadowGenerator(1024, this.#key);
    this.#shadows.useBlurExponentialShadowMap = true;
    this.#publishDebug();
  }

  get shadowGenerator(): ShadowGenerator {
    return this.#shadows;
  }

  acceptSnapshot(snapshot: PresentationSnapshot): void {
    this.#assertLive();
    if (!Number.isFinite(snapshot.tileSize) || snapshot.tileSize <= 0) {
      this.reset();
      throw new RangeError("environment tile size must be finite and positive");
    }
    const geometryRevision = [
      snapshot.epoch, snapshot.mapRevision, snapshot.visRevision,
      snapshot.mapCols, snapshot.mapRows, snapshot.tileSize,
    ].join(":");
    if (geometryRevision !== this.#geometryRevision) {
      this.#rebuildGeometry(snapshot);
      this.#geometryRevision = geometryRevision;
    }
    this.#reconcileFurniture(snapshot);
    this.#publishDebug();
  }

  counts(): EnvironmentCounts {
    let triangles = 0;
    for (const instance of this.#geometry) triangles += instance.getTotalIndices() / 3;
    for (const node of this.#furniture.values()) triangles += node.mesh.getTotalIndices() / 3;
    return Object.freeze({
      geometry: this.#geometry.length,
      furniture: this.#furniture.size,
      instances: this.#geometry.length + this.#furniture.size,
      lights: 1 + this.#torchLights.size,
      shadowCasters: this.#shadowCasters.size,
      triangles,
    });
  }

  furnitureKeys(): readonly string[] {
    return Object.freeze([...this.#furniture.keys()]);
  }

  reset(): void {
    if (this.#disposed) return;
    this.#clearGeometry();
    for (const node of [...this.#furniture.values()]) this.#retireFurniture(node);
    for (const light of this.#torchLights.values()) light.dispose();
    this.#torchLights.clear();
    this.#geometryRevision = "";
    this.#publishDebug();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.reset();
    this.#disposed = true;
    this.#shadows.dispose();
    this.#key.dispose();
    for (const source of this.#sources.values()) source.dispose();
    this.#sources.clear();
    for (const material of this.#materials) material.dispose();
    this.#debug.removeOwner("environment");
  }

  #rebuildGeometry(snapshot: PresentationSnapshot): void {
    this.#clearGeometry();
    for (let ty = 0; ty < snapshot.mapRows; ty++) {
      for (let tx = 0; tx < snapshot.mapCols; tx++) {
        const decision = decideTilePresence(snapshot, "geometry", tx, ty);
        if (!decision.render || (decision.material !== "current" && decision.material !== "remembered")) {
          continue;
        }
        const map = snapshot.map[ty * snapshot.mapCols + tx];
        // The published map has exactly two meanings. Future or malformed bytes fail closed.
        const kind: GeometryKind | null = map === MAP_OPEN ? "floor" : map === MAP_SOLID ? "wall" : null;
        if (kind === null) continue;
        const instance = this.#instance(kind, decision.material, tx, ty, snapshot.tileSize);
        this.#geometry.push(instance);
        if (kind === "wall" && decision.shadow) this.#addShadowCaster(instance);
      }
    }
  }

  #reconcileFurniture(snapshot: PresentationSnapshot): void {
    const present = new Map<string, PresentationFurniture>();
    for (const furniture of snapshot.furniture) {
      const decision = decideFurniturePresence(snapshot, furniture);
      if (!decision.render) continue;
      if (furniture.kind !== FURNITURE_DOOR && furniture.kind !== FURNITURE_TORCH) continue;
      if (furniture.key !== `${furniture.kind}:${furniture.tx}:${furniture.ty}`) continue;
      if (furniture.kind === FURNITURE_DOOR
          && furniture.state !== FURNITURE_DOOR_SHUT && furniture.state !== FURNITURE_DOOR_OPEN) continue;
      if (furniture.kind === FURNITURE_TORCH
          && furniture.state !== TORCH_FACE_POS_X && furniture.state !== TORCH_FACE_POS_Y) continue;
      present.set(furniture.key, furniture);
    }

    for (const node of [...this.#furniture.values()]) {
      if (!present.has(node.key)) this.#retireFurniture(node);
    }
    for (const furniture of present.values()) {
      const node = this.#furniture.get(furniture.key) ?? this.#createFurniture(furniture);
      this.#poseFurniture(node, furniture, snapshot.tileSize);
    }
    this.#reconcileTorchLights(present, snapshot.tileSize);
  }

  #createFurniture(furniture: PresentationFurniture): FurnitureNode {
    const door = furniture.kind === FURNITURE_DOOR;
    const source = this.#sources.get(door ? "furniture:door" : "furniture:torch");
    if (source === undefined) throw new Error(`missing furniture source for ${furniture.kind}`);
    const mesh = source.createInstance(`furniture:${furniture.key}`);
    mesh.metadata = Object.freeze({ presentationKind: "furniture", furnitureKey: furniture.key });
    mesh.isPickable = true;
    const node = { key: furniture.key, kind: furniture.kind, mesh, shadow: false };
    this.#furniture.set(furniture.key, node);
    if (door) {
      this.#addShadowCaster(mesh);
      node.shadow = true;
    }
    return node;
  }

  #poseFurniture(node: FurnitureNode, furniture: PresentationFurniture, tileSize: number): void {
    node.mesh.position.set(
      (furniture.tx + 0.5) * tileSize,
      node.kind === FURNITURE_DOOR ? tileSize * 0.41 : tileSize * 0.275,
      (furniture.ty + 0.5) * tileSize,
    );
    if (node.kind === FURNITURE_DOOR) {
      node.mesh.scaling.set(tileSize * 0.82, tileSize * 0.82, tileSize * 0.12);
      node.mesh.rotation.y = furniture.state === FURNITURE_DOOR_OPEN ? Math.PI / 2 : 0;
    } else {
      node.mesh.scaling.set(tileSize * 0.12, tileSize * 0.55, tileSize * 0.12);
    }
  }

  #reconcileTorchLights(present: ReadonlyMap<string, PresentationFurniture>, tileSize: number): void {
    const wanted = [...present.values()]
      .filter((item) => item.kind === FURNITURE_TORCH)
      .slice(0, MAX_TORCH_LIGHTS);
    const keys = new Set(wanted.map((item) => item.key));
    for (const [key, light] of this.#torchLights) {
      if (!keys.has(key)) {
        light.dispose();
        this.#torchLights.delete(key);
      }
    }
    for (const torch of wanted) {
      let light = this.#torchLights.get(torch.key);
      if (light === undefined) {
        light = new PointLight(`torch-light:${torch.key}`, Vector3.Zero(), this.#scene);
        light.diffuse = new Color3(1, 0.48, 0.16);
        light.intensity = 0.7;
        light.range = tileSize * 5;
        this.#torchLights.set(torch.key, light);
      }
      light.position.set((torch.tx + 0.5) * tileSize, tileSize * 0.7, (torch.ty + 0.5) * tileSize);
    }
  }

  #instance(
    kind: GeometryKind, material: GeometryMaterial, tx: number, ty: number, tileSize: number,
  ): InstancedMesh {
    const source = this.#sources.get(`${kind}:${material}`);
    if (source === undefined) throw new Error(`missing ${kind}:${material} source`);
    const instance = source.createInstance(`${kind}:${material}:${tx}:${ty}`);
    instance.position.set(
      (tx + 0.5) * tileSize,
      kind === "floor" ? 0 : tileSize * WALL_HEIGHT / 2,
      (ty + 0.5) * tileSize,
    );
    instance.scaling.set(
      tileSize * (kind === "floor" ? 0.97 : 0.94),
      kind === "floor" ? 1 : tileSize * WALL_HEIGHT,
      tileSize * (kind === "floor" ? 0.97 : 0.94),
    );
    instance.isPickable = false;
    instance.metadata = Object.freeze({ presentationKind: "geometry", visibility: material, tx, ty });
    return instance;
  }

  #floorSource(material: GeometryMaterial, paint: StandardMaterial): Mesh {
    const source = MeshBuilder.CreateGround(`floor-source:${material}`, { width: 1, height: 1 }, this.#scene);
    source.position.y = -FLOOR_HEIGHT;
    source.material = paint;
    source.isVisible = false;
    source.isPickable = false;
    return source;
  }

  #wallSource(material: GeometryMaterial, paint: StandardMaterial): Mesh {
    const source = MeshBuilder.CreateBox(`wall-source:${material}`, { size: 1 }, this.#scene);
    source.material = paint;
    source.isVisible = false;
    source.isPickable = false;
    return source;
  }

  #furnitureSource(kind: "door" | "torch", paint: StandardMaterial): Mesh {
    const source = kind === "door"
      ? MeshBuilder.CreateBox("furniture-source:door", { size: 1 }, this.#scene)
      : MeshBuilder.CreateCylinder("furniture-source:torch", { height: 1, diameter: 1, tessellation: 8 }, this.#scene);
    source.material = paint;
    source.isVisible = false;
    source.isPickable = false;
    return source;
  }

  #material(name: string, color: Color3): StandardMaterial {
    const material = new StandardMaterial(name, this.#scene);
    material.diffuseColor = color;
    material.specularColor = Color3.Black();
    return material;
  }

  #clearGeometry(): void {
    for (const instance of this.#geometry) {
      this.#removeShadowCaster(instance);
      instance.dispose();
    }
    this.#geometry.length = 0;
  }

  #retireFurniture(node: FurnitureNode): void {
    if (node.shadow) this.#removeShadowCaster(node.mesh);
    node.mesh.dispose();
    this.#furniture.delete(node.key);
  }

  #addShadowCaster(mesh: AbstractMesh): void {
    if (this.#shadowCasters.has(mesh)) return;
    this.#shadows.addShadowCaster(mesh);
    this.#shadowCasters.add(mesh);
  }

  #removeShadowCaster(mesh: AbstractMesh): void {
    if (!this.#shadowCasters.delete(mesh)) return;
    this.#shadows.removeShadowCaster(mesh);
  }

  #publishDebug(): void {
    const counts = this.counts();
    this.#debug.replaceOwnerCounts("environment", {
      scene: {
      meshes: this.#sources.size,
      instances: counts.instances,
      draws: this.#activeDraws(),
      triangles: counts.triangles,
      lights: counts.lights,
      shadowCasters: counts.shadowCasters,
      },
      visibility: {
        geometry: counts.geometry, furniture: counts.furniture,
        picking: counts.furniture, debug: counts.geometry + counts.furniture,
      },
    });
  }

  #activeDraws(): number {
    const materialKeys = new Set<string>();
    for (const instance of this.#geometry) materialKeys.add(instance.sourceMesh.name);
    for (const node of this.#furniture.values()) materialKeys.add(`furniture:${node.kind}`);
    return materialKeys.size;
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error("environment presentation is disposed");
  }
}

export function createEnvironmentPresentation(
  scene: Scene, debug: RendererDebugRegistry,
): EnvironmentPresentation {
  return new EnvironmentPresentation(scene, debug);
}
