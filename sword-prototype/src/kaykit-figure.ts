import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { AssetContainer } from "@babylonjs/core/assetContainer.js";
import type { Bone } from "@babylonjs/core/Bones/bone.js";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton.js";
import type { Node } from "@babylonjs/core/node.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";

import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";

import {
  KAYKIT_NATIVE_TO_PHYSICS,
  KAYKIT_REGION_ORDER,
  KAYKIT_TARGET_SOURCE,
  type KayKitPhysicsBone,
} from "./kaykit-adapter.ts";
import {
  bindCorrectedSkinWorldToRef,
  redirectedSkinWeights,
  skinLocalMatrixToRef,
  type BoneName,
  type FigureController,
  type FigureRig,
} from "./figure.ts";
import type { HandName } from "./mind.ts";
import { creatorGeometryQualification, type Weapon } from "./weapon.ts";
import type { Part } from "./rig.ts";

const ASSET_URL = "/assets/kaykit-knight.glb";
const PREFIX = "kaykit:";

export type KayKitPreparation =
  | Readonly<{ available: true; reason: null }>
  | Readonly<{ available: false; reason: string }>;

/** Convert preparation into the setup screen's disabled-option contract. */
export function kayKitUnavailableUnits(
  result: KayKitPreparation,
): Readonly<Record<string, string>> {
  return result.available ? Object.freeze({}) : Object.freeze({ "kaykit-knight": result.reason });
}

interface PreparedAsset {
  container: AssetContainer | null;
  result: KayKitPreparation;
}

const prepared = new WeakMap<Scene, PreparedAsset>();
const pending = new WeakMap<Scene, Promise<PreparedAsset>>();

const assetBytes: Promise<ArrayBuffer | null> =
  typeof window === "undefined" || typeof fetch !== "function"
    ? Promise.resolve(null)
    : fetch(ASSET_URL)
        .then((response) => response.ok ? response.arrayBuffer() : null)
        .catch(() => null);

async function parseAsset(scene: Scene, raw: ArrayBuffer | Uint8Array): Promise<PreparedAsset> {
  try {
    const container = await LoadAssetContainerAsync(
      raw instanceof Uint8Array ? raw : new Uint8Array(raw),
      scene,
      { pluginExtension: ".glb" },
    );
    // Babylon starts the source's first clip while parsing this exact GLB.
    // Native clips are retained as provenance/reference, never as a second
    // controller over the solver, so stop them before the asset is published.
    for (const animation of container.animationGroups) animation.stop();
    const reason = qualify(container);
    if (reason) {
      container.dispose();
      return { container: null, result: Object.freeze({ available: false, reason }) };
    }
    return { container, result: Object.freeze({ available: true, reason: null }) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      container: null,
      result: Object.freeze({
        available: false,
        reason: `KayKit Knight asset could not be parsed: ${detail}`,
      }),
    };
  }
}

const regionOf = (name: string): KayKitPhysicsBone | null => {
  const marker = name.lastIndexOf("__region_");
  if (marker < 0) return null;
  const suffix = name.slice(marker + "__region_".length).replace(/_primitive\d+$/, "");
  return (KAYKIT_REGION_ORDER as readonly string[]).includes(suffix)
    ? suffix as KayKitPhysicsBone
    : null;
};

function qualify(container: AssetContainer): string | null {
  if (container.skeletons.length !== 1) return "the KayKit asset does not contain exactly one skeleton";
  const skeleton = container.skeletons[0];
  const expected = Object.keys(KAYKIT_NATIVE_TO_PHYSICS).sort();
  const actual = skeleton.bones.map((bone) => bone.name).sort();
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
    return "the KayKit asset's 41-joint skeleton does not match the pinned adapter";
  }
  const regions = new Set(container.meshes.map((mesh) => regionOf(mesh.name)).filter(Boolean));
  if (regions.size !== KAYKIT_REGION_ORDER.length ||
      KAYKIT_REGION_ORDER.some((region) => !regions.has(region))) {
    return "the KayKit asset does not contain all 13 qualified anatomical regions";
  }
  const nodes = new Set<Node>([...container.meshes, ...container.transformNodes]);
  for (const [name, kind, componentCount] of [
    ["1H_Sword", "sword", 3],
    ["Round_Shield", "shield", 2],
  ] as const) {
    const visual = [...nodes].find((node): node is TransformNode =>
      node instanceof TransformNode && node.name === name);
    if (!visual) {
      return `the KayKit asset is missing creator-mounted visual "${name}"`;
    }
    const meshes = [visual, ...visual.getDescendants(false)].filter(
      (node): node is Mesh => node instanceof Mesh && node.getTotalVertices() > 0,
    );
    const geometryReason = creatorGeometryQualification(visual, meshes, kind, componentCount);
    if (geometryReason) return `the KayKit ${name} geometry is unusable: ${geometryReason}`;
  }
  return null;
}

async function loadAsset(scene: Scene): Promise<PreparedAsset> {
  const known = pending.get(scene);
  if (known) return known;
  const load = assetBytes.then(async (raw): Promise<PreparedAsset> => {
    if (!raw) {
      return {
        container: null,
        result: Object.freeze({ available: false, reason: "KayKit Knight asset could not be fetched" }),
      };
    }
    return parseAsset(scene, raw);
  });
  pending.set(scene, load);
  return load;
}

/** Parse and qualify the exact runtime asset before a selectable unit can use it. */
export async function prepareKayKitFigure(scene: Scene): Promise<KayKitPreparation> {
  const result = await loadAsset(scene);
  prepared.set(scene, result);
  return result.result;
}

/** The same gate for native/headless hosts which already own the pinned bytes. */
export async function prepareKayKitFigureFromBytes(
  scene: Scene,
  raw: Uint8Array,
): Promise<KayKitPreparation> {
  const result = await parseAsset(scene, raw);
  prepared.set(scene, result);
  return result.result;
}

interface SkinBinding {
  bone: Bone;
  node: TransformNode;
  part: Part;
  parent: SkinBinding | null;
  bindWorld: Matrix;
  physicsBindInverse: Matrix;
  partWorld: Matrix;
  delta: Matrix;
  world: Matrix;
  inverse: Matrix;
  local: Matrix;
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
}

interface SkinRegion {
  mesh: Mesh;
  owner: BoneName;
  indices: number[];
  weights: number[];
}

const LIMB_REGION: Readonly<Record<string, BoneName>> = Object.freeze({
  torso: "torso",
  head: "head",
  pelvis: "pelvis",
  upperArm: "swordUpperArm",
  forearm: "swordForearm",
  hand: "swordHand",
  offUpperArm: "offUpperArm",
  offForearm: "offForearm",
  offHand: "offHand",
  thighL: "thighLeft",
  shinL: "shinLeft",
  thighR: "thighRight",
  shinR: "shinRight",
});

function allNodes(roots: readonly Node[]): Node[] {
  const result: Node[] = [];
  for (const root of roots) result.push(root, ...root.getDescendants(false));
  return result;
}

/** Positional metres and angular radians moved by a visual reparent. */
export function kayKitVisualMountError(before: Matrix, after: Matrix): {
  position: number;
  angle: number;
} {
  const beforePosition = new Vector3();
  const afterPosition = new Vector3();
  const beforeRotation = new Quaternion();
  const afterRotation = new Quaternion();
  before.decompose(new Vector3(), beforeRotation, beforePosition);
  after.decompose(new Vector3(), afterRotation, afterPosition);
  const dot = Math.min(1, Math.abs(Quaternion.Dot(beforeRotation, afterRotation)));
  return {
    position: Vector3.Distance(beforePosition, afterPosition),
    angle: 2 * Math.acos(dot),
  };
}

/** A fail-closed, solver-driven instance of the pinned KayKit Knight. */
export class KayKitFigure implements FigureController {
  readonly pieces: Mesh[] = [];

  private readonly scene: Scene;
  private readonly roots: Node[] = [];
  private readonly bindings: SkinBinding[] = [];
  private readonly regions: SkinRegion[] = [];
  private readonly severed = new Set<BoneName>();
  private readonly animations: { stop(): void; dispose(): void }[] = [];
  private readonly transferred: Node[] = [];
  private skeleton: Skeleton | null = null;
  private observer: Observer<Scene> | null = null;

  constructor(
    scene: Scene,
    rig: FigureRig,
    weapons: Readonly<Record<HandName, Weapon | null>>,
    placementTarget: { readonly origin: Vector3; readonly facing: number },
  ) {
    this.scene = scene;
    const asset = prepared.get(scene);
    if (!asset?.container || !asset.result.available) {
      throw new Error(asset?.result.reason ?? "KayKit Knight asset was not prepared");
    }
    if (weapons.primary?.kind !== "sword" || weapons.secondary?.kind !== "buckler") {
      throw new Error("KayKit Knight requires primary sword and secondary buckler");
    }

    const before = new Set(scene.meshes);
    const entries = asset.container.instantiateModelsToScene(
      (name) => `${PREFIX}${rig.prefix}:${name}`,
      false,
      { doNotInstantiate: true },
    );
    this.animations.push(...entries.animationGroups);
    for (const animation of this.animations) animation.stop();
    const skeleton = entries.skeletons.length === 1 ? entries.skeletons[0] : null;
    if (!skeleton) {
      this.disposeEntries(entries.rootNodes, entries.skeletons);
      throw new Error("KayKit Knight instance did not preserve its one skeleton");
    }

    const meshes = scene.meshes.filter((mesh): mesh is Mesh =>
      mesh instanceof Mesh && !before.has(mesh) && mesh.getTotalVertices() > 0);
    const skinned = meshes.filter((mesh) => mesh.skeleton === skeleton);
    const regions = skinned.map((mesh): SkinRegion | null => {
      const owner = regionOf(mesh.name) as BoneName | null;
      const indices = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind);
      const weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);
      const width = mesh.getTotalVertices() * 4;
      return owner && indices && weights && indices.length === width && weights.length === width
        ? { mesh, owner, indices: Array.from(indices), weights: Array.from(weights) }
        : null;
    });
    const foundRegions = new Set(regions.map((region) => region?.owner).filter(Boolean));
    if (regions.some((region) => region === null) ||
        KAYKIT_REGION_ORDER.some((region) => !foundRegions.has(region))) {
      this.disposeEntries(entries.rootNodes, entries.skeletons);
      throw new Error("KayKit Knight instance lost a qualified skin region");
    }
    this.regions.push(...regions as SkinRegion[]);

    const placement = new TransformNode(`${rig.prefix}.kaykit.placement`, scene);
    placement.rotationQuaternion = Quaternion.Identity();
    for (const root of entries.rootNodes) root.parent = placement;
    placement.computeWorldMatrix(true);

    const bones = new Map(skeleton.bones.map((bone) => [bone.name, bone]));
    const sourceRoot = bones.get("root")?.getTransformNode();
    if (!sourceRoot) {
      placement.dispose(false, false);
      this.disposeEntries(entries.rootNodes, entries.skeletons);
      throw new Error("KayKit Knight instance has no linked root transform");
    }
    const sourceRootWorld = sourceRoot.computeWorldMatrix(true).clone();
    const sourceRootInverse = Matrix.Identity();
    sourceRootWorld.invertToRef(sourceRootInverse);
    const targetWorld = Matrix.Identity();
    Matrix.ComposeToRef(
      Vector3.OneReadOnly,
      Quaternion.RotationAxis(new Vector3(0, 1, 0), placementTarget.facing),
      placementTarget.origin,
      targetWorld,
    );
    // The source root is the creator's model origin. Aligning that exact frame
    // to the fighter's construction frame preserves every native proportion;
    // no body part is translated to make a mismatched collider look correct.
    const placementMatrix = sourceRootInverse.multiply(targetWorld);
    placementMatrix.decompose(placement.scaling, placement.rotationQuaternion, placement.position);
    placement.computeWorldMatrix(true);

    const orderedBones = [...skeleton.bones].sort((left, right) => {
      const depth = (bone: Bone): number => bone.getParent() ? 1 + depth(bone.getParent() as Bone) : 0;
      return depth(left) - depth(right);
    });
    const bindingByBone = new Map<Bone, SkinBinding>();
    for (const bone of orderedBones) {
      const target = KAYKIT_NATIVE_TO_PHYSICS[bone.name];
      if (target === null || target === undefined) continue;
      const node = bone.getTransformNode();
      if (!node) {
        placement.dispose(false, false);
        this.disposeEntries(entries.rootNodes, entries.skeletons);
        throw new Error(`KayKit Knight bone "${bone.name}" lost its transform node`);
      }
      const parent = bone.getParent() ? bindingByBone.get(bone.getParent() as Bone) ?? null : null;
      const part = rig[target];
      const partWorld = Matrix.Identity();
      Matrix.ComposeToRef(
        Vector3.OneReadOnly,
        part.mesh.rotationQuaternion ?? Quaternion.Identity(),
        part.mesh.position,
        partWorld,
      );
      const binding: SkinBinding = {
        bone,
        node,
        part,
        parent,
        bindWorld: node.computeWorldMatrix(true).clone(),
        physicsBindInverse: Matrix.Identity(),
        partWorld,
        delta: Matrix.Identity(),
        world: Matrix.Identity(),
        inverse: Matrix.Identity(),
        local: Matrix.Identity(),
        position: new Vector3(),
        rotation: new Quaternion(),
        scale: new Vector3(1, 1, 1),
      };
      partWorld.invertToRef(binding.physicsBindInverse);
      bindingByBone.set(bone, binding);
      this.bindings.push(binding);
    }
    if (this.bindings.length === 0) {
      placement.dispose(false, false);
      this.disposeEntries(entries.rootNodes, entries.skeletons);
      throw new Error("KayKit Knight instance produced no solver bindings");
    }

    for (const region of this.regions) {
      region.mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, region.indices, true);
      region.mesh.setVerticesData(VertexBuffer.MatricesWeightsKind, region.weights, true);
    }
    this.sync();

    // From here onward an imported node may be transferred under a weapon. Own
    // the remaining graph before that first mutation so an unexpected failure
    // can release the skin side here while Fighter releases its physics side.
    this.roots.push(placement);
    this.skeleton = skeleton;
    const graph = allNodes(entries.rootNodes);
    const transfer = (visualName: "1H_Sword" | "Round_Shield", weapon: Weapon): void => {
      const wanted = `${PREFIX}${rig.prefix}:${visualName}`;
      const visual = graph.find((node): node is TransformNode =>
        node instanceof TransformNode && node.name === wanted);
      if (!visual) throw new Error(`KayKit Knight instance is missing visual "${visualName}"`);
      const authoredWorld = visual.computeWorldMatrix(true).clone();
      weapon.root.computeWorldMatrix(true);
      visual.setParent(weapon.root);
      const mountedWorld = visual.computeWorldMatrix(true);
      const error = kayKitVisualMountError(authoredWorld, mountedWorld);
      if (error.position > 0.0001 || error.angle > Math.PI / 1800) {
        throw new Error(
          `KayKit ${visualName} mount moved by ${error.position} m and ${error.angle} rad`,
        );
      }
      const visualMeshes = [visual, ...visual.getDescendants(false)].filter(
        (node): node is Mesh => node instanceof Mesh && node.getTotalVertices() > 0,
      );
      weapon.adoptCreatorGeometry(visualMeshes);
      weapon.hideBuiltVisual();
      this.transferred.push(visual);
      for (const mesh of visualMeshes) {
        mesh.isVisible = true;
        mesh.isPickable = true;
        mesh.receiveShadows = true;
      }
    };
    try {
      transfer("1H_Sword", weapons.primary);
      transfer("Round_Shield", weapons.secondary);

      const transferredMeshes = new Set(this.transferred.flatMap((node) =>
        [node, ...node.getDescendants(false)].filter((child): child is Mesh => child instanceof Mesh)));
      for (const mesh of meshes) {
        if (transferredMeshes.has(mesh)) continue;
        mesh.receiveShadows = true;
        mesh.isPickable = true;
        this.pieces.push(mesh);
      }

      this.observer = scene.onBeforeRenderObservable.add(() => this.sync());
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  sever(limbKey: string): void {
    const cut = LIMB_REGION[limbKey];
    if (!cut || cut === "torso" || !this.skeleton || this.severed.has(cut)) return;
    this.severed.add(cut);
    const byIndex = new Map<number, BoneName>();
    for (const bone of this.skeleton.bones) {
      const target = KAYKIT_NATIVE_TO_PHYSICS[bone.name];
      if (target) byIndex.set(bone.getIndex(), target as BoneName);
    }
    const byName = new Map<BoneName, number>();
    for (const target of KAYKIT_REGION_ORDER) {
      const bone = this.skeleton.bones.find((candidate) => candidate.name === KAYKIT_TARGET_SOURCE[target]);
      if (bone) byName.set(target as BoneName, bone.getIndex());
    }
    for (const region of this.regions) {
      const redirected = redirectedSkinWeights(
        region.owner,
        this.severed,
        byName,
        byIndex,
        region.indices,
        region.weights,
      );
      region.mesh.updateVerticesData(VertexBuffer.MatricesIndicesKind, redirected.indices, false, false);
      region.mesh.updateVerticesData(VertexBuffer.MatricesWeightsKind, redirected.weights, false, false);
    }
  }

  dispose(): void {
    if (this.observer) this.scene.onBeforeRenderObservable.remove(this.observer);
    this.observer = null;
    for (const animation of this.animations) {
      animation.stop();
      animation.dispose();
    }
    this.animations.length = 0;
    for (const binding of this.bindings) binding.bone.linkTransformNode(null);
    this.bindings.length = 0;
    for (const root of this.roots) root.dispose(false, false);
    this.roots.length = 0;
    this.skeleton?.dispose();
    this.skeleton = null;
    this.regions.length = 0;
    this.severed.clear();
    // Weapon owns every transferred visual now; `Arm.dispose` removes it after
    // the figure has released the skeleton and body graph.
    this.transferred.length = 0;
  }

  private sync(): void {
    for (const binding of this.bindings) {
      Matrix.ComposeToRef(
        Vector3.OneReadOnly,
        binding.part.mesh.rotationQuaternion ?? Quaternion.Identity(),
        binding.part.mesh.position,
        binding.partWorld,
      );
      bindCorrectedSkinWorldToRef(
        binding.bindWorld,
        binding.physicsBindInverse,
        binding.partWorld,
        binding.delta,
        binding.world,
      );
      if (binding.parent) {
        skinLocalMatrixToRef(binding.world, binding.parent.world, binding.inverse, binding.local);
      } else {
        const parentWorld = binding.node.parent?.computeWorldMatrix(true);
        if (parentWorld) skinLocalMatrixToRef(binding.world, parentWorld, binding.inverse, binding.local);
        else binding.local.copyFrom(binding.world);
      }
      binding.local.decompose(binding.scale, binding.rotation, binding.position);
      binding.node.position.copyFrom(binding.position);
      binding.node.rotationQuaternion ??= Quaternion.Identity();
      binding.node.rotationQuaternion.copyFrom(binding.rotation);
      binding.node.scaling.copyFrom(binding.scale);
    }
  }

  private disposeEntries(roots: readonly Node[], skeletons: readonly Skeleton[]): void {
    for (const animation of this.animations) animation.dispose();
    this.animations.length = 0;
    for (const root of roots) root.dispose(false, false);
    for (const skeleton of skeletons) skeleton.dispose();
  }
}
