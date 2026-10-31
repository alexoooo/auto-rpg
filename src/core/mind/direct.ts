import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { ReadBody } from "../read-body.ts";
import type { Clock } from "../clock.ts";
import { bodyEffectors, type EffectorModel } from "../control/effectors.ts";
import type { BodyObservation } from "../observation.ts";
import { observeBody } from "../observation.ts";
import { deepFreeze } from "../state.ts";
import { applyBodyAction, checkedBodyAction, type AssistAsk, type BodyAction } from "./body-actions.ts";
import type { EquipmentPort } from "./equipment-port.ts";
import type { Mind, OwnBody } from "./mind.ts";

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
export function policyMind(own: OwnBody, make: (model: ActuatorModel) => Policy, clock: Clock, equipment?: EquipmentPort): Mind {
  const observe = observeBody(own.built, own.muscles, clock, own.senses, { equipment: equipment ? () => equipment.observe() : undefined });
  const model = deepFreeze({ effectors: bodyEffectors(own.built).map(e => e.model), handPoses: own.built.handPoses.model, channels: own.muscles.channels.map((c) => ({ name: c.name, min: c.dof.spec.min.value,
    max: c.dof.spec.max.value, positive: c.positive.peak, negative: c.negative.peak })),
    assist: { force: own.assist.most.force, moment: own.assist.most.moment },
    ...(equipment ? { equipment: equipment.model } : {}) });
  const force = new Vector3(), moment = new Vector3();
  const ask = (asked: AssistAsk) => own.assist.ask(force.set(...asked.force), moment.set(...asked.moment));
  const policy = make(model);
  return { name: policy.name, state: policy.state, idle: () => policy.idle?.(), step(_senses, dt) {
    const action = checkedBodyAction(policy.step(observe(), dt), model.channels.length, equipment, own.built.handPoses);
    applyBodyAction(own.muscles, action, equipment, { request: own.requestHandPoses }, ask);
  } };
}
