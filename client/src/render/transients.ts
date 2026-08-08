import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { RendererDebugRegistry } from "./debug.js";
import type { PresentationEvent, PresentationShot, PresentationSnapshot } from "./presentation.js";
import { decidePointPresence, type PresenceDecision } from "./visibility.js";

export type TransientRegistryCounts = Readonly<{
  shots: number; events: number; shadows: number; labels: number;
  effects: number; audio: number; picking: number; debug: number;
}>;

type TransientNode = Readonly<{
  key: string;
  kind: "shot" | "event";
  mesh: InstancedMesh;
  shadow: boolean;
}>;

export class TransientPresentation {
  readonly #scene: Scene;
  readonly #debug: RendererDebugRegistry;
  readonly #shadows: ShadowGenerator | null;
  readonly #nodes: TransientNode[] = [];
  readonly #sources = new Map<"shot" | "event", Mesh>();
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
    this.reset();
    for (const shot of snapshot.shots) {
      const decision = decidePointPresence(snapshot, "shot", shot.x, shot.y);
      if (decision.render) this.#createShot(shot, decision);
    }
    for (const event of snapshot.events) {
      const decision = decidePointPresence(snapshot, "event", event.x, event.y);
      if (decision.render) this.#createEvent(event, decision);
    }
    this.#publishCounts();
  }

  counts(): TransientRegistryCounts {
    const shots = this.#nodes.filter((node) => node.kind === "shot").length;
    const events = this.#nodes.length - shots;
    return Object.freeze({
      shots, events, shadows: this.#nodes.filter((node) => node.shadow).length,
      labels: this.#labels.size, effects: this.#effects.size, audio: this.#audio.size,
      picking: this.#picking.size, debug: this.#debugRecords.size,
    });
  }

  keys(): readonly string[] {
    return Object.freeze(this.#nodes.map((node) => node.key));
  }

  reset(): void {
    for (const node of this.#nodes) {
      if (node.shadow) this.#shadows?.removeShadowCaster(node.mesh);
      node.mesh.dispose();
    }
    this.#nodes.length = 0;
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
    this.#debug.removeOwner("transients");
  }

  #source(kind: "shot" | "event"): Mesh {
    const old = this.#sources.get(kind);
    if (old !== undefined) return old;
    const source = kind === "shot"
      ? MeshBuilder.CreateCylinder("transient-source:shot", { height: 0.65, diameter: 0.08, tessellation: 6 }, this.#scene)
      : MeshBuilder.CreateSphere("transient-source:event", { diameter: 0.3, segments: 6 }, this.#scene);
    const material = new StandardMaterial(`transient-material:${kind}`, this.#scene);
    material.diffuseColor = kind === "shot" ? new Color3(0.95, 0.8, 0.2) : new Color3(1, 0.2, 0.08);
    material.emissiveColor = kind === "event" ? new Color3(0.35, 0.04, 0.01) : Color3.Black();
    material.specularColor = Color3.Black();
    source.material = material;
    source.isVisible = false;
    source.isPickable = false;
    this.#sources.set(kind, source);
    return source;
  }

  #createShot(shot: PresentationShot, decision: PresenceDecision): void {
    const mesh = this.#source("shot").createInstance(`shot:${shot.key}`);
    mesh.position.set(shot.x, 0.35, shot.y);
    mesh.rotation.set(Math.PI / 2, -shot.heading, 0);
    mesh.metadata = Object.freeze({ presentationKind: "shot", snapshotKey: shot.key });
    this.#register(Object.freeze({ key: shot.key, kind: "shot", mesh, shadow: decision.shadow }), decision);
  }

  #createEvent(event: PresentationEvent, decision: PresenceDecision): void {
    const mesh = this.#source("event").createInstance(`event:${event.key}`);
    const scale = Math.max(0.35, Math.min(2, Math.abs(event.amount)));
    mesh.position.set(event.x, 0.2, event.y);
    mesh.scaling.setAll(scale);
    mesh.metadata = Object.freeze({ presentationKind: "event", snapshotKey: event.key, eventKind: event.kind });
    this.#register(Object.freeze({ key: event.key, kind: "event", mesh, shadow: decision.shadow }), decision);
  }

  #register(node: TransientNode, decision: PresenceDecision): void {
    node.mesh.setEnabled(decision.render);
    node.mesh.isPickable = decision.pick;
    const shadow = decision.shadow && this.#shadows !== null;
    const registered = shadow === node.shadow ? node : Object.freeze({ ...node, shadow });
    this.#nodes.push(registered);
    if (shadow) this.#shadows?.addShadowCaster(node.mesh);
    this.#toggle(this.#labels, node.key, decision.label);
    this.#toggle(this.#effects, node.key, decision.effect);
    this.#toggle(this.#audio, node.key, decision.audio);
    this.#toggle(this.#picking, node.key, decision.pick);
    this.#toggle(this.#debugRecords, node.key, decision.debug);
  }

  #publishCounts(): void {
    const counts = this.counts();
    this.#debug.replaceOwnerCounts("transients", {
      scene: { meshes: this.#sources.size, instances: counts.shots + counts.events, shadowCasters: counts.shadows },
      visibility: {
        shots: counts.shots, events: counts.events, effects: counts.effects,
        audio: counts.audio, picking: counts.picking, debug: counts.debug,
      },
    });
  }

  #toggle(registry: Set<string>, key: string, enabled: boolean): void {
    if (enabled) registry.add(key);
    else registry.delete(key);
  }
}
