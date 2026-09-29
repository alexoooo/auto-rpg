import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { PhysicsConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import type { HavokPhysicsWithBindings } from "@babylonjs/havok";

/**
 * **The angular impulse a constraint applied over the last solver step**, world frame, N m s: its
 * motors', limits' and locked axes' together, as Havok reports it (`HP_Constraint_GetAppliedImpulses`,
 * which Babylon does not wrap). Its component along a free axis is that axis's motor, and its limit
 * when one is met, turned into the parent's frame as a joint's speed is (`joint-state.ts`).
 *
 * It is exact on a saturated motor and rough on one holding. On a rod on a pin (Node stand,
 * 120 Hz), driven flat out, the component along the pin divided by the step read the ceiling the
 * motor was given, 10.78 N m against 10.8 and -13.65 against 13.6. Holding a rod still against
 * gravity it read -12 % to +14 % of the weight's moment about the pin across six rods (0.434 and
 * 0.560 N m against 0.4905, 2.016 against 1.962), and its linear part 9.77-10.08 N against a weight
 * of 9.81; at 1920 Hz, -7 % to +7 %. So its sign is the side that pulled wherever the torque is
 * larger than that.
 */
export function appliedAngularImpulseToRef(constraint: PhysicsConstraint, out: Vector3): Vector3 {
  const { _physicsPlugin: plugin, _pluginData: ids } = constraint as unknown as {
    _physicsPlugin: { _hknp: HavokPhysicsWithBindings }; _pluginData: unknown[] };
  const [, , angular] = plugin._hknp.HP_Constraint_GetAppliedImpulses(ids[0] as never);
  return out.set(angular[0], angular[1], angular[2]);
}
