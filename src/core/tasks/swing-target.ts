import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { cos, sin } from "../math/real.ts";
import { cuboidMoments } from "../spec/geometry.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { World } from "../world.ts";

/**
 * A freely swinging box on one revolute joint. Only initialization supplies an impulse; gravity,
 * joint limits and contact determine its subsequent motion. Inputs are fixture geometry and mass,
 * not character anatomy. Its moments are a uniform box's (`cuboidMoments`).
 */
export function createSwingTarget(world: World, config: {
  readonly id: string; readonly centre: Vec3; readonly size: Vec3; readonly mass: number;
  readonly length: number; readonly limit: number; readonly angle: number; readonly speed: number;
  readonly anchorRadius: number; readonly anchorMass: number; readonly anchorMoment: number;
}) {
  if (!config.id || ![...config.centre, ...config.size, config.mass, config.length, config.limit, config.angle,
    config.speed, config.anchorRadius, config.anchorMass, config.anchorMoment].every(Number.isFinite)
    || ![...config.size, config.mass, config.length, config.limit, config.anchorRadius, config.anchorMass, config.anchorMoment].every((v) => v > 0)
    || Math.abs(config.angle) > config.limit) throw new Error("invalid swing target");
  const node = new TransformNode(config.id, world.scene), anchorNode = new TransformNode(`${config.id}.anchor`, world.scene);
  const sine = sin(config.angle), cosine = cos(config.angle), [x, y, z] = config.centre;
  node.position.set(x + config.length * sine, y + config.length * (1 - cosine), z);
  node.rotationQuaternion = new Quaternion(0, 0, sin(config.angle / 2), cos(config.angle / 2));
  anchorNode.position.set(x, y + config.length, z); anchorNode.rotationQuaternion = Quaternion.Identity();
  const body = world.physics.addBody(node, [{ kind: "box", centre: [0, 0, 0], size: config.size }], {
    mass: config.mass, centre: [0, 0, 0], moments: cuboidMoments(config.mass, config.size), orientation: Quaternion.Identity(),
  }, { ccd: true });
  const anchor = world.physics.addBody(anchorNode, [{ kind: "sphere", centre: [0, 0, 0], radius: config.anchorRadius }], {
    mass: config.anchorMass, centre: [0, 0, 0], moments: [config.anchorMoment, config.anchorMoment, config.anchorMoment], orientation: Quaternion.Identity(),
  });
  anchor.setFixed(true);
  const frame = new Quaternion(0, -Math.sqrt(0.5), 0, Math.sqrt(0.5));
  world.physics.addJoint(anchor, body, { anchorParent: [0, 0, 0], anchorChild: [0, config.length, 0],
    frameParent: frame, frameChild: frame, limits: [[-config.limit, config.limit]] });
  body.applyImpulse(new Vector3(config.mass * config.speed * cosine, config.mass * config.speed * sine, 0), node.position);
  return { body, anchor, size: [...config.size] as Vec3,
    dispose() { world.physics.removeBody(body); world.physics.removeBody(anchor); node.dispose(false, false); anchorNode.dispose(false, false); } };
}
