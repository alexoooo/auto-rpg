import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../build/build-body.ts";
import { heldFrame } from "../build/rigid.ts";
import { createEquipment } from "../equipment.ts";
import type { ItemSpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { World } from "../world.ts";
import { handHolding } from "./grip.ts";
import type { Side } from "./landmarks.ts";

interface HandEquipment {
  readonly id: string;
  readonly item: ItemSpec;
  /** Initially attached hand; other registered hands must reach their frames before capture. */
  readonly primary: Side;
  /** The item-local position at the little-finger end of each hand's grasp. */
  readonly grips: readonly { readonly side: Side; readonly at: Vec3 }[];
  readonly capture: { readonly distance: number; readonly rotationError: number };
  readonly ccd?: boolean;
}

/**
 * Initial separate equipment in the same anatomical grasp frame as `armed`. Construction is
 * before stepping, with stationary hands; later capture and release use the item's grip API.
 * The bare hands keep their own mass and shapes. A second grip registers a reachable objective,
 * not a second item or a placement of the other hand.
 */
export function equipHands(world: World, built: BuiltBody, definition: HandEquipment) {
  if (world.steps !== 0 || built.physics !== world.physics) throw new Error("hand equipment requires its body's initial world");
  const names = new Set<Side>(), vector = new Vector3();
  const grips = definition.grips.map(({ side, at }) => {
    if ((side !== "left" && side !== "right") || names.has(side) || at.length !== 3 || !at.every(Number.isFinite)) {
      throw new Error("invalid or duplicate hand grip");
    }
    names.add(side);
    const held = handHolding(built.spec, side, definition.item), hand = built.segments.get(held.segment)!;
    if (hand.rigid.owners.some((owner) => owner.kind === "held")) throw new Error("a separately equipped hand must not also contain compound equipment");
    if (hand.body.linearVelocityToRef(vector).lengthSquared() !== 0 || hand.body.angularVelocityToRef(vector).lengthSquared() !== 0) {
      throw new Error("initial hand equipment requires stationary hands");
    }
    const frame = heldFrame(held), own = hand.frame;
    const local = (v: Vec3): Vec3 => [own.x, own.y, own.z].map((a) => a[0] * v[0] + a[1] * v[1] + a[2] * v[2]) as unknown as Vec3;
    const origin = frame.origin.map((v, k) => v - own.origin[k]!) as unknown as Vec3;
    const turn = Quaternion.RotationQuaternionFromAxis(new Vector3(...local(frame.x)), new Vector3(...local(frame.y)), new Vector3(...local(frame.z)));
    return { name: side, body: hand.body,
      bodyFrame: { position: local(origin), rotation: [turn.x, turn.y, turn.z, turn.w] as const },
      itemFrame: { position: [...at] as Vec3, rotation: [0, 0, 0, 1] as const } };
  });
  const primary = grips.find((g) => g.name === definition.primary);
  if (!primary) throw new Error("initial equipment needs its primary hand's grip");
  const hand = primary.body.node, rotation = new Quaternion();
  hand.rotationQuaternion!.multiplyToRef(new Quaternion(...primary.bodyFrame.rotation), rotation);
  const position = new Vector3(...primary.bodyFrame.position);
  position.applyRotationQuaternionToRef(hand.rotationQuaternion!, position).addInPlace(hand.position);
  vector.set(...primary.itemFrame.position).applyRotationQuaternionToRef(rotation, vector);
  position.subtractInPlace(vector);
  const item = createEquipment(world, { id: definition.id, item: definition.item,
    pose: { position: [position.x, position.y, position.z], rotation: [rotation.x, rotation.y, rotation.z, rotation.w] },
    grips, capture: definition.capture, ccd: definition.ccd });
  if (!item.tryGrip(definition.primary)) { item.dispose(); throw new Error("initial equipment does not meet its capture tolerances"); }
  return item;
}
