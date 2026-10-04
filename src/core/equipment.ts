import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { ColliderShape, SegmentBody } from "./engine/engine.ts";
import type { ItemShape, ItemSpec } from "./spec/body.ts";
import type { Vec3 } from "./spec/quantity.ts";
import { deepFreeze } from "./state.ts";
import type { World } from "./world.ts";

interface Frame {
  readonly position: Vec3;
  readonly rotation: readonly [number, number, number, number];
}

/** Construction authority for an item; policies receive only its detached observation. */
interface EquipmentDefinition {
  readonly id: string;
  readonly item: ItemSpec;
  readonly pose: Frame;
  /** Sweep against moving colliders too; a task declares this numerical setting. */
  readonly ccd?: boolean;
  readonly grips: readonly {
    readonly name: string;
    readonly body: SegmentBody;
    readonly bodyFrame: Frame;
    readonly itemFrame: Frame;
  }[];
  /** Explicit task tolerances: anchor distance (m) and 1 - |quaternion dot|. */
  readonly capture: { readonly distance: number; readonly rotationError: number };
}

function collider(shape: ItemShape): ColliderShape {
  switch (shape.kind) {
    case "capsule": return { kind: "capsule", from: shape.from.value, to: shape.to.value, radius: shape.radius.value };
    case "sphere": return { kind: "sphere", centre: shape.centre.value, radius: shape.radius.value };
    case "hull": return { kind: "hull", points: shape.points.map((p) => p.value) };
    default: { const never: never = shape; throw new Error(`unknown item shape ${JSON.stringify(never)}`); }
  }
}

function frame(value: Frame): { at: Vector3; turn: Quaternion } {
  if (value.position.length !== 3 || value.rotation.length !== 4
    || ![...value.position, ...value.rotation].every(Number.isFinite)) throw new Error("invalid equipment frame");
  const turn = new Quaternion(...value.rotation);
  if (turn.x * turn.x + turn.y * turn.y + turn.z * turn.z + turn.w * turn.w === 0) throw new Error("zero equipment rotation");
  return { at: new Vector3(...value.position), turn: turn.normalize() };
}
const tuple = (v: Vector3): Vec3 => [v.x, v.y, v.z];

/**
 * One independently simulated item, with persistent identity and any number of registered grips.
 * A grip is an ideal rigid attachment, like a compound holding: it has no break-strength rule.
 * Capture checks both local frames in the current world pose; it never moves either body.
 * Grip attachments live in the engine snapshot, including releases and reattachments.
 */
export function createEquipment(world: World, definition: EquipmentDefinition) {
  const { id, item } = definition, pose = frame(definition.pose);
  const distance = definition.capture.distance, rotationError = definition.capture.rotationError;
  if (!id || !(distance >= 0) || !Number.isFinite(distance) || !(rotationError >= 0 && rotationError <= 1)) {
    throw new Error("invalid equipment identity or capture tolerances");
  }
  const names = new Set<string>();
  const definitions = definition.grips.map((g) => {
    if (!g.name || names.has(g.name)) throw new Error("duplicate or empty equipment grip");
    names.add(g.name);
    return { name: g.name, body: g.body, hand: frame(g.bodyFrame), item: frame(g.itemFrame) };
  });
  const node = new TransformNode(`item.${id}`, world.scene);
  node.position.copyFrom(pose.at);
  node.rotationQuaternion = pose.turn;
  const body = world.physics.addBody(node, item.shapes.map(collider), {
    mass: item.mass.value, centre: item.centreOfMass.value, moments: item.inertia.value, orientation: Quaternion.Identity(),
  }, { ccd: definition.ccd });
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    world.physics.removeBody(body);
    node.dispose(false, false);
  };
  const position = new Vector3(), other = new Vector3(), qa = new Quaternion(), qb = new Quaternion();
  const velocity = new Vector3(), spin = new Vector3();
  const live = () => { if (disposed) throw new Error("equipment is disposed"); };
  try {
    const grips = definitions.map((g) => ({ ...g, joint: world.physics.addGrip(g.body, body, {
      anchorParent: tuple(g.hand.at), anchorChild: tuple(g.item.at), frameParent: g.hand.turn, frameChild: g.item.turn,
    }) }));
    const rotation = (q: Quaternion) => [q.x, q.y, q.z, q.w] as const;
    const model = deepFreeze({ id, name: item.name, mass: item.mass.value,
      centre: [...item.centreOfMass.value] as Vec3, inertia: [...item.inertia.value] as Vec3,
      capture: { distance, rotationError },
      grips: grips.map((g) => ({ name: g.name, body: g.body.node.name,
        bodyFrame: { position: tuple(g.hand.at), rotation: rotation(g.hand.turn) },
        itemFrame: { position: tuple(g.item.at), rotation: rotation(g.item.turn) } })),
    });
    const grip = (name: string) => {
      live();
      const result = grips.find((g) => g.name === name);
      if (!result) throw new Error(`item ${id} has no grip ${name}`);
      return result;
    };
    const error = (g: typeof grips[number]) => {
      g.hand.at.applyRotationQuaternionToRef(g.body.node.rotationQuaternion!, position).addInPlace(g.body.node.position);
      g.item.at.applyRotationQuaternionToRef(node.rotationQuaternion!, other).addInPlace(node.position);
      g.body.node.rotationQuaternion!.multiplyToRef(g.hand.turn, qa);
      node.rotationQuaternion!.multiplyToRef(g.item.turn, qb);
      qa.normalize(); qb.normalize();
      const x = position.x - other.x, y = position.y - other.y, z = position.z - other.z;
      return { distance: Math.sqrt(x * x + y * y + z * z),
        rotationError: Math.max(0, 1 - Math.abs(qa.x * qb.x + qa.y * qb.y + qa.z * qb.z + qa.w * qb.w)) };
    };
    return {
      id, spec: item, model, body, node,
      tryGrip(name: string): boolean {
        const g = grip(name);
        if (g.joint.attached) return true;
        const e = error(g);
        if (e.distance > distance || e.rotationError > rotationError) return false;
        g.joint.attach();
        return true;
      },
      release(name: string): void { grip(name).joint.release(); },
      observe() {
        live();
        const q = node.rotationQuaternion!;
        return deepFreeze({ id, name: item.name, substance: item.substance, mass: item.mass.value,
          position: tuple(node.position), rotation: [q.x, q.y, q.z, q.w] as const,
          velocity: tuple(body.linearVelocityToRef(velocity)), spin: tuple(body.angularVelocityToRef(spin)),
          grips: grips.map((g) => ({ name: g.name, body: g.body.node.name, attached: g.joint.attached, ...error(g) })),
          contacts: world.physics.contactsOf(body).map((c) => ({ other: c.other?.node.name ?? null, fixed: c.fixed,
            point: [...c.point] as Vec3, normal: [...c.normal] as Vec3, impulse: c.impulse,
            pairs: c.pairs.map((p) => ({ ...p, point: [...p.point] as Vec3, normal: [...p.normal] as Vec3 })),
          })),
        });
      },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}
