import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../build/build-body.ts";
import { bodyEffectors, type EffectorModel } from "../control/effectors.ts";
import type { AssistCeiling } from "../control/assist.ts";
import type { BodyObservation } from "../observation.ts";
import { observeBody } from "../observation.ts";
import { physicalBody, type PhysicalBody } from "../physical-body.ts";
import { deepFreeze } from "../state.ts";
import type { World } from "../world.ts";
import { applyBodyAction, checkedBodyAction, type AssistAsk, type BodyAction } from "./body-actions.ts";
import type { EquipmentPort } from "./equipment-port.ts";
import { embody } from "./mind.ts";
import { clockSenses, type Senses } from "./senses.ts";
import type { SheetLog } from "./sheets.ts";

/** Immutable actuator description; no object here can change the live body. */
export interface ActuatorModel {
  readonly effectors: readonly EffectorModel[];
  readonly handPoses: BuiltBody["handPoses"]["model"];
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

interface PolicyOptions { readonly senses?: () => Senses; readonly assist?: AssistCeiling; readonly equipment?: EquipmentPort; readonly log?: SheetLog }

/** Host a replacement controller through detached observations and checked actions alone. */
export function createPolicyBody(built: BuiltBody, world: World, make: (model: ActuatorModel) => Policy, options: PolicyOptions = {}): PhysicalBody {
  const sense = options.senses ?? clockSenses(world), equipment = options.equipment;
  const embodied = embody(built, world, (own) => {
    const observe = observeBody(built, own.muscles, world, sense, equipment ? () => equipment.observe() : undefined);
    const model = deepFreeze({ effectors: bodyEffectors(built).map(e => e.model), handPoses: built.handPoses.model, channels: own.muscles.channels.map((c) => ({ name: c.name, min: c.dof.spec.min.value,
      max: c.dof.spec.max.value, positive: c.positive.peak, negative: c.negative.peak })),
      assist: { force: own.assist.most.force, moment: own.assist.most.moment },
      ...(equipment ? { equipment: equipment.model } : {}) });
    const force = new Vector3(), moment = new Vector3();
    const ask = (asked: AssistAsk) => own.assist.ask(force.set(...asked.force), moment.set(...asked.moment));
    const policy = make(model);
    return { name: policy.name, state: policy.state, idle: () => policy.idle?.(), step() {
      const action = checkedBodyAction(policy.step(observe(), world.dt), model.channels.length, equipment, built.handPoses);
      applyBodyAction(own.muscles, action, equipment, { request: own.requestHandPoses }, ask);
    } };
  }, sense, options.assist, options.log);
  return physicalBody(built, embodied.own, world, sense, () => embodied.mind.name, embodied.state, embodied.dispose, undefined, equipment);
}
