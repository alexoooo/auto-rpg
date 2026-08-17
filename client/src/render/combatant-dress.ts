import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
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

/** Resolve a rigid authored piece to the semantic joint whose local space it uses. */
export function combatantMeshJoint(semantic: string): string {
  if (semantic === "sword" || semantic === "club") return "socket_weapon_right";
  if (semantic === "shield") return "socket_shield";
  if (semantic.includes("left") && (semantic.includes("forearm") || semantic.includes("hand"))) return "hand_left";
  if (semantic.includes("right") && (semantic.includes("forearm") || semantic.includes("hand"))) return "hand_right";
  if (semantic.includes("left") && (semantic.includes("arm") || semantic.includes("pauldron"))) return "arm_left";
  if (semantic.includes("right") && (semantic.includes("arm") || semantic.includes("pauldron"))) return "arm_right";
  if (semantic.includes("head") || semantic.includes("helmet") || semantic.includes("visor") ||
      semantic.includes("plume") || semantic.includes("horn") || semantic.includes("tusk")) return "head";
  if (semantic.includes("pelvis") || semantic.includes("kilt") || semantic.includes("belt") ||
      semantic.includes("leg") || semantic.includes("boot")) return "pelvis";
  return "torso";
}

const COPY_INVERSE = new Quaternion();

/** Copy the already-authoritative named rig into an authored joint-local dress. */
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
 * Babylon's container clone is the important operation here: it gives every
 * body an independent authored node closure and clip set. The asset meshes are
 * deliberately rigid joint-local pieces. Parenting those pieces to their
 * semantic nodes consumes that contract directly and avoids making Babylon's
 * glTF conversion root, mesh pose and linked-bone path agree by accident.
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
  if (entries.skeletons[0] === undefined) throw new Error("combatant " + kind + " clone lacks its skeleton");
  // The glTF loader's hidden root and per-mesh pose jointly convert glTF into
  // Babylon space. Linked bones deliberately bypass that root, so retaining
  // either half makes the GPU skin path disagree with the semantic rig. This
  // dress already lives in a right-handed scene and copies scene-space joints;
  // normalise the loader closure and let semantic joints be the sole transform.
  outer.position.setAll(0);
  outer.scaling.setAll(1);
  if (outer.rotationQuaternion === null) outer.rotation.setAll(0);
  else outer.rotationQuaternion.copyFromFloats(0, 0, 0, 1);
  outer.computeWorldMatrix(true);
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
        const jointSemantic = combatantMeshJoint(row.semantic);
        const joint = nodes.get(jointSemantic);
        if (joint === undefined) {
          throw new Error("combatant " + kind + " lacks joint " + jointSemantic + " for " + row.semantic);
        }
        mesh.skeleton = null;
        mesh.parent = joint;
        mesh.position.setAll(0);
        mesh.scaling.setAll(1);
        if (mesh.rotationQuaternion === null) mesh.rotation.setAll(0);
        else mesh.rotationQuaternion.copyFromFloats(0, 0, 0, 1);
        mesh.isVisible = true;
        mesh.isPickable = false;
        mesh.receiveShadows = true;
      // These are small bounded rigid pieces, so their ordinary transformed
      // bounds now follow the hero without a stale bind-pose culling box.
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
    for (const mesh of allMeshes) mesh.dispose(false, false);
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
      const scale = Math.max(0.0001, height) / source.contract.height;
      // Rigid pieces inherit their semantic joint hierarchy. Put uniform body
      // scale on that hierarchy once and leave Babylon's loader closure neutral.
      outer.scaling.setAll(1);
      semanticRoot.scaling.setAll(scale);
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
      for (const mesh of allMeshes) mesh.dispose(false, false);
      entries.dispose();
    },
    get disposed(): boolean { return disposed; },
  };
  return Object.freeze(dress);
}
