import type { AssetContainer } from "@babylonjs/core/assetContainer.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
// The glTF loader registers itself on import; without it the load finds no plugin for `.glb`.
import "@babylonjs/loaders/glTF/index.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import fighterRig from "../../assets/humanoid/workshop-fighter.json" with { type: "json" };
import rogueRig from "../../assets/humanoid/workshop-rogue.json" with { type: "json" };
import { publicAssetUrl } from "../asset-url.ts";
import type { BuiltBody, BuiltSegment } from "../core/build/build-body.ts";
import { FIT_SCALE } from "../core/human/model.ts";
import type { WorkshopModel } from "../core/human/rig.ts";
import { CHARACTERS, visiblePart } from "../character-lab/catalog.ts";

/**
 * **The core body as the world sees it**: the workshop model's skinned mesh, each bone carried by
 * the core segment it belongs to. It reads the segments' achieved transforms and nothing else; it
 * owns no collision and decides nothing, so what it shows is a costume on the shapes `view.ts`
 * draws.
 *
 * A bone follows one segment rigidly: its bind pose relative to the segment's reference frame is
 * held. The rig's bind pose is the spec's reference pose (the spec's segment ends are the rig's
 * bone ends), so at the reference pose the skin is its bind pose, scaled by the fit scale.
 * Finger bones hold a grip against their parents, between the relaxed hand and a fist as the
 * caller's closure says. The arm's twist helpers follow
 * their own segment, with no share of the next one's twist; a wrist turned far shows a pinch.
 */
export interface SkinView {
  readonly meshes: readonly Mesh[];
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

interface RigBone { readonly host: string; readonly head: readonly number[] }
type Grip = Readonly<Record<string, readonly number[]>>;
interface Rig { readonly bones: Readonly<Record<string, RigBone>>; readonly grips: { readonly empty: Grip; readonly "sword-shield": Grip } }
const RIGS: Readonly<Record<WorkshopModel, Rig>> = {
  "workshop-fighter": fighterRig as Rig,
  "workshop-rogue": rogueRig as Rig,
};
/** The character workshop's entry for each model, whose default loadout sets boots and armour. */
const CHARACTER = { "workshop-fighter": CHARACTERS.fighter, "workshop-rogue": CHARACTERS.rogue } as const;

const TRUNK = ["upperTrunk", "middleTrunk", "lowerTrunk"] as const;

/**
 * **The fist.** The rig has no fist, but its closed grip (`sword-shield`, fitted around a handle by
 * `scripts/character-lab/realistic/grip_fit.py`) turns each finger joint about one axis, the
 * bone's own x within a few degrees. A fist is that turn carried on about the same axis: the
 * knuckle (MCP, `_01`) to 90 degrees and the middle joint (PIP, `_02`) to 100, the normal active
 * ranges (AAOS); the end joint (DIP, `_03`) to 0.65 of the PIP, the coupling `grip_fit.py` fits
 * with. The thumb's turns are not about one axis, so it keeps the closed grip, wrapped as around
 * a handle.
 */
const FIST_DEGREES: Readonly<Record<string, number>> = { "01": 90, "02": 100, "03": 0.65 * 100 };
const FINGER = /^(index|middle|ring|pinky)_(0[123])_[lr]$/;

/** A grip's turn, which the rig stores w first, as a Babylon quaternion. */
const gripQuaternion = (pose: readonly number[]) => new Quaternion(pose[1]!, pose[2]!, pose[3]!, pose[0]!);

/** `name`'s turn in a fist, from its turn in the closed grip. */
function fistTurn(name: string, closed: readonly number[]): Quaternion {
  const joint = FINGER.exec(name)?.[2];
  const grip = gripQuaternion(closed);
  if (!joint) return grip;
  const axis = new Vector3(grip.x, grip.y, grip.z).normalize();
  return Quaternion.RotationAxis(axis, (FIST_DEGREES[joint]! * Math.PI) / 180);
}

export type Hand = "left" | "right";
/**
 * The rig's hosts, which name the old game's modules, as core segments. The rig's primary side is
 * its right. The trunk and pelvis hosts are split among the three trunk segments by `trunkSegment`;
 * the neck goes with the head, as de Leva's head runs to the cervicale.
 */
const HOSTS: Readonly<Record<string, string>> = {
  "torso.core": "trunk", "locomotion.pelvis": "trunk", "head.neck": "head", "head.head": "head",
  "primary.upper": "upperArm.right", "primary.fore": "forearm.right", "primary.hand": "hand.right",
  "secondary.upper": "upperArm.left", "secondary.fore": "forearm.left", "secondary.hand": "hand.left",
  "locomotion.thighR": "thigh.right", "locomotion.shinR": "shank.right", "locomotion.footR": "foot.right",
  "locomotion.thighL": "thigh.left", "locomotion.shinL": "shank.left", "locomotion.footL": "foot.left",
};

const loads = new WeakMap<Scene, Map<WorkshopModel, Promise<AssetContainer>>>();
/** `model`'s asset, loaded once per scene; the scene owns it and its materials. */
export function loadSkin(model: WorkshopModel, scene: Scene): Promise<AssetContainer> {
  let byModel = loads.get(scene);
  if (!byModel) loads.set(scene, byModel = new Map());
  let load = byModel.get(model);
  if (!load) {
    load = LoadAssetContainerAsync(publicAssetUrl(`/assets/humanoid/${model}.glb`), scene);
    load.then((container) => scene.onDisposeObservable.addOnce(() => container.dispose()), () => byModel.delete(model));
    byModel.set(model, load);
  }
  return load;
}

const localMatrix = (node: TransformNode): Matrix =>
  Matrix.Compose(node.scaling, node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation), node.position);
const segmentMatrix = (node: TransformNode): Matrix =>
  Matrix.Compose(Vector3.One(), node.rotationQuaternion!, node.position);

/** The trunk segment whose span holds `point` (body frame), or the nearest span's. */
function trunkSegment(built: BuiltBody, point: Vector3): BuiltSegment {
  let best: BuiltSegment | null = null, bestOutside = Infinity;
  for (const name of TRUNK) {
    const segment = built.segments.get(name)!, { frame, spec } = segment;
    const along = Vector3.Dot(point.subtract(Vector3.FromArray(frame.origin)), Vector3.FromArray(frame.y));
    const span = Vector3.Distance(Vector3.FromArray(spec.proximal.value), Vector3.FromArray(spec.distal.value));
    const outside = Math.max(0, -along, along - span);
    if (outside < bestOutside) { best = segment; bestOutside = outside; }
  }
  return best!;
}

/**
 * Dress `built` in its model's skin from `container`, which `loadSkin` loaded into `scene`.
 * `closure` says, each frame, how far each hand is closed into a fist, 0 relaxed to 1 closed.
 */
export function dressBody(built: BuiltBody, container: AssetContainer, scene: Scene, closure: (hand: Hand) => number = () => 0): SkinView {
  const model = built.spec.model as WorkshopModel, rig = RIGS[model], prefix = `${model}.skin.`;
  // Materials stay the container's: a body part never disposes materials (H59).
  const instance = container.instantiateModelsToScene((name) => prefix + name, false, { doNotInstantiate: true });
  const nodes = instance.rootNodes.flatMap((root) => [root, ...root.getDescendants(false)]) as TransformNode[];
  const nameOf = (node: TransformNode) => node.name.slice(prefix.length);

  // Rest world matrices from the nodes' own transforms (H24): the loader's root turns glTF's frame
  // into Babylon's, which is the body frame, at the authored size.
  const rest = new Map<TransformNode, Matrix>();
  const restOf = (node: TransformNode): Matrix => {
    let matrix = rest.get(node);
    if (!matrix) {
      matrix = node.parent ? localMatrix(node).multiply(restOf(node.parent as TransformNode)) : localMatrix(node);
      rest.set(node, matrix);
    }
    return matrix;
  };
  nodes.forEach(restOf);

  const fit = Matrix.Scaling(FIT_SCALE.value, FIT_SCALE.value, FIT_SCALE.value);
  const relaxed = rig.grips.empty, closed = rig.grips["sword-shield"];
  // Parents come before children: `getDescendants` walks depth first.
  const rows = nodes.filter((node) => rig.bones[nameOf(node)]).map((node) => {
    const name = nameOf(node), open = relaxed[name], shut = closed[name];
    if (open && shut) {
      // A finger: its rest local, turned by the grip, on its parent as achieved.
      const scaling = new Vector3(), rotation = new Quaternion(), position = new Vector3();
      localMatrix(node).decompose(scaling, rotation, position);
      const finger = { hand: (name.endsWith("_r") ? "right" : "left") as Hand, scaling, rotation, position,
        open: gripQuaternion(open), fist: fistTurn(name, shut) };
      return { node, segment: null, held: new Matrix(), finger };
    }
    const host = HOSTS[rig.bones[name]!.host];
    if (!host) throw new Error(`${model}: bone ${name} has host ${rig.bones[name]!.host}, which names no core segment`);
    const atFit = restOf(node).multiply(fit);
    const segment = host === "trunk" ? trunkSegment(built, atFit.getTranslation()) : built.segments.get(host);
    if (!segment) throw new Error(`${model}: no segment ${host} for bone ${name}`);
    const { frame } = segment;
    const reference = Matrix.Compose(Vector3.One(),
      Quaternion.RotationQuaternionFromAxis(Vector3.FromArray(frame.x), Vector3.FromArray(frame.y), Vector3.FromArray(frame.z)),
      Vector3.FromArray(frame.origin));
    // The bone at x1 in the segment's reference frame; times the segment as achieved, the bone.
    return { node, segment, held: atFit.multiply(Matrix.Invert(reference)), finger: null };
  });

  const meshes = nodes.filter((node): node is Mesh => node instanceof Mesh && node.getTotalVertices() > 0);
  const loadout = { ...CHARACTER[model].defaults, weapon: "empty" as const };
  const worn = meshes.filter((mesh) => visiblePart(nameOf(mesh), loadout));
  for (const mesh of meshes) {
    mesh.isPickable = false;
    // The mesh's bounds are its bind pose's where it was authored; the body walks away from them.
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.setEnabled(worn.includes(mesh));
  }

  const achieved = new Map<TransformNode, Matrix>();
  const relative = new Matrix(), turn = new Quaternion(), curled = new Quaternion();
  const update = () => {
    achieved.clear();
    const shut = { left: closure("left"), right: closure("right") };
    for (const row of rows) {
      if (row.finger) {
        const { hand, scaling, rotation, position, open, fist } = row.finger;
        Quaternion.SlerpToRef(open, fist, shut[hand], turn);
        rotation.multiplyToRef(turn, curled);
        Matrix.ComposeToRef(scaling, curled, position, row.held);
      }
      const parent = row.node.parent as TransformNode;
      const parentMatrix = achieved.get(parent) ?? rest.get(parent) ?? Matrix.IdentityReadOnly;
      const world = row.segment ? row.held.multiply(segmentMatrix(row.segment.node)) : row.held.multiply(parentMatrix);
      achieved.set(row.node, world);
      world.multiplyToRef(Matrix.Invert(parentMatrix), relative);
      row.node.rotationQuaternion ??= Quaternion.Identity();
      relative.decompose(row.node.scaling, row.node.rotationQuaternion, row.node.position);
    }
  };
  update();
  const observer = scene.onBeforeRenderObservable.add(update);
  return {
    meshes: worn,
    setEnabled(enabled) {
      for (const mesh of worn) mesh.setEnabled(enabled);
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      instance.dispose();
    },
  };
}
