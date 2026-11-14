
/** A way over the ground, world (x, z): a direction, or a fraction of a gait's travel. */
interface Heading { readonly x: number; readonly z: number }

/** **What a paw gait is asked**: the way to travel, world, a fraction of its travel (none stands), and the way to face (none keeps its own). */
export interface TravelOrders { readonly move: Heading | null; readonly face: Heading | null }

/** Standing where it is, facing as it faces. */
export const STAND_TRAVEL: TravelOrders = Object.freeze({ move: null, face: null });
