import type { SolidSense } from "../core/mind/object-senses.ts";
import { cos, sin } from "../core/math/real.ts";
import { deepFreeze } from "../core/state.ts";
import type { Side } from "../core/spec/body.ts";
import type { Vec3 } from "../core/spec/quantity.ts";
import { cryptFurnishing } from "../environment/furniture.ts";

/** Court columns leave open routes on either side of its central obstruction, m. */
const court = [[0, 0], [-3, -3], [-3, 3], [3, -3], [3, 3]].map(([x, z], i) => cryptFurnishing("column", `court.column.${i}`, x!, z!));

/** A stage's content and spawn policy, independent of either renderer or physics engine. */
export const LEVELS = deepFreeze({
  open: { label: "Open stage", gap: { default: 4, min: 0, max: 24 }, furniture: [] as typeof court,
    spawns: { left: { direction: [-1, 0, 0], heading: 0 }, right: { direction: [1, 0, 0], heading: 0 } } },
  "obstacle-court": { label: "Column court", gap: { default: 6, min: 4, max: 8 }, furniture: court,
    spawns: { left: { direction: [-1, 0, 0], heading: 0 }, right: { direction: [1, 0, 0], heading: 0 } } },
});

export type ArenaLevel = keyof typeof LEVELS;

/** A recipe's level must exist; a misspelled stage never silently changes its environment. */
export function levelDefinition(level: ArenaLevel = "open") {
  if (!Object.hasOwn(LEVELS, level)) throw new Error(`unknown Arena level ${level}`);
  return LEVELS[level];
}

/** Spawn pairs scale only within their level's allowed gap; geometry is checked after posing. */
export function levelSpawn(level: ArenaLevel, side: Side, gap?: number): { position: Vec3; heading: number } {
  const definition = levelDefinition(level), distance = gap ?? definition.gap.default;
  if (!Number.isFinite(distance) || distance <= 0 || distance < definition.gap.min || distance > definition.gap.max)
    throw new Error(`invalid starting gap ${distance} for ${level}`);
  const spawn = definition.spawns[side];
  return { position: spawn.direction.map(v => v * distance / 2) as unknown as Vec3, heading: spawn.heading };
}

/** Conservative overlap of posed collider bounds with a level's boxes or hull bounds. */
function overlaps(body: SolidSense, solid: SolidSense): boolean {
  if (body.kind !== "box") throw new Error("spawn collider bounds must be boxes");
  let centre: Vec3, size: Vec3, turn = 0;
  switch (solid.kind) {
    case "box": ({ centre, size } = solid); turn = solid.turn ?? 0; break;
    case "hull": {
      const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
      for (const p of solid.points) for (let k = 0; k < 3; k++) { low[k] = Math.min(low[k]!, p[k]!); high[k] = Math.max(high[k]!, p[k]!); }
      centre = low.map((v, k) => (v + high[k]!) / 2) as unknown as Vec3;
      size = low.map((v, k) => high[k]! - v) as unknown as Vec3;
      break;
    }
    default: { const never: never = solid; throw new Error(`unknown level solid ${never}`); }
  }
  const c = cos(turn), s = sin(turn), dx = body.centre[0] - centre[0], dz = body.centre[2] - centre[2];
  return Math.abs(body.centre[1] - centre[1]) < (body.size[1] + size[1]) / 2
    && Math.abs(c * dx - s * dz) < (Math.abs(c) * body.size[0] + Math.abs(s) * body.size[2] + size[0]) / 2
    && Math.abs(s * dx + c * dz) < (Math.abs(s) * body.size[0] + Math.abs(c) * body.size[2] + size[2]) / 2;
}

/** A spawn clears every solid above its supporting floor, with attached loadout geometry included. */
export function spawnClearanceFaults(bounds: readonly SolidSense[], solids: readonly SolidSense[]): string[] {
  return bounds.flatMap(body => solids.filter(solid => solid.name !== "ground" && overlaps(body, solid))
    .map(solid => `${body.name} overlaps ${solid.name} at spawn`));
}
