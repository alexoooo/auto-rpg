import { readGlb, type DecodeMeshopt } from "../art/glb.ts";
import { deepFreeze } from "../../state.ts";
import { SIDES } from "../bilateral.ts";

/**
 * **The crypt skeleton as the world sees it**: the pieces of `assets/art/environment/skeleton/skeleton.glb`
 * (Blender Studio's realistic skeleton, CC0; its README), each carried rigidly by the core segment
 * its bone belongs to. Like the humans' skin (`skin.ts`) it reads the segments' achieved transforms
 * and nothing else, owns no collision and decides nothing.
 *
 * The file holds one piece per part of the skeleton, its vertices in that part's frame, in the
 * game's left-handed coordinates, which are the body frame's: nothing is converted. A part's place
 * in the body is its bind (`assets/skeleton/bind.json`, the fist build), which is the skeleton
 * spec's reference pose (`src/core/bodies/human/skeleton.ts`), so a piece holds its bind relative to its
 * segment's reference frame and at the reference pose shows exactly as authored.
 *
 * The neck rides the head, as de Leva's head runs to the cervicale; the ribcage and collars the
 * upper trunk; the lumbar spine the middle trunk; the pelvis the lower trunk; the palm and the
 * fingers the hand. The roll ring has no piece (the radius and ulna span it), and the whole closed
 * hand (`*.wrist`) is not shown: the palm and fist pieces split that same hand.
 */
export const SKELETON_PIECES: Readonly<Record<string, { readonly part: string; readonly segment: string }>> = deepFreeze({
  "head.head": { part: "head.head", segment: "head" },
  "head.neck": { part: "head.neck", segment: "head" },
  "trunk.core": { part: "trunk.core", segment: "upperTrunk" },
  "primary.collar": { part: "primary.collar", segment: "upperTrunk" },
  "secondary.collar": { part: "secondary.collar", segment: "upperTrunk" },
  "trunk.waist": { part: "trunk.waist", segment: "middleTrunk" },
  "legs.pelvis": { part: "legs.pelvis", segment: "lowerTrunk" },
  ...Object.fromEntries([...SIDES].reverse().flatMap((side) => {
    const arm = side === "right" ? "primary" : "secondary", leg = side === "right" ? "R" : "L";
    return [
      [`${arm}.upperArm`, { part: `${arm}.upperArm`, segment: `upperArm.${side}` }],
      [`${arm}.forearm`, { part: `${arm}.forearm`, segment: `forearm.${side}` }],
      [`${arm}.wrist.bare`, { part: `${arm}.wrist`, segment: `hand.${side}` }],
      [`${arm}.fist`, { part: `${arm}.fist`, segment: `hand.${side}` }],
      [`legs.thigh${leg}`, { part: `legs.thigh${leg}`, segment: `thigh.${side}` }],
      [`legs.shin${leg}`, { part: `legs.shin${leg}`, segment: `shank.${side}` }],
      [`legs.foot${leg}`, { part: `legs.foot${leg}`, segment: `foot.${side}` }],
    ];
  })),
});

/** One piece of the art: its vertices in its part's frame, and the eye sockets' centres on the head. */
interface SkeletonPiece {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly colors: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly eyes?: readonly (readonly number[])[];
}
export type SkeletonArt = ReadonlyMap<string, SkeletonPiece>;

interface Primitive { attributes: { POSITION: number; NORMAL: number; TEXCOORD_0: number; COLOR_0: number }; indices: number }
interface Asset { meshes: { name: string; primitives: Primitive[]; extras?: { eyes?: number[][] } }[] }

/** The pieces of a `skeleton.glb`'s bytes. */
export async function parseSkeletonArt(buffer: ArrayBuffer, decode?: DecodeMeshopt): Promise<SkeletonArt> {
  const glb = await readGlb<Asset>(buffer, "the skeleton's art", decode);
  const art = new Map<string, SkeletonPiece>();
  for (const mesh of glb.json.meshes) {
    if (mesh.primitives.length !== 1) throw new Error(`the skeleton piece ${mesh.name} must have one primitive`);
    const primitive = mesh.primitives[0]!, eyes = mesh.extras?.eyes;
    art.set(mesh.name, {
      positions: glb.floats(primitive.attributes.POSITION), normals: glb.floats(primitive.attributes.NORMAL),
      uvs: glb.floats(primitive.attributes.TEXCOORD_0), colors: glb.floats(primitive.attributes.COLOR_0),
      indices: glb.indices(primitive.indices),
      ...(eyes ? { eyes } : {}),
    });
  }
  return art;
}
