import type { MuscleDriver } from "../muscle/driver.ts";
import { deepFreeze } from "../state.ts";
import { applyAction, checkedAction, type ActuatorAction } from "./actions.ts";
import type { EquipmentPort, GripAction } from "./equipment-port.ts";
import type { HandPoses, HandPoseRequest } from "../build/hand-poses.ts";

/**
 * **A wrench asked of the body's assist** (`Assist`): a force, N, and a moment, N m, about the
 * root's centre of mass, world, for the step about to be taken. What is given is the ask shortened
 * to the assist's ceiling.
 */
export interface AssistAsk {
  readonly force: readonly [number, number, number];
  readonly moment: readonly [number, number, number];
}

/** Actuation alone, or one atomic request combining actuation with permitted equipment commands, hand poses and an ask of the assist. */
export type BodyAction = ActuatorAction | {
  readonly kind: "body";
  readonly actuators: ActuatorAction;
  readonly grips: readonly GripAction[];
  readonly handPoses?: readonly HandPoseRequest[];
  readonly assist?: AssistAsk;
};

/** `ask` copied, refused unless its force and its moment are each three finite numbers. */
function checkedAsk(ask: AssistAsk): AssistAsk {
  const three = (v: unknown): v is readonly [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  if (typeof ask !== "object" || ask === null || !three(ask.force) || !three(ask.moment)) throw new Error("invalid assist ask");
  return { force: [ask.force[0], ask.force[1], ask.force[2]], moment: [ask.moment[0], ask.moment[1], ask.moment[2]] };
}

/** Validate and copy every component before any physical command is written. */
export function checkedBodyAction(action: BodyAction, count: number, equipment?: EquipmentPort, hands?: HandPoses): BodyAction {
  switch (action.kind) {
    case "velocity": case "torque": return checkedAction(action, count);
    case "body": {
      const actuators = checkedAction(action.actuators, count);
      if (!Array.isArray(action.grips) || (!equipment && action.grips.length)) throw new Error("this body has no equipment command port");
      if (action.handPoses && !hands) throw new Error("this body has no hand pose command port");
      return deepFreeze({ ...action, actuators, grips: equipment ? equipment.check(action.grips) : [],
        ...(action.handPoses ? { handPoses: hands!.check(action.handPoses) } : {}),
        ...(action.assist !== undefined ? { assist: checkedAsk(action.assist) } : {}) });
    }
    default: { const never: never = action; throw new Error(`unknown body action ${JSON.stringify(never)}`); }
  }
}

/** Apply a checked action, its assist's ask through `assist`; a failed geometric capture remains detached in the next observation. */
export function applyBodyAction(muscles: MuscleDriver, action: BodyAction, equipment?: EquipmentPort, hands?: Pick<HandPoses, "request">, assist?: (ask: AssistAsk) => void): void {
  switch (action.kind) {
    case "velocity": case "torque": applyAction(muscles, action); return;
    case "body": {
      if (action.grips.length && !equipment) throw new Error("this body has no equipment command port");
      if (action.handPoses) {
        if (!hands) throw new Error("this body has no hand pose command port");
        hands.request(action.handPoses);
      }
      if (action.assist) {
        if (!assist) throw new Error("this body has no assist command port");
        assist(action.assist);
      }
      equipment?.apply(action.grips);
      applyAction(muscles, action.actuators);
      return;
    }
    default: { const never: never = action; throw new Error(`unknown body action ${JSON.stringify(never)}`); }
  }
}
