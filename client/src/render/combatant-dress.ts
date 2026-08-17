import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
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

type FighterSurface = Readonly<{
  albedo: readonly [number, number, number];
  emissive: readonly [number, number, number];
  metallic: number;
  roughness: number;
}>;

const fighterSurface = (
  albedo: FighterSurface["albedo"], emissive: FighterSurface["emissive"],
  metallic: number, roughness: number,
): FighterSurface => Object.freeze({ albedo, emissive, metallic, roughness });

const FIGHTER_SURFACES: Readonly<Record<string, FighterSurface>> = Object.freeze({
  combatant_burgundy: fighterSurface([0.34, 0.12, 0.07], [0.030, 0.008, 0.003], 0.0, 0.80),
  combatant_dark_steel: fighterSurface([0.20, 0.23, 0.28], [0.035, 0.040, 0.050], 0.72, 0.43),
  combatant_leather: fighterSurface([0.27, 0.15, 0.075], [0.010, 0.004, 0.001], 0.0, 0.76),
  combatant_skin: fighterSurface([0.62, 0.43, 0.28], [0.040, 0.024, 0.012], 0.0, 0.72),
  combatant_steel: fighterSurface([0.48, 0.51, 0.55], [0.045, 0.050, 0.060], 0.76, 0.36),
});

const FIGHTER_SEMANTIC_SURFACES: Readonly<Record<string, FighterSurface>> = Object.freeze({
  torso_breastplate: fighterSurface([0.43, 0.46, 0.50], [0.040, 0.046, 0.055], 0.76, 0.38),
  head_visor: fighterSurface([0.18, 0.21, 0.26], [0.009, 0.011, 0.016], 0.68, 0.46),
  pauldron_left: fighterSurface([0.40, 0.43, 0.47], [0.036, 0.041, 0.050], 0.75, 0.40),
  pauldron_right: fighterSurface([0.40, 0.43, 0.47], [0.036, 0.041, 0.050], 0.75, 0.40),
  hand_left: fighterSurface([0.23, 0.25, 0.28], [0.006, 0.007, 0.009], 0.75, 0.40),
  hand_right: fighterSurface([0.23, 0.25, 0.28], [0.006, 0.007, 0.009], 0.75, 0.40),
  shield: fighterSurface([0.31, 0.35, 0.39], [0.032, 0.040, 0.050], 0.68, 0.48),
  sword: fighterSurface([0.64, 0.67, 0.71], [0.060, 0.066, 0.078], 0.82, 0.29),
});

function applyFighterSurface(material: PBRMaterial, surface: FighterSurface): void {
  material.albedoColor.copyFromFloats(...surface.albedo);
  material.emissiveColor.copyFromFloats(...surface.emissive);
  material.metallic = surface.metallic;
  material.roughness = surface.roughness;
}

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
  const meshes = new Map<string, Mesh>();
  const clips = new Map<string, AnimationGroup>();
  const ownedMaterials: PBRMaterial[] = [];
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
      // The mesh stays at the loader closure's origin while its cloned
      // skeleton follows the published rig. Babylon otherwise frustum-culls
      // against that stale bind-pose box: the camera can be centred on the
      // hero while every dressed mesh is rejected somewhere else in the
      // room. Keeping this small, bounded dress closure active is the honest
      // alternative to pretending the loader-origin bounds followed bones.
      mesh.alwaysSelectAsActiveMesh = true;
      if (kind === "fighter") {
        const surface = FIGHTER_SEMANTIC_SURFACES[row.semantic] ?? FIGHTER_SURFACES[row.materialRole];
        const material = mesh.material?.clone(clonePrefix + row.node + ":surface");
        if (!(material instanceof PBRMaterial) || surface === undefined) {
          throw new Error("combatant fighter material role drifted: " + row.materialRole);
        }
        mesh.material = material;
        ownedMaterials.push(material);
        applyFighterSurface(material, surface);
      }
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
    for (const material of ownedMaterials) material.dispose(false, false);
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
      for (const material of ownedMaterials) material.dispose(false, false);
    },
    get disposed(): boolean { return disposed; },
  });
}
