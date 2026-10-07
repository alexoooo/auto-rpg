import { type Side, segmentFrame, type BodySpec, type HeldSpec, type ItemSpec, type SegmentSpec } from "../spec/body.ts";
import { derive, type Quantity, type Vec3 } from "../spec/quantity.ts";
import { add, dot, scale, sub } from "../spec/vec.ts";

/**
 * **A human hand closed on a haft** (`core-grip`): the haft runs across the knuckles, from the
 * little finger's to the index finger's, so what it carries stands out of the fist on the thumb's
 * side. Its axis passes the middle finger's knuckle on the palm's side, with the haft's surface at
 * the palm: the hand's half-thickness (its capsule's radius) from the knuckle. The grip ends (the
 * item's origin) where the little finger's knuckle lies along it. The item's x is the hand's own
 * length, wrist to fingers. The hand's capsule is an open hand's, fingers out, so the haft runs
 * through its fingers as a closed hand's fingers run round a haft; the gripping pair must not
 * collide, whether simulated as one compound body or joined separate bodies.
 *
 * The palm's side is the hand frame's -z: the rig holds the hands thumb up with the palms toward
 * the body, and z = x cross y points away from it on both hands (`tests/core-club.test.mjs`).
 */
export function handHolding(spec: BodySpec, side: Side, item: ItemSpec): HeldSpec {
  const hand = holdingHand(spec, side);
  if (!hand || !item.grip) throw new Error(`${spec.model}'s ${side} hand cannot hold ${item.name}`);
  const name = hand.name, knuckles = hand.points.knuckles, little = hand.points.little;
  // The knuckles' row, little to index: the hand's right on the right hand, against it on the left.
  const along: Quantity<Vec3> = side === "right" ? hand.right
    : derive("1", "the left hand's right reversed: little finger to index", [hand.right], (r) => scale(r, -1));
  const origin = derive("m", "the little finger's knuckle along the haft's axis, which passes the middle knuckle palmward by the hand's radius and the haft's",
    [hand.proximal, hand.distal, hand.right, knuckles, little, hand.shape.radius, item.grip, along],
    (proximal, distal, right, middle, end, handRadius, gripRadius, a) => {
      const palmar = scale(segmentFrame(proximal, distal, right).z, -1);
      const onAxis = add(middle, scale(palmar, handRadius + gripRadius));
      return add(onAxis, scale(a, dot(sub(end, onAxis), a)));
    });
  const across = derive("1", "the hand's length, wrist to fingers", [hand.proximal, hand.distal, hand.right],
    (proximal, distal, right) => segmentFrame(proximal, distal, right).y);
  return { segment: name, item, origin, along, across };
}

/** Whether `spec`'s `side` hand can close on a haft (`handHolding`). */
export const canHold = (spec: BodySpec, side: Side): boolean => holdingHand(spec, side) !== null;

/** `spec`'s `side` hand if a haft can lie across it: a capsule with its own right and the knuckles a grip is laid by. */
function holdingHand(spec: BodySpec, side: Side) {
  const hand = spec.segments.find((segment) => segment.name === `hand.${side}`);
  const knuckles = hand?.points?.knuckles, little = hand?.points?.little, shape = hand?.shape, right = hand?.right;
  if (!hand || shape?.kind !== "capsule" || !knuckles || !little || !right) return null;
  return { ...hand, shape, right, points: { knuckles, little } } satisfies SegmentSpec;
}

/** `spec` holding `item` in its `side` hand, beside whatever it held. */
export const armed = (spec: BodySpec, side: Side, item: ItemSpec): BodySpec =>
  ({ ...spec, held: [...(spec.held ?? []), handHolding(spec, side, item)] });
