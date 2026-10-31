/**
 * **The moving target**: a rail that carries one side's body as a pad, held rigid in the pose it
 * was built in, lifted off the floor and moved along a path at a speed (`Rail`). A drill's target
 * (`DuelRecipe.rail`), a world fixture and not anatomy: each step it gives every segment of the
 * body the impulse that brings its centre of mass onto the path where the next step puts it and
 * its turn back to its built one, so the body keeps its path and speed with nothing touching it,
 * and a blow moves it only until the rail takes it back. The body is sensed, struck and read as any
 * body is: the striker's mind and the drill's reader see a body that moves, nothing else.
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import { centreOfToRef } from "../core/read-motion.ts";
import { cos, sin } from "../core/math/real.ts";
import { spinBetweenToRef } from "../core/math/turn.ts";
import type { Side } from "../core/spec/body.ts";
import type { Hook, World } from "../core/world.ts";

/**
 * A rail's path, on the floor, from where the body was built (x, z, m): `line`, to `along` and
 * holding there; `back-and-forth`, to `along` and back, over and over; `circle`, round the point
 * `centre`, turning about +y the positive way where `way` is 1 and the other where it is -1.
 */
export type RailPath =
  | { readonly kind: "line"; readonly along: readonly [number, number] }
  | { readonly kind: "back-and-forth"; readonly along: readonly [number, number] }
  | { readonly kind: "circle"; readonly centre: readonly [number, number]; readonly way: 1 | -1 };

/** **A rail**: the side whose body it carries, its path, its speed along the path, m/s, and how high it holds the body above where it was built, m. */
export interface Rail {
  readonly side: Side;
  readonly path: RailPath;
  readonly speed: number;
  readonly height: number;
}

/**
 * How soon the rail takes a body pushed off its path back onto it, s: it closes what is off this
 * fast, its velocity on the path's own at once. A setting of the fixture.
 */
const RETURN = .05;

/** Why `rail` is no rail: a list of faults, empty for one. */
export function railFaults(rail: Rail): string[] {
  const finite = (...values: number[]) => values.every(Number.isFinite), path = rail.path;
  const faults = [
    ...rail.side === "left" || rail.side === "right" ? [] : ["side: left or right"],
    ...finite(rail.speed) && rail.speed >= 0 ? [] : ["speed: a finite speed, m/s, not negative"],
    ...finite(rail.height) && rail.height >= 0 ? [] : ["height: a finite height, m, not negative"],
  ];
  switch (path.kind) {
    case "line": case "back-and-forth":
      if (!(path.along.length === 2 && finite(...path.along))) faults.push("path: along is a finite point on the floor, x and z");
      break;
    case "circle":
      if (!(path.centre.length === 2 && finite(...path.centre)) || path.centre[0] === 0 && path.centre[1] === 0) faults.push("path: centre is a finite point on the floor off the start");
      if (path.way !== 1 && path.way !== -1) faults.push("path: way is 1 or -1");
      break;
    default: { const never: never = path; faults.push(`path: no kind ${JSON.stringify(never)}`); }
  }
  return faults;
}

/** Where `path` has carried a body `distance` m along it, from where it began (x, z, m), into `out`. */
export function railPlace(path: RailPath, distance: number, out: [number, number]): [number, number] {
  switch (path.kind) {
    case "line": case "back-and-forth": {
      const [x, z] = path.along, length = Math.sqrt(x * x + z * z);
      if (length === 0) { out[0] = 0; out[1] = 0; return out; }
      let gone = distance;
      if (path.kind === "line") gone = Math.min(distance, length);
      else {
        const lap = distance - 2 * length * Math.floor(distance / (2 * length));
        gone = lap <= length ? lap : 2 * length - lap;
      }
      out[0] = x * gone / length; out[1] = z * gone / length;
      return out;
    }
    case "circle": {
      const [cx, cz] = path.centre, radius = Math.sqrt(cx * cx + cz * cz), angle = path.way * distance / radius;
      // The start's place round the centre, turned about +y by the angle.
      const sx = -cx, sz = -cz, c = cos(angle), s = sin(angle);
      out[0] = cx + c * sx + s * sz; out[1] = cz - s * sx + c * sz;
      return out;
    }
    default: { const never: never = path; throw new Error(`no rail path ${JSON.stringify(never)}`); }
  }
}

/**
 * The rail carrying `built`, from now: each segment's centre and turn as they are now are its pad's,
 * moved by the path `clock` s along it. Before every solver step it gives each segment what brings
 * it onto the rail by the step's end, gravity included.
 */
export function carryOnRail(world: World, built: BuiltBody, rail: Rail, clock: () => number): Hook {
  const gravity = world.physics.gravity, dt = world.dt;
  const segments = [...built.segments.values()].map((segment) => {
    const centre = centreOfToRef(segment, new Vector3());
    return { segment, centre: Object.freeze([centre.x, centre.y + rail.height, centre.z] as const), turn: segment.node.rotationQuaternion!.clone() };
  });
  const now = [0, 0] as [number, number], next = [0, 0] as [number, number];
  const at = new Vector3(), velocity = new Vector3(), spin = new Vector3(), wanted = new Vector3(), impulse = new Vector3();
  const frame = new Quaternion(), inverse = new Quaternion();
  return world.beforeStep(() => {
    const time = clock();
    railPlace(rail.path, rail.speed * time, now);
    railPlace(rail.path, rail.speed * (time + dt), next);
    for (const { segment, centre, turn } of segments) {
      const { body } = segment, { mass, moments, orientation } = body.massProperties;
      centreOfToRef(segment, at);
      body.linearVelocityToRef(velocity);
      // The velocity that ends the step where the path will be, closing what it is off over `RETURN`.
      const vx = (next[0] - now[0]) / dt + (centre[0] + now[0] - at.x) / RETURN;
      const vy = (centre[1] - at.y) / RETURN;
      const vz = (next[1] - now[1]) / dt + (centre[2] + now[1] - at.z) / RETURN;
      impulse.set(mass * (vx - velocity.x - gravity[0] * dt), mass * (vy - velocity.y - gravity[1] * dt), mass * (vz - velocity.z - gravity[2] * dt));
      body.applyImpulse(impulse, at);
      // The spin that turns it back to its built turn over `RETURN`, through its inertia in its principal frame.
      const node = segment.node.rotationQuaternion!;
      spinBetweenToRef(node, turn, RETURN, wanted);
      wanted.subtractInPlace(body.angularVelocityToRef(spin));
      node.multiplyToRef(orientation, frame);
      Quaternion.InverseToRef(frame, inverse);
      wanted.applyRotationQuaternionToRef(inverse, wanted);
      wanted.set(wanted.x * moments[0], wanted.y * moments[1], wanted.z * moments[2]);
      wanted.applyRotationQuaternionToRef(frame, wanted);
      body.applyTorqueImpulse(wanted);
    }
  });
}
