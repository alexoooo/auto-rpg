import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { SegmentBody } from "../engine/engine.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import type { World } from "../world.ts";

/** Detached external rigid-object measurements; named points are in the object's local frame. */
export interface ObjectSense {
  readonly id: string;
  readonly owner: string | null;
  readonly points: Readonly<Record<string, Vec3>>;
  readonly time: number;
  readonly mass: number;
  readonly position: Vec3;
  readonly rotation: readonly [number, number, number, number];
  readonly centre: Vec3;
  readonly velocity: Vec3;
  readonly spin: Vec3;
}

interface SensedObject {
  readonly id: string;
  readonly owner: string | null;
  readonly body: SegmentBody;
  readonly points: Readonly<Record<string, Vec3>>;
}

/** Saved scalar layout: `docs/reference/moving-strike.md#observation-layout`. */
const FRAME_LENGTH = 3 + 4 + 3 + 3 + 3 + 1 + 1;

/**
 * Read permitted physical objects in the world's sensing phase, independently of their controller
 * or attachment topology. A host combines these readings with its body senses. Only this trusted
 * observer holds engine bodies; policies receive plain data with the actual sample time. Saved
 * delay buffers decode directly after restore, without a live cache to refresh.
 */
export function createObjectSenses(world: World, definitions: readonly SensedObject[], delay = 0) {
  if (!Number.isSafeInteger(delay) || delay < 0) throw new Error("object sensing delay must be whole steps");
  const ids = new Set<string>();
  const objects = definitions.map((entry) => {
    if (!entry.id || ids.has(entry.id) || (entry.owner !== null && typeof entry.owner !== "string")) throw new Error("invalid sensed object identity");
    ids.add(entry.id);
    const points = Object.fromEntries(Object.entries(entry.points).map(([name, at]) => {
      if (!name || !Array.isArray(at) || at.length !== 3 || !at.every(Number.isFinite)) throw new Error("invalid sensed object point");
      return [name, [at[0], at[1], at[2]]] as [string, Vec3];
    }));
    return { id: entry.id, owner: entry.owner, body: entry.body, points: deepFreeze(points) };
  });
  const point = new Vector3(), velocity = new Vector3(), spin = new Vector3();
  const read = (entry: typeof objects[number], frame: Float64Array) => {
    const body = entry.body, node = body.node, q = node.rotationQuaternion!, p = node.position;
    point.set(...body.massProperties.centre).applyRotationQuaternionToRef(q, point).addInPlace(p);
    body.linearVelocityToRef(velocity); body.angularVelocityToRef(spin);
    frame.set([p.x, p.y, p.z, q.x, q.y, q.z, q.w, point.x, point.y, point.z,
      velocity.x, velocity.y, velocity.z, spin.x, spin.y, spin.z, body.massProperties.mass, world.time]);
  };
  const state = { objects: objects.map((entry) => {
    const frame = new Float64Array(FRAME_LENGTH); read(entry, frame);
    return { at: 0, frames: Array.from({ length: delay + 1 }, () => frame.slice()) };
  }) };
  const hook = world.sense(() => objects.forEach((entry, i) => {
    const memory = state.objects[i]!;
    read(entry, memory.frames[memory.at]!); memory.at = (memory.at + 1) % memory.frames.length;
  }));
  return { state,
    read(): readonly ObjectSense[] {
      return deepFreeze(objects.map((entry, i): ObjectSense => {
        const memory = state.objects[i]!, frame = memory.frames[memory.at]!;
        return { id: entry.id, owner: entry.owner, points: entry.points, time: frame[17]!, mass: frame[16]!,
          position: [frame[0]!, frame[1]!, frame[2]!], rotation: [frame[3]!, frame[4]!, frame[5]!, frame[6]!],
          centre: [frame[7]!, frame[8]!, frame[9]!], velocity: [frame[10]!, frame[11]!, frame[12]!], spin: [frame[13]!, frame[14]!, frame[15]!] };
      }));
    },
    dispose() { hook.dispose(); },
  };
}
