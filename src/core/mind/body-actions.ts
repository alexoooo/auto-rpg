import type { MuscleDriver } from "../muscle/driver.ts";
import { deepFreeze } from "../state.ts";
import { applyAction, checkedAction, type ActuatorAction } from "./actions.ts";
import type { EquipmentPort, GripAction } from "./equipment-port.ts";

/** Actuation alone, or one atomic request combining actuation with permitted equipment commands. */
export type BodyAction = ActuatorAction | {
  readonly kind: "body";
  readonly actuators: ActuatorAction;
  readonly grips: readonly GripAction[];
};

/** Validate and copy every component before any physical command is written. */
export function checkedBodyAction(action: BodyAction, count: number, equipment?: EquipmentPort): BodyAction {
  switch (action.kind) {
    case "velocity": case "torque": return checkedAction(action, count);
    case "body": {
      const actuators = checkedAction(action.actuators, count);
      if (!equipment) throw new Error("this body has no equipment command port");
      return deepFreeze({ kind: "body", actuators, grips: equipment.check(action.grips) });
    }
    default: { const never: never = action; throw new Error(`unknown body action ${JSON.stringify(never)}`); }
  }
}

/** Apply a checked action; a failed geometric capture remains detached in the next observation. */
export function applyBodyAction(muscles: MuscleDriver, action: BodyAction, equipment?: EquipmentPort): void {
  switch (action.kind) {
    case "velocity": case "torque": applyAction(muscles, action); return;
    case "body": {
      if (!equipment) throw new Error("this body has no equipment command port");
      equipment.apply(action.grips);
      applyAction(muscles, action.actuators);
      return;
    }
    default: { const never: never = action; throw new Error(`unknown body action ${JSON.stringify(never)}`); }
  }
}
