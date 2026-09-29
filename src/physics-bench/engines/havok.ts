import "@babylonjs/core/Physics/joinedPhysicsEngineComponent.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import { Physics6DoFConstraint, type Physics6DoFLimit } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import { PhysicsShapeBox, PhysicsShapeCapsule, PhysicsShapeSphere, type PhysicsShape } from "@babylonjs/core/Physics/v2/physicsShape.js";
import { PhysicsActivationControl, PhysicsConstraintAxis, PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
import type { HavokPhysicsWithBindings } from "@babylonjs/havok";
import { GRAVITY, type Joint, type Shape } from "../model.ts";
import { STRIDE } from "../control.ts";
import { cross, dot, normalize, perpendicular, scale, sub, type V3 } from "../math.ts";
import { conditioningOf, describe, FRICTION, type SceneSpec, type Settings, type Sim } from "./types.ts";

/**
 * **Havok** (`@babylonjs/havok`, through Babylon's plugin as the game uses it) for the bake-off's
 * neutral body: bodies and 6-DoF constraints are made with Babylon's `PhysicsBody` and
 * `Physics6DoFConstraint` exactly as `buildBody` makes them (free angular axes the spec's freedoms,
 * limited to their ranges, the rest locked; joint partners do not collide), but world-aligned at
 * the centre of mass like every engine here. It is stepped and read through the raw Havok calls
 * (`HP_World_Step`, `HP_Body_GetQTransform`, the two velocity reads, `HP_Body_ApplyAngularImpulse`),
 * not Babylon's step, which would also sync every node. A torque is an angular impulse of torque
 * times the solver step, given before each solver step.
 *
 * Havok exposes no solver setting but the step (`HP_World_SetIdealStepTime`, set to the solver
 * step), so its only knobs are `substeps` and the scene's inertia conditioning. Damping is set to
 * zero (`damping: "default"` keeps Havok's), and bodies are always active (H08).
 */
export function createHavok(hk: HavokPhysicsWithBindings, scene: SceneSpec, settings: Settings): Sim & { readonly scene: Scene; readonly plugin: HavokPlugin } {
  const engine = new NullEngine();
  const bScene = new Scene(engine);
  const plugin = new HavokPlugin(false, hk);
  if (!bScene.enablePhysics(new Vector3(0, -GRAVITY, 0), plugin)) throw new Error("Havok did not attach");
  const dt = 1 / settings.hz / settings.substeps;
  plugin.setTimeStep(dt);
  const friction = scene.friction ?? FRICTION;
  const keepDamping = settings.damping === "default";
  if (scene.ground) {
    const node = new TransformNode("ground", bScene);
    node.position = new Vector3(0, -1, 0);
    node.rotationQuaternion = Quaternion.Identity();
    const body = new PhysicsBody(node, PhysicsMotionType.STATIC, false, bScene);
    body.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(100, 2, 100), bScene);
    body.shape.material = { friction, restitution: 0 };
  }
  const bodies: PhysicsBody[] = [];
  scene.models.forEach((model, mi) => {
    const own = model.segments.map((seg) => {
      const node = new TransformNode(`m${mi}.${seg.name}`, bScene);
      node.position = new Vector3(...seg.com);
      node.rotationQuaternion = Quaternion.Identity();
      const body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, bScene);
      body.shape = shapeOf(seg.shape, bScene);
      body.shape.material = { friction, restitution: 0 };
      const k = conditioningOf(scene, seg.name);
      body.setMassProperties({
        mass: seg.mass, centerOfMass: Vector3.Zero(),
        inertia: new Vector3(...seg.inertia).scaleInPlace(k / seg.mass),
        inertiaOrientation: new Quaternion(...seg.inertiaFrame),
      });
      if (!keepDamping) { body.setLinearDamping(0); body.setAngularDamping(0); }
      plugin.setActivationControl(body, PhysicsActivationControl.ALWAYS_ACTIVE);
      return body;
    });
    for (const joint of model.joints) {
      let parent: PhysicsBody, parentCom: V3;
      if (joint.parent < 0) {
        const node = new TransformNode(`m${mi}.${joint.name}.anchor`, bScene);
        node.position = new Vector3(...joint.centre);
        node.rotationQuaternion = Quaternion.Identity();
        parent = new PhysicsBody(node, PhysicsMotionType.STATIC, false, bScene);
        const shape = new PhysicsShapeSphere(Vector3.Zero(), 0.001, bScene);
        shape.filterMembershipMask = 0;
        shape.filterCollideMask = 0;
        parent.shape = shape;
        parentCom = joint.centre;
      } else {
        parent = own[joint.parent]!;
        parentCom = model.segments[joint.parent]!.com;
      }
      const child = own[joint.child]!;
      jointOf(joint, parent, child, sub(joint.centre, parentCom), sub(joint.centre, model.segments[joint.child]!.com), bScene);
    }
    bodies.push(...own);
  });
  const world = plugin.world;
  const ids = bodies.map((b) => (b as unknown as { _pluginData: { hpBodyId: never } })._pluginData.hpBodyId);
  hk.HP_World_SetIdealStepTime(world, dt);
  const impulses = new Float64Array(3 * bodies.length);
  const imp: [number, number, number] = [0, 0, 0];
  return {
    label: `Havok ${describe(settings)}${scene.conditioning ? ` cond=${JSON.stringify(scene.conditioning)}` : ""}`,
    segments: bodies.length,
    scene: bScene, plugin,
    prepare() {},
    read(state) {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!, o = i * STRIDE;
        const [p, q] = hk.HP_Body_GetQTransform(id)[1];
        const v = hk.HP_Body_GetLinearVelocity(id)[1], w = hk.HP_Body_GetAngularVelocity(id)[1];
        state[o] = p[0]; state[o + 1] = p[1]; state[o + 2] = p[2];
        state[o + 3] = q[0]; state[o + 4] = q[1]; state[o + 5] = q[2]; state[o + 6] = q[3];
        state[o + 7] = v[0]; state[o + 8] = v[1]; state[o + 9] = v[2];
        state[o + 10] = w[0]; state[o + 11] = w[1]; state[o + 12] = w[2];
      }
    },
    applyTorques(torques) {
      for (let i = 0; i < torques.length; i++) impulses[i] = torques[i]! * dt;
    },
    step() {
      for (let k = 0; k < settings.substeps; k++) {
        for (let i = 0; i < ids.length; i++) {
          imp[0] = impulses[3 * i]!; imp[1] = impulses[3 * i + 1]!; imp[2] = impulses[3 * i + 2]!;
          hk.HP_Body_ApplyAngularImpulse(ids[i]!, imp);
        }
        hk.HP_World_Step(world, dt);
      }
    },
    dispose() {
      bScene.dispose();
      engine.dispose();
    },
  };
}

function shapeOf(shape: Shape, scene: Scene): PhysicsShape {
  switch (shape.kind) {
    case "capsule": return new PhysicsShapeCapsule(new Vector3(...shape.a), new Vector3(...shape.b), shape.radius, scene);
    case "sphere": return new PhysicsShapeSphere(new Vector3(...shape.centre), shape.radius, scene);
    case "box": return new PhysicsShapeBox(new Vector3(...shape.centre), new Quaternion(...shape.rotation), new Vector3(...scale(shape.half, 2)), scene);
    default: {
      const never: never = shape;
      throw new Error(`unknown shape ${JSON.stringify(never)}`);
    }
  }
}

const LINEAR = [PhysicsConstraintAxis.LINEAR_X, PhysicsConstraintAxis.LINEAR_Y, PhysicsConstraintAxis.LINEAR_Z] as const;
const ANGULAR = [PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Y, PhysicsConstraintAxis.ANGULAR_Z] as const;

/** As `buildBody`'s `buildJoint`: X the first freedom, Y the second (or any square to X), Z = X x Y. */
function jointOf(joint: Joint, parent: PhysicsBody, child: PhysicsBody, pivotA: V3, pivotB: V3, scene: Scene): void {
  const x = normalize(joint.dofs[0]!.axis);
  const y = joint.dofs[1] ? normalize(joint.dofs[1].axis) : perpendicular(x);
  const z = cross(x, y);
  const along = [x, y, z];
  const limits: Physics6DoFLimit[] = LINEAR.map((axis) => ({ axis, minLimit: 0, maxLimit: 0 }));
  ANGULAR.forEach((axis, k) => {
    const d = joint.dofs[k];
    if (!d) { limits.push({ axis, minLimit: 0, maxLimit: 0 }); return; }
    const sign = Math.sign(dot(normalize(d.axis), along[k]!));
    limits.push(sign > 0 ? { axis, minLimit: d.min, maxLimit: d.max } : { axis, minLimit: -d.max, maxLimit: -d.min });
  });
  const constraint = new Physics6DoFConstraint({
    pivotA: new Vector3(...pivotA), pivotB: new Vector3(...pivotB),
    axisA: new Vector3(...x), axisB: new Vector3(...x), perpAxisA: new Vector3(...y), perpAxisB: new Vector3(...y),
    collision: false,
  }, limits, scene);
  parent.addConstraint(child, constraint);
}
