// Explicit `.ts` extensions for Node's resolver: `Combat` imports this, and the harness imports Combat.
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { jointsOf, partBodyOf, type PartBody, type PartJoint } from "./rig.ts";
import type { PoseSource } from "./step-start.ts";
import { effectiveMassKg, lumpLinks, principalInertia, worldInertia,
  type LinkJoint, type RigidLink, type Vec3 } from "./golem/effective-mass.ts";

/**
 * **The effective mass of a live body at a contact** (physical contact session 05): the chain from
 * the contact back to its trunk, read off the parts and joints `src/rig.ts` recorded, handed to the
 * pure mechanics in `src/golem/effective-mass.ts`.
 *
 * - **The chain** is the joint path from the contacted part to the heaviest part it is joined to --
 *   the core of a golem or a human, whichever family -- found by walking the recorded joints. It
 *   runs through the terminal, the links (`BuiltChain.parts`) and the mount.
 * - **The trunk is a free-floating base carrying the whole of the rest of the body**: every joined
 *   part that is not on the chain, welded into it with its own mass and inertia at the common
 *   centre. Never the keyframed carrier, which would be infinitely heavy and make a thrust along a
 *   straight arm read as unbounded. With a floating base the answer is at most the whole body.
 * - **The joints on the chain are free** on the axes each was built to swing on, and locked on the
 *   rest; the loop a maul's second hand closes is kept as a second joint into the base.
 * - **Each part's mass properties are the ones the solver carries**, floors and all, and not its own
 *   solid's. The plan that introduced this said the opposite -- the chains' floors (`jointInertiaFloor`,
 *   `castToCarried`, the human arm's `inertiaFloor`) are conditioning rather than body -- and the
 *   stroke overruled it: what a struck body feels is what the solver moves, and a wrist ring cast to
 *   its blade is heavy in the solver whatever it is in stone. Into a 90 kg sphere with the motors let
 *   go at contact and the joint stops opened, the momentum the stroke gave up read 1.47, 3.41, 3.17,
 *   4.95, 9.20, 11.76, 0.96 and 1.29 kg (wrist blade, mace, maul and pitch blade, x1 then max); this
 *   walk through the solver's properties read 1.11, 2.93, 2.97, 4.50, 10.32, 14.77, 0.89 and 1.16,
 *   and through the parts' own solids 0.77, 0.82, 2.35, 2.41, 8.37, 8.39, 0.89 and 1.16 -- a max blade
 *   no heavier than an x1 one (physical contact session 05, the Node impact bench, stand base).
 * - **A joint resting on its stop is the one coupling this leaves out**: the joints are free, and a
 *   stop is not. With the stops left in place the mace at max gave up 7.51 kg against this walk's
 *   4.50.
 *
 * Reads `mesh.position` and `mesh.rotationQuaternion` and nothing else of the pose, because every
 * body part is a scene-root node and a world-matrix read stamps the render id (`AGENTS.md`).
 */
export interface EffectiveMassOptions {
  /**
   * `"solver"`, the default and the one a bout uses: Havok's carried mass properties, floors and all,
   * which is what a struck body is moved by and what the impact bench's tap measures through.
   * `"geometric"`: each part's own solid, what the body would be without the solver's conditioning.
   */
  readonly inertia?: "geometric" | "solver";
  /** Bodies that cannot move -- the bench's keyframed stand. A pinned body becomes the base. */
  readonly pinned?: ReadonlySet<PhysicsBody>;
  /**
   * Where each part stood at the instant the contact describes, when that is not where it stands
   * now. A collision callback runs after the solver step, and Havok's point and normal are from
   * before it, so `Combat`'s `"arrival"` reading hands in the step's start (`StepStart.poseOf` in
   * `src/step-start.ts`): the point, the lever and every joint are then read at one instant. A part
   * it has no pose for is read where it stands. Absent: every part where it stands.
   */
  readonly pose?: PoseSource;
}

type Rotation = readonly [number, number, number, number];

const rotationOf = (q: Quaternion | null): Rotation => q ? [q.x, q.y, q.z, q.w] : [0, 0, 0, 1];
const compose = (a: Rotation, b: Rotation): Rotation => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
function rotate(q: Rotation, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
}
const vec = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function linkOf(entry: PartBody, options: EffectiveMassOptions): RigidLink {
  const mesh = entry.part.mesh;
  const at = options.pose?.(entry.part.body) ?? null;
  const rotation = rotationOf(at ? at.rotation : mesh.rotationQuaternion);
  const position = vec(at ? at.position : mesh.position);
  const pinned = options.pinned?.has(entry.part.body) ?? false;
  if (options.inertia !== "geometric") {
    const props = entry.part.body.getMassProperties();
    const orientation = compose(rotation, rotationOf(props.inertiaOrientation ?? null));
    const massKg = props.mass ?? entry.massKg;
    // Havok reads and writes inertia per kilogram of the body's mass, whatever the property is called.
    const inertia = props.inertia ? vec(props.inertia.scale(massKg)) : principalInertia(entry.shape, entry.massKg);
    return { massKg, pinned,
      centre: add(position, rotate(rotation, props.centerOfMass ? vec(props.centerOfMass) : [0, 0, 0])),
      inertia: worldInertia(inertia, orientation) };
  }
  return { massKg: entry.massKg, pinned,
    centre: add(position, entry.centerOfMass ? rotate(rotation, vec(entry.centerOfMass)) : [0, 0, 0]),
    inertia: worldInertia(principalInertia(entry.shape, entry.massKg), rotation) };
}

/** The pivot and the locked angular axes of a joint, in world terms, from its child's pose. */
function jointFrame(joint: PartJoint, options: EffectiveMassOptions): { pivot: Vec3; locked: Vec3[] } {
  const at = options.pose?.(joint.child.body) ?? null;
  const rotation = rotationOf(at ? at.rotation : joint.child.mesh.rotationQuaternion);
  const pivot = add(vec(at ? at.position : joint.child.mesh.position), rotate(rotation, vec(joint.pivotChild)));
  const x = vec(joint.axisChild.clone().normalize());
  const y = vec(joint.perpChild.clone().normalize());
  const z: Vec3 = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  const locked: Vec3[] = [];
  if (!joint.free.x) locked.push(rotate(rotation, x));
  if (!joint.free.y) locked.push(rotate(rotation, y));
  if (!joint.free.z) locked.push(rotate(rotation, z));
  return { pivot, locked };
}

/**
 * The effective mass of `body` at `point` along `normal`, kilograms. `Infinity` for a body nothing
 * moves (a wall, a post, a chain pinned straight along the normal). A body no builder in `rig.ts`
 * made answers the mass Havok carries for it, which for the arena's static pieces is 0 and so
 * `Infinity`.
 */
export function effectiveMassAt(body: PhysicsBody, point: Vector3, normal: Vector3,
  options: EffectiveMassOptions = {}): number {
  const own = partBodyOf(body);
  if (!own) {
    const mass = body.getMassProperties().mass ?? 0;
    return mass > 0 ? mass : Infinity;
  }
  // Everything joined to it, and every live joint among them.
  const parts = new Map<PhysicsBody, PartBody>([[body, own]]);
  const joints = new Set<PartJoint>();
  const queue: PhysicsBody[] = [body];
  while (queue.length > 0) {
    const next = queue.pop() as PhysicsBody;
    for (const joint of jointsOf(next)) {
      joints.add(joint);
      for (const other of [joint.parent.body, joint.child.body]) {
        if (parts.has(other)) continue;
        const entry = partBodyOf(other);
        if (!entry) continue;
        parts.set(other, entry);
        queue.push(other);
      }
    }
  }
  // The base: a pinned body if there is one, otherwise the heaviest.
  let base = body;
  let heaviest = -1;
  for (const [candidate, entry] of parts) {
    if (options.pinned?.has(candidate)) { base = candidate; break; }
    if (entry.massKg > heaviest) { heaviest = entry.massKg; base = candidate; }
  }
  // The chain: the joint path from the contact back to the base.
  const cameFrom = new Map<PhysicsBody, PhysicsBody | null>([[base, null]]);
  const frontier: PhysicsBody[] = [base];
  while (frontier.length > 0 && !cameFrom.has(body)) {
    const next = frontier.shift() as PhysicsBody;
    for (const joint of jointsOf(next)) {
      const other = joint.parent.body === next ? joint.child.body : joint.parent.body;
      if (cameFrom.has(other) || !parts.has(other)) continue;
      cameFrom.set(other, next);
      frontier.push(other);
    }
  }
  const chain: PhysicsBody[] = [];
  for (let at: PhysicsBody | null = body; at && at !== base; at = cameFrom.get(at) ?? null) chain.push(at);
  const index = new Map<PhysicsBody, number>(chain.map((part, i) => [part, i]));
  const baseIndex = chain.length;
  const links: RigidLink[] = chain.map((part) => linkOf(parts.get(part) as PartBody, options));
  links.push(lumpLinks([...parts].filter(([part]) => !index.has(part)).map(([, entry]) => linkOf(entry, options))));
  const at = (part: PhysicsBody): number => index.get(part) ?? baseIndex;
  const linkJoints: LinkJoint[] = [];
  for (const joint of joints) {
    if (!parts.has(joint.parent.body) || !parts.has(joint.child.body)) continue;
    const a = at(joint.parent.body);
    const b = at(joint.child.body);
    if (a === b) continue;
    const { pivot, locked } = jointFrame(joint, options);
    linkJoints.push({ a, b, pivot, lockedAngular: locked });
  }
  return effectiveMassKg(links, linkJoints, { link: at(body), point: vec(point), normal: vec(normal) });
}

