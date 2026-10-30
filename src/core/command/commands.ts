import type { GroundPoint } from "../intent/movement.ts";
import type { Orders } from "../intent/orders.ts";

/** **How to strike a foe**, each part optional: an action of the member's kit, a limb and a region (`Orders`'s). */
export type StrikeChoice = Pick<Orders, "action" | "limb" | "region">;

/** **A route a person draws**: its points grow while it is drawn (`drawing`), and every member sent along it walks the same points. */
export interface DrawnRoute {
  readonly points: GroundPoint[];
  drawing: boolean;
}

/**
 * **A person's command** to the team they lead: plain data, carried out on the members selected.
 *
 * - `select`: these members, by id, are the ones the next commands go to.
 * - `go`: to a point, fighting what is met on the way (`destination`), or along a drawn route past
 *   every foe (`route`). Several sent together take slots about its end, no faster than the slowest
 *   of them goes.
 * - `attack`: fight this sensed foe, by id, following it while it is seen; where it names an action,
 *   a limb or a region (`StrikeChoice`), strike it so.
 * - `face`: toward a ground point (`toward`), or turned from the way it faces by `turn` radians,
 *   positive from +z toward +x.
 * - `hold`: stand where it is and fight only what comes to it.
 * - `stop`: drop what it was doing and stand where it is.
 * - `regroup`: come back to the leader and go after it.
 * - `follow`: go after this member, by id.
 */
export type Command =
  | { readonly kind: "select"; readonly members: readonly string[] }
  | { readonly kind: "go"; readonly destination: GroundPoint }
  | { readonly kind: "go"; readonly route: DrawnRoute }
  | { readonly kind: "attack"; readonly foe: string } & StrikeChoice
  | { readonly kind: "face"; readonly toward: GroundPoint }
  | { readonly kind: "face"; readonly turn: number }
  | { readonly kind: "hold" }
  | { readonly kind: "stop" }
  | { readonly kind: "regroup" }
  | { readonly kind: "follow"; readonly member: string };

/**
 * **A member's standing order**: none (`idle`), go to a point and fight what is met on the way
 * (`attack-move`), fight one foe (`lock`, as its `StrikeChoice` names), walk a drawn route past every foe (`force`), stand at a
 * point and fight only what comes to it (`hold`), or go after a member (`follow`). A go given to
 * several at once names them (`together`), one list shared by their orders.
 */
export type TeamOrder = { readonly kind: "idle" } | { readonly kind: "attack-move"; readonly destination: GroundPoint; readonly together?: readonly string[] }
  | { readonly kind: "lock"; readonly target: string } & StrikeChoice | { readonly kind: "force"; readonly route: DrawnRoute; readonly together?: readonly string[] }
  | { readonly kind: "hold"; readonly at: GroundPoint } | { readonly kind: "follow"; readonly member: string };
