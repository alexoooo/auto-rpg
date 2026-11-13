import { heldBy, type Held } from "../../../core/bodies/items/held.ts";
import type { Mechanism } from "../../../combat/rulebook.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { Vec3 } from "../../../core/quantity.ts";
import type { Side } from "../../../core/bodies/bilateral.ts";

/**
 * **What a hand strikes with where it is not its fist**: a named point of what it holds (`point`),
 * and the way of the item, in its own frame, that meets the target (`facing`): at its contact pose
 * the arm holds that way along the line from the shoulder to the target, as it holds a fist's
 * knuckles on it.
 */
export interface StrikingFace { readonly point: string; readonly facing: Vec3 }

/**
 * The way a blunt item's face meets the target, in the item's frame: its x, the holding hand's own
 * length (`handHolding`), the way its far end goes as the wrist bends it toward the little finger,
 * as a hammer's head goes.
 */
const BLUNT_FACING: Vec3 = Object.freeze([1, 0, 0]) as unknown as Vec3;

/**
 * **The face `hand` of `spec` meets a target with by `mechanism`** (`StrikingFace`): a directed
 * region of what it holds with that mechanism and a point of its own name, facing as the region
 * does (the sword's edge, its tip); for a blunt blow, the item's aimed point (`ItemSpec.aim`)
 * facing `BLUNT_FACING`. Null where the hand holds nothing, or nothing with such a face.
 */
export function faceOf(spec: BodySpec, hand: Side, mechanism: Mechanism): StrikingFace | null {
  const item = spec.held?.find((h) => h.segment === `hand.${hand}`)?.item;
  if (!item) return null;
  if (mechanism === "blunt") return item.aim ? { point: item.aim, facing: BLUNT_FACING } : null;
  const region = item.contacts?.find((one) => one.surface.directed?.mechanism === mechanism && item.points[one.name]);
  return region ? { point: region.name, facing: region.surface.directed!.direction.value } : null;
}

/** The face `effector` of `spec` strikes with by `mechanism` where its hand holds `item` (`faceOf`): null where it is no hand, or holds something else or nothing. */
export function heldFace(spec: BodySpec, effector: string, item: Held, mechanism: Mechanism): StrikingFace | null {
  const hand: Side | null = effector === "hand.left" ? "left" : effector === "hand.right" ? "right" : null;
  return hand && heldBy(spec, hand) === item ? faceOf(spec, hand, mechanism) : null;
}
