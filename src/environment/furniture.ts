import { cos, sin } from "../core/math/real.ts";
import type { SolidSense } from "../core/mind/object-senses.ts";

/** Footprints shared by the Crypt kit and its physical furnishings, width, depth and height, m
 * (`docs/reference/look.md#crypt-rooms`). */
export const CRYPT_FURNITURE = {
  tomb: [2.5, 1.15, 1.1], column: [.8, .8, 2.65], altar: [2.4, 1.1, 1.05],
  bench: [1.7, .55, .65], rack: [1.8, .6, 1.9], cluster: [1.8, 1.5, .55],
} as const;

/** Open frames obstruct feet, not vision; this grant is independent of collision height. */
const CRYPT_SIGHT = { tomb: false, column: true, altar: false, bench: false, rack: false, cluster: false } as const;

export interface KitPlacement { readonly piece: string; readonly x: number; readonly z: number; readonly turn: number; readonly obstacleId?: string }

/** One furnishing's visual placement, collision box, navigation footprint and sight permission. */
export function cryptFurnishing(piece: keyof typeof CRYPT_FURNITURE, id: string, x: number, z: number, turn = 0) {
  const [width, depth, height] = CRYPT_FURNITURE[piece], quarter = turn / (Math.PI / 2);
  const cardinal = Number.isInteger(quarter), odd = Math.abs(quarter % 2) === 1;
  const c = cardinal ? (odd ? 0 : 1) : Math.abs(cos(turn)), s = cardinal ? (odd ? 1 : 0) : Math.abs(sin(turn));
  const solid: SolidSense = { name: id, kind: "box", centre: [x, height / 2, z], size: [width, height, depth], turn };
  return {
    solid,
    placement: { piece, x, z, turn, obstacleId: id } satisfies KitPlacement,
    obstacle: { id, x, z, width: c * width + s * depth, depth: s * width + c * depth, height, blocksSight: CRYPT_SIGHT[piece] },
  };
}
