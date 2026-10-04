import type { MuscleDriver } from "../muscle/driver.ts";
import { deepFreeze } from "../state.ts";

/** Channel order is the body's declared actuator order. Commands never change anatomical limits. */
export type ActuatorAction =
  | { readonly kind: "velocity"; readonly activation: readonly number[]; readonly velocity: readonly number[] }
  | { readonly kind: "torque"; readonly torque: readonly number[] };

/** Copy and validate a whole action before accepting any of it, including across worker boundaries. */
export function checkedAction(action: ActuatorAction, count: number): ActuatorAction {
  switch (action.kind) {
    case "velocity":
      if (!Array.isArray(action.activation) || !Array.isArray(action.velocity)
        || action.activation.length !== count || action.velocity.length !== count
        || !Array.from(action.activation).every((v) => Number.isFinite(v) && v >= 0 && v <= 1)
        || !Array.from(action.velocity).every((v) => typeof v === "number" && !Number.isNaN(v))) throw new Error("invalid actuator velocity action");
      return deepFreeze({ kind: "velocity", activation: [...action.activation], velocity: [...action.velocity] });
    case "torque":
      if (!Array.isArray(action.torque) || action.torque.length !== count || !Array.from(action.torque).every(Number.isFinite)) throw new Error("invalid actuator torque action");
      return deepFreeze({ kind: "torque", torque: [...action.torque] });
    default: throw new Error(`unknown action ${(action satisfies never as ActuatorAction).kind}`);
  }
}

/** Enforce the same muscle envelope for direct velocity and torque policies. Input is checked at the action boundary. */
export function applyAction(muscles: MuscleDriver, action: ActuatorAction): void {
  switch (action.kind) {
    case "velocity":
      muscles.activation.set(action.activation); muscles.velocity.set(action.velocity);
      return;
    case "torque":
      for (let i = 0; i < muscles.channels.length; i++) {
        const torque = action.torque[i]!, capacity = muscles.strength(i, torque >= 0 ? 1 : -1);
        muscles.activation[i] = capacity > 0 ? Math.min(1, Math.abs(torque) / capacity) : 0;
        muscles.velocity[i] = torque > 0 ? Infinity : torque < 0 ? -Infinity : 0;
      }
      return;
    default: throw new Error(`unknown action ${(action satisfies never as ActuatorAction).kind}`);
  }
}
