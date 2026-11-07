import type { Heading } from "../minds/orders.ts";

/** Live movement of the controlled member, in world coordinates. */
export interface PlayerLead {
  readonly keys: Heading | null;
  readonly walk: boolean;
}
