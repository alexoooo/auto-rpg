import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import type { CombatantArchetypeContract, CombatantKind } from "./combatant-asset-contract.js";
import type { CombatantAsset } from "./combatant-assets.js";

export type CombatantDress = Readonly<{
  kind: CombatantKind;
  contract: CombatantArchetypeContract;
  root: TransformNode;
  nodes: ReadonlyMap<string, TransformNode>;
  meshes: ReadonlyMap<string, Mesh>;
  clips: ReadonlyMap<string, AnimationGroup>;
  sampleClip(semantic: "idle" | "walk" | "stagger" | "fall", phase: number): void;
  setStandingHeight(height: number): void;
  setEnabled(enabled: boolean): void;
  dispose(): void;
  readonly disposed: boolean;
}>;

export type CombatantMeshRole =
  | "head" | "torso" | "legs" | "arm_left" | "arm_right" | "weapon" | "shield";

/** The sidecar mesh names form one shared semantic grammar, not correction data. */
export function combatantMeshRole(semantic: string): CombatantMeshRole {
  if (semantic === "sword" || semantic === "club") return "weapon";
  if (semantic === "shield") return "shield";
  if (semantic.includes("left") && (semantic.includes("arm") || semantic.includes("hand") || semantic.includes("pauldron"))) {
    return "arm_left";
  }
  if (semantic.includes("right") && (semantic.includes("arm") || semantic.includes("hand") || semantic.includes("pauldron"))) {
    return "arm_right";
  }
  if (semantic.includes("leg") || semantic.includes("boot")) return "legs";
  if (semantic.includes("head") || semantic.includes("helmet") || semantic.includes("visor") ||
      semantic.includes("plume") || semantic.includes("horn") || semantic.includes("tusk")) return "head";
  return semantic.includes("pelvis") || semantic.includes("kilt") || semantic.includes("belt")
    ? "legs" : "torso";
}

const COPY_INVERSE = new Quaternion();

/** Copy the already-authoritative named rig into a skinned authored dress. */
export function copyCombatantRigPose(
  dress: CombatantDress, source: ReadonlyMap<string, TransformNode>, standingHeight: number,
): void {
  dress.setStandingHeight(standingHeight);
  for (const row of dress.contract.nodes) {
    const from = source.get(row.semantic);
    const to = dress.nodes.get(row.semantic);
    if (to === undefined) throw new Error("combatant dress lacks " + row.semantic);
    // The legacy game publication has bones and sockets but no region/clip
    // rows. Those authored markers are driven by visibility/events below, not
    // fabricated into the legacy frame.
    if (from === undefined) continue;
    from.computeWorldMatrix(true);
    const wanted = from.absoluteRotationQuaternion;
    if (to.rotationQuaternion === null) to.rotationQuaternion = Quaternion.Identity();
    const parent = to.parent as TransformNode | null;
    if (parent !== null) {
      parent.computeWorldMatrix(true);
      Quaternion.InverseToRef(parent.absoluteRotationQuaternion, COPY_INVERSE);
      COPY_INVERSE.multiplyToRef(wanted, to.rotationQuaternion);
    } else to.rotationQuaternion.copyFrom(wanted);
    to.setAbsolutePosition(from.getAbsolutePosition());
    to.computeWorldMatrix(true);
  }
}

/**
 * Clone one exact archetype out of the shared checked container.
 *
 * Babylon's container clone is the important operation here: it clones the
 * skeleton and relinks every cloned bone to the cloned semantic TransformNode.
 * A mesh-only clone would look right at rest and quietly keep the source
 * skeleton, making the second body move the first one's bones.
 */
export function instantiateCombatantDress(
  asset: CombatantAsset, kind: CombatantKind, owner: string,
): CombatantDress {
  const source = asset.archetypes.get(kind);
  if (source === undefined) throw new Error("combatant asset has no " + kind + " archetype");
  const authoredPrefix = source.contract.nodePrefix;
  const clonePrefix = owner + ":";
  const entries = asset.container.instantiateModelsToScene(
    (name) => clonePrefix + name,
    false,
    {
      doNotInstantiate: true,
      predicate: (entity: { name?: unknown }) =>
        entity.name === "__root__"
        || (typeof entity.name === "string" && entity.name.startsWith(authoredPrefix)),
    },
  );
  const outer = entries.rootNodes[0] as TransformNode | undefined;
  if (entries.rootNodes.length !== 1 || outer === undefined || entries.skeletons.length !== 1) {
    entries.dispose();
    throw new Error("combatant " + kind + " clone closure drifted");
  }
  const skeleton = entries.skeletons[0];
  if (skeleton === undefined) throw new Error("combatant " + kind + " clone lacks its skeleton");
  skeleton.useTextureToStoreBoneMatrices = true;
  const descendants = [outer, ...outer.getDescendants(false)] as TransformNode[];
  const byName = new Map(descendants.map((node) => [node.name, node]));
  const nodes = new Map<string, TransformNode>();
  const meshes = new Map<string, Mesh>();
  const clips = new Map<string, AnimationGroup>();
  let semanticRoot: TransformNode | null = null;
  try {
    for (const row of source.contract.nodes) {
      const node = byName.get(clonePrefix + row.node);
      if (node === undefined) throw new Error("combatant " + kind + " clone lacks " + row.semantic);
      nodes.set(row.semantic, node);
    }
    for (const row of source.contract.meshes) {
      const mesh = byName.get(clonePrefix + row.node) as Mesh | undefined;
      if (mesh === undefined || typeof mesh.getTotalVertices !== "function") {
        throw new Error("combatant " + kind + " clone lacks mesh " + row.semantic);
      }
      mesh.isVisible = true;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      meshes.set(row.semantic, mesh);
    }
    for (const row of source.contract.clips) {
      const group = entries.animationGroups.find(({ name }) => name === clonePrefix + row.animation);
      if (group === undefined) throw new Error("combatant " + kind + " clone lacks clip " + row.semantic);
      group.stop();
      clips.set(row.semantic, group);
    }
    semanticRoot = nodes.get("root") ?? null;
    if (semanticRoot === null) throw new Error("combatant " + kind + " clone lacks its root");
    semanticRoot.setEnabled(true);
    outer.setEnabled(false);
  } catch (error) {
    entries.dispose();
    throw error;
  }
  let disposed = false;
  return Object.freeze({
    kind, contract: source.contract, root: semanticRoot,
    nodes, meshes, clips,
    sampleClip(semantic: "idle" | "walk" | "stagger" | "fall", phase: number): void {
      if (disposed) return;
      const group = clips.get(semantic);
      const contract = source.contract.clips.find((clip) => clip.semantic === semantic);
      if (group === undefined || contract === undefined) {
        throw new Error("combatant " + kind + " lacks clip " + semantic);
      }
      for (const other of clips.values()) if (other !== group) other.stop();
      // Starting then pausing creates Babylon's animatables, but no wall clock
      // advances them. The caller selects the exact normalised sample from a
      // published stride/event and immediately restores authoritative named
      // endpoints after this cosmetic sample.
      if (!group.isStarted) group.start(contract.looping, 1, group.from, group.to, false);
      const bounded = Math.min(1, Math.max(0, Number.isFinite(phase) ? phase : 0));
      group.goToFrame(group.from + (group.to - group.from) * bounded);
      group.pause();
    },
    setStandingHeight(height: number): void {
      if (disposed) return;
      outer.scaling.setAll(Math.max(0.0001, height) / source.contract.height);
      outer.computeWorldMatrix(true);
    },
    setEnabled(enabled: boolean): void {
      if (!disposed) outer.setEnabled(enabled);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const group of clips.values()) group.stop();
      entries.dispose();
    },
    get disposed(): boolean { return disposed; },
  });
}
