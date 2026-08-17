import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import {
  DUNGEON_OBJECT_BARREL, DUNGEON_OBJECT_DOOR, DUNGEON_OBJECT_POTTERY,
  DUNGEON_OBJECT_TORCH, DUNGEON_OBJECT_WATER, DUNGEON_OBJECT_WEB, MAP_OPEN, RAW_ANGLE_TURN,
} from "../protocol/abi.generated.js";
import type { PresentationDungeonObject, PresentationSnapshot } from "./presentation.js";
import type { PresentationMode } from "./presentation-mode.js";

const TAU = Math.PI * 2;
export const DOOR_OPEN_MILLISECONDS = 450;
export const DOOR_OPEN_ANGLE = Math.PI / 2;
const BROKEN = 1;

type DoorMotion = {
  readonly hinge: TransformNode;
  angle: number;
  from: number;
  target: number;
  startedAt: number;
};

type ObjectNode = {
  readonly key: string;
  readonly kind: number;
  readonly identity: number;
  readonly root: TransformNode;
  readonly meshes: AbstractMesh[];
  readonly casters: Set<AbstractMesh>;
  readonly lights: PointLight[];
  door: DoorMotion | null;
  intact: boolean;
  stateFlags: number;
};

export type RoomObjectCounts = Readonly<{
  objects: number; meshes: number; triangles: number; lights: number; picks: number; shadows: number;
}>;

function visible(snapshot: PresentationSnapshot, object: PresentationDungeonObject): boolean {
  const tx = Math.floor(object.x / snapshot.tileSize);
  const ty = Math.floor(object.y / snapshot.tileSize);
  return tx >= 0 && ty >= 0 && tx < snapshot.mapCols && ty < snapshot.mapRows &&
    snapshot.vis[ty * snapshot.mapCols + tx] === 2;
}

function yaw(raw: number): number {
  return -(raw & 0xffff) / RAW_ANGLE_TURN * TAU;
}

const supported = (kind: number): boolean => kind === DUNGEON_OBJECT_DOOR ||
  kind === DUNGEON_OBJECT_TORCH || kind === DUNGEON_OBJECT_BARREL ||
  kind === DUNGEON_OBJECT_POTTERY || kind === DUNGEON_OBJECT_WEB || kind === DUNGEON_OBJECT_WATER;

function createTaperedFlamePlane(name: string, scene: Scene): Mesh {
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = [-0.13, 0, 0, 0.13, 0, 0, 0.075, 0.30, 0, 0, 0.58, 0, -0.075, 0.30, 0];
  data.normals = [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
  data.uvs = [0, 0, 1, 0, 0.78, 0.52, 0.5, 1, 0.22, 0.52];
  data.indices = [0, 1, 2, 0, 2, 4, 4, 2, 3];
  data.applyToMesh(mesh, true);
  return mesh;
}

export class RoomObjectPresentation {
  readonly #scene: Scene;
  readonly #shadows: ShadowGenerator;
  readonly #nodes = new Map<string, ObjectNode>();
  readonly #dressing = new Map<string, AbstractMesh>();
  readonly #wood: StandardMaterial;
  readonly #iron: StandardMaterial;
  readonly #clay: StandardMaterial;
  readonly #web: StandardMaterial;
  readonly #water: StandardMaterial;
  readonly #flame: StandardMaterial;
  readonly #ember: StandardMaterial;
  readonly #blood: StandardMaterial;
  readonly #vine: StandardMaterial;
  readonly #stone: StandardMaterial;
  #mode: PresentationMode = "world";
  #disposed = false;

  constructor(scene: Scene, shadows: ShadowGenerator) {
    this.#scene = scene;
    this.#shadows = shadows;
    this.#wood = this.#material("wood", new Color3(0.25, 0.105, 0.038));
    this.#iron = this.#material("iron", new Color3(0.09, 0.105, 0.12));
    this.#iron.specularColor = new Color3(0.28, 0.30, 0.32);
    this.#clay = this.#material("clay", new Color3(0.34, 0.13, 0.065));
    this.#web = this.#material("web", new Color3(0.42, 0.46, 0.47));
    this.#web.emissiveColor = new Color3(0.035, 0.04, 0.045);
    this.#web.alpha = 0.52;
    this.#web.backFaceCulling = false;
    this.#water = this.#material("water", new Color3(0.035, 0.12, 0.15));
    this.#water.emissiveColor = new Color3(0.01, 0.035, 0.045);
    this.#water.alpha = 0.64;
    this.#water.backFaceCulling = false;
    this.#flame = this.#material("flame", new Color3(1, 0.18, 0.018));
    this.#flame.emissiveColor = new Color3(1, 0.105, 0.006);
    this.#flame.alpha = 0.78;
    this.#flame.disableLighting = true;
    this.#flame.backFaceCulling = false;
    this.#ember = this.#material("ember", new Color3(1, 0.58, 0.08));
    this.#ember.emissiveColor = new Color3(1, 0.34, 0.035);
    this.#ember.disableLighting = true;
    this.#blood = this.#material("blood", new Color3(0.16, 0.012, 0.008));
    this.#blood.specularColor = new Color3(0.12, 0.025, 0.018);
    this.#vine = this.#material("vine", new Color3(0.055, 0.095, 0.025));
    this.#stone = this.#material("loose-stone", new Color3(0.18, 0.15, 0.125));
  }

  acceptSnapshot(snapshot: PresentationSnapshot, nowMs = performance.now()): void {
    this.#assertLive();
    const wanted = new Map(snapshot.dungeonObjects.filter((object) => supported(object.kind) && visible(snapshot, object))
      .map((object) => [object.key, object]));
    for (const [key, node] of this.#nodes) if (!wanted.has(key)) this.#retire(node);
    for (const object of wanted.values()) {
      let node = this.#nodes.get(object.key);
      if (node !== undefined && node.kind !== object.kind) {
        this.#retire(node);
        node = undefined;
      }
      if (node === undefined) {
        node = this.#create(object, nowMs);
        this.#nodes.set(object.key, node);
      }
      this.#update(node, object, nowMs);
    }
    this.#reconcileDressing(snapshot);
    this.advanceMotion(nowMs);
    this.#applyMode();
  }

  advanceMotion(nowMs = performance.now()): void {
    this.#assertLive();
    for (const node of this.#nodes.values()) {
      if (node.door !== null) {
        const motion = node.door;
        const alpha = Math.min(1, Math.max(0, (nowMs - motion.startedAt) / DOOR_OPEN_MILLISECONDS));
        const eased = alpha * alpha * (3 - 2 * alpha);
        motion.angle = motion.from + (motion.target - motion.from) * eased;
        motion.hinge.rotation.y = motion.angle;
      }
      for (const light of node.lights) {
        light.intensity = 2.8 + 0.34 * Math.sin(nowMs * 0.011 + node.identity * 1.618);
      }
      const flameMeshes = node.meshes.filter((mesh) => mesh.name.includes(":torch:flame"));
      for (const [index, flame] of flameMeshes.entries()) {
        flame.scaling.y = 0.94 + 0.08 * Math.sin(nowMs * 0.017 + node.identity + index);
      }
    }
  }

  setPresentationMode(mode: PresentationMode): void {
    this.#assertLive();
    this.#mode = mode;
    this.#applyMode();
  }

  keys(): readonly string[] { return Object.freeze([...this.#nodes.keys()]); }

  counts(): RoomObjectCounts {
    let meshes = 0, triangles = 0, lights = 0, picks = 0, shadows = 0;
    for (const node of this.#nodes.values()) {
      const visibleMeshes = node.meshes.filter((mesh) => mesh.isEnabled());
      meshes += visibleMeshes.length;
      triangles += visibleMeshes.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0);
      lights += node.lights.filter((light) => light.isEnabled()).length;
      picks += node.meshes.filter((mesh) => mesh.isEnabled() && mesh.isPickable).length;
      shadows += node.casters.size;
    }
    const dressing = [...this.#dressing.values()].filter((mesh) => mesh.isEnabled());
    meshes += dressing.length;
    triangles += dressing.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0);
    return Object.freeze({ objects: this.#nodes.size, meshes, triangles, lights, picks, shadows });
  }

  reset(): void {
    this.#assertLive();
    for (const node of [...this.#nodes.values()]) this.#retire(node);
    for (const mesh of this.#dressing.values()) mesh.dispose();
    this.#dressing.clear();
  }

  dispose(): void {
    if (this.#disposed) return;
    for (const node of [...this.#nodes.values()]) this.#retire(node);
    for (const material of [this.#wood, this.#iron, this.#clay, this.#web,
      this.#water, this.#flame, this.#ember, this.#blood, this.#vine, this.#stone]) material.dispose();
    this.#disposed = true;
  }

  #create(object: PresentationDungeonObject, nowMs: number): ObjectNode {
    const root = new TransformNode(`room-object:${object.key}:root`, this.#scene);
    root.position.set(object.x, 0, object.y);
    root.rotation.y = yaw(object.yawRaw);
    const node: ObjectNode = {
      key: object.key, kind: object.kind, identity: object.identity,
      root, meshes: [], casters: new Set(), lights: [], door: null,
      intact: (object.stateFlags & BROKEN) === 0, stateFlags: object.stateFlags,
    };
    if (object.kind === DUNGEON_OBJECT_DOOR) this.#buildDoor(node, object, nowMs);
    else if (object.kind === DUNGEON_OBJECT_TORCH) this.#buildTorch(node);
    else if (object.kind === DUNGEON_OBJECT_BARREL) this.#buildBarrel(node, object);
    else if (object.kind === DUNGEON_OBJECT_POTTERY) this.#buildPottery(node, object);
    else if (object.kind === DUNGEON_OBJECT_WEB) this.#buildWeb(node, object);
    else if (object.kind === DUNGEON_OBJECT_WATER) this.#buildWater(node, object);
    return node;
  }

  #buildDoor(node: ObjectNode, object: PresentationDungeonObject, nowMs: number): void {
    const halfWidth = Math.max(0.22, object.halfX);
    const depth = Math.max(0.10, object.halfY * 2);
    const height = 1.55;
    const hinge = new TransformNode(`room-object:${node.key}:door:hinge`, this.#scene);
    hinge.parent = node.root;
    hinge.position.x = -halfWidth;
    const leaf = this.#box(node, "door:leaf", halfWidth * 2, height, depth, this.#wood, true);
    leaf.parent = hinge;
    leaf.position.set(halfWidth, height / 2, 0);
    for (const bandY of [0.32, 1.18]) {
      const band = this.#box(node, `door:iron:${bandY}`, halfWidth * 1.75, 0.055, depth + 0.025,
        this.#iron, false);
      band.parent = leaf;
      band.position.set(0, bandY - height / 2, 0);
    }
    const jambWidth = 0.13;
    for (const side of [-1, 1]) {
      const jamb = this.#box(node, `door:jamb:${side}`, jambWidth, height + 0.2, depth * 1.8,
        this.#iron, false);
      jamb.position.set(side * (halfWidth + jambWidth / 2), (height + 0.2) / 2, 0);
    }
    const lintel = this.#box(node, "door:lintel", halfWidth * 2 + jambWidth * 2,
      0.16, depth * 1.8, this.#iron, false);
    lintel.position.y = height + 0.12;
    const initial = (object.stateFlags & BROKEN) !== 0 ? DOOR_OPEN_ANGLE : object.progress * 0.14;
    const angle = (object.stateFlags & BROKEN) !== 0 ? DOOR_OPEN_ANGLE : initial;
    hinge.rotation.y = angle;
    node.door = { hinge, angle, from: angle, target: angle, startedAt: nowMs };
  }

  #buildTorch(node: ObjectNode): void {
    const backplate = this.#box(node, "torch:backplate", 0.28, 0.42, 0.07, this.#iron, true);
    backplate.position.set(0, 0.78, 0);
    const haft = MeshBuilder.CreateCylinder(`room-object:${node.key}:torch:haft`, {
      height: 0.46, diameterTop: 0.075, diameterBottom: 0.105, tessellation: 10,
    }, this.#scene);
    haft.parent = node.root;
    haft.material = this.#wood;
    haft.rotation.x = Math.PI / 2;
    haft.position.set(0, 0.78, 0.25);
    this.#publishMesh(node, haft, true, false);
    const bowl = MeshBuilder.CreateCylinder(`room-object:${node.key}:torch:bowl`, {
      height: 0.12, diameterTop: 0.28, diameterBottom: 0.16, tessellation: 12,
    }, this.#scene);
    bowl.parent = node.root;
    bowl.material = this.#iron;
    bowl.position.set(0, 0.93, 0.48);
    this.#publishMesh(node, bowl, true, false);
    for (const turn of [0, 1]) {
      const flame = createTaperedFlamePlane(
        `room-object:${node.key}:torch:flame:${turn}`, this.#scene);
      flame.parent = node.root;
      flame.material = this.#flame;
      flame.position.set(0, 1.00, 0.48);
      flame.rotation.y = turn * Math.PI / 2;
      this.#publishMesh(node, flame, false, false);
    }
    const core = MeshBuilder.CreateCylinder(`room-object:${node.key}:torch:flame:core`, {
      diameterTop: 0.01, diameterBottom: 0.13, height: 0.28, tessellation: 7,
    }, this.#scene);
    core.parent = node.root;
    core.position.set(0, 1.13, 0.48);
    core.material = this.#ember;
    this.#publishMesh(node, core, false, false);
    const light = new PointLight(`room-object:${node.key}:torch:light`, new Vector3(0, 1.18, 0.62), this.#scene);
    light.parent = node.root;
    light.diffuse = new Color3(1, 0.23, 0.035);
    light.specular = new Color3(0.42, 0.16, 0.04);
    light.range = 9;
    node.lights.push(light);
  }

  #buildBarrel(node: ObjectNode, object: PresentationDungeonObject): void {
    const radius = Math.max(0.22, Math.min(object.halfX, object.halfY));
    const body = MeshBuilder.CreateCylinder(`room-object:${node.key}:barrel:body`, {
      height: 0.78, diameterTop: radius * 1.8, diameterBottom: radius * 1.85, tessellation: 14,
    }, this.#scene);
    body.parent = node.root; body.position.y = 0.39; body.material = this.#wood;
    this.#publishMesh(node, body, true, true);
    for (const y of [0.13, 0.39, 0.65]) {
      const band = MeshBuilder.CreateTorus(`room-object:${node.key}:barrel:band:${y}`, {
        diameter: radius * 1.88, thickness: 0.035, tessellation: 14,
      }, this.#scene);
      band.parent = node.root; band.position.y = y; band.material = this.#iron;
      this.#publishMesh(node, band, true, false);
    }
  }

  #buildPottery(node: ObjectNode, object: PresentationDungeonObject): void {
    const radius = Math.max(0.16, Math.min(object.halfX, object.halfY));
    const body = MeshBuilder.CreateSphere(`room-object:${node.key}:pottery:body`, {
      diameter: radius * 2, segments: 12,
    }, this.#scene);
    body.parent = node.root; body.position.y = radius * 0.9; body.scaling.y = 1.25;
    body.material = this.#clay;
    this.#publishMesh(node, body, true, true);
    const neck = MeshBuilder.CreateCylinder(`room-object:${node.key}:pottery:neck`, {
      height: radius * 0.8, diameterTop: radius * 0.65, diameterBottom: radius * 0.9, tessellation: 12,
    }, this.#scene);
    neck.parent = node.root; neck.position.y = radius * 1.8; neck.material = this.#clay;
    this.#publishMesh(node, neck, true, false);
  }

  #buildWeb(node: ObjectNode, object: PresentationDungeonObject): void {
    const sheet = MeshBuilder.CreatePlane(`room-object:${node.key}:web:sheet`, {
      width: Math.max(0.4, object.halfX * 2), height: Math.max(0.35, object.halfY * 2),
    }, this.#scene);
    sheet.parent = node.root; sheet.position.y = Math.max(0.15, object.halfY);
    sheet.rotation.x = Math.PI / 2; sheet.material = this.#web;
    this.#publishMesh(node, sheet, false, true);
  }

  #buildWater(node: ObjectNode, object: PresentationDungeonObject): void {
    const surface = MeshBuilder.CreateGround(`room-object:${node.key}:water:surface`, {
      width: Math.max(0.3, object.halfX * 2), height: Math.max(0.3, object.halfY * 2), subdivisions: 2,
    }, this.#scene);
    surface.parent = node.root; surface.position.y = 0.055; surface.material = this.#water;
    this.#publishMesh(node, surface, false, true);
  }

  #update(node: ObjectNode, object: PresentationDungeonObject, nowMs: number): void {
    node.root.position.set(object.x, 0, object.y);
    node.root.rotation.y = yaw(object.yawRaw);
    const broken = (object.stateFlags & BROKEN) !== 0;
    if (node.door !== null) {
      const target = broken ? DOOR_OPEN_ANGLE : Math.min(1, Math.max(0, object.progress)) * 0.14;
      if (target !== node.door.target) {
        node.door.from = node.door.angle;
        node.door.target = target;
        node.door.startedAt = nowMs;
      }
    } else if (broken && node.intact && (node.kind === DUNGEON_OBJECT_BARREL ||
        node.kind === DUNGEON_OBJECT_POTTERY || node.kind === DUNGEON_OBJECT_WEB)) {
      node.intact = false;
      for (const mesh of node.meshes.splice(0)) this.#disposeMesh(node, mesh);
      this.#buildDebris(node);
    }
    node.stateFlags = object.stateFlags;
    for (const mesh of node.meshes) mesh.metadata = Object.freeze({
      presentationKind: "dungeon-object", objectKey: node.key, objectKind: node.kind,
      stateFlags: object.stateFlags, materialCode: object.materialCode,
    });
  }

  #buildDebris(node: ObjectNode): void {
    for (let index = 0; index < 5; index++) {
      const chip = this.#box(node, `debris:${index}`, 0.10 + index * 0.018, 0.045,
        0.16 - index * 0.012, node.kind === DUNGEON_OBJECT_POTTERY ? this.#clay : this.#wood,
        false);
      const angle = (node.identity * 1.7 + index * 2.399) % TAU;
      chip.position.set(Math.cos(angle) * (0.16 + index * 0.035), 0.04,
        Math.sin(angle) * (0.16 + index * 0.035));
      chip.rotation.y = angle;
    }
  }

  #reconcileDressing(snapshot: PresentationSnapshot): void {
    const wanted = new Map<string, Readonly<{ kind: number; tx: number; ty: number; score: number }>>();
    if (snapshot.dungeonObjects.length > 0) {
      const candidates: Array<Readonly<{ kind: number; tx: number; ty: number; score: number }>> = [];
      for (let ty = 0; ty < snapshot.mapRows; ty++) for (let tx = 0; tx < snapshot.mapCols; tx++) {
        const at = ty * snapshot.mapCols + tx;
        if (snapshot.vis[at] !== 2 || snapshot.map[at] !== MAP_OPEN) continue;
        let score = Math.imul(tx + 17, 0x9e3779b1) ^ Math.imul(ty + 29, 0x85ebca6b);
        score = Math.imul(score ^ (score >>> 16), 0x27d4eb2d) >>> 0;
        if (score % 19 !== 0) continue;
        candidates.push(Object.freeze({ kind: (score >>> 8) & 3, tx, ty, score }));
      }
      candidates.sort((a, b) => a.score - b.score || a.ty - b.ty || a.tx - b.tx);
      for (const item of candidates.slice(0, 24)) wanted.set(`${item.kind}:${item.tx}:${item.ty}`, item);
    }
    for (const [key, mesh] of this.#dressing) if (!wanted.has(key)) {
      mesh.dispose();
      this.#dressing.delete(key);
    }
    for (const [key, item] of wanted) {
      if (this.#dressing.has(key)) continue;
      let mesh: AbstractMesh;
      if (item.kind === 0) {
        mesh = MeshBuilder.CreateDisc(`room-dressing:blood:${item.tx}:${item.ty}`, {
          radius: 0.22 + (item.score & 7) * 0.012, tessellation: 18,
        }, this.#scene);
        mesh.rotation.x = Math.PI / 2;
        mesh.material = this.#blood;
      } else if (item.kind === 1) {
        const path = [0, 1, 2, 3].map((step) => new Vector3(
          -0.32 + step * 0.21, 0.035, Math.sin(item.score + step * 1.7) * 0.12));
        mesh = MeshBuilder.CreateTube(`room-dressing:vine:${item.tx}:${item.ty}`, {
          path, radius: 0.018, tessellation: 6,
        }, this.#scene);
        mesh.material = this.#vine;
      } else if (item.kind === 2) {
        mesh = MeshBuilder.CreateBox(`room-dressing:loose-brick:${item.tx}:${item.ty}`, {
          width: 0.30, height: 0.075, depth: 0.16,
        }, this.#scene);
        mesh.material = this.#stone;
      } else {
        mesh = MeshBuilder.CreateDisc(`room-dressing:spiderweb:${item.tx}:${item.ty}`, {
          radius: 0.26, tessellation: 12,
        }, this.#scene);
        mesh.rotation.x = Math.PI / 2;
        mesh.material = this.#web;
      }
      mesh.position.x += (item.tx + 0.5) * snapshot.tileSize;
      mesh.position.y += 0.065;
      mesh.position.z += (item.ty + 0.5) * snapshot.tileSize;
      mesh.rotation.y = (item.score & 3) * Math.PI / 2;
      mesh.isPickable = false;
      mesh.receiveShadows = false;
      mesh.metadata = Object.freeze({ presentationKind: "room-dressing", semanticKey: key });
      this.#dressing.set(key, mesh);
    }
  }

  #box(node: ObjectNode, suffix: string, width: number, height: number, depth: number,
    material: StandardMaterial, pickable: boolean): AbstractMesh {
    const mesh = MeshBuilder.CreateBox(`room-object:${node.key}:${suffix}`, { width, height, depth }, this.#scene);
    mesh.parent = node.root; mesh.material = material;
    this.#publishMesh(node, mesh, true, pickable);
    return mesh;
  }

  #publishMesh(node: ObjectNode, mesh: AbstractMesh, casts: boolean, pickable: boolean): void {
    mesh.isPickable = pickable;
    mesh.receiveShadows = true;
    mesh.metadata = Object.freeze({ presentationKind: "dungeon-object", objectKey: node.key,
      objectKind: node.kind, stateFlags: node.stateFlags });
    node.meshes.push(mesh);
    if (casts) {
      node.casters.add(mesh);
      this.#shadows.addShadowCaster(mesh, false);
    }
  }

  #disposeMesh(node: ObjectNode, mesh: AbstractMesh): void {
    if (node.casters.delete(mesh)) this.#shadows.removeShadowCaster(mesh, false);
    mesh.dispose();
  }

  #retire(node: ObjectNode): void {
    for (const light of node.lights.splice(0)) light.dispose();
    for (const mesh of node.meshes.splice(0)) this.#disposeMesh(node, mesh);
    node.door?.hinge.dispose();
    node.root.dispose();
    this.#nodes.delete(node.key);
  }

  #applyMode(): void {
    const fullArt = this.#mode !== "geometry" && this.#mode !== "dev";
    for (const node of this.#nodes.values()) {
      for (const mesh of node.meshes) {
        const effect = mesh.name.includes(":torch:flame") || mesh.name.includes(":web:") ||
          mesh.name.includes(":water:");
        mesh.setEnabled(fullArt || !effect);
      }
      for (const light of node.lights) light.setEnabled(fullArt);
    }
    for (const mesh of this.#dressing.values()) mesh.setEnabled(fullArt);
  }

  #material(name: string, colour: Color3): StandardMaterial {
    const material = new StandardMaterial(`room-object-material:${name}`, this.#scene);
    material.diffuseColor = colour;
    material.specularColor = Color3.Black();
    return material;
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error("room object presentation is disposed");
  }
}
