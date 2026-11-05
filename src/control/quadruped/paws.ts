import type { Vector3 } from "../../core/math/vector.ts";
import type { BodyView } from "../body.ts";
import { supportReader, type EndReading, type SupportEndpoint } from "../supported-motor.ts";
import type { ReadBody } from "../../core/bodies/read-body.ts";
import { pawsOf } from "../../core/bodies/spec/body.ts";
import { REPTILE_MOTOR } from "./tuning.ts";

/** **What bears a body on its paws**: its centre of mass and velocity, and each paw as it bears (`EndReading`), in its spec's order (`pawsOf`). */
export interface PawReading {
  readonly centre: Vector3;
  readonly velocity: Vector3;
  readonly feet: readonly EndReading[];
}

/** The paws `built` stands on as a support motor bears them (`SupportEndpoint`), in its spec's order (`pawsOf`). */
export const pawEndpoints = (built: ReadBody): readonly SupportEndpoint[] => pawsOf(built.spec).map((paw) => ({ segment: paw.segment, point: paw.point, sole: paw.sole }));

/** Each body's paw reader, made once a body: its readings are re-read each step from the body, no state. */
const READERS = new WeakMap<ReadBody, ReturnType<typeof supportReader>>();

/**
 * **The reader of what bears `built` on its paws** (`supportReader` over `pawEndpoints`, a contact
 * read as `REPTILE_MOTOR` reads it), one a body: its paw motor reads it each step as the body is
 * felt (`MotorControl.read`), and its gaits, its bite and its righting read what it found.
 */
export function pawReader(built: ReadBody): ReturnType<typeof supportReader> {
  let reader = READERS.get(built);
  if (!reader) READERS.set(built, reader = supportReader(built, pawEndpoints(built), REPTILE_MOTOR));
  return reader;
}

/**
 * **What a paw gait reads of the body**: what bears it on its paws (`PawReading`), the way it faces
 * (`StanceReading.facing`) and whether it is down (`BodyView.down`), as its view last read them.
 */
export interface PawView extends PawReading {
  readonly yaw: number;
  readonly down: boolean;
}

/** The paw view (`PawView`) of a body seen through `view`, its paws read by `pawReader`. */
export function pawView(built: ReadBody, view: Pick<BodyView, "stance" | "down">): PawView {
  const reading = pawReader(built).state;
  return { centre: reading.centre, velocity: reading.velocity, feet: reading.endpoints, get yaw() { return view.stance.facing; }, get down() { return view.down; } };
}
