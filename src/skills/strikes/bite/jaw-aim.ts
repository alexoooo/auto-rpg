import { Quaternion, Vector3 } from "../../../core/math/vector.ts";
import type { BodyView } from "../../../control/body.ts";
import { pointAtToRef, type Frame } from "../../../control/kinematics.ts";
import { nearestSurface } from "../../perception/targets.ts";
import { regionSegments, sensedActionTarget, type Aimed } from "../../framework/action-aim.ts";
import type { Region } from "../../framework/action.ts";
import { hypot } from "../../../core/math/real.ts";
import { turnAboutToRef } from "../../../core/math/turn.ts";
import type { BodySense } from "../../../core/bodies/senses.ts";
import { surfaceContains, surfaceEntry } from "../../perception/openings.ts";
import type { Aim, AimAsking, AimPart } from "../../framework/aim-part.ts";
import type { Vec3 } from "../../../core/quantity.ts";
import { deepFreeze } from "../../../core/state.ts";
import { headFrameToRef, jawOf, mouthToRef } from "../shared/jaw.ts";
import { biteSettings, fitsBite, type BiteTuning } from "./bite/bite.ts";

/** **The first exposed surface**'s config. */
/** The aim's config: its kind, and the bite's research `tuning` its strike gives it (`aimFor`), which a link does not carry. */
interface FirstExposedConfig { readonly kind: "first-exposed"; readonly tuning?: Partial<BiteTuning> }

/** A surface the aim holds: on which foe and segment, where on it in the segment's frame, the tooth that meets it, and when it was found. */
interface Held { foe: string; part: string; local: Vec3; tooth: string; made: number }

/** Whether `at` lies inside a sensed foe of `view`'s. */
const buried = (view: BodyView, at: Vec3): boolean => view.senses.others.some((foe) => !foe.out && foe.side !== view.senses.side
  && foe.spec.segments.some((part) => surfaceContains(foe, part.name, at)));

/**
 * **The first exposed surface along the jaw's arc** of a body of `spec`, by its bite's settings (`biteSettings`): each
 * tooth's path as the jaw closes from open (`open`), in `biteSamples` steps, from the head as it is
 * and leant toward the target's nearest surface (the lean its chamber may make, `biteShift` at
 * most), meets the first sensed surface in its way; the aim is the first such surface the target's
 * region holds that the tooth pierces (its piercing way against the surface's normal at least its
 * alignment), within `biteElevation` of the mouth's height, the least leant, then the earliest
 * along the arc, then the best aligned. It searches only with a surface of the target within
 * `bitePrepareNear` of the mouth and the mouth not inside a foe.
 *
 * It holds what it found on the foe's segment, led `biteLead` s by its motion, with its tooth
 * (`Aimed.with`), until the target is another foe or region, the jaw has ended a bite since
 * (`ledger`), the point leaves the mouth's reach or height, the mouth is inside a foe, or another
 * had the body (`BodyView.resumed`). A reading of the mind (`AimAsking`) answers alike and holds nothing.
 */
function firstExposed(spec: Parameters<AimPart["make"]>[0], config: FirstExposedConfig, asking: Readonly<AimAsking>): Aim {
  const T = biteSettings(spec, config), jaw = jawOf(spec);
  const arcs = jaw.teeth.map((tooth) => ({ tooth: tooth.name,
    arc: Array.from({ length: T.biteSamples + 1 }, (_, i) => pointAtToRef([jaw.hinge], [[T.open * (1 - i / T.biteSamples)]], tooth.tip, new Vector3())) }));
  const path = Array.from({ length: T.biteSamples + 1 }, () => new Vector3());
  // The teeth's middle at the half-open gape (`contactAt`), body frame: the point the chamber brings onto what it bites.
  const half = jaw.teeth.map((tooth) => pointAtToRef([jaw.hinge], [[T.open * T.contactAt]], tooth.tip, new Vector3()));
  const middle = half.reduce((sum, p) => sum.addInPlace(p), new Vector3()).scaleInPlace(1 / half.length);
  const axis = new Vector3(...jaw.hinge.dofs[0]!.spec.axis.value);
  const frame: Frame = { position: new Vector3(), rotation: new Quaternion() }, mouth = new Vector3(), ahead = new Vector3(), closing = new Vector3(), bitePoint = new Vector3();
  const turn = new Quaternion(), inverse = new Quaternion(), carried = new Vector3();
  const state = { held: null as Held | null };
  /** Where `held` is now on its foe, led by the segment's motion; null where the segment is not sensed. */
  const heldAt = (foe: BodySense, held: Held): Vec3 | null => {
    const segment = foe.segments.get(held.part);
    if (!segment) return null;
    carried.set(...held.local).applyRotationQuaternionToRef(segment.rotation, carried).addInPlace(segment.position);
    const x = carried.x - segment.centre.x, y = carried.y - segment.centre.y, z = carried.z - segment.centre.z;
    return [carried.x + T.biteLead * (segment.velocity.x + segment.spin.y * z - segment.spin.z * y),
      carried.y + T.biteLead * (segment.velocity.y + segment.spin.z * x - segment.spin.x * z),
      carried.z + T.biteLead * (segment.velocity.z + segment.spin.x * y - segment.spin.y * x)];
  };
  /**
   * The first exposed surface of `foe`'s `names` along a tooth's arc (`firstExposed`), or null:
   * from the head as it is, and leant over the ground toward the region's surface nearest the teeth's
   * half-open middle until that middle is `biteEntry` past it, no farther than `biteShift`.
   */
  const search = (view: BodyView, foe: BodySense, names: readonly string[], accept: (at: Vec3) => boolean, region: Region) => {
    let found: { part: string; at: Vec3; shift: number; progress: number; tooth: string; alignment: number } | null = null;
    // The head's forward way over the ground (the body frame's z), and across it.
    ahead.set(0, 0, 1).applyRotationQuaternionToRef(frame.rotation, ahead);
    const flat = Math.sqrt(ahead.x * ahead.x + ahead.z * ahead.z), fx = flat ? ahead.x / flat : 0, fz = flat ? ahead.z / flat : 0;
    middle.applyRotationQuaternionToRef(frame.rotation, bitePoint).addInPlace(frame.position);
    const near = nearestSurface(view.senses, [bitePoint.x, bitePoint.y, bitePoint.z], accept, foe.id, region)?.at ?? [bitePoint.x, bitePoint.y, bitePoint.z];
    const dx = near[0] - bitePoint.x, dz = near[2] - bitePoint.z, gap = hypot(dx, dz), lean = gap + T.biteEntry;
    const scale = gap ? Math.min(lean, T.biteShift) / gap : 0;
    // The head as it is, then leant, ahead and across, m.
    const leans = [[0, 0], [(dx * fx + dz * fz) * scale, (dx * fz - dz * fx) * scale]] as const;
    for (const [forward, aside] of leans) for (const { arc, tooth } of arcs) {
      const shift = hypot(forward, aside), sx = fx * forward + fz * aside, sz = fz * forward - fx * aside;
      arc.forEach((p, i) => p.applyRotationQuaternionToRef(frame.rotation, path[i]!).addInPlace(frame.position).addInPlaceFromFloats(sx, 0, sz));
      if (buried(view, [path[0]!.x, path[0]!.y, path[0]!.z])) continue;
      for (let i = 0; i < path.length - 1; i++) {
        const start = path[i]!, finish = path[i + 1]!, from: Vec3 = [start.x, start.y, start.z], to: Vec3 = [finish.x, finish.y, finish.z];
        const dx = finish.x - start.x, dy = finish.y - start.y, dz = finish.z - start.z, squared = dx * dx + dy * dy + dz * dz;
        let exposed: { foe: string; part: string; at: Vec3; normal: Vec3; fraction: number } | null = null;
        for (const other of view.senses.others) {
          if (other.out || other.side === view.senses.side) continue;
          for (const part of other.spec.segments) {
            const hit = surfaceEntry(other, part.name, from, to);
            if (!hit) continue;
            const fraction = squared ? ((hit.at[0] - start.x) * dx + (hit.at[1] - start.y) * dy + (hit.at[2] - start.z) * dz) / squared : 0;
            if (!exposed || fraction < exposed.fraction) exposed = { foe: other.id, part: part.name, ...hit, fraction };
          }
        }
        if (!exposed) continue;
        const progress = i + exposed.fraction;
        turnAboutToRef(axis, T.open * (1 - progress / T.biteSamples), turn);
        closing.set(...jaw.piercing.direction).applyRotationQuaternionToRef(turn, closing).applyRotationQuaternionToRef(frame.rotation, closing);
        const alignment = -(closing.x * exposed.normal[0] + closing.y * exposed.normal[1] + closing.z * exposed.normal[2]);
        if (alignment >= jaw.piercing.alignment && accept(exposed.at) && exposed.foe === foe.id && names.includes(exposed.part)
          && (!found || shift < found.shift || shift === found.shift && (progress < found.progress || progress === found.progress && alignment > found.alignment)))
          found = { part: exposed.part, at: exposed.at, shift, progress, tooth, alignment };
        break;
      }
    }
    return found;
  };
  const aim: Aim = (view, target, effector, ledger = []) => {
    if (target.kind === "point") return { at: target.at, ...(target.direction ? { direction: target.direction } : {}) };
    const foe = sensedActionTarget(view, target);
    if (effector !== jaw.head.name || !foe) { if (asking.keeps) state.held = null; return null; }
    const names = regionSegments(foe.spec, target.region);
    mouthToRef(view, jaw, mouth);
    const from: Vec3 = [mouth.x, mouth.y, mouth.z], inside = buried(view, from);
    const accept = (at: Vec3) => Math.abs(at[1] - mouth.y) <= T.biteElevation;
    const reach = (at: Vec3) => accept(at) && hypot(at[0] - mouth.x, at[2] - mouth.z) <= T.bitePrepareNear;
    let held = state.held;
    if (held && (view.resumed || inside || held.foe !== foe.id || !names.includes(held.part)
      || ledger.some((record) => record.effector === effector && record.ended > held!.made))) held = null;
    let at = held && heldAt(foe, held);
    if (held && (!at || !reach(at))) { held = null; at = null; }
    if (!held && !inside) {
      const near = nearestSurface(view.senses, from, accept, foe.id, target.region);
      if (near && near.squared <= T.bitePrepareNear * T.bitePrepareNear) headFrameToRef(view, jaw, frame);
      const found = near && near.squared <= T.bitePrepareNear * T.bitePrepareNear ? search(view, foe, names, accept, target.region) : null;
      const segment = found && foe.segments.get(found.part);
      if (found && segment) {
        carried.set(...found.at).subtractInPlace(segment.position).applyRotationQuaternionToRef(Quaternion.InverseToRef(segment.rotation, inverse), carried);
        held = { foe: foe.id, part: found.part, local: [carried.x, carried.y, carried.z], tooth: found.tooth, made: view.time };
        at = heldAt(foe, held);
      }
    }
    if (asking.keeps) state.held = held;
    return held && at ? { at, with: held.tooth } satisfies Aimed : null;
  };
  return Object.assign(aim, { state });
}

/** **The first exposed surface** (`firstExposed`) as a kind of aim: a jaw's, for a body with a bite (`fitsBite`). */
export const FIRST_EXPOSED_AIM = deepFreeze<AimPart<FirstExposedConfig>>({
  role: "aim", label: "First exposed surface", unit: null, fields: [], slots: [], defaults: { kind: "first-exposed" }, keys: { kind: true, tuning: true },
  fits: (spec, _config, parts) => fitsBite(spec, { kind: "first-exposed" }, parts), fitReads: ["bite/bite"], faults: () => [], reads: () => ["bite/bite"], make: (spec, config, asking) => firstExposed(spec, config, asking),
});

declare module "../../config.ts" {
  interface AimConfigs {
    readonly "first-exposed": FirstExposedConfig;
  }
}
