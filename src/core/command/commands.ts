import type { GroundPoint } from "../mind/movement.ts";

/**
 * **A standing order** a leader gives members: none (`idle`), go to a point and fight what is met
 * on the way (`attack-move`), fight one foe (`lock`), or walk a drawn route past every foe
 * (`force`). A drawn route's points grow while it is drawn; every member sent along it walks the
 * same points.
 */
export type TeamOrder = { readonly kind: "idle" } | { readonly kind: "attack-move"; readonly destination: GroundPoint }
  | { readonly kind: "lock"; readonly target: string } | { readonly kind: "force"; readonly points: GroundPoint[]; drawing: boolean };

/** **A leader's command**: an order to the members it names, or those members called back to the leader. */
export type TeamCommand = { readonly kind: "order"; readonly order: TeamOrder; readonly members: readonly string[] }
  | { readonly kind: "regroup"; readonly members: readonly string[] };
