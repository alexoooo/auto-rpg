import type { World } from "../world.ts";

/**
 * **What a mind is told of the world**, each control step, as the last solver step left it. A
 * mind's own body is not here: it has that whole (`OwnBody`, `mind.ts`).
 */
export interface Senses {
  /** Seconds of the world's clock. */
  readonly time: number;
}

/** Senses that tell the time and nothing else: a body alone on a stand. */
export function clockSenses(world: World): () => Senses {
  const senses = { time: 0 };
  return () => { senses.time = world.time; return senses; };
}
