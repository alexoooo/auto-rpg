import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import { PhysicsShapeBox } from "@babylonjs/core/Physics/v2/physicsShape.js";
import { PhysicsActivationControl, PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { HavokPhysicsWithBindings } from "@babylonjs/havok";
import { buildBody, type BuiltBody } from "../../core/build/build-body.ts";
import { humanSpec } from "../../core/human/spec.ts";
import { createWorld } from "../../core/world.ts";
import { dot, sub, type V3 } from "../math.ts";
import { STRIDE } from "../control.ts";
import { FIGHTER } from "../model.ts";
import { describe, FRICTION, type Settings, type Sim } from "./types.ts";

/**
 * **Havok's real human, as the core builds and steps it**: `buildBody(humanSpec("workshop-fighter"))`
 * (convex hulls for the trunk, segment-frame nodes) in the core's world (`createWorld`), stepped
 * through Babylon (`PhysicsEngine._step`, which also syncs every node), read through Babylon's nodes
 * and `getLinearVelocityToRef` / `getAngularVelocityToRef`, torques through `applyAngularImpulse`.
 * Segments are in the spec's order, which is `humanModel()`'s, so the same controller drives it.
 * `offsets` places one human per entry (the body frame's origin, between the soles).
 */
export function createHavokReal(hk: HavokPhysicsWithBindings, offsets: readonly V3[], settings: Settings, conditioning: Readonly<Record<string, number>> = {}): Sim {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const hz = settings.hz * settings.substeps;
  const world = createWorld(scene, hk, { hz });
  const plugin = scene.getPhysicsEngine()!.getPhysicsPlugin();
  const node = new TransformNode("ground", scene);
  node.position = new Vector3(0, -1, 0);
  node.rotationQuaternion = Quaternion.Identity();
  const ground = new PhysicsBody(node, PhysicsMotionType.STATIC, false, scene);
  ground.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(100, 2, 100), scene);
  ground.shape.material = { friction: FRICTION, restitution: 0 };
  const spec = humanSpec(FIGHTER);
  const built: BuiltBody[] = offsets.map((position) => buildBody(spec, scene, { position }));
  const segs = built.flatMap((b) => [...b.segments.values()]);
  for (const s of segs) {
    s.shape.material = { friction: FRICTION, restitution: 0 };
    (plugin as unknown as { setActivationControl(b: PhysicsBody, c: number): void }).setActivationControl(s.body, PhysicsActivationControl.ALWAYS_ACTIVE);
    const k = conditioning[s.spec.name];
    if (k) {
      const m = s.body.getMassProperties();
      s.body.setMassProperties({ ...m, inertia: m.inertia!.scale(k) });
    }
  }
  const localCom = segs.map((s): V3 => {
    const d = sub(s.spec.centreOfMass.value, s.frame.origin);
    return [dot(d, s.frame.x), dot(d, s.frame.y), dot(d, s.frame.z)];
  });
  const restInverse = segs.map((s) => Quaternion.Inverse(s.rest));
  const q = new Quaternion(), c = new Vector3(), v = new Vector3(), w = new Vector3(), imp = new Vector3();
  const lc = localCom.map((l) => new Vector3(...l));
  const dt = 1 / hz;
  const impulses = new Float64Array(3 * segs.length);
  return {
    label: `Havok real buildBody ${describe(settings)}${Object.keys(conditioning).length ? ` cond=${JSON.stringify(conditioning)}` : ""}`,
    segments: segs.length,
    prepare() {},
    read(state) {
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]!, o = i * STRIDE, rot = s.node.rotationQuaternion!;
        lc[i]!.applyRotationQuaternionToRef(rot, c);
        state[o] = s.node.position.x + c.x; state[o + 1] = s.node.position.y + c.y; state[o + 2] = s.node.position.z + c.z;
        rot.multiplyToRef(restInverse[i]!, q);
        state[o + 3] = q.x; state[o + 4] = q.y; state[o + 5] = q.z; state[o + 6] = q.w;
        s.body.getLinearVelocityToRef(v);
        s.body.getAngularVelocityToRef(w);
        state[o + 7] = v.x; state[o + 8] = v.y; state[o + 9] = v.z;
        state[o + 10] = w.x; state[o + 11] = w.y; state[o + 12] = w.z;
      }
    },
    applyTorques(torques) {
      for (let i = 0; i < torques.length; i++) impulses[i] = torques[i]! * dt;
    },
    step() {
      for (let k = 0; k < settings.substeps; k++) {
        for (let i = 0; i < segs.length; i++) {
          imp.set(impulses[3 * i]!, impulses[3 * i + 1]!, impulses[3 * i + 2]!);
          segs[i]!.body.applyAngularImpulse(imp);
        }
        world.step(1);
      }
    },
    dispose() {
      world.dispose();
      for (const b of built) b.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
