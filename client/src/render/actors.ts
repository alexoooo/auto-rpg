import "@babylonjs/core/Meshes/instancedMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { EVENT_DAMAGE, EVENT_DEATH, EVENT_SHOVE } from "../protocol/abi.generated.js";
import type { RendererDebugRegistry } from "./debug.js";
import {
  combatantMeshRole, copyCombatantRigPose, instantiateCombatantDress, type CombatantDress,
} from "./combatant-dress.js";
import type { CombatantAsset } from "./combatant-assets.js";
import {
  buildFigure, buildFigureSources, poseFigure, type Figure, type FigureSources,
} from "./figure.js";
import type { PresentationSnapshot, PresentationUnit } from "./presentation.js";
import { decideUnitPresence, type PresenceDecision } from "./visibility.js";

export type ActorRegistryCounts = Readonly<{
  meshes: number; shadows: number; labels: number; effects: number;
  audio: number; picking: number; debug: number;
}>;

type ActorNode = {
  readonly key: string;
  readonly figure: Figure;
  readonly dress: CombatantDress | null;
  shadow: boolean;
};

const sourceKey = (unit: PresentationUnit): string => `${unit.faction}:${unit.kind}`;

export class ActorPresentation {
  readonly #scene: Scene;
  readonly #debug: RendererDebugRegistry;
  readonly #shadows: ShadowGenerator | null;
  readonly #combatants: CombatantAsset | null;
  readonly #sources = new Map<string, FigureSources>();
  readonly #nodes = new Map<string, ActorNode>();
  readonly #labels = new Set<string>();
  readonly #effects = new Set<string>();
  readonly #audio = new Set<string>();
  readonly #picking = new Set<string>();
  readonly #debugRecords = new Set<string>();

  constructor(
    scene: Scene, debug: RendererDebugRegistry, shadows: ShadowGenerator | null = null,
    combatants: CombatantAsset | null = null,
  ) {
    this.#scene = scene;
    this.#debug = debug;
    this.#shadows = shadows;
    this.#combatants = combatants;
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
      this.#pose(node, unit, snapshot);
      this.#applyPresence(node, decision);
    }
    this.#publishCounts();
  }

  counts(): ActorRegistryCounts {
    let meshes = 0;
    let shadows = 0;
    for (const node of this.#nodes.values()) {
      meshes += this.#parts(node).length;
      if (node.shadow) shadows += this.#parts(node).length;
    }
    return Object.freeze({
      meshes, shadows,
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
    for (const source of this.#sources.values()) source.dispose();
    this.#sources.clear();
    this.#debug.removeOwner("actors");
  }

  #sourcesFor(unit: PresentationUnit): FigureSources {
    const key = sourceKey(unit);
    const old = this.#sources.get(key);
    if (old !== undefined) return old;
    const sources = buildFigureSources(this.#scene, key, unit.faction);
    this.#sources.set(key, sources);
    return sources;
  }

  #create(unit: PresentationUnit): ActorNode {
    const figure = buildFigure(this.#scene, this.#sourcesFor(unit), `actor:${unit.key}`, unit.kind);
    for (const part of figure.parts) {
      part.metadata = Object.freeze({ presentationKind: "unit", entityKey: unit.key });
    }
    let dress: CombatantDress | null = null;
    const kind = unit.kind === 0 ? "fighter" : unit.kind === 2 ? "brute" : null;
    if (kind !== null && this.#combatants !== null) {
      try {
        dress = instantiateCombatantDress(this.#combatants, kind, `actor:${unit.key}:authored`);
        for (const part of figure.parts) part.setEnabled(false);
        for (const part of dress.meshes.values()) {
          part.metadata = Object.freeze({ presentationKind: "unit", entityKey: unit.key });
        }
      } catch {
        dress = null;
      }
    }
    const node = { key: unit.key, figure, dress, shadow: false };
    this.#nodes.set(unit.key, node);
    return node;
  }

  /**
   * World `(x, y)` to Babylon `(x, z)`, height to `y`, yaw negated.
   *
   * **This is not the only world-to-scene mapping in the client, and the other
   * one is its mirror.** `client/src/arena/geometry.ts`'s `scenePoint` maps world
   * `(x, y, height)` to `(x, height, -y)` and does *not* negate yaw, because its
   * 2D authority `fight/view.ts` draws `+y` up the screen while this page's,
   * `web/main.js`, draws `+y` down; the two conventions differ by a reflection,
   * so the two renderers must too. Neither is wrong and neither may be copied
   * into the other's page. The old cylinder had no chirality, so nothing here
   * ever exposed the difference; the figure does -- its main arm is a named
   * hand -- and `figure.ts` states which local axis is the anatomical left and
   * why. The domains and the argument are recorded in
   * `docs/architecture/browser-runtime.md`.
   */
  #pose(node: ActorNode, unit: PresentationUnit, snapshot: PresentationSnapshot): void {
    poseFigure(node.figure, unit);
    if (node.dress === null) return;
    const heightInRadii = unit.kind === 2 ? 2.7 : 3.0;
    copyCombatantRigPose(node.dress, node.figure.nodes, unit.radius * heightInRadii);
    node.dress.setEnabled(true);
    const armed = unit.actionRole !== 2 && unit.limbReach > 0.05;
    const shielded = unit.actionRole === 1;
    for (const [semantic, mesh] of node.dress.meshes) {
      const role = combatantMeshRole(semantic);
      mesh.setEnabled(role === "weapon" ? armed : role === "shield" ? shielded : true);
    }
    const reaction = snapshot.events.some((event) => event.actorIndex === unit.index && event.kind === EVENT_DEATH)
      ? "fall"
      : snapshot.events.some((event) => event.actorIndex === unit.index &&
          (event.kind === EVENT_DAMAGE || event.kind === EVENT_SHOVE)) ? "stagger" : null;
    const locomotion = Math.hypot(unit.vx, unit.vy) > unit.radius * 0.001 ? "walk" : "idle";
    for (const clip of ["idle", "walk", "stagger", "fall"] as const) {
      node.dress.nodes.get(clip)?.setEnabled(clip === (reaction ?? locomotion));
    }
  }

  #applyPresence(node: ActorNode, decision: PresenceDecision): void {
    node.figure.root.setEnabled(node.dress === null && decision.render);
    node.dress?.setEnabled(decision.render);
    for (const part of this.#parts(node)) part.isPickable = decision.pick;
    this.#toggle(this.#labels, node.key, decision.label);
    this.#toggle(this.#effects, node.key, decision.effect);
    this.#toggle(this.#audio, node.key, decision.audio);
    this.#toggle(this.#picking, node.key, decision.pick);
    this.#toggle(this.#debugRecords, node.key, decision.debug);
    const shadow = decision.shadow && this.#shadows !== null;
    if (shadow !== node.shadow) {
      for (const part of this.#parts(node)) {
        if (shadow) this.#shadows?.addShadowCaster(part);
        else this.#shadows?.removeShadowCaster(part);
      }
      node.shadow = shadow;
    }
  }

  #retire(node: ActorNode): void {
    if (node.shadow) {
      for (const part of this.#parts(node)) this.#shadows?.removeShadowCaster(part);
    }
    // Disposing the root disposes the whole hierarchy -- every named joint and
    // every part instance -- which is what keeps a many-mesh figure's
    // retirement the same one call the cylinder's was. A leaked part per death
    // would be a slow leak nothing else names, so the registry test counts
    // live meshes against the per-kind part table.
    node.dress?.dispose();
    node.figure.root.dispose(false);
    this.#nodes.delete(node.key);
    this.#labels.delete(node.key);
    this.#effects.delete(node.key);
    this.#audio.delete(node.key);
    this.#picking.delete(node.key);
    this.#debugRecords.delete(node.key);
  }

  #parts(node: ActorNode): readonly import("@babylonjs/core/Meshes/abstractMesh.js").AbstractMesh[] {
    return node.dress === null ? node.figure.parts : [...node.dress.meshes.values()];
  }

  #toggle(registry: Set<string>, key: string, enabled: boolean): void {
    if (enabled) registry.add(key);
    else registry.delete(key);
  }

  #publishCounts(): void {
    const counts = this.counts();
    let sourceMeshes = 0;
    for (const source of this.#sources.values()) sourceMeshes += source.meshes.size;
    this.#debug.replaceOwnerCounts("actors", {
      scene: { meshes: sourceMeshes, instances: counts.meshes, shadowCasters: counts.shadows },
      visibility: {
        units: this.#nodes.size, effects: counts.effects, audio: counts.audio,
        picking: counts.picking, debug: counts.debug,
      },
    });
  }
}
