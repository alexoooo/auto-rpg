import { Quaternion, Vector3 } from "../../core/math/vector.ts";
import type { BodyObservation } from "../../control/observation.ts";
import { physicalReading } from "../../control/observation.ts";
import { footStatesOf, withinSupport } from "../../control/support.ts";
import type { BuiltBody } from "../../core/bodies/build/build-body.ts";
import type { ContactSink } from "../../core/physics/engine.ts";

/**
 * What a reading holds of one foot's contacts as it reads them, each list kept from step to step
 * and filled up to its count: the fixed colliders it is loaded on with an upward normal, and each
 * loaded upward fixed manifold's points (collider, x, y, z), both in the order the engine tells them.
 */
interface FootContacts {
  touched: boolean;
  fixed: number[];
  fixedCount: number;
  points: number[];
  pointCount: number;
  corners: Vector3[];
  /** The sole `withinSupport` reads. */
  readonly sole: { corners: Vector3[] };
}

/**
 * **Actual loaded contact patches and uprightness**, independent of the recovery policy's requests:
 * whether the body is ready to hand back (`ready`): upright on its soles, loaded only on its feet's
 * upward fixed contacts, every segment quiet, its centre over the outline of its loaded sole patches.
 * Read every step by a stand's verification, so it reads the engine's contacts number by number
 * (`PhysicsWorld.tellContacts`, `tellManifolds`) and allocates nothing until the body stands quiet on
 * its feet, where the support outline is drawn. The reading is one object, overwritten by each call;
 * its `observation` is the body's whole detached observation (`observe`), made only when it is read.
 */
export function recoveryMeasurement(built: BuiltBody, observe: () => BodyObservation) {
  const feet = footStatesOf(built), root = built.segments.get("lowerTrunk")!;
  const inverseRoot = Quaternion.Inverse(root.rest), turn = new Quaternion(), up = new Vector3(), velocity = new Vector3();
  const footUps = feet.map(f => Vector3.UpReadOnly.applyRotationQuaternionToRef(Quaternion.Inverse(f.segment.rest),new Vector3()));
  const physical = physicalReading(built), segments = [...built.segments.values()];
  const footOf = new Map<object, FootContacts>();
  const reads: FootContacts[] = feet.map((f) => {
    const read = { touched: false, fixed: [], fixedCount: 0, points: [], pointCount: 0, corners: [], sole: { corners: [] } };
    footOf.set(f.segment.body, read);
    return read;
  });
  const soles = reads.map(r => r.sole);
  // Quiet, upright two-foot support is the recovery-to-host acceptance condition.
  const settings = { slow: .1, minUpNormal: .9 };
  // What the sink reads now: a foot's contacts (null for another segment), the collider of the manifold whose points it keeps (NaN for none), and whether another segment is loaded on something fixed.
  const now = { foot: null as FootContacts | null, at: Number.NaN, other: false };
  const sink: ContactSink = {
    contact(_other, fixed, impulse, _px, _py, _pz, _nx, ny) {
      if (fixed === null || !(impulse > 0)) return;
      const foot = now.foot;
      if (!foot) { now.other = true; return; }
      if (!(Math.abs(ny) >= settings.minUpNormal)) return;
      foot.touched = true;
      foot.fixed[foot.fixedCount++] = fixed;
    },
    pair() {},
    manifold(other, fixed, _mine, _theirs, _nx, ny, _nz, impulse) {
      now.at = other === null && fixed !== null && impulse > 0 && Math.abs(ny) >= settings.minUpNormal ? fixed : Number.NaN;
    },
    point(x, y, z, distance) {
      const foot = now.foot;
      if (!foot || Number.isNaN(now.at) || !(distance <= 0)) return;
      foot.points[foot.pointCount++] = now.at; foot.points[foot.pointCount++] = x; foot.points[foot.pointCount++] = y; foot.points[foot.pointCount++] = z;
    },
  };
  const reading = {
    rootUp: 0, soleUp: feet.map(() => 0), ready: false, down: false,
    /** The body's centre of mass, world (`physicalReading`). */
    centre: physical().centre,
    get observation(): BodyObservation { return observe(); },
  };
  /** A foot's corners: under each upward loaded contact, the points of its collider's loaded manifolds, in the engine's order. */
  const cornersOf = (read: FootContacts): number => {
    let n = 0;
    for (let c = 0; c < read.fixedCount; c++) for (let k = 0; k < read.pointCount; k += 4) {
      if (read.points[k] !== read.fixed[c]) continue;
      const corner = read.corners[n] ??= new Vector3();
      corner.set(read.points[k + 1]!, read.points[k + 2]!, read.points[k + 3]!);
      read.sole.corners[n++] = corner;
    }
    if (read.sole.corners.length !== n) read.sole.corners.length = n;
    return n;
  };
  const ready = (): boolean => {
    if (reading.down) return false;
    now.other = false;
    for (let i = 0; i < reads.length; i++) { const read = reads[i]!; read.touched = false; read.fixedCount = 0; read.pointCount = 0; }
    for (let i = 0; i < segments.length; i++) {
      const body = segments[i]!.body;
      now.foot = footOf.get(body) ?? null;
      built.physics.tellContacts(body, sink);
      if (now.foot) built.physics.tellManifolds(body, sink);
    }
    now.foot = null;
    if (now.other) return false;
    for (let i = 0; i < reads.length; i++) if (!reads[i]!.touched || cornersOf(reads[i]!) === 0) return false;
    for (let i = 0; i < segments.length; i++) {
      segments[i]!.body.linearVelocityToRef(velocity);
      if (0 + velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z >= settings.slow * settings.slow) return false;
    }
    const { x, z } = reading.centre, nearest = withinSupport(soles, x, z);
    return nearest[0] === x && nearest[1] === z;
  };
  return () => {
    reading.down = physical().down;
    root.pose.rotation.multiplyToRef(inverseRoot,turn);
    up.set(0,1,0).applyRotationQuaternionToRef(turn,up);
    reading.rootUp = up.y;
    let upright = reading.rootUp >= .9;
    for (let i = 0; i < feet.length; i++) {
      up.copyFrom(footUps[i]!).applyRotationQuaternionToRef(feet[i]!.segment.pose.rotation,up);
      reading.soleUp[i] = up.y;
      upright &&= up.y >= .9;
    }
    reading.ready = upright && ready();
    return reading;
  };
}
