import { Vector3 } from "../core/math/vector.ts";
import { jointTracker } from "../core/bodies/build/joint-state.ts";
import { uprightness } from "./ground.ts";
import { centreOfToRef, massCentreToRef, partsOn, pointOfToRef } from "../core/bodies/read-motion.ts";
import type { BodyLevel, MuscleReading } from "../core/bodies/muscle/driver.ts";
import type { Senses } from "../core/bodies/senses.ts";
import type { SolidSense } from "../core/bodies/object-senses.ts";
import type { ObjectSense } from "../core/bodies/object-senses.ts";
import type { EquipmentObservation } from "../core/bodies/equipment.ts";
import type { Vec3 } from "../core/quantity.ts";
import { deepFreeze } from "../core/state.ts";
import type { Clock } from "../core/world/clock.ts";
import { attachment, type ReadBody } from "../core/bodies/read-body.ts";

interface SegmentObservation {
  readonly configuration?: import("../core/bodies/spec/body.ts").ConfigurationName;
  readonly name: string;
  readonly position: Vec3;
  readonly rotation: readonly [number, number, number, number];
  readonly centre: Vec3;
  readonly velocity: Vec3;
  readonly spin: Vec3;
}

/** Detached measurements: no engine objects, mutable live arrays, goals or controller memory. */
export interface BodyObservation {
  readonly configurations: Readonly<Record<string, { readonly applied: import("../core/bodies/spec/body.ts").ConfigurationName; readonly requested: import("../core/bodies/spec/body.ts").ConfigurationName }>>;
  readonly time: number;
  readonly level: BodyLevel;
  readonly model: string;
  /** Only the equipment explicitly granted to this observer. */
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
    /** Unaveraged solver points of loaded fixed-contact manifolds, when the observer requests them. */
    readonly patch?: readonly { readonly point: Vec3; readonly normal: Vec3; readonly distance: number }[];
  }[];
  readonly senses: {
    readonly time: number; readonly side: string; readonly out: boolean;
    readonly objects?: readonly ObjectSense[];
    readonly solids?: readonly SolidSense[];
    readonly others: readonly {
      readonly id: string; readonly time?: number; readonly side: string; readonly model: string; readonly out: boolean;
      readonly centre: Vec3; readonly velocity: Vec3; readonly segments: readonly SegmentObservation[];
    }[];
  };
}

/** Physical readings for trusted game code; all fields are overwritten from physics on each read. */
export function physicalReading(built: ReadBody, down?: () => boolean) {
  const upright = uprightness(built), point = new Vector3();
  const head = built.segments.has(built.spec.marks.high) ? centreReading(built, built.spec.marks.high) : null;
  const reading = { centre: new Vector3(), head: new Vector3(), height: 0, down: false };
  const parts = partsOn(built);
  return () => {
    const { segments, mass } = parts();
    massCentreToRef(segments, mass, reading.centre, point);
    if (head) { head.update(); reading.head.copyFrom(head.centre); }
    else reading.head.copyFrom(reading.centre);
    reading.height = upright.height();
    reading.down = down ? down() : upright.fallen();
    return reading;
  };
}

/**
 * A segment's centre read through its local frame, with the work made once. A segment cut off
 * (`attachment`) is no longer the body's: its centre is read where the body would carry it, on its
 * nearest part still on as at the reference pose (`pointOfToRef`).
 */
export function centreReading(built: ReadBody, name: string): { centre: Vector3; update(): void } {
  const segment = built.segments.get(name);
  if (!segment) throw new Error(`${built.spec.model} has no ${name}`);
  const on = attachment(built), parentOf = new Map([...built.joints.values()].map((joint) => [joint.child, joint.parent]));
  const { origin, x, y, z } = segment.frame, c = segment.rigid.centre;
  const d = [c[0] - origin[0], c[1] - origin[1], c[2] - origin[2]];
  const local = new Vector3(...[x, y, z].map((a) => d[0]! * a[0]! + d[1]! * a[1]! + d[2]! * a[2]!) as [number, number, number]);
  const centre = new Vector3();
  return {
    centre,
    update() {
      if (on(segment)) { local.applyRotationQuaternionToRef(segment.pose.rotation, centre).addInPlace(segment.pose.position); return; }
      let carrier = parentOf.get(segment)!;
      while (!on(carrier)) carrier = parentOf.get(carrier)!;
      pointOfToRef(carrier, segment.rigid.centre, centre);
    },
  };
}

const tuple = (v: { readonly x: number; readonly y: number; readonly z: number }): Vec3 => [v.x, v.y, v.z];

/**
 * What an observation reads beside the body: whether the body is down by its host's rule (`down`, else by its own
 * uprightness), and each ground contact's patch (`contactPatches`).
 */
interface ObserveOptions {
  readonly equipment?: () => readonly EquipmentObservation[];
  readonly down?: () => boolean;
  readonly contactPatches?: boolean;
  /** The trusted body's level; a mind runs only at full level. */
  readonly level?: () => BodyLevel;
}

/** Snapshot on demand, including current joint motion even while the muscles are idle. */
export function observeBody(built: ReadBody, muscles: MuscleReading, clock: Clock, senses: () => Senses,
  { equipment, down, contactPatches = false, level = () => "full" }: ObserveOptions = {}): () => BodyObservation {
  const read = physicalReading(built, down), p = new Vector3(), v = new Vector3();
  const spins = new Map([...built.segments.values()].map((part) => [part, new Vector3()]));
  const trackers = [...built.joints.values()].map((joint) => ({ joint, tracker: jointTracker(joint) }));
  return () => {
    const physical = read(), external = senses();
    const segments = [...built.segments.values()].map((part) => {
      const q = part.pose.rotation;
      part.body.angularVelocityToRef(spins.get(part)!);
      return { name: part.spec.name, ...(part.configuration ? { configuration: part.configuration.applied } : {}), position: tuple(part.pose.position), rotation: [q.x, q.y, q.z, q.w] as const,
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
    const contacts = [...built.segments.values()].flatMap((part) => {
      const manifolds = contactPatches ? built.physics.contactManifoldsOf(part.body, other => other === null) : [];
      return built.physics.contactsOf(part.body).map((contact) => ({
        segment: part.spec.name, other: contact.other?.pose.name ?? null, fixed: contact.fixed,
        point: [...contact.point] as Vec3, normal: [...contact.normal] as Vec3, impulse: contact.impulse,
        pairs: contact.pairs.map((pair) => ({ ...pair, point: [...pair.point] as Vec3, normal: [...pair.normal] as Vec3 })),
        ...(contactPatches ? { patch: manifolds.filter(m => contact.fixed !== null && m.fixed === contact.fixed && m.impulse > 0)
          .flatMap(m => m.points.map(p => ({ point: [...p.point] as Vec3, normal: [...m.normal] as Vec3, distance: p.distance }))) } : {}),
      }));
    });
    return deepFreeze({ time: clock.time, level: level(), model: built.spec.model,
      configurations: structuredClone(built.configurations.state),
      ...(equipment ? { equipment: equipment() } : {}),
      centre: tuple(physical.centre), head: built.spec.marks?.high && built.segments.has(built.spec.marks.high) ? tuple(physical.head) : null,
      height: physical.height, down: physical.down, segments, joints, contacts,
      senses: { time: external.time, side: external.side, out: external.out,
        ...(external.solids ? { solids: structuredClone(external.solids) } : {}),
        ...(external.objects ? { objects: structuredClone(external.objects) } : {}), others: external.others.map((other) => ({
        id: other.id, ...(other.time !== undefined ? { time: other.time } : {}), side: other.side, model: other.spec.model, out: other.out, centre: tuple(other.centre), velocity: tuple(other.velocity),
        segments: [...other.segments].map(([name, s]) => ({ name, ...(s.configuration ? { configuration: s.configuration } : {}), position: tuple(s.position),
          rotation: [s.rotation.x, s.rotation.y, s.rotation.z, s.rotation.w] as const,
          centre: tuple(s.centre), velocity: tuple(s.velocity), spin: tuple(s.spin) })),
      })) },
    });
  };
}
