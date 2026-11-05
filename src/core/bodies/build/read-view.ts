import type { Vector3 } from "../../math/vector.ts";
import type { Contact, ContactManifold, SegmentBody } from "../../physics/engine.ts";
import type { ConfigurationName } from "../spec/body.ts";
import type { BodyRef, ReadBody, ReadContact, ReadJoint, ReadPhysics, ReadSegment, ReadSegmentBody } from "../read-body.ts";
import type { BuiltBody, BuiltSegment } from "./build-body.ts";

/** Each body's identity in a contact: its read view's where it has one, else its id and name alone. */
const refs = new WeakMap<SegmentBody, BodyRef>();
/** Each read view's own engine body, which its physics reads contacts of. */
const engineOf = new WeakMap<ReadSegmentBody, SegmentBody>();
/** Each built body's read view, made once so that its identities are one. */
const views = new WeakMap<BuiltBody, ReadBody>();

/** `body` as a contact names it to a mind (`BodyRef`). */
function refOf(body: SegmentBody | null): BodyRef | null {
  if (body === null) return null;
  let ref = refs.get(body);
  if (!ref) { ref = Object.freeze({ id: body.id, pose: Object.freeze({ name: body.pose.name }) }); refs.set(body, ref); }
  return ref;
}

/** A detached identity projection; cached engine records retain their engine bodies. */
function named<C extends Contact | ContactManifold>(contacts: readonly C[]): readonly (Omit<C, "other"> & { readonly other: BodyRef | null })[] {
  return contacts.map((contact) => ({ ...contact, other: refOf(contact.other) }));
}

function segmentView(segment: BuiltSegment): ReadSegment {
  const real = segment.pose, body = segment.body;
  const pose = Object.freeze({
    name: real.name,
    get position(): Vector3 { return real.position; },
    get rotation() { return real.rotation; },
  });
  const readBody: ReadSegmentBody = Object.freeze({
    id: body.id, pose,
    linearVelocityToRef: (out: Vector3) => body.linearVelocityToRef(out),
    angularVelocityToRef: (out: Vector3) => body.angularVelocityToRef(out),
    get massProperties() { return body.massProperties; },
  });
  engineOf.set(readBody, body);
  refs.set(body, readBody);
  const configured = segment.configuration;
  const configuration = configured ? Object.freeze({ get applied(): ConfigurationName { return configured.applied; }, get requested(): ConfigurationName { return configured.requested; } }) : undefined;
  return Object.freeze({
    spec: segment.spec, frame: segment.frame, pose, body: readBody, rest: segment.rest, get rigid() { return segment.rigid; },
    ...(configuration ? { configuration } : {}), ...(segment.poses ? { poses: segment.poses } : {}), ...(segment.toes ? { toes: segment.toes } : {}),
  });
}

/**
 * **`built` as its mind reads it** (`ReadBody`): the same body by views that read its poses and
 * engine bodies live and hold neither, so that nothing a mind is given moves the body, sets a
 * motor or reaches the engine. One view a body: a segment, a joint and a contact's other side are
 * the same objects wherever a mind meets them.
 */
export function readView(built: BuiltBody): ReadBody {
  const made = views.get(built);
  if (made) return made;
  const segments = new Map<string, ReadSegment>();
  const byBuilt = new Map<BuiltSegment, ReadSegment>();
  for (const [name, segment] of built.segments) {
    const view = segmentView(segment);
    segments.set(name, view);
    byBuilt.set(segment, view);
  }
  const joints = new Map<string, ReadJoint>();
  for (const [name, joint] of built.joints) joints.set(name, Object.freeze({
    spec: joint.spec, dofs: joint.dofs, axes: joint.axes, parent: byBuilt.get(joint.parent)!, child: byBuilt.get(joint.child)!, strength: joint.strength, attached: joint.attached,
  }));
  const physics = built.physics;
  const engine = (body: ReadSegmentBody): SegmentBody => {
    const real = engineOf.get(body);
    if (!real) throw new Error("contacts are read of a body's own segments");
    return real;
  };
  const wantedOf = (wanted?: (other: BodyRef | null) => boolean) => wanted && ((other: SegmentBody | null) => wanted(refOf(other)));
  const read: ReadPhysics = Object.freeze({
    gravity: physics.gravity,
    contactsOf: (body: ReadSegmentBody, wanted?: (other: BodyRef | null) => boolean): readonly ReadContact[] =>
      named(physics.contactsOf(engine(body), wantedOf(wanted)) as Contact[]),
    contactManifoldsOf: (body: ReadSegmentBody, wanted?: (other: BodyRef | null) => boolean) =>
      named(physics.contactManifoldsOf(engine(body), wantedOf(wanted)) as ContactManifold[]),
  });
  const poses = built.configurations;
  const state = Object.freeze(Object.fromEntries(Object.entries(poses.state).map(([segment, pose]) => [segment,
    Object.freeze({ get applied(): ConfigurationName { return pose.applied; }, get requested(): ConfigurationName { return pose.requested; } })])));
  const view: ReadBody = Object.freeze({
    spec: built.spec, physics: read, segments, joints, configurations: Object.freeze({ model: poses.model, state }),
  });
  views.set(built, view);
  return view;
}
