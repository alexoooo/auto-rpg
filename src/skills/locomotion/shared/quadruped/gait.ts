import { Quaternion } from "../../../../core/math/vector.ts";
import { atan2, cos, sin } from "../../../../core/math/real.ts";
import type { Vec3 } from "../../../../core/quantity.ts";
import type { EndReading } from "../../../../control/supported-motor.ts";
import type { PawReading } from "../../../../control/quadruped/paws.ts";
import type { PawGaitBody } from "./parts.ts";
import type { TravelOrders } from "./travel.ts";

/** A place, world (x, y, z), that a gait keeps and writes over. */
type Place = [number, number, number];

/** Where each of `paws` bears now (`anchorAt`), one place a paw. */
export const anchorsOf = (paws: PawReading): Place[] => paws.feet.map(e => [e.at.x, e.ground, e.at.z]);

/** Sets `anchor` to where `foot` bears: its place on the floor (x, z) at the ground's height. */
export function anchorAt(anchor: Place, foot: EndReading): void {
  anchor[0] = foot.at.x; anchor[1] = foot.ground; anchor[2] = foot.at.z;
}

/**
 * **What a paw gait starts from** over `body`: each paw's sole at the reference pose (`nominal`)
 * and the body's centre of mass there (`reference`), body frame; and what every paw gait's state
 * holds, as the body stands now: the centre it asks, each paw's anchor (where it last bore) and
 * its command (`SupportedCommand`), each paw at its anchor's place at its sole's height.
 */
export function gaitStart({ built, root, paws, names }: PawGaitBody) {
  const nominal = names.map(name => built.segments.get(name)!.spec.points!.sole!.value);
  const mass = built.spec.mass.value, reference = built.spec.segments.reduce((c, p) => {
    const m = p.mass.value / mass, at = p.centreOfMass.value;
    return [c[0] + m * at[0], c[1] + m * at[1], c[2] + m * at[2]] as Vec3;
  }, [0, 0, 0] as Vec3);
  const q = root.pose.rotation;
  return {
    nominal, reference,
    centre: [paws.centre.x, reference[1], paws.centre.z] as Place,
    anchors: anchorsOf(paws),
    command: {
      centre: [paws.centre.x, reference[1], paws.centre.z] as Place,
      velocity: [0, 0, 0] as Place, rotation: [q.x, q.y, q.z, q.w] as [number, number, number, number],
      endpoints: paws.feet.map((e, i) => ({ target: [e.at.x, nominal[i]![1], e.at.z] as Place,
        bearing: true, rotation: [0, 0, 0, 1] as [number, number, number, number] })),
      posture: {} as Record<string, number>,
    },
  };
}

/** A paw gait's command (`SupportedCommand`) as it writes it over each step. */
type GaitCommand = ReturnType<typeof gaitStart>["command"];

/**
 * Where the centre of mass `reference` stands from the mean of `points` (x, z), body frame: where
 * a settled stance on them puts the centre (`settledCentre`), wherever the legs meet the trunk.
 */
export function overMean(reference: Vec3, points: readonly (readonly [number, number])[]): readonly [number, number] {
  return [reference[0] - points.reduce((s, n) => s + n[0], 0) / points.length, reference[2] - points.reduce((s, n) => s + n[1], 0) / points.length];
}

/** The mean of `anchors`, world. */
export function meanOf(anchors: readonly Place[]): number[] {
  const average = [0, 0, 0];
  for (const anchor of anchors) for (let k = 0; k < 3; k++) average[k] += anchor[k]! / anchors.length;
  return average;
}

/** Sets the `centre` a gait heading `yaw` asks (x, z) where a settled stance on paws whose mean is `mean` puts it: `over` it (`overMean`), turned to the heading. */
export function settledCentre(gait: { readonly centre: Place; readonly yaw: number }, mean: readonly number[], over: readonly [number, number]): void {
  const c = cos(gait.yaw), s = sin(gait.yaw);
  gait.centre[0] = mean[0]! + c * over[0] + s * over[1];
  gait.centre[2] = mean[2]! - s * over[0] + c * over[1];
}

/** How far the way `orders` ask to face (their facing, else their travel) turns from `yaw`, rad, within ±π; none asked, none. */
export function headingError(orders: TravelOrders, yaw: number): number {
  const face = orders.face ?? orders.move;
  if (!face || !(face.x * face.x + face.z * face.z > 0)) return 0;
  const d = atan2(face.x, face.z) - yaw;
  return atan2(sin(d), cos(d));
}

/**
 * **A paw gait's poser** over `body`: it turns a gait's command (`GaitCommand`), its trunk and
 * each paw, to the gait's heading `yaw`, and sets each paw at its anchor, bearing, or where
 * `swinging` places it, not bearing.
 */
export function gaitPoser({ built, root, names }: PawGaitBody) {
  const rotation = new Quaternion(), turned = new Quaternion();
  return (gait: { readonly yaw: number; readonly anchors: readonly Place[]; readonly command: GaitCommand }, swinging: (paw: number) => Place | null): GaitCommand => {
    rotation.set(0, sin(gait.yaw / 2), 0, cos(gait.yaw / 2));
    rotation.multiplyToRef(root.rest, turned);
    gait.command.rotation.splice(0, 4, turned.x, turned.y, turned.z, turned.w);
    gait.command.endpoints.forEach((goal, i) => {
      rotation.multiplyToRef(built.segments.get(names[i]!)!.rest, turned);
      goal.rotation.splice(0, 4, turned.x, turned.y, turned.z, turned.w);
      goal.target.splice(0, 3, ...gait.anchors[i]!); goal.bearing = true;
      const target = swinging(i);
      if (target) { goal.target.splice(0, 3, ...target); goal.bearing = false; }
    });
    return gait.command;
  };
}

/** Whether `settings` hold every key of `defaults` and no other, each a finite number not below zero. */
export function completeSettings(defaults: Readonly<Record<string, number>>, settings: Readonly<Record<string, number>>): boolean {
  return !!settings && typeof settings === "object" && !Array.isArray(settings)
    && Object.keys(defaults).every(key => Object.hasOwn(settings, key))
    && Object.entries(settings).every(([key, value]) => Object.hasOwn(defaults, key) && Number.isFinite(value) && value >= 0);
}
