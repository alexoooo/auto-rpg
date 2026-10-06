import type { MuscleDriver } from "../muscle/driver.ts";
import { deepFreeze } from "../state.ts";
import { applyAction, checkedAction, type ActuatorAction } from "./actions.ts";
import type { EquipmentPort, GripAction } from "./equipment-port.ts";
import type { HandPoses, HandPoseRequest } from "../control/hand-poses.ts";

/** Actuation alone, or one atomic request combining actuation with permitted equipment commands. */
export type BodyAction = ActuatorAction | {
  readonly kind: "body";
  readonly actuators: ActuatorAction;
  readonly grips: readonly GripAction[];
  readonly handPoses?: readonly HandPoseRequest[];
};

/** Validate and copy every component before any physical command is written. */
export function checkedBodyAction(action: BodyAction, count: number, equipment?: EquipmentPort, hands?: HandPoses): BodyAction {
  switch (action.kind) {
    case "velocity": case "torque": return checkedAction(action, count);
    case "body": {
      const actuators = checkedAction(action.actuators, count);
      if (!Array.isArray(action.grips) || (!equipment && action.grips.length)) throw new Error("this body has no equipment command port");
      if (action.handPoses && !hands) throw new Error("this body has no hand pose command port");
      return deepFreeze({ ...action, actuators, grips: equipment ? equipment.check(action.grips) : [],
        ...(action.handPoses ? { handPoses: hands!.check(action.handPoses) } : {}) });
    }
    default: { const never: never = action; throw new Error(`unknown body action ${JSON.stringify(never)}`); }
  }
}

/** Apply a checked action; a failed geometric capture remains detached in the next observation. */
export function applyBodyAction(muscles: MuscleDriver, action: BodyAction, equipment?: EquipmentPort, hands?: HandPoses): void {
  switch (action.kind) {
    case "velocity": case "torque": applyAction(muscles, action); return;
    case "body": {
      if (action.grips.length && !equipment) throw new Error("this body has no equipment command port");
      if (action.handPoses) {
        if (!hands) throw new Error("this body has no hand pose command port");
        hands.request(action.handPoses);
      }
      equipment?.apply(action.grips);
      applyAction(muscles, action.actuators);
      return;
    }
    default: { const never: never = action; throw new Error(`unknown body action ${JSON.stringify(never)}`); }
  }
}
