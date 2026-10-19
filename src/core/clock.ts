/** **A world's clock as a mind reads it**: the length of a step, s; the steps taken; and the time, s. */
export interface Clock {
  readonly dt: number;
  readonly steps: number;
  readonly time: number;
}

/** `world`'s clock and nothing else of it: what a mind and its parts are given in place of the world. */
export function clockOf(world: Clock): Clock {
  return Object.freeze({ dt: world.dt, get steps() { return world.steps; }, get time() { return world.time; } });
}
