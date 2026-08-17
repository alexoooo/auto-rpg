import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import type {
  CombatantArchetypeContract, CombatantKind, CombatantLod,
} from "./combatant-asset-contract.js";
import type { CombatantAsset } from "./combatant-assets.js";

export type CombatantDress = Readonly<{
  kind: CombatantKind;
  contract: CombatantArchetypeContract;
  root: TransformNode;
  nodes: ReadonlyMap<string, TransformNode>;
  lods: ReadonlyMap<CombatantLod, ReadonlyMap<string, Mesh>>;
  meshes: ReadonlyMap<string, Mesh>;
  readonly activeLod: CombatantLod;
  allMeshes: readonly Mesh[];
  clips: ReadonlyMap<string, AnimationGroup>;
  setLod(lod: CombatantLod): void;
  setSemanticEnabled(semantic: string, enabled: boolean): void;
  sampleClip(semantic: "idle" | "walk" | "stagger" | "fall", phase: number): void;
  setStandingHeight(height: number): void;
  setEnabled(enabled: boolean): void;
  dispose(): void;
  readonly disposed: boolean;
}>;

export const COMBATANT_HIGH_LOD_MIN_PIXELS = 160;
export const COMBATANT_MID_LOD_MIN_PIXELS = 64;

/** Select a bounded dress by its current projected standing height. */
export function combatantLodForProjectedHeight(projectedHeight: number): CombatantLod {
  if (projectedHeight >= COMBATANT_HIGH_LOD_MIN_PIXELS) return "high";
  if (projectedHeight >= COMBATANT_MID_LOD_MIN_PIXELS) return "mid";
  return "low";
}

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
  // Each authored mesh is a rigid, joint-local piece weighted wholly to one
  // semantic bone. Blender exports conventional armature-space inverse binds,
  // but applying those to joint-local vertices subtracts the bind pose a
  // second time: boots, torso and head scatter around the floor even though
  // the linked nodes themselves are exact. The publication supplies the
  // complete joint transforms, so identity is the correct inverse bind for
  // this deliberately rigid skin.
  for (const bone of skeleton.bones) bone.setBindMatrix(Matrix.Identity());
  const descendants = [outer, ...outer.getDescendants(false)] as TransformNode[];
  const byName = new Map(descendants.map((node) => [node.name, node]));
  const nodes = new Map<string, TransformNode>();
  const lods = new Map<CombatantLod, ReadonlyMap<string, Mesh>>();
  const allMeshes: Mesh[] = [];
  const clips = new Map<string, AnimationGroup>();
  let semanticRoot: TransformNode | null = null;
  try {
    for (const row of source.contract.nodes) {
      const node = byName.get(clonePrefix + row.node);
      if (node === undefined) throw new Error("combatant " + kind + " clone lacks " + row.semantic);
      nodes.set(row.semantic, node);
    }
    for (const lod of source.contract.lods) {
      const meshes = new Map<string, Mesh>();
      for (const row of lod.meshes) {
        const mesh = byName.get(clonePrefix + row.node) as Mesh | undefined;
        if (mesh === undefined || typeof mesh.getTotalVertices !== "function") {
          throw new Error("combatant " + kind + " clone lacks " + lod.level + " mesh " + row.semantic);
        }
        mesh.isVisible = true;
        mesh.isPickable = false;
        mesh.receiveShadows = true;
      // The mesh stays at the loader closure's origin while its cloned
      // skeleton follows the published rig. Babylon otherwise frustum-culls
      // against that stale bind-pose box: the camera can be centred on the
      // hero while every dressed mesh is rejected somewhere else in the
      // room. Keeping this small, bounded dress closure active is the honest
      // alternative to pretending the loader-origin bounds followed bones.
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.setEnabled(false);
        meshes.set(row.semantic, mesh);
        allMeshes.push(mesh);
      }
      lods.set(lod.level, meshes);
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
  let enabled = false;
  let activeLod: CombatantLod = "high";
  const semanticEnabled = new Map<string, boolean>(
    source.contract.lods[0]?.meshes.map(({ semantic }) => [semantic, true] as const) ?? [],
  );
  const applyMeshState = (): void => {
    for (const [level, meshes] of lods) for (const [semantic, mesh] of meshes) {
      mesh.setEnabled(enabled && level === activeLod && (semanticEnabled.get(semantic) ?? false));
    }
  };
  const dress: CombatantDress = {
    kind, contract: source.contract, root: semanticRoot,
    nodes, lods, get meshes(): ReadonlyMap<string, Mesh> {
      return lods.get(activeLod) ?? new Map();
    },
    get activeLod(): CombatantLod { return activeLod; },
    allMeshes: Object.freeze(allMeshes), clips,
    setLod(lod: CombatantLod): void {
      if (disposed || lod === activeLod) return;
      if (!lods.has(lod)) throw new Error("combatant " + kind + " lacks " + lod + " LOD");
      activeLod = lod;
      applyMeshState();
    },
    setSemanticEnabled(semantic: string, visible: boolean): void {
      if (disposed) return;
      if (!semanticEnabled.has(semantic)) {
        throw new Error("combatant " + kind + " lacks mesh semantic " + semantic);
      }
      semanticEnabled.set(semantic, visible);
      applyMeshState();
    },
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
    setEnabled(visible: boolean): void {
      if (disposed) return;
      enabled = visible;
      outer.setEnabled(visible);
      applyMeshState();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const group of clips.values()) group.stop();
      entries.dispose();
    },
    get disposed(): boolean { return disposed; },
  };
  return Object.freeze(dress);
}
