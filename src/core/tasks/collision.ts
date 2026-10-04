import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { PhysicsEngine } from "../engine/engine.ts";
import { createWorld } from "../world.ts";

interface CollisionConfiguration {
  readonly ccd: boolean;
  readonly mode: "linear" | "rotate";
  readonly hz: number;
  readonly shieldHeight: number;
  readonly shieldSpeed: number;
  readonly actuation: "symmetric" | "directional";
}

/**
 * A numerical tunnelling fixture: a free bar and a thin moving defense. Geometry, mass, inertia
 * and launch speeds are the engineering inputs in `docs/reference/collision-ccd.md`, not anatomy.
 * The caller owns stepping, scoring and the scene. Neither collider has a prescribed trajectory.
 */
export function createCollisionProbe(scene: Scene, engine: PhysicsEngine, config: CollisionConfiguration) {
  if (!Number.isInteger(config.hz) || config.hz < 120 || config.hz % 120 !== 0
    || !Number.isFinite(config.shieldHeight) || !Number.isFinite(config.shieldSpeed)
    || typeof config.ccd !== "boolean" || !["linear", "rotate"].includes(config.mode)) throw new Error("invalid collision probe configuration");
  const world = createWorld(scene, engine, { gravity: false, hz: config.hz, actuation: config.actuation });
  const barNode = new TransformNode("bar", scene), shieldNode = new TransformNode("shield", scene);
  barNode.rotationQuaternion = Quaternion.Identity(); shieldNode.rotationQuaternion = Quaternion.Identity();
  shieldNode.position.set(0.4, config.shieldHeight, 0);
  const bar = world.physics.addBody(barNode, [{ kind: "capsule", from: [0, -0.5, 0], to: [0, 0.5, 0], radius: 0.015 }], {
    mass: 1, centre: [0, 0, 0], moments: [0.09, 0.0001125, 0.09], orientation: Quaternion.Identity(),
  }, { ccd: config.ccd });
  const mass = 10, width = 0.01, height = 0.02, depth = 1;
  const shield = world.physics.addBody(shieldNode, [{ kind: "box", centre: [0, 0, 0], size: [width, height, depth] }], {
    mass, centre: [0, 0, 0], moments: [mass * (height * height + depth * depth) / 12,
      mass * (width * width + depth * depth) / 12, mass * (width * width + height * height) / 12], orientation: Quaternion.Identity(),
  });
  shield.applyImpulse(new Vector3(mass * config.shieldSpeed, 0, 0), shieldNode.position);
  switch (config.mode) {
    case "linear": bar.applyImpulse(new Vector3(120, 0, 0), barNode.position); break;
    case "rotate": bar.applyTorqueImpulse(new Vector3(0, 0, 0.09 * 80)); break;
    default: { const never: never = config.mode; throw new Error(`unknown collision mode ${never}`); }
  }
  const velocity = new Vector3(), spin = new Vector3();
  const tuple = (v: Vector3) => [v.x, v.y, v.z] as const;
  return {
    world, bar, shield,
    observe() {
      const q = barNode.rotationQuaternion!;
      return { steps: world.steps, bar: tuple(barNode.position), rotation: [q.x, q.y, q.z, q.w] as const,
        velocity: tuple(bar.linearVelocityToRef(velocity)), spin: tuple(bar.angularVelocityToRef(spin)),
        shield: tuple(shieldNode.position), shieldVelocity: tuple(shield.linearVelocityToRef(velocity)),
        contacts: world.physics.contactsOf(bar).map((c) => ({ shield: c.other === shield, impulse: c.impulse,
          point: [...c.point], normal: [...c.normal], pairs: c.pairs.map((p) => ({ mine: p.mine, theirs: p.theirs })) })),
      };
    },
    dispose() { world.dispose(); barNode.dispose(false, false); shieldNode.dispose(false, false); },
  };
}
