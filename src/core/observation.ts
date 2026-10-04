import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "./build/build-body.ts";
import { jointTracker } from "./build/joint-state.ts";
import { uprightness } from "./control/ground.ts";
import { centreOfToRef } from "./control/support.ts";
import type { MuscleDriver } from "./muscle/driver.ts";
import type { Senses } from "./mind/senses.ts";
import type { EquipmentObservation } from "./mind/equipment-port.ts";
import type { Vec3 } from "./spec/quantity.ts";
import { deepFreeze } from "./state.ts";
import type { World } from "./world.ts";

interface SegmentObservation {
  readonly name: string;
  readonly position: Vec3;
  readonly rotation: readonly [number, number, number, number];
  readonly centre: Vec3;
  readonly velocity: Vec3;
  readonly spin: Vec3;
}

/** Detached measurements: no engine objects, mutable live arrays, goals or controller memory. */
export interface BodyObservation {
  readonly time: number;
  readonly level: MuscleDriver["level"];
  readonly model: string;
  /** Only equipment granted to this controller; absent when no equipment port is configured. */
  readonly equipment?: readonly EquipmentObservation[];
  readonly centre: Vec3;
  readonly head: Vec3 | null;
  readonly height: number;
  readonly down: boolean;
  readonly segments: readonly SegmentObservation[];
  readonly joints: readonly {
    readonly name: string; readonly angle: number; readonly rate: number; readonly speed: number;
    readonly effort: number; readonly negative: number; readonly positive: number;
  }[];
  readonly contacts: readonly {
    readonly segment: string; readonly other: string | null; readonly fixed: number | null;
    readonly point: Vec3; readonly normal: Vec3; readonly impulse: number;
    readonly pairs: readonly { readonly mine: number; readonly theirs: number; readonly point: Vec3; readonly normal: Vec3; readonly impulse: number }[];
  }[];
  readonly senses: {
    readonly time: number; readonly side: string; readonly out: boolean;
    readonly others: readonly {
      readonly id: string; readonly side: string; readonly model: string; readonly out: boolean;
      readonly centre: Vec3; readonly velocity: Vec3; readonly segments: readonly SegmentObservation[];
    }[];
  };
}

/** Physical readings for trusted game code; all fields are overwritten from physics on each read. */
export function physicalReading(built: BuiltBody) {
  const upright = uprightness(built), point = new Vector3();
  const head = built.segments.has("head") ? centreReading(built, "head") : null;
  const reading = { centre: new Vector3(), head: new Vector3(), height: 0, down: false };
  const parts = [...built.segments.values()], mass = parts.reduce((sum, part) => sum + part.rigid.mass, 0);
  return () => {
    reading.centre.set(0, 0, 0);
    for (const part of parts) {
      reading.centre.addInPlace(centreOfToRef(part, point).scaleInPlace(part.rigid.mass));
    }
    reading.centre.scaleInPlace(1 / mass);
    if (head) { head.update(); reading.head.copyFrom(head.centre); }
    else reading.head.copyFrom(reading.centre);
    reading.height = upright.height();
    reading.down = upright.down();
    return reading;
  };
}

/** A segment's centre read through its local frame, with the work made once. */
export function centreReading(built: BuiltBody, name: string): { centre: Vector3; update(): void } {
  const segment = built.segments.get(name);
  if (!segment) throw new Error(`${built.spec.model} has no ${name}`);
  const { origin, x, y, z } = segment.frame, c = segment.rigid.centre;
  const d = [c[0] - origin[0], c[1] - origin[1], c[2] - origin[2]];
  const local = new Vector3(...[x, y, z].map((a) => d[0]! * a[0]! + d[1]! * a[1]! + d[2]! * a[2]!) as [number, number, number]);
  const centre = new Vector3();
  return { centre, update() { local.applyRotationQuaternionToRef(segment.node.rotationQuaternion!, centre).addInPlace(segment.node.position); } };
}

const tuple = (v: { readonly x: number; readonly y: number; readonly z: number }): Vec3 => [v.x, v.y, v.z];

/** Snapshot on demand, including current joint motion even while the muscles are idle. */
export function observeBody(built: BuiltBody, muscles: MuscleDriver, world: World, senses: () => Senses,
  equipment?: () => readonly EquipmentObservation[]): () => BodyObservation {
  const read = physicalReading(built), p = new Vector3(), v = new Vector3();
  const spins = new Map([...built.segments.values()].map((part) => [part, new Vector3()]));
  const trackers = [...built.joints.values()].map((joint) => ({ joint, tracker: jointTracker(joint) }));
  return () => {
    const physical = read(), external = senses();
    const segments = [...built.segments.values()].map((part) => {
      const q = part.node.rotationQuaternion!;
      part.body.angularVelocityToRef(spins.get(part)!);
      return { name: part.spec.name, position: tuple(part.node.position), rotation: [q.x, q.y, q.z, q.w] as const,
        centre: tuple(centreOfToRef(part, p)), velocity: tuple(part.body.linearVelocityToRef(v)), spin: tuple(spins.get(part)!) };
    });
    let index = 0;
    const joints = trackers.flatMap(({ joint, tracker }) => {
      tracker.update((part) => spins.get(part)!);
      return joint.dofs.map((_, k) => {
        const i = index++;
        return { name: muscles.channels[i]!.name, angle: tracker.angles[k]!, rate: tracker.rates[k]!, speed: tracker.speeds[k]!,
          effort: muscles.pulled[i]!, negative: muscles.bounds.negative[i]!, positive: muscles.bounds.positive[i]! };
      });
    });
    const contacts = [...built.segments.values()].flatMap((part) => built.physics.contactsOf(part.body).map((contact) => ({
      segment: part.spec.name, other: contact.other?.node.name ?? null, fixed: contact.fixed,
      point: [...contact.point] as Vec3, normal: [...contact.normal] as Vec3, impulse: contact.impulse,
      pairs: contact.pairs.map((pair) => ({ ...pair, point: [...pair.point] as Vec3, normal: [...pair.normal] as Vec3 })),
    })));
    return deepFreeze({ time: world.time, level: muscles.level, model: built.spec.model,
      ...(equipment ? { equipment: equipment() } : {}),
      centre: tuple(physical.centre), head: built.segments.has("head") ? tuple(physical.head) : null,
      height: physical.height, down: physical.down, segments, joints, contacts,
      senses: { time: external.time, side: external.side, out: external.out, others: external.others.map((other) => ({
        id: other.id, side: other.side, model: other.spec.model, out: other.out, centre: tuple(other.centre), velocity: tuple(other.velocity),
        segments: [...other.segments].map(([name, s]) => ({ name, position: tuple(s.position),
          rotation: [s.rotation.x, s.rotation.y, s.rotation.z, s.rotation.w] as const,
          centre: tuple(s.centre), velocity: tuple(s.velocity), spin: tuple(s.spin) })),
      })) },
    });
  };
}
