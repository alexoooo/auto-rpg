import { sourced, type Quantity } from "./quantity.ts";

/**
 * Physical constants: numbers that belong to no body and no engine. A table that turns a published
 * normalised torque into newton metres reads them from here, as the physics world does.
 */

/** Standard gravity, the conventional value of the acceleration of free fall. */
export const STANDARD_GRAVITY: Quantity<number> = sourced(9.80665, "m/s2", "cgpm-1901",
  "Declaration on the unit of mass and on the definition of weight; conventional value of gn");
