import type { ReadBody } from "../read-body.ts";
import type { Clock } from "../clock.ts";
import { bodyEffectors, type EffectorModel } from "../control/effectors.ts";
import type { BodyObservation } from "../observation.ts";
import { observeBody } from "../observation.ts";
import { deepFreeze } from "../state.ts";
import { checkedBodyAction, type BodyAction } from "./body-actions.ts";
import { applyAction } from "./actions.ts";
import type { EquipmentPort } from "./equipment-port.ts";
import type { MindConstruction, OwnBody } from "./mind.ts";

/** Immutable actuator description; no object here can change the live body. */
export interface ActuatorModel {
  readonly effectors: readonly EffectorModel[];
  readonly handPoses: ReadBody["handPoses"]["model"];
  readonly equipment?: EquipmentPort["model"];
  /** The most its assist gives, N and N m (`Assist.most`): an ask beyond it is shortened to it. */
  readonly assist: { readonly force: number; readonly moment: number };
  readonly channels: readonly {
    readonly name: string; readonly min: number; readonly max: number;
    readonly positive: number; readonly negative: number;
  }[];
}

/** An observation/action policy owns only its own explicit memory. */
export interface Policy {
  readonly name: string;
  readonly state: object;
  step(observation: BodyObservation, dt: number): BodyAction;
  idle?(): void;
}

/**
 * **A policy as a mind** over its own body: it acts through detached observations of the body,
 * read on `clock` (`observeBody`), and checked actions alone (`checkedBodyAction`), with the
 * equipment port if given. `make` makes the policy from the body's actuators (`ActuatorModel`).
 */
export function policyMind(own: OwnBody, make: (model: ActuatorModel) => Policy, clock: Clock, equipment?: EquipmentPort): MindConstruction {
  let sensed = own.first;
  const observe = observeBody(own.built, own.muscles, clock, () => sensed, { equipment: equipment ? () => equipment.observe() : undefined });
  const model = deepFreeze({ effectors: bodyEffectors(own.built).map(e => e.model), handPoses: own.built.handPoses.model, channels: own.muscles.channels.map((c) => ({ name: c.name, min: c.dof.spec.min.value,
    max: c.dof.spec.max.value, positive: c.positive.peak, negative: c.negative.peak })),
    assist: { force: own.assist.most.force, moment: own.assist.most.moment },
    ...(equipment ? { equipment: equipment.model } : {}) });
  const policy = make(model);
  const state = { policy: policy.state, pending: null as BodyAction | null,
    activation: new Float64Array(model.channels.length), velocity: new Float64Array(model.channels.length) };
  return { name: policy.name, has: () => policy.name, dispose() {}, mind: {
    state,
    act(control) {
      const action = state.pending;
      if (!action) return;
      const actuators = action.kind === "body" ? action.actuators : action;
      if (actuators.kind === "velocity") {
        control.muscles.activation.set(actuators.activation); control.muscles.velocity.set(actuators.velocity);
      } else {
        control.muscles.activation.set(state.activation); control.muscles.velocity.set(state.velocity);
      }
      if (action.kind === "body") {
        if (action.handPoses) for (const request of action.handPoses) control.hands.request(request.hand, request.pose);
        if (action.assist) {
          control.assist.force.set(...action.assist.force);
          control.assist.moment.set(...action.assist.moment);
        }
        equipment?.apply(action.grips);
      }
      state.pending = null;
    },
    interrupt() { state.pending = null; policy.idle?.(); },
    think(senses) {
      sensed = senses;
      const action = checkedBodyAction(policy.step(observe(), clock.dt), model.channels.length, equipment, own.built.handPoses);
      const actuators = action.kind === "body" ? action.actuators : action;
      if (actuators.kind === "torque") applyAction(own.muscles, state, actuators);
      state.pending = action;
    },
  } };
}
