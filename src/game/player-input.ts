import type { Heading } from "../skills/intent/orders.ts";

/** Live movement of the controlled member, in world coordinates. */
export interface PlayerLead {
  readonly keys: Heading | null;
  readonly walk: boolean;
}
