/** The arena's orbit camera: its bearing and elevation, rad, and its distance, m, with the distance's and elevation's
 * limits. Set by eye (`docs/reference/look.md#arena-camera`). */
export const ORBIT = Object.freeze({ azimuth: 0, pitch: 0.32, distance: 7, nearest: 2.5, farthest: 16, lowest: 0.05, highest: 1.35 });

interface OrbitPoint { readonly x: number; readonly y: number; readonly z: number }

/** Where the orbit camera stands: `distance` from `target`, raised `pitch`, looking along bearing `azimuth`. */
export function orbitPosition(target: OrbitPoint, azimuth: number, pitch: number, distance: number): [number, number, number] {
  const along = Math.cos(pitch) * distance;
  return [target.x - Math.sin(azimuth) * along, target.y + Math.sin(pitch) * distance, target.z - Math.cos(azimuth) * along];
}
