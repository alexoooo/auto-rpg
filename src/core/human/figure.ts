import type { Surface } from "../spec/body.ts";
import type { Quantity, Vec3 } from "../spec/quantity.ts";
import type { Extents, TrunkSegment } from "./envelope.ts";
import type { LimbLandmarks, Side, TrunkLandmarks } from "./landmarks.ts";
import type { Sex } from "./tables/de-leva-1996.ts";

/**
 * **A human figure**: everything the human body-plan code (`segments.ts`, `joints.ts`,
 * `muscle.ts`, `speed.ts`, `wounds.ts`) reads of one body, and nothing it derives. The workshop
 * models' figures come from their rigs and envelopes (`workshop.ts`); the crypt skeleton's from
 * its art's bind (`skeleton.ts`). Families share this code, not its values: each figure's numbers
 * say where they came from.
 *
 * Points are in the body frame (`src/core/spec/body.ts`), in the reference pose, at the size the
 * figure was authored at; `scale` takes them to x1.
 */
export interface HumanFigure {
  /** The spec's family and model. */
  readonly family: string;
  readonly model: string;
  /** What the body is made of (`BodySpec.surface`). */
  readonly surface: Surface;
  /** Which column of a sex-specific table the figure reads. */
  readonly sex: Sex;
  /** The one factor from the authored size to x1; absent, the figure is authored at x1. */
  readonly scale?: Quantity<number>;
  /** At x1. */
  readonly mass: Quantity<number>;
  readonly stature: Quantity<number>;
  readonly trunk: TrunkLandmarks;
  readonly limbs: Readonly<Record<Side, LimbFigure>>;
  /** Each trunk segment's surface: the corners of its convex hull. */
  readonly hulls: Readonly<Record<TrunkSegment, readonly Quantity<Vec3>[]>>;
  /** Each foot's extents, body frame. */
  readonly feet: Readonly<Record<Side, Extents>>;
  /** The body's hit points, in the rulebook's unit. */
  readonly hp: Quantity<number>;
  /** The body's balance, per cent of its weight (`AttributeSpec`). */
  readonly balance: Quantity<number>;
}

/**
 * **One side's limbs**: de Leva's landmarks (`LimbLandmarks`), where the foot's segment runs (its
 * heel and toe), and the hand's own right in the anatomical position (`SegmentSpec.right`): across
 * its knuckles toward the thumb on the right hand, toward the little finger on the left. `little`,
 * the little finger's knuckle, is where a grip ends (`grip.ts`); a hand without one holds nothing.
 */
export interface LimbFigure extends LimbLandmarks {
  readonly HEEL: Quantity<Vec3>;
  readonly TTIP: Quantity<Vec3>;
  readonly handRight: Quantity<Vec3>;
  readonly little?: Quantity<Vec3>;
}
