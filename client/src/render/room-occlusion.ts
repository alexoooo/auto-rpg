export type RoomProjectionPoint = Readonly<{ x: number; y: number; depth: number }>;
export type RoomWorldPoint = Readonly<{ x: number; y: number; z: number }>;
export type RoomOcclusionFace = Readonly<{
  key: string;
  corners: readonly RoomWorldPoint[];
}>;

export type RoomProjector = (point: RoomWorldPoint) => RoomProjectionPoint;

const overlaps = (
  a: Readonly<{ left: number; right: number; top: number; bottom: number }>,
  b: Readonly<{ left: number; right: number; top: number; bottom: number }>,
): boolean => a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;

/**
 * A cutaway is a local readability effect, never a topology choice. A face
 * must both cover the hero on screen and sit in front of the hero; room edges
 * elsewhere and walls behind the figure remain fully solid.
 */
export function chooseLocalWallCutaways(
  faces: readonly RoomOcclusionFace[], hero: Readonly<{ x: number; z: number }>,
  project: RoomProjector, marginPixels = 18,
): ReadonlySet<string> {
  if (!Number.isFinite(marginPixels) || marginPixels < 0) {
    throw new RangeError("room cutaway margin must be finite and non-negative");
  }
  const heroFeet = project({ x: hero.x, y: 0.05, z: hero.z });
  const heroHead = project({ x: hero.x, y: 1.75, z: hero.z });
  const heroBounds = {
    left: Math.min(heroFeet.x, heroHead.x) - marginPixels,
    right: Math.max(heroFeet.x, heroHead.x) + marginPixels,
    top: Math.min(heroFeet.y, heroHead.y) - marginPixels,
    bottom: Math.max(heroFeet.y, heroHead.y) + marginPixels,
  };
  const heroDepth = (heroFeet.depth + heroHead.depth) / 2;
  const cutaways = new Set<string>();
  for (const face of faces) {
    if (face.corners.length === 0) continue;
    const projected = face.corners.map(project);
    const bounds = {
      left: Math.min(...projected.map(({ x }) => x)),
      right: Math.max(...projected.map(({ x }) => x)),
      top: Math.min(...projected.map(({ y }) => y)),
      bottom: Math.max(...projected.map(({ y }) => y)),
    };
    if (Math.min(...projected.map(({ depth }) => depth)) < heroDepth && overlaps(bounds, heroBounds)) {
      cutaways.add(face.key);
    }
  }
  return cutaways;
}
