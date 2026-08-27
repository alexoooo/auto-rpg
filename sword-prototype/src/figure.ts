import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { AssetContainer } from "@babylonjs/core/assetContainer.js";
import type { Bone } from "@babylonjs/core/Bones/bone.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Node } from "@babylonjs/core/node.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton.js";

// Side effect, and a load-bearing one: this is what teaches `LoadAssetContainerAsync`
// that a `.glb` is a thing it can read. Without it the load rejects with "Unable to
// find a plugin to load .glb files", the costume silently never arrives, and the
// page looks exactly like a page whose asset is missing. Fifth member of the same
// family as the physics, shadow, outline, `Culling/ray` and `edgesRenderer` imports
// -- when a Babylon feature works in the playground and not here, suspect a missing
// side-effect import before suspecting the feature.
import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";

import { CONFIG } from "./config.ts";
import { isStrapped, type HandName, type WeaponKind } from "./hands.ts";
import { followSurfaceMaps } from "./surface.ts";
import type { Part } from "./rig.ts";

export interface FigureMaterials {
  steel: Material;
  leather: Material;
  cloth: Material;
  flesh: Material;
}

/** The bones a costume hangs on. Every piece is a child of one of these. */
export interface FigureRig {
  /** Which fighter this is, so two costumes in one scene have distinct names. */
  prefix: string;
  torso: Part;
  head: Part;
  pelvis: Part;
  /**
   * Both arms, all six bones.
   *
   * There used to be two, because there used to be one driven arm and one
   * gait-swung stub, and the driven one was deliberately left bare: it was the
   * subject of the whole prototype and a sleeve on it would have been a costume
   * on the thing being measured. Both arms are driven now, and that argument
   * does not survive the change -- it would leave a fighter dressed on one side
   * and stripped on the other, which is not an instrument, it is a mistake. The
   * instrument is `G`, which takes the whole costume off and was built for
   * exactly this.
   */
  swordUpperArm: Part;
  swordForearm: Part;
  swordHand: Part;
  offUpperArm: Part;
  offForearm: Part;
  offHand: Part;
  thighLeft: Part;
  shinLeft: Part;
  thighRight: Part;
  shinRight: Part;
}

/** Every name in `FigureRig` that is a bone rather than the prefix. */
export type BoneName = Exclude<keyof FigureRig, "prefix">;

/**
 * The visual hierarchy, and deliberately not Havok's constraint direction.
 *
 * The waist motor has to be registered pelvis-to-torso for the V2 solver, but
 * a person is cut the other way: severing the pelvis takes the legs with it and
 * leaves the chest behind. The skin therefore roots at the torso. Every other
 * severable part is then exactly a subtree, which is the property a future
 * wound-cap pass needs and one an armature cannot recover after export.
 */
export const SKIN_BONE_PARENT: Readonly<Record<BoneName, BoneName | null>> = Object.freeze({
  torso: null,
  head: "torso",
  pelvis: "torso",
  swordUpperArm: "torso",
  swordForearm: "swordUpperArm",
  swordHand: "swordForearm",
  offUpperArm: "torso",
  offForearm: "offUpperArm",
  offHand: "offForearm",
  thighLeft: "pelvis",
  shinLeft: "thighLeft",
  thighRight: "pelvis",
  shinRight: "thighRight",
});

/** Parent-before-child order for composing independent physics roots. */
const SKIN_BONE_ORDER: readonly BoneName[] = Object.freeze([
  "torso", "head", "pelvis",
  "swordUpperArm", "swordForearm", "swordHand",
  "offUpperArm", "offForearm", "offHand",
  "thighLeft", "shinLeft", "thighRight", "shinRight",
]);

/**
 * Express an independently simulated world transform in its visual parent's
 * local frame. Babylon uses row vectors, so `local * parent === world`; reversing
 * this product mirrors rotations around translated parents while still looking
 * correct for the identity pose.
 */
export function skinLocalMatrixToRef(
  world: Matrix,
  parentWorld: Matrix,
  inverse: Matrix,
  result: Matrix,
): void {
  parentWorld.invertToRef(inverse);
  world.multiplyToRef(inverse, result);
}

/** Apply a physics delta to an arbitrary authored bone bind frame. */
export function bindCorrectedSkinWorldToRef(
  bindWorld: Matrix,
  physicsBindInverse: Matrix,
  physicsCurrent: Matrix,
  delta: Matrix,
  result: Matrix,
): void {
  physicsBindInverse.multiplyToRef(physicsCurrent, delta);
  bindWorld.multiplyToRef(delta, result);
}

/** Which of the arena's materials a piece is made of, or its fighter's colour. */
export type PieceMaterial = keyof FigureMaterials | "side";

type Triple = readonly [number, number, number];

/** The stand-in drawn when the authored asset has nothing under this name. */
type Primitive =
  | { kind: "box"; size: Triple }
  | { kind: "capsule"; height: number; radius: number }
  | { kind: "sphere"; diameter: number; scale?: Triple }
  | { kind: "cylinder"; height: number; diameter: number };

export interface CostumePiece {
  /** The node name in `public/assets/warrior.glb`, and the mesh name in the
   *  scene once the fighter's prefix is on the front of it. */
  name: string;
  /** Which physics part it rides on. */
  bone: BoneName;
  material: PieceMaterial;
  /**
   * Where the *primitive* is drawn, as a point in the fighter's own upright
   * frame -- absolute, so it can be read against the table in `config.ts`'s
   * `body` block with a tape measure rather than by unwinding an offset. The
   * authored piece ignores this and stands where it was authored.
   */
  at: Triple;
  primitive: Primitive;
}

/** Where a bone hangs from, and where its capsule balances. Both absolute. */
export interface BoneFrame {
  /** The joint this bone swings about: the origin its authored piece is cut at. */
  joint: Triple;
  /** The centre of the physics capsule, which is the origin of its local frame. */
  centre: Triple;
}

/**
 * The thirteen bones, in the fighter's upright frame, straight off `config.ts`.
 *
 * A function rather than a constant because `config.ts` is deliberately mutable
 * -- `?tune` writes into it live -- and a table snapshotted at module load would
 * quietly disagree with the bodies the numbers actually built.
 *
 * Read the two columns together and the arithmetic checks itself: the torso and
 * the pelvis share the waist, because that is the one joint where the spine
 * splits; the thigh's joint is the hip and its centre is half a thigh below it.
 */
export function boneFrames(): Record<BoneName, BoneFrame> {
  const B = CONFIG.body;
  const F = CONFIG.fighter;
  const A = CONFIG.arm;
  const side = F.shoulderSide;
  const off = -F.shoulderSide;
  const z = F.shoulderFront;
  return {
    torso: { joint: [0, B.waist, 0], centre: [0, B.torsoCentre, 0] },
    head: { joint: [0, B.neck, 0], centre: [0, B.headCentre, 0] },
    pelvis: { joint: [0, B.waist, 0], centre: [0, B.pelvisCentre, 0] },
    // Both arms take their dimensions from the one `arm` block, because both
    // arms are now built from it. They used to differ -- the off arm was its own
    // set of numbers in `body`, a couple of centimetres shorter -- and a costume
    // authored to those and hung on these would sit that far out of place.
    swordUpperArm: {
      joint: [side, F.shoulderHeight, z],
      centre: [side, F.shoulderHeight - A.upperLength / 2, z],
    },
    swordForearm: {
      joint: [side, F.shoulderHeight - A.upperLength, z],
      centre: [side, F.shoulderHeight - A.upperLength - A.foreLength / 2, z],
    },
    swordHand: {
      joint: [side, F.shoulderHeight - A.upperLength - A.foreLength, z],
      centre: [side, F.shoulderHeight - A.upperLength - A.foreLength - A.handLength / 2, z],
    },
    offUpperArm: {
      joint: [off, F.shoulderHeight, z],
      centre: [off, F.shoulderHeight - A.upperLength / 2, z],
    },
    offForearm: {
      joint: [off, F.shoulderHeight - A.upperLength, z],
      centre: [off, F.shoulderHeight - A.upperLength - A.foreLength / 2, z],
    },
    offHand: {
      joint: [off, F.shoulderHeight - A.upperLength - A.foreLength, z],
      centre: [off, F.shoulderHeight - A.upperLength - A.foreLength - A.handLength / 2, z],
    },
    thighLeft: { joint: [-B.hipSide, B.hip, 0], centre: [-B.hipSide, B.thighCentre, 0] },
    shinLeft: { joint: [-B.hipSide, B.knee, 0], centre: [-B.hipSide, B.shinCentre, 0] },
    thighRight: { joint: [B.hipSide, B.hip, 0], centre: [B.hipSide, B.thighCentre, 0] },
    shinRight: { joint: [B.hipSide, B.knee, 0], centre: [B.hipSide, B.shinCentre, 0] },
  };
}

/**
 * Every piece of the costume, once.
 *
 * This table is the single description of what a fighter wears, and it is
 * exported because two other things read it: `scripts/run-blender.mjs` writes it
 * into `asset-src/dimensions.json` so the Blender script builds exactly these
 * names on exactly these bones, and `scripts/check-warrior.mjs` asserts the
 * built `.glb` carries all of them and nothing else. A second copy of this list
 * in the authoring script would drift the first time a piece was renamed, and
 * the failure would be a piece that silently fell back to its primitive.
 */
export function costumePieces(): CostumePiece[] {
  const B = CONFIG.body;
  const F = CONFIG.fighter;
  const side = F.shoulderSide;
  const off = -F.shoulderSide;
  const z = F.shoulderFront;
  /**
   * One arm's three costume pieces, from the shoulder down.
   *
   * `R` is the sword side and `L` the off side, matching the leg suffixes and
   * the names the asset already carries -- the off arm's three pieces were
   * `upperArmL`, `forearmL` and `handL` before there was a second set, and
   * keeping them is what stops this being a rename of the asset as well as an
   * addition to it.
   */
  const armCostume = (suffix: "L" | "R", x: number): CostumePiece[] => {
    const A = CONFIG.arm;
    const elbow = F.shoulderHeight - A.upperLength;
    const wrist = elbow - A.foreLength;
    const bone = (part: string) =>
      (suffix === "R" ? `sword${part}` : `off${part}`) as BoneName;
    return [
      {
        name: `upperArmSkin${suffix}`,
        bone: bone("UpperArm"),
        material: "cloth",
        at: [x, F.shoulderHeight - A.upperLength / 2, z],
        primitive: { kind: "capsule", height: A.upperLength + 0.02, radius: A.upperRadius * 0.82 },
      },
      {
        name: `upperArm${suffix}`,
        bone: bone("UpperArm"),
        material: "cloth",
        at: [x, F.shoulderHeight - A.upperLength / 2, z],
        primitive: { kind: "capsule", height: A.upperLength, radius: A.upperRadius },
      },
      {
        name: `elbowCover${suffix}`,
        bone: bone("Forearm"),
        material: "cloth",
        at: [x, elbow, z],
        primitive: { kind: "sphere", diameter: A.foreRadius * 2.1 },
      },
      {
        name: `forearmSkin${suffix}`,
        bone: bone("Forearm"),
        material: "leather",
        at: [x, elbow - A.foreLength / 2, z],
        primitive: { kind: "capsule", height: A.foreLength + 0.02, radius: A.foreRadius * 0.82 },
      },
      {
        name: `forearm${suffix}`,
        bone: bone("Forearm"),
        material: "leather",
        at: [x, elbow - A.foreLength / 2, z],
        primitive: { kind: "capsule", height: A.foreLength, radius: A.foreRadius },
      },
      {
        name: `wristCover${suffix}`,
        bone: bone("Forearm"),
        material: "leather",
        at: [x, wrist, z],
        primitive: { kind: "sphere", diameter: A.handRadius * 2.1 },
      },
      {
        name: `hand${suffix}`,
        bone: bone("Hand"),
        material: "flesh",
        at: [x, wrist - A.handLength / 2, z],
        primitive: { kind: "capsule", height: A.handLength, radius: A.handRadius },
      },
    ];
  };

  const leg = (suffix: "L" | "R", side: -1 | 1): CostumePiece[] => {
    const x = side * B.hipSide;
    const thigh = suffix === "L" ? "thighLeft" : "thighRight";
    const shin = suffix === "L" ? "shinLeft" : "shinRight";
    return [
      {
        name: `thighSkin${suffix}`,
        bone: thigh,
        material: "cloth",
        at: [x, B.thighCentre, 0],
        primitive: { kind: "capsule", height: B.thighLength + 0.02, radius: B.thighRadius * 0.82 },
      },
      {
        name: `thigh${suffix}`,
        bone: thigh,
        material: "cloth",
        at: [x, B.thighCentre, 0],
        primitive: { kind: "capsule", height: 0.44, radius: 0.085 },
      },
      {
        name: `shinSkin${suffix}`,
        bone: shin,
        material: "leather",
        at: [x, B.shinCentre, 0],
        primitive: { kind: "capsule", height: B.shinLength + 0.02, radius: B.shinRadius * 0.82 },
      },
      {
        name: `shin${suffix}`,
        bone: shin,
        material: "leather",
        at: [x, B.shinCentre, 0],
        primitive: { kind: "capsule", height: 0.42, radius: 0.068 },
      },
      // The fallback keeps the old footprint only for a failed asset load. The
      // authored piece is Poly Haven's rounded LOD1 boot foot, recoloured as
      // worn leather and joined visually to the Ranger boot shaft.
      {
        name: `foot${suffix}`,
        bone: shin,
        material: "leather",
        at: [x, 0.0375, 0.055],
        primitive: { kind: "box", size: [0.11, 0.075, 0.26] },
      },
    ];
  };

  return [
    // ---- trunk ----
    {
      name: "belly",
      bone: "torso",
      material: "leather",
      at: [0, 1.16, 0],
      primitive: { kind: "box", size: [0.30, 0.18, 0.23] },
    },
    {
      name: "chest",
      bone: "torso",
      material: "cloth",
      at: [0, 1.34, 0],
      primitive: { kind: "box", size: [0.37, 0.34, 0.25] },
    },
    {
      name: "pauldronR",
      bone: "torso",
      material: "steel",
      at: [F.shoulderSide, 1.44, 0.01],
      primitive: { kind: "sphere", diameter: 0.20, scale: [1, 0.72, 1] },
    },
    {
      name: "pauldronL",
      bone: "torso",
      material: "steel",
      at: [-F.shoulderSide, 1.44, 0.01],
      primitive: { kind: "sphere", diameter: 0.20, scale: [1, 0.72, 1] },
    },
    // The one piece this session adds, and it is here to be *read* rather than
    // to be worn: from the Fixed camera at default zoom a helmed figure in steel
    // looks like the other helmed figure in steel, and the surcoat is the panel
    // large enough to carry a colour that says which is which at a glance.
    {
      name: "surcoat",
      bone: "torso",
      material: "side",
      at: [0, 1.24, 0],
      primitive: { kind: "box", size: [0.26, 0.44, 0.27] },
    },

    // ---- pelvis ----
    {
      name: "pelvis",
      bone: "pelvis",
      material: "cloth",
      at: [0, 0.94, 0],
      primitive: { kind: "box", size: [0.28, 0.16, 0.22] },
    },
    {
      name: "skirt",
      bone: "pelvis",
      material: "side",
      at: [0, 1.03, 0],
      primitive: { kind: "box", size: [0.33, 0.21, 0.27] },
    },

    // ---- head ----
    // The neck rides on the head rather than on the torso, because a head turned
    // by a blow that leaves a neck stump pointing the old way reads as a break in
    // the model rather than as a hit.
    {
      name: "neck",
      bone: "head",
      material: "flesh",
      at: [0, 1.53, 0],
      primitive: { kind: "cylinder", height: 0.10, diameter: 0.11 },
    },
    {
      name: "head",
      bone: "head",
      material: "flesh",
      at: [0, 1.635, 0],
      primitive: { kind: "sphere", diameter: 0.205 },
    },
    // The fallback is still a skullcap. The authored piece is an open Ranger
    // hood: it keeps the face readable and gives the orbit view a finished back.
    {
      name: "helm",
      bone: "head",
      material: "cloth",
      at: [0, 1.655, -0.004],
      primitive: { kind: "sphere", diameter: 0.235, scale: [1, 0.92, 1.04] },
    },

    // ---- free arm ----
    // Both arms, mirrored. The sword arm used to be missing here on purpose --
    // it was the one real arm and the whole point of the prototype, and a sleeve
    // on it would have been a costume on the subject being measured. There are
    // two real arms now, and half an armoured fighter reads as a bug rather
    // than as an instrument. `G` is the instrument.
    ...armCostume("R", side),
    ...armCostume("L", off),

    // ---- legs ----
    ...leg("L", -1),
    ...leg("R", 1),
  ];
}

/**
 * The fighter's colour, as linear RGB.
 *
 * Two panels carry it -- the surcoat and the skirt -- and nothing else does,
 * because a fighter dyed head to foot stops reading as armour. Crimson and blue
 * rather than two shades of one hue: the arena is lit by a warm sun through an
 * ACES curve, and two warm colours converge under it.
 */
export const FIGURE_SIDE_COLOURS: Readonly<Record<string, Triple>> = {
  left: [0.42, 0.06, 0.08],
  right: [0.07, 0.15, 0.42],
};

/**
 * One cloth material per fighter, tinted.
 *
 * Constructed beside the figure cloth rather than cloned from it. Babylon's
 * PBR clone creates fresh Texture wrappers; overwriting those with the shared
 * maps leaks the wrappers, while disposing them risks the image the palette
 * still owns. `followSurfaceMaps` shares the palette objects directly, including
 * maps that finish decoding later. `Figure.dispose` owns only this material.
 */
function sideCloth(prefix: string, cloth: Material): { material: Material; unfollow: () => void } {
  const name = `figure.side.${prefix}`;
  let tinted: PBRMaterial | StandardMaterial;
  if (cloth instanceof PBRMaterial) {
    tinted = new PBRMaterial(name, cloth.getScene());
    tinted.metallic = cloth.metallic;
    tinted.roughness = cloth.roughness;
    tinted.invertNormalMapX = cloth.invertNormalMapX;
    tinted.invertNormalMapY = cloth.invertNormalMapY;
    tinted.useMetallnessFromMetallicTextureBlue = cloth.useMetallnessFromMetallicTextureBlue;
    tinted.useRoughnessFromMetallicTextureAlpha = cloth.useRoughnessFromMetallicTextureAlpha;
    tinted.useRoughnessFromMetallicTextureGreen = cloth.useRoughnessFromMetallicTextureGreen;
    tinted.useAmbientOcclusionFromMetallicTextureRed = cloth.useAmbientOcclusionFromMetallicTextureRed;
  } else if (cloth instanceof StandardMaterial) {
    tinted = new StandardMaterial(name, cloth.getScene());
    tinted.specularColor.copyFrom(cloth.specularColor);
  } else {
    throw new Error(`cloth material ${cloth.name} has no supported tint constructor`);
  }
  const rgb = FIGURE_SIDE_COLOURS[prefix] ?? FIGURE_SIDE_COLOURS.left;
  // PBR calls it `albedoColor` and the standard material calls it
  // `diffuseColor`. The property probe keeps the tint assignment itself shared
  // between the browser's PBR palette and the headless StandardMaterial fixture.
  const target = tinted as unknown as { albedoColor?: Color3; diffuseColor?: Color3 };
  if (target.albedoColor) target.albedoColor = new Color3(rgb[0], rgb[1], rgb[2]);
  if (target.diffuseColor) target.diffuseColor = new Color3(rgb[0], rgb[1], rgb[2]);
  return { material: tinted, unfollow: followSurfaceMaps(cloth, tinted) };
}

/** Make imported glTF tangents use the same LH frame as Babylon primitives. */
export function normalizeImportedTangents(data: VertexData): void {
  const tangents = data.tangents;
  if (!tangents) return;
  for (let i = 0; i + 3 < tangents.length; i += 4) {
    tangents[i] = -tangents[i];
    tangents[i + 1] = -tangents[i + 1];
    tangents[i + 2] = -tangents[i + 2];
  }
}

/**
 * Turn every triangle round.
 *
 * glTF winds a front face the opposite way from Babylon, and Babylon's loader
 * does not fix that in the geometry -- it fixes it by setting the reversed
 * `sideOrientation` on the materials it creates for the file. These vertices
 * are leaving those materials behind for the arena's palette, so the
 * compensation has to come with them or every piece renders inside out: solid
 * from behind, invisible from in front, which reads as a missing costume rather
 * than as a back-to-front one.
 *
 * Measured rather than reasoned, because there is a second flip in the way and
 * the two are easy to talk yourself into cancelling. `VertexData.transform`
 * reverses the winding on its own when the matrix determinant is negative,
 * which it is here -- Babylon's glTF root mirrors X to change handedness. Both
 * flips are needed, and the check that says so is direct: on every mesh Babylon
 * builds itself, the cross product of a triangle's two edges *opposes* its
 * stored vertex normal, and after `transform` alone this data agreed with it on
 * all 13344 faces.
 */
function reverseWinding(data: VertexData): void {
  const indices = data.indices;
  if (!indices) return;
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const first = indices[i];
    indices[i] = indices[i + 2];
    indices[i + 2] = first;
  }
}

/** Where the authored costume is served from, relative to the site root. */
const COSTUME_URL = "/assets/warrior.glb";

/**
 * The costume's bytes, asked for once and as early as anything can be asked for.
 *
 * This runs at module load, which is several hundred milliseconds before the
 * first `Figure` exists: `buildArena` has Havok's wasm and a 1.5 MB HDRI to get
 * through first, and the fighters are built after both. Starting the request
 * here rather than at the first construction is the difference between the
 * costume being ready when it is wanted and a visible frame or two of boxes.
 *
 * Guarded on `window` because `fighter.ts` -- and therefore this file -- is
 * imported by `tests/view.test.mjs` and by `npm run measure`, neither of which
 * has a server to ask. A missing or broken asset resolves to `null` and every
 * piece keeps its primitive, which is the whole of the fallback.
 */
const costumeBytes: Promise<ArrayBuffer | null> =
  typeof window === "undefined" || typeof fetch !== "function"
    ? Promise.resolve(null)
    : fetch(COSTUME_URL)
        .then((response) => (response.ok ? response.arrayBuffer() : null))
        .catch(() => null);

/** Parsed once per scene: two fighters wear one asset. */
const costumes = new WeakMap<Scene, Promise<AssetContainer | null>>();
/**
 * The resolved half of `costumes`.
 *
 * A skinned graph cannot arrive after a fighter has been published. Picking,
 * the shadow list and the rig overlay all snapshot the meshes in its constructor;
 * swapping in new ones a frame later makes the visible person a stranger to all
 * three systems. `main.ts` therefore awaits `prepareWarriorFigure` before the
 * first bout, and every later rebuild reads this map synchronously.
 */
const preparedCostumes = new WeakMap<Scene, AssetContainer | null>();

function costumeFor(scene: Scene): Promise<AssetContainer | null> {
  const known = costumes.get(scene);
  if (known) return known;
  const pending = costumeBytes.then(async (raw) => {
    if (!raw) return null;
    try {
      // The container is deliberately *not* added to the scene. Its meshes are
      // a source of vertex data and nothing else: they are never rendered, are
      // not in `scene.meshes`, and so cannot be picked, lit, or swept up by
      // `main.ts`'s shadow-caster refresh.
      return await LoadAssetContainerAsync(new Uint8Array(raw), scene, {
        pluginExtension: ".glb",
      });
    } catch {
      return null;
    }
  });
  costumes.set(scene, pending);
  return pending;
}

/** Parse the one Warrior asset before any fighter can publish its visual graph. */
export async function prepareWarriorFigure(scene: Scene): Promise<void> {
  preparedCostumes.set(scene, await costumeFor(scene));
}

function hasExactSkin(container: AssetContainer): boolean {
  if (container.skeletons.length !== 1) return false;
  const skeleton = container.skeletons[0];
  if (skeleton.bones.length !== SKIN_BONE_ORDER.length) return false;
  const found = new Map(skeleton.bones.map((bone) => [bone.name, bone]));
  if (found.size !== SKIN_BONE_ORDER.length) return false;
  for (const name of SKIN_BONE_ORDER) {
    const bone = found.get(name);
    if (!bone || !bone.getTransformNode()) return false;
    const parentName = SKIN_BONE_PARENT[name];
    if ((bone.getParent()?.name ?? null) !== parentName) return false;
    if (parentName && bone.getTransformNode()?.parent !== found.get(parentName)?.getTransformNode()) return false;
  }
  return container.meshes.some((mesh) => mesh.skeleton === skeleton && mesh.getTotalVertices() > 0);
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

const LIMB_SKIN_BONE: Readonly<Record<string, BoneName>> = Object.freeze({
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

const regionOf = (name: string): BoneName | null => {
  const marker = name.lastIndexOf("__region_");
  if (marker < 0) return null;
  const suffix = name.slice(marker + "__region_".length);
  // Babylon expands one glTF mesh with several primitives into sibling meshes
  // named `<source>_primitiveN`. The anatomical owner precedes that loader
  // suffix; treating the whole tail as a bone name rejects a valid skin and
  // silently restores the disjoint primitive mannequin.
  const candidate = suffix.replace(/_primitive\d+$/, "") as BoneName;
  return Object.hasOwn(SKIN_BONE_PARENT, candidate) ? candidate : null;
};

const inSkinSubtree = (candidate: BoneName, root: BoneName): boolean => {
  for (let at: BoneName | null = candidate; at; at = SKIN_BONE_PARENT[at]) {
    if (at === root) return true;
  }
  return false;
};

/** Pure half of severance, exported so the crossing-weight rule can be mutated. */
export function redirectedSkinWeights(
  owner: BoneName,
  cuts: Iterable<BoneName>,
  boneIndices: ReadonlyMap<BoneName, number>,
  indexBones: ReadonlyMap<number, BoneName>,
  sourceIndices: readonly number[],
  sourceWeights: readonly number[],
): { indices: number[]; weights: number[] } {
  const indices = Array.from(sourceIndices);
  const weights = Array.from(sourceWeights);
  for (const cut of cuts) {
    const loose = inSkinSubtree(owner, cut);
    const destination = loose ? cut : SKIN_BONE_PARENT[cut];
    const destinationIndex = destination ? boneIndices.get(destination) : undefined;
    if (destinationIndex === undefined) continue;
    for (let at = 0; at < weights.length; at += 1) {
      if (weights[at] <= 0) continue;
      const influence = indexBones.get(Math.round(indices[at]));
      if (!influence || inSkinSubtree(influence, cut) === loose) continue;
      indices[at] = destinationIndex;
    }
  }
  for (let vertex = 0; vertex < weights.length; vertex += 4) {
    const total = weights[vertex] + weights[vertex + 1] + weights[vertex + 2] + weights[vertex + 3];
    if (total <= 0) continue;
    for (let slot = 0; slot < 4; slot += 1) weights[vertex + slot] /= total;
  }
  return { indices, weights };
}

const handPose = (kind: WeaponKind): "open" | "grip" | "strapped" =>
  kind === "empty" ? "open" : isStrapped(kind) ? "strapped" : "grip";

function selectHandMorphs(mesh: Mesh, loadout: Record<HandName, WeaponKind> | undefined): void {
  const manager = mesh.morphTargetManager;
  if (!manager || !loadout) return;
  const wanted: Record<HandName, string> = {
    primary: `hand.primary.${handPose(loadout.primary)}`,
    secondary: `hand.secondary.${handPose(loadout.secondary)}`,
  };
  for (let index = 0; index < manager.numTargets; index += 1) {
    const target = manager.getTarget(index);
    if (!/^hand\.(primary|secondary)\.(open|grip|strapped)$/.test(target.name)) continue;
    target.influence = target.name === wanted.primary || target.name === wanted.secondary ? 1 : 0;
  }
}

/**
 * What a fighter looks like.
 *
 * Deliberately cosmetic, and genuinely so. It used to be a rigid figure
 * parented to the torso alone, with its own hips and knees that it animated
 * itself -- which was right while the body below it was a single capsule, and
 * became a lie the moment the body became eleven jointed bodies that move
 * independently. A head that lolls under a blow while its helmet stays level, or
 * a leg that has been cut off and is still wearing its boot back on the fighter,
 * is worse than no costume at all.
 *
 * So every piece here is a child of the physics part it covers, and this class
 * has no update method: it builds and then it is finished. Whatever the solver
 * does to a part, the part's mesh does, and the costume rides along for free --
 * including falling to the floor when the part it is on is severed, because
 * Babylon disposes and transforms children with their parent. That is also why
 * the parts themselves are invisible rather than absent: they are the transform
 * the costume needs.
 *
 * Nothing here carries authority. These meshes own no collision and decide no
 * hit; the one thing they are asked for besides being looked at is being
 * pickable, so that hovering a fighter can outline the piece under the cursor.
 *
 * **Every piece is built as a primitive first and re-skinned in place when the
 * authored asset arrives.** That is a deliberate choice over building the
 * authored meshes instead, and the reason is identity: `Fighter` snapshots this
 * object's meshes into the set that answers `owns()`, `main.ts` snapshots them
 * into the shadow map's render list, and the rig overlay hides them by
 * reference and expects to put back exactly what it hid. All three were taken
 * before an asynchronous load can possibly have finished, so a costume built out
 * of *new* meshes would arrive unpickable, shadowless and invisible to `G`.
 * Swapping the vertex data under a mesh that already exists changes none of
 * those. It also gives the fallback for free: a piece the asset does not name
 * simply never gets re-skinned.
 */
export class Figure {
  /** Every mesh built here, for the rig overlay to hide and a pick to find. */
  readonly pieces: Mesh[] = [];

  /** The piece under each authored node name, and the bone it rides on. */
  private readonly byName = new Map<string, { mesh: Mesh; bone: BoneName }>();
  /** The only per-fighter material. Its textures remain palette-shared. */
  private sideMaterial: Material;
  private unfollowSideMaps: () => void;
  /** The instantiated graph is not parented to a physics mesh and owns itself. */
  private skinRoots: Node[] = [];
  private skinSkeleton: Skeleton | null = null;
  private skinBindings: SkinBinding[] = [];
  private skinRegions: SkinRegion[] = [];
  private severedSkinRoots = new Set<BoneName>();
  private renderObserver: Observer<Scene> | null = null;
  private skinAnimations: { stop(): void; dispose(): void }[] = [];

  constructor(
    scene: Scene,
    rig: FigureRig,
    materials: FigureMaterials,
    options: {
      scale?: number;
      authored?: boolean;
      loadout?: Record<HandName, WeaponKind>;
    } = {},
  ) {
    const frames = boneFrames();
    const scale = options.scale ?? 1;
    const side = sideCloth(rig.prefix, materials.cloth);
    this.sideMaterial = side.material;
    this.unfollowSideMaps = side.unfollow;

    const paint = (which: PieceMaterial): Material =>
      which === "side" ? this.sideMaterial : materials[which];

    for (const piece of costumePieces()) {
      const parent = rig[piece.bone];
      const centre = frames[piece.bone].centre;
      const shape = piece.primitive;
      const name = `${rig.prefix}.figure.${piece.name}`;

      let mesh: Mesh;
      switch (shape.kind) {
        case "box":
          mesh = MeshBuilder.CreateBox(
            name,
            { width: shape.size[0] * scale, height: shape.size[1] * scale, depth: shape.size[2] * scale },
            scene,
          );
          break;
        case "capsule":
          mesh = MeshBuilder.CreateCapsule(
            name,
            { height: shape.height * scale, radius: shape.radius * scale, tessellation: 12, subdivisions: 1 },
            scene,
          );
          break;
        case "sphere":
          mesh = MeshBuilder.CreateSphere(name, { diameter: shape.diameter * scale, segments: 12 }, scene);
          if (shape.scale) mesh.scaling.set(shape.scale[0], shape.scale[1], shape.scale[2]);
          break;
        case "cylinder":
          mesh = MeshBuilder.CreateCylinder(
            name,
            { height: shape.height * scale, diameter: shape.diameter * scale, tessellation: 12 },
            scene,
          );
          break;
      }

      // The parent's own centre is subtracted here rather than being baked into
      // a number nobody can check, which is how the whole figure stays readable
      // against a tape measure.
      mesh.position.set(
        (piece.at[0] - centre[0]) * scale,
        (piece.at[1] - centre[1]) * scale,
        (piece.at[2] - centre[2]) * scale,
      );
      mesh.material = paint(piece.material);
      mesh.parent = parent.mesh;
      mesh.receiveShadows = true;
      // Pickable, and explicitly so: this used to be turned off with the note
      // that the hero is never the target, which stopped being true the moment
      // there were two fighters and either could be locked on to. The capsules
      // underneath are invisible, so these are the only meshes a ray can find.
      mesh.isPickable = true;
      this.pieces.push(mesh);
      this.byName.set(piece.name, { mesh, bone: piece.bone });
    }

    if (options.authored === false) return;

    const prepared = preparedCostumes.get(scene);
    if (prepared && hasExactSkin(prepared)) {
      this.installSkin(scene, prepared, rig, options.loadout);
      return;
    }
    if (prepared) {
      // Compatibility with the previous rigid asset while the skinned authoring
      // pipeline is being replaced. Once the file contains a skin, a malformed
      // one must fall through to primitives rather than being worn as rigid
      // islands and recreating the defect the skin exists to remove.
      if (prepared.skeletons.length === 0) this.wear(prepared, frames);
      return;
    }

    // Direct headless fixtures never call the browser's prepare seam and keep
    // their immediate primitive fallback. A late rigid file is safe to apply in
    // place because it preserves every mesh identity; a late skin is not.
    void costumeFor(scene).then((container) => {
      if (container && container.skeletons.length === 0) this.wear(container, frames);
    });
  }

  /**
   * Stop skin weights from spanning a physics joint that no longer exists.
   *
   * Each authored mesh names the anatomical region that owns its triangles.
   * On the loose side of a cut, influence from the retained body is folded into
   * the cut root; on the retained side, influence from the loose subtree is
   * folded into the cut's parent. Starting from the authored arrays every time
   * makes several cuts commute well enough to stay local -- a hand cut after an
   * upper arm cut cannot inherit the upper arm's already rewritten weights.
   */
  sever(limbKey: string): void {
    const root = LIMB_SKIN_BONE[limbKey];
    if (!root || root === "torso" || !this.skinSkeleton) return;
    if (this.severedSkinRoots.has(root)) return;
    this.severedSkinRoots.add(root);

    const byIndex = new Map<number, BoneName>();
    const byName = new Map<BoneName, number>();
    for (const bone of this.skinSkeleton.bones) {
      if (!Object.hasOwn(SKIN_BONE_PARENT, bone.name)) continue;
      const name = bone.name as BoneName;
      byIndex.set(bone.getIndex(), name);
      byName.set(name, bone.getIndex());
    }

    for (const region of this.skinRegions) {
      const { indices, weights } = redirectedSkinWeights(
        region.owner,
        this.severedSkinRoots,
        byName,
        byIndex,
        region.indices,
        region.weights,
      );
      region.mesh.updateVerticesData(VertexBuffer.MatricesIndicesKind, indices, false, false);
      region.mesh.updateVerticesData(VertexBuffer.MatricesWeightsKind, weights, false, false);
    }
  }

  /** Release the one material this figure, rather than the arena palette, owns. */
  dispose(): void {
    if (this.renderObserver) {
      this.sideMaterial.getScene().onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }
    for (const animation of this.skinAnimations) {
      animation.stop();
      animation.dispose();
    }
    this.skinAnimations.length = 0;
    for (const binding of this.skinBindings) binding.bone.linkTransformNode(null);
    for (const root of this.skinRoots) root.dispose(false, false);
    this.skinRoots.length = 0;
    this.skinSkeleton?.dispose();
    this.skinSkeleton = null;
    this.skinBindings.length = 0;
    this.skinRegions.length = 0;
    this.severedSkinRoots.clear();
    this.unfollowSideMaps();
    this.sideMaterial.dispose(false, false);
  }

  /**
   * Instantiate one independent skin and connect its thirteen visual bones to
   * the thirteen authoritative, scene-root physics meshes.
   */
  private installSkin(
    scene: Scene,
    container: AssetContainer,
    rig: FigureRig,
    loadout: Record<HandName, WeaponKind> | undefined,
  ): void {
    const before = new Set(scene.meshes);
    const entries = container.instantiateModelsToScene(
      (source) => `${rig.prefix}.figure.${source}`,
      false,
      { doNotInstantiate: true },
    );
    const skeleton = entries.skeletons.length === 1 ? entries.skeletons[0] : null;
    const meshes = scene.meshes.filter((mesh): mesh is Mesh =>
      mesh instanceof Mesh && !before.has(mesh) &&
      mesh.skeleton === skeleton && mesh.getTotalVertices() > 0);

    // The source was checked before cloning; repeat the identity-bearing half
    // on the clone because Babylon remaps linked transform nodes during this
    // call, and a failed remap is a skin that moves nowhere.
    const bones = skeleton ? new Map(skeleton.bones.map((bone) => [bone.name, bone])) : new Map();
    const exactBones = skeleton !== null && meshes.length > 0 && SKIN_BONE_ORDER.every((name) => {
      const bone = bones.get(name);
      const parentName = SKIN_BONE_PARENT[name];
      return bone?.getTransformNode() &&
        (bone.getParent()?.name ?? null) === parentName &&
        (!parentName || bone.getTransformNode()?.parent === bones.get(parentName)?.getTransformNode());
    });
    const regions = meshes.map((mesh): SkinRegion | null => {
      const owner = regionOf(mesh.name);
      const indices = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind);
      const weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);
      const width = mesh.getTotalVertices() * 4;
      if (!owner || !indices || !weights || indices.length !== width || weights.length !== width) return null;
      return { mesh, owner, indices: Array.from(indices), weights: Array.from(weights) };
    });
    const rootNode = bones.get("torso")?.getTransformNode() ?? null;
    if (!exactBones || regions.some((region) => region === null) || !rootNode?.parent) {
      for (const root of entries.rootNodes) root.dispose(false, false);
      for (const animation of entries.animationGroups) animation.dispose();
      skeleton?.dispose();
      return;
    }
    this.skinRegions = regions as SkinRegion[];

    // The GLTF graph is authored around the arena's model origin. Put that
    // whole bind pose at this fighter's construction transform before caching
    // any bone bind matrices: otherwise the delta formula below would preserve
    // both fighters faithfully at the asset origin. This is one static parent,
    // not a fourteenth bone and not a source of motion.
    const placement = new TransformNode(`${rig.prefix}.figure.placement`, scene);
    placement.rotationQuaternion = Quaternion.Identity();
    const modelTorso = Matrix.Translation(0, boneFrames().torso.centre[1], 0);
    const modelTorsoInverse = Matrix.Identity();
    modelTorso.invertToRef(modelTorsoInverse);
    const physicsTorso = Matrix.Identity();
    Matrix.ComposeToRef(
      Vector3.OneReadOnly,
      rig.torso.mesh.rotationQuaternion ?? Quaternion.Identity(),
      rig.torso.mesh.position,
      physicsTorso,
    );
    const placementMatrix = modelTorsoInverse.multiply(physicsTorso);
    placementMatrix.decompose(placement.scaling, placement.rotationQuaternion, placement.position);
    for (const graphRoot of entries.rootNodes) graphRoot.parent = placement;
    placement.computeWorldMatrix(true);

    const tintable = meshes.filter((mesh) => mesh.material?.name === "cloth_surcoat");
    if (tintable.length > 0) {
      const authoredSide = sideCloth(rig.prefix, tintable[0].material as Material);
      this.unfollowSideMaps();
      this.sideMaterial.dispose(false, false);
      this.sideMaterial = authoredSide.material;
      this.unfollowSideMaps = authoredSide.unfollow;
      for (const mesh of tintable) mesh.material = this.sideMaterial;
    }

    const fallback = this.pieces.splice(0);
    this.byName.clear();
    for (const mesh of fallback) mesh.dispose(false, false);

    for (const mesh of meshes) {
      mesh.receiveShadows = true;
      mesh.isPickable = true;
      selectHandMorphs(mesh, loadout);
      this.pieces.push(mesh);
    }
    // GLTF vertex buffers are immutable by default. Severance is a one-way
    // visual state change, so make only the two skin attributes it rewrites
    // updatable and keep the authored arrays above as the reset point for every
    // later cut.
    for (const region of this.skinRegions) {
      region.mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, region.indices, true);
      region.mesh.setVerticesData(VertexBuffer.MatricesWeightsKind, region.weights, true);
    }

    const bindings = new Map<BoneName, SkinBinding>();
    for (const name of SKIN_BONE_ORDER) {
      const bone = bones.get(name) as Bone;
      const node = bone.getTransformNode() as TransformNode;
      const parentName = SKIN_BONE_PARENT[name];
      const binding: SkinBinding = {
        bone,
        node,
        part: rig[name],
        parent: parentName ? bindings.get(parentName) ?? null : null,
        bindWorld: node.computeWorldMatrix(true).clone(),
        physicsBindInverse: Matrix.Identity(),
        partWorld: Matrix.Identity(),
        delta: Matrix.Identity(),
        world: Matrix.Identity(),
        inverse: Matrix.Identity(),
        local: Matrix.Identity(),
        position: new Vector3(),
        rotation: new Quaternion(),
        scale: new Vector3(1, 1, 1),
      };
      Matrix.ComposeToRef(
        Vector3.OneReadOnly,
        binding.part.mesh.rotationQuaternion ?? Quaternion.Identity(),
        binding.part.mesh.position,
        binding.partWorld,
      );
      binding.partWorld.invertToRef(binding.physicsBindInverse);
      bindings.set(name, binding);
      this.skinBindings.push(binding);
    }

    const root = this.skinBindings[0];
    // `hasExactSkin` cannot know whether instantiation retained the loader's
    // handedness root. The guard above refuses a clone that did not.
    rootNode.parent.computeWorldMatrix(true).invertToRef(root.inverse);

    this.skinRoots = [placement];
    this.skinSkeleton = skeleton;
    this.skinAnimations = entries.animationGroups;
    for (const animation of this.skinAnimations) animation.stop();
    this.syncSkin();
    this.renderObserver = scene.onBeforeRenderObservable.add(() => this.syncSkin());
  }

  /** Copy the solver-achieved pose into the linked GLTF joint hierarchy. */
  private syncSkin(): void {
    for (const binding of this.skinBindings) {
      const rotation = binding.part.mesh.rotationQuaternion ?? Quaternion.Identity();
      Matrix.ComposeToRef(Vector3.OneReadOnly, rotation, binding.part.mesh.position, binding.partWorld);
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
        binding.world.multiplyToRef(binding.inverse, binding.local);
      }
      binding.local.decompose(binding.scale, binding.rotation, binding.position);
      binding.node.position.copyFrom(binding.position);
      binding.node.rotationQuaternion ??= Quaternion.Identity();
      binding.node.rotationQuaternion.copyFrom(binding.rotation);
      binding.node.scaling.copyFrom(binding.scale);
    }
  }

  /**
   * Put the authored geometry on, one piece at a time.
   *
   * The asset is authored in the fighter's own upright frame with each piece cut
   * at the joint of the bone it rides on, so what lands here is that piece's
   * vertices in world metres of a warrior standing at the origin. Two transforms
   * bring it home: the source's world matrix, which is what folds in both the
   * node's joint translation and the handedness flip Babylon's glTF loader hangs
   * on `__root__`; and a translation by minus the bone's capsule centre, which
   * is the origin of the local frame the mesh actually lives in. Neither is a
   * fudge factor -- the first comes out of the file and the second out of
   * `config.ts` -- and a piece that lands in the wrong place is therefore a
   * piece that was authored in the wrong place.
   *
   * Nothing here is conditional on the piece being *right*: a node whose
   * geometry is nonsense produces a nonsense costume, which is what
   * `scripts/check-warrior.mjs` exists to refuse before the file is committed.
   * What is conditional is the node being *there*.
   */
  private wear(container: AssetContainer, frames: Record<BoneName, BoneFrame>): void {
    for (const source of container.meshes) {
      const worn = this.byName.get(source.name);
      if (!worn || worn.mesh.isDisposed()) continue;
      if (source.getTotalVertices() === 0) continue;

      const centre = frames[worn.bone].centre;
      // `forceCopy`, and it is not an optimisation to remove: `transform` works
      // in place, both fighters read the same source, and sharing the buffer
      // would leave the second one wearing the first one's offsets.
      const data = VertexData.ExtractFromMesh(source as Mesh, false, true);
      data.transform(
        source
          .computeWorldMatrix(true)
          .multiply(Matrix.Translation(-centre[0], -centre[1], -centre[2])),
      );
      normalizeImportedTangents(data);
      reverseWinding(data);
      data.applyToMesh(worn.mesh);
      // The primitive's offset and squash were how *it* was placed; the authored
      // piece carries its own position in its vertices, so both go back to
      // nothing rather than being applied twice.
      worn.mesh.position.setAll(0);
      worn.mesh.scaling.setAll(1);
    }
  }
}
