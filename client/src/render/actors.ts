import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { RendererDebugRegistry } from "./debug.js";
import type { PresentationSnapshot, PresentationUnit } from "./presentation.js";
import { decideUnitPresence, type PresenceDecision } from "./visibility.js";

export type ActorRegistryCounts = Readonly<{
  meshes: number; shadows: number; labels: number; effects: number;
  audio: number; picking: number; debug: number;
}>;

type ActorNode = {
  readonly key: string;
  readonly mesh: InstancedMesh;
  shadow: boolean;
};

const sourceKey = (unit: PresentationUnit): string => `${unit.faction}:${unit.kind}`;

export class ActorPresentation {
  readonly #scene: Scene;
  readonly #debug: RendererDebugRegistry;
  readonly #shadows: ShadowGenerator | null;
  readonly #sources = new Map<string, Mesh>();
  readonly #nodes = new Map<string, ActorNode>();
  readonly #labels = new Set<string>();
  readonly #effects = new Set<string>();
  readonly #audio = new Set<string>();
  readonly #picking = new Set<string>();
  readonly #debugRecords = new Set<string>();

  constructor(scene: Scene, debug: RendererDebugRegistry, shadows: ShadowGenerator | null = null) {
    this.#scene = scene;
    this.#debug = debug;
    this.#shadows = shadows;
  }

  acceptSnapshot(snapshot: PresentationSnapshot): void {
    const present = new Map<string, Readonly<{ unit: PresentationUnit; decision: PresenceDecision }>>();
    for (const unit of snapshot.units) {
      const decision = decideUnitPresence(snapshot, unit);
      if (decision.render) present.set(unit.key, Object.freeze({ unit, decision }));
    }

    for (const [key, node] of this.#nodes) {
      if (!present.has(key)) this.#retire(node);
    }
    for (const { unit, decision } of present.values()) {
      const existing = this.#nodes.get(unit.key);
      const node = existing ?? this.#create(unit);
      this.#pose(node, unit);
      this.#applyPresence(node, decision);
    }
    this.#publishCounts();
  }

  counts(): ActorRegistryCounts {
    return Object.freeze({
      meshes: this.#nodes.size, shadows: [...this.#nodes.values()].filter((node) => node.shadow).length,
      labels: this.#labels.size, effects: this.#effects.size, audio: this.#audio.size,
      picking: this.#picking.size, debug: this.#debugRecords.size,
    });
  }

  keys(): readonly string[] {
    return Object.freeze([...this.#nodes.keys()]);
  }

  reset(): void {
    for (const node of [...this.#nodes.values()]) this.#retire(node);
    this.#labels.clear();
    this.#effects.clear();
    this.#audio.clear();
    this.#picking.clear();
    this.#debugRecords.clear();
    this.#publishCounts();
  }

  dispose(): void {
    this.reset();
    for (const source of this.#sources.values()) {
      source.material?.dispose();
      source.dispose();
    }
    this.#sources.clear();
    this.#debug.removeOwner("actors");
  }

  #source(unit: PresentationUnit): Mesh {
    const key = sourceKey(unit);
    const old = this.#sources.get(key);
    if (old !== undefined) return old;
    const source = MeshBuilder.CreateCylinder(`actor-source:${key}`, {
      height: 1, diameter: 1, tessellation: unit.kind === 2 ? 8 : 12,
    }, this.#scene);
    const material = new StandardMaterial(`actor-material:${key}`, this.#scene);
    material.diffuseColor = unit.faction === 0 ? new Color3(0.2, 0.55, 0.95) : new Color3(0.75, 0.25, 0.18);
    material.specularColor = Color3.Black();
    source.material = material;
    source.isVisible = false;
    source.isPickable = false;
    this.#sources.set(key, source);
    return source;
  }

  #create(unit: PresentationUnit): ActorNode {
    const mesh = this.#source(unit).createInstance(`actor:${unit.key}`);
    mesh.metadata = Object.freeze({ presentationKind: "unit", entityKey: unit.key });
    const node = { key: unit.key, mesh, shadow: false };
    this.#nodes.set(unit.key, node);
    return node;
  }

  #pose(node: ActorNode, unit: PresentationUnit): void {
    const diameter = Math.max(0.01, unit.radius * 2);
    node.mesh.position.set(unit.x, unit.radius, unit.y);
    node.mesh.scaling.set(diameter, diameter, diameter);
    node.mesh.rotation.set(0, -unit.facing, 0);
  }

  #applyPresence(node: ActorNode, decision: PresenceDecision): void {
    node.mesh.setEnabled(decision.render);
    node.mesh.isPickable = decision.pick;
    this.#toggle(this.#labels, node.key, decision.label);
    this.#toggle(this.#effects, node.key, decision.effect);
    this.#toggle(this.#audio, node.key, decision.audio);
    this.#toggle(this.#picking, node.key, decision.pick);
    this.#toggle(this.#debugRecords, node.key, decision.debug);
    const shadow = decision.shadow && this.#shadows !== null;
    if (shadow !== node.shadow) {
      if (shadow) this.#shadows?.addShadowCaster(node.mesh);
      else this.#shadows?.removeShadowCaster(node.mesh);
      node.shadow = shadow;
    }
  }

  #retire(node: ActorNode): void {
    if (node.shadow) this.#shadows?.removeShadowCaster(node.mesh);
    node.mesh.dispose();
    this.#nodes.delete(node.key);
    this.#labels.delete(node.key);
    this.#effects.delete(node.key);
    this.#audio.delete(node.key);
    this.#picking.delete(node.key);
    this.#debugRecords.delete(node.key);
  }

  #toggle(registry: Set<string>, key: string, enabled: boolean): void {
    if (enabled) registry.add(key);
    else registry.delete(key);
  }

  #publishCounts(): void {
    const counts = this.counts();
    this.#debug.replaceOwnerCounts("actors", {
      scene: { meshes: this.#sources.size, instances: counts.meshes, shadowCasters: counts.shadows },
      visibility: {
        units: counts.meshes, effects: counts.effects, audio: counts.audio,
        picking: counts.picking, debug: counts.debug,
      },
    });
  }
}
