import type { BuiltBody } from "../build/build-body.ts";
import { checkedMotionCommand, type MotionCommand, type MotionModel } from "../control/tasks.ts";
import { wholeBodyTracking } from "../control/whole-body.ts";
import type { ContactTrackingSettings } from "../control/contact-tracking.ts";
import type { JointStopSettings } from "../control/joint-stops.ts";
import type { SegmentBody } from "../engine/engine.ts";
import type { createEquipment } from "../equipment.ts";
import { observeBody, type BodyObservation } from "../observation.ts";
import { physicalBody } from "../physical-body.ts";
import { deepFreeze } from "../state.ts";
import type { World } from "../world.ts";
import { applyAction } from "./actions.ts";
import { equipmentPort } from "./equipment-port.ts";
import { embody } from "./mind.ts";
import { clockSenses, type Senses } from "./senses.ts";

type Equipment = ReturnType<typeof createEquipment>;
interface MotionPolicy {
  readonly name: string;
  readonly state: object;
  step(observation: BodyObservation, dt: number): MotionCommand;
  idle?(): void;
}
interface MotionOptions {
  readonly senses?: () => Senses;
  readonly items: readonly Equipment[];
  readonly grants: readonly { readonly item: Equipment; readonly grip: string }[];
  /** Physical fixture pins, declared by the task rather than requested by a policy. */
  readonly fixed: readonly SegmentBody[];
  readonly capacity: number;
  readonly effortCost: number;
  /** Optional measured sticking support; the controller checks predicted force admissibility. */
  readonly contact?: ContactTrackingSettings;
  readonly jointStops?: JointStopSettings;
}

/** Optional reference tracker; an independent policy can still use the actuator host directly. */
export function createMotionBody(built: BuiltBody, world: World,
  make: (model: MotionModel & { readonly equipment: readonly Equipment["model"][] }) => MotionPolicy, options: MotionOptions) {
  const items = [...options.items], fixed = [...options.fixed];
  if (options.grants.some((g) => !items.includes(g.item))) throw new Error("motion grip grant names an unmodeled item");
  const port = equipmentPort(options.grants), senses = options.senses ?? clockSenses(world);
  let tracking!: ReturnType<typeof wholeBodyTracking>;
  const embodied = embody(built, world, (own) => {
    tracking = wholeBodyTracking(built, own.muscles, world.physics.gravity, items, fixed, { capacity: options.capacity,
      effortCost: options.effortCost, ...(options.jointStops ? { jointStops: { settings: options.jointStops, dt: world.dt } } : {}), ...(options.contact ? { contact: { physics: world.physics, settings: options.contact } } : {}) });
    const description = deepFreeze({ channels: own.muscles.channels.map((c) => ({ name: c.name, min: c.dof.spec.min.value, max: c.dof.spec.max.value })),
      frames: [...[...built.segments.keys()].map((name) => ({ kind: "segment" as const, name })),
        ...items.map((item) => ({ kind: "item" as const, id: item.id }))], equipment: port.model });
    const policy = make(description), observe = observeBody(built, own.muscles, world, senses, () => port.observe());
    const state = { policy: policy.state, tracking: tracking.state };
    return { name: policy.name, state, idle: () => policy.idle?.(), step() {
      const command = checkedMotionCommand(policy.step(observe(), world.dt), description);
      tracking.check(command);
      const grips = port.check(command.grips);
      port.apply(grips);
      const torque = tracking.track(command);
      applyAction(own.muscles, { kind: "torque", torque: Array.from(torque) });
    } };
  }, senses);
  return Object.assign(physicalBody(embodied.own, world, senses, () => embodied.mind.name, embodied.state, embodied.dispose, undefined, port),
    { report: () => tracking.report() });
}
