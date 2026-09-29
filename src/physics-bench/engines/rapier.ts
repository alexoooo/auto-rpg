import type RAPIER_NS from "@dimforge/rapier3d-compat";
import { GRAVITY, type Joint, type Shape } from "../model.ts";
import { STRIDE } from "../control.ts";
import { add, cross, normalize, perpendicular, qBetween, qFromBasis, scale, sub, dot, type V3 } from "../math.ts";
import { conditioningOf, describe, FRICTION, type SceneSpec, type Settings, type Sim } from "./types.ts";

export type Rapier = typeof RAPIER_NS;

/**
 * **Rapier** (`@dimforge/rapier3d-compat`, or the SIMD build; the same API). Two joint kinds:
 *
 * - `joints: "impulse"` (the default): maximal coordinates, like Havok. Each joint is a generic
 *   joint whose frame's X, Y, Z are the spec's freedom axes, linear axes and unused angular axes
 *   locked, every free axis limited to its range (`jointSetLimits` on the raw set; the typed API
 *   limits only one-axis joints).
 * - `joints: "multibody"`: reduced coordinates (Featherstone). Rapier's JS API gives multibody
 *   joints no limits at all, so this kind is unlimited; a joint of two freedoms is only built when
 *   its axes are the world's x and z (the ankle), since the generic joint's frame cannot be set.
 *
 * Knobs: `iterations` (`numSolverIterations`, default 4), `pgs` (`numInternalPgsIterations`,
 * default 1), `joints`, `contactHz` (`contact_natural_frequency`, the contacts' softness, Hz;
 * unset, Rapier's default). Bodies never sleep; colliders carry no mass (density 0), the mass
 * properties are set on the body.
 */
export const RAPIER_DEFAULTS = { iterations: 4, pgs: 1, joints: "impulse" } as const;

export function createRapier(R: Rapier, scene: SceneSpec, settings: Settings): Sim & { readonly world: RAPIER_NS.World } {
  const world = new R.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = 1 / settings.hz / settings.substeps;
  world.numSolverIterations = Number(settings.iterations ?? RAPIER_DEFAULTS.iterations);
  world.numInternalPgsIterations = Number(settings.pgs ?? RAPIER_DEFAULTS.pgs);
  if (settings.contactHz !== undefined) world.integrationParameters.contact_natural_frequency = Number(settings.contactHz);
  const multibody = (settings.joints ?? RAPIER_DEFAULTS.joints) === "multibody";
  const friction = scene.friction ?? FRICTION;
  if (scene.ground) {
    world.createCollider(R.ColliderDesc.cuboid(50, 1, 50).setTranslation(0, -1, 0).setFriction(friction).setRestitution(0));
  }
  const bodies: RAPIER_NS.RigidBody[] = [];
  for (const model of scene.models) {
    const own: RAPIER_NS.RigidBody[] = [];
    for (const seg of model.segments) {
      const k = conditioningOf(scene, seg.name);
      const [qx, qy, qz, qw] = seg.inertiaFrame;
      const desc = R.RigidBodyDesc.dynamic().setTranslation(...seg.com).setCanSleep(false)
        .setAdditionalMassProperties(seg.mass, { x: 0, y: 0, z: 0 }, { x: seg.inertia[0] * k, y: seg.inertia[1] * k, z: seg.inertia[2] * k }, { x: qx, y: qy, z: qz, w: qw });
      const body = world.createRigidBody(desc);
      world.createCollider(colliderOf(R, seg.shape).setDensity(0).setFriction(friction).setRestitution(0), body);
      own.push(body);
    }
    for (const joint of model.joints) {
      let parent: RAPIER_NS.RigidBody, parentCom: V3;
      if (joint.parent < 0) {
        parent = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...joint.centre));
        parentCom = joint.centre;
      } else {
        parent = own[joint.parent]!;
        parentCom = model.segments[joint.parent]!.com;
      }
      const child = own[joint.child]!;
      const a1 = sub(joint.centre, parentCom), a2 = sub(joint.centre, model.segments[joint.child]!.com);
      if (multibody) multibodyJoint(R, world, joint, parent, child, a1, a2);
      else impulseJoint(R, world, joint, parent, child, a1, a2);
    }
    bodies.push(...own);
  }
  const t = { x: 0, y: 0, z: 0 }, q = { x: 0, y: 0, z: 0, w: 1 }, v = { x: 0, y: 0, z: 0 }, w = { x: 0, y: 0, z: 0 };
  const torque = { x: 0, y: 0, z: 0 };
  return {
    label: `Rapier ${describe(settings)}`,
    segments: bodies.length,
    world,
    prepare() {},
    read(state) {
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i]!, o = i * STRIDE;
        b.translation(t); b.rotation(q); b.linvel(v); b.angvel(w);
        state[o] = t.x; state[o + 1] = t.y; state[o + 2] = t.z;
        state[o + 3] = q.x; state[o + 4] = q.y; state[o + 5] = q.z; state[o + 6] = q.w;
        state[o + 7] = v.x; state[o + 8] = v.y; state[o + 9] = v.z;
        state[o + 10] = w.x; state[o + 11] = w.y; state[o + 12] = w.z;
      }
    },
    applyTorques(torques) {
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i]!;
        torque.x = torques[3 * i]!; torque.y = torques[3 * i + 1]!; torque.z = torques[3 * i + 2]!;
        b.resetTorques(false);
        b.addTorque(torque, false);
      }
    },
    step() {
      for (let k = 0; k < settings.substeps; k++) world.step();
    },
    dispose() {
      world.free();
    },
  };
}

function colliderOf(R: Rapier, shape: Shape): RAPIER_NS.ColliderDesc {
  switch (shape.kind) {
    case "capsule": {
      const d = sub(shape.b, shape.a), len = Math.hypot(...d);
      const mid = scale(add(shape.a, shape.b), 0.5);
      const [x, y, z, w] = len > 1e-9 ? qBetween([0, 1, 0], normalize(d)) : [0, 0, 0, 1];
      return R.ColliderDesc.capsule(len / 2, shape.radius).setTranslation(...mid).setRotation({ x, y, z, w });
    }
    case "sphere": return R.ColliderDesc.ball(shape.radius).setTranslation(...shape.centre);
    case "box": {
      const [x, y, z, w] = shape.rotation;
      return R.ColliderDesc.cuboid(...shape.half).setTranslation(...shape.centre).setRotation({ x, y, z, w });
    }
    default: {
      const never: never = shape;
      throw new Error(`unknown shape ${JSON.stringify(never)}`);
    }
  }
}

const vx = (v: V3): { x: number; y: number; z: number } => ({ x: v[0], y: v[1], z: v[2] });

/** The joint frame: X, Y along the first two freedoms, Z = X x Y; each freedom's sign along its frame axis. */
function frameOf(joint: Joint): { rot: { x: number; y: number; z: number; w: number }; signs: number[] } {
  const x = normalize(joint.dofs[0]!.axis);
  const y = joint.dofs[1] ? normalize(joint.dofs[1].axis) : perpendicular(x);
  const z = cross(x, y);
  const [qx, qy, qz, qw] = qFromBasis(x, y, z);
  const along = [x, y, z];
  return { rot: { x: qx, y: qy, z: qz, w: qw }, signs: joint.dofs.map((d, k) => Math.sign(dot(normalize(d.axis), along[k]!))) };
}

function impulseJoint(R: Rapier, world: RAPIER_NS.World, joint: Joint, parent: RAPIER_NS.RigidBody, child: RAPIER_NS.RigidBody, a1: V3, a2: V3): void {
  const M = R.JointAxesMask;
  const n = joint.dofs.length;
  const locked = M.LinX | M.LinY | M.LinZ | (n < 2 ? M.AngY : 0) | (n < 3 ? M.AngZ : 0);
  const data = R.JointData.generic(vx(a1), vx(a2), vx(normalize(joint.dofs[0]!.axis)), locked);
  const j = world.createImpulseJoint(data, parent, child, true);
  const { rot, signs } = frameOf(joint);
  j.setLocalFrame1(vx(a1), rot);
  j.setLocalFrame2(vx(a2), rot);
  j.setContactsEnabled(false);
  const axes = [R.JointAxis.AngX, R.JointAxis.AngY, R.JointAxis.AngZ];
  joint.dofs.forEach((d, k) => {
    const [lo, hi] = signs[k]! > 0 ? [d.min, d.max] : [-d.max, -d.min];
    world.impulseJoints.raw.jointSetLimits(j.handle, axes[k]! as unknown as never, lo, hi);
  });
}

function multibodyJoint(R: Rapier, world: RAPIER_NS.World, joint: Joint, parent: RAPIER_NS.RigidBody, child: RAPIER_NS.RigidBody, a1: V3, a2: V3): void {
  const n = joint.dofs.length;
  let data: RAPIER_NS.JointData;
  if (n === 3) data = R.JointData.spherical(vx(a1), vx(a2));
  else if (n === 1) data = R.JointData.revolute(vx(a1), vx(a2), vx(normalize(joint.dofs[0]!.axis)));
  else {
    const [d1, d2] = joint.dofs.map((d) => normalize(d.axis));
    if (Math.abs(Math.abs(d1![0]) - 1) > 1e-9 || Math.abs(Math.abs(d2![2]) - 1) > 1e-9) {
      throw new Error(`Rapier multibody: ${joint.name}'s two freedoms are not the world's x and z`);
    }
    const M = R.JointAxesMask;
    data = R.JointData.generic(vx(a1), vx(a2), { x: 1, y: 0, z: 0 }, M.LinX | M.LinY | M.LinZ | M.AngY);
  }
  const j = world.createMultibodyJoint(data, parent, child, true);
  j.setContactsEnabled(false);
}
