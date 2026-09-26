import type { BodyFamily } from "../golem/family.ts";
import { NAMED_BUILDS, type NamedBuild } from "../golem/roster.ts";
import { SKELETON_BUILDS } from "../golem/skeleton/presets.ts";

/** One family a dungeon spawn may be, its weight among the families, and the builds it is drawn from. */
export interface EnemyFamily {
  readonly family: BodyFamily;
  readonly weight: number;
  readonly builds: readonly NamedBuild[];
}

/**
 * Who a dungeon spawn may be: a family by weight, then a build of it, uniformly. The weights are starting values, to
 * be judged in play. Humans are left out until their cost is measured: each skins about 130,000 vertices on the CPU
 * every frame, hidden or not. `NAMED_BUILDS` is the research pool and is only read here, never widened.
 */
export const DUNGEON_ENEMIES: readonly EnemyFamily[] = Object.freeze([
  Object.freeze({ family: "golem", weight: 0.55, builds: NAMED_BUILDS }),
  Object.freeze({ family: "skeleton", weight: 0.45, builds: SKELETON_BUILDS }),
]);

/** One enemy's build name, from two draws of `random`. */
export function drawEnemy(random: () => number): string {
  let roll = random() * DUNGEON_ENEMIES.reduce((sum, f) => sum + f.weight, 0);
  const family = DUNGEON_ENEMIES.find(f => (roll -= f.weight) < 0) ?? DUNGEON_ENEMIES[DUNGEON_ENEMIES.length - 1];
  return family.builds[Math.floor(random() * family.builds.length)].name;
}
