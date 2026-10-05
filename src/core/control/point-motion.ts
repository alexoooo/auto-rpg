import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyObservation } from "../observation.ts";
import type { ObjectSense } from "../mind/object-senses.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { MotionCommand } from "./tasks.ts";

type Frame = MotionCommand["frames"][number]["frame"];
type Kinematics = Pick<ObjectSense, "position" | "rotation" | "velocity" | "spin">;

/** Per-controller scratch for detached point motion, including angular velocity about the centre. */
export function pointMotion(equipment: readonly { readonly id: string; readonly centre: Vec3 }[] = []) {
  const centres = new Map(equipment.map((item) => [item.id, [...item.centre] as Vec3]));
  const position = new Vector3(), offset = new Vector3(), velocity = new Vector3(), spin = new Vector3(), rotation = new Quaternion();
  const sample = (part: Kinematics, at: Vec3, centre: Vec3, local: boolean) => {
    rotation.set(...part.rotation);
    position.set(...at).applyRotationQuaternionToRef(rotation, position).addInPlaceFromFloats(...part.position);
    offset.set(...centre);
    if (local) offset.applyRotationQuaternionToRef(rotation, offset).addInPlaceFromFloats(...part.position);
    position.subtractToRef(offset, offset);
    spin.set(...part.spin); velocity.set(...part.velocity);
    Vector3.CrossToRef(spin, offset, offset); velocity.addInPlace(offset);
    return { position: [position.x, position.y, position.z] as Vec3, velocity: [velocity.x, velocity.y, velocity.z] as Vec3 };
  };
  const part = (observation: BodyObservation, frame: Frame) => {
    switch (frame.kind) {
      case "segment": {
        const reading = observation.segments.find((s) => s.name === frame.name);
        if (!reading) throw new Error("motion segment is absent from observation");
        return reading;
      }
      case "item": {
        const reading = observation.equipment?.find((s) => s.id === frame.id);
        if (!reading) throw new Error("motion item is absent from observation");
        return reading;
      }
      default: { const never: never = frame; throw new Error(`unknown motion frame ${JSON.stringify(never)}`); }
    }
  };
  return {
    part,
    own(observation: BodyObservation, frame: Frame, at: Vec3) {
      const reading = part(observation, frame);
      if (frame.kind === "segment") return sample(reading, at, observation.segments.find((s) => s.name === frame.name)!.centre, false);
      const centre = centres.get(frame.id);
      if (!centre) throw new Error("motion item has no centre in its model");
      return sample(reading, at, centre, true);
    },
    object(reading: ObjectSense, at: Vec3) { return { time: reading.time, ...sample(reading, at, reading.centre, false) }; },
  };
}
