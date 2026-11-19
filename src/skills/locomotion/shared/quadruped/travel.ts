
/** A way over the ground, world (x, z): a direction, or a fraction of a gait's travel. */
interface Heading { readonly x: number; readonly z: number }

/**
 * **What a paw gait is asked**: the way to travel, world, a fraction of its travel (none stands);
 * the way to face (none keeps its own); and the height to carry the body at, a share of its
 * standing height (`BodyView.standing`; none, the gait's own).
 */
export interface TravelOrders { readonly move: Heading | null; readonly face: Heading | null; readonly height: number | null }

/** Standing where it is, facing as it faces, at `height` (`TravelOrders.height`). */
export const standAt = (height: number | null): TravelOrders => ({ move: null, face: null, height });
