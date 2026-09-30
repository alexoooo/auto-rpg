import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import { contactMass } from "../core/build/contact-mass.ts";
import { heldPoint } from "../core/build/rigid.ts";
import { impactEnergy } from "../core/rules/impact.ts";
import type { World } from "../core/world.ts";
import { STAND } from "../core/skills/strike.ts";
import { centreNow, inFrameOf, type ThrownBlow } from "./blow.ts";

/**
 * **A club blow read as it lands**: the damage unit's reading (stage 5 of
 * `docs/plans/2026-09-28-core-foundation.md`), shared by the search that scores club blows
 * (`research/core-club-strike.mjs`) and the lab's Blow scenario (`blow-scenario.ts`).
 *
 * **The target is an opponent's head**: a sphere of the striker's head capsule's radius, at its own
 * head's centre as it stands when the blow begins (`STAND`), moved straight ahead by `distance`.
 * **The blow lands** where the club's swell (its second shape, a capsule) first touches the sphere,
 * found within each step by carrying the hand's pose between the step's ends (its origin in a line,
 * its turn by slerp) at `SUB` points. The closing speed is the club's velocity there along the
 * contact's normal, from the hand body's (its centre's, plus its spin across).
 *
 * **Its energy** is `impactEnergy` of the two masses the contact meets (`contactMass`), joints free
 * and bodies floating: the club's at its contact point along the normal, with the striker's pose at
 * the end of the step it lands in; and the head's at the struck point, which is the striker's own
 * head as it stood when the blow began, turned to face the striker.
 *
 * It reads after every solver step (`World.afterStep`) until the blow lands or the body falls.
 */

/** Points a step is read at between its ends. */
const SUB = 16;

/** Where and how hard a club blow landed. */
export interface ClubLanding {
  /** J. */
  readonly energy: number;
  /** m/s, along the normal. */
  readonly closing: number;
  /** The masses the contact meets, kg: the club's and the head's. */
  readonly clubKg: number;
  readonly headKg: number;
  /** When, s after the pushes began. */
  readonly at: number;
  /** The contact's normal, club into head, world. */
  readonly normal: readonly number[];
  /** How far along the swell from its first end, m. */
  readonly along: number;
  /** Where the club touched, world, m. */
  readonly point: readonly [number, number, number];
}

export interface ClubBlowWatch {
  /** The landing, once it landed. */
  readonly landed: ClubLanding | null;
  /** Whether the body fell before it landed. */
  readonly fell: boolean;
  /** The nearest the swell passed the sphere after the pushes began, m (negative is into it). */
  readonly nearest: number;
  /** The swell's far end's peak speed before it landed, m/s. */
  readonly peak: number;
  /** The target's centre, world, once the blow has begun. */
  readonly target: Vector3 | null;
  /** The target's radius, m. */
  readonly radius: number;
  dispose(): void;
}

/** The point of segment AB nearest `c`. */
function nearestOn(a: Vector3, b: Vector3, c: Vector3, out: Vector3): Vector3 {
  const ab = b.subtract(a), t = Math.max(0, Math.min(1, Vector3.Dot(c.subtract(a), ab) / ab.lengthSquared()));
  return out.copyFrom(a).addInPlace(ab.scaleInPlace(t));
}

/** Watch `blow`, a club blow by `built` with the club in `hand`, into a head `distance` ahead. */
export function watchClubBlow(built: BuiltBody, world: World, blow: ThrownBlow, distance: number, hand: "left" | "right"): ClubBlowWatch {
  const headSpec = built.spec.segments.find((s) => s.name === "head")!;
  if (headSpec.shape.kind !== "capsule") throw new Error(`the head is a ${headSpec.shape.kind}, not a capsule`);
  const R = headSpec.shape.radius.value;
  const held = built.spec.held?.find((h) => h.segment === `hand.${hand}`);
  if (!held) throw new Error(`the ${hand} hand holds nothing`);
  const swell = held.item.shapes[1];
  if (swell?.kind !== "capsule") throw new Error(`${held.item.name} has no swell`);
  const r = swell.radius.value;
  const segment = built.segments.get(`hand.${hand}`)!, head = built.segments.get("head")!;
  // The swell's ends and the hand's centre, in the hand's own frame.
  const ends = [heldPoint(held, swell.from).value, heldPoint(held, swell.to).value].map((p) => inFrameOf(segment, p)) as [Vector3, Vector3];
  const centre = inFrameOf(segment, segment.rigid.centre);
  const striker = contactMass(built), struck = contactMass(built);
  const last = { position: new Vector3(), rotation: new Quaternion(), velocity: new Vector3(), spin: new Vector3() };
  const now = { position: new Vector3(), rotation: new Quaternion(), velocity: new Vector3(), spin: new Vector3() };
  const read = (into: typeof now) => {
    into.position.copyFrom(segment.node.position);
    into.rotation.copyFrom(segment.node.rotationQuaternion!);
    segment.body.linearVelocityToRef(into.velocity);
    segment.body.angularVelocityToRef(into.spin);
  };
  const place = (position: Vector3, rotation: Quaternion, local: Vector3) => local.applyRotationQuaternion(rotation).addInPlace(position);
  let landed: ClubLanding | null = null, nearest = Infinity, peak = 0, watching = false, fell = false;
  let headCentre: Vector3 | null = null, target: Vector3 | null = null;
  const at = new Vector3(), q = new Quaternion(), p = new Vector3(), scratch = new Vector3();
  const hook = world.afterStep(() => {
    if (landed || fell) return;
    if (!headCentre && blow.time >= STAND) {
      // The body as it stands when the blow begins: the target's pose, and where it is.
      struck.update();
      headCentre = centreNow(head);
      target = headCentre.add(new Vector3(0, 0, distance));
    }
    if (blow.fallen) { fell = true; return; }
    read(now);
    const live = blow.time >= blow.pushing;
    if (live && watching) {
      for (let k = 1; k <= SUB && !landed; k++) {
        const f = k / SUB;
        Vector3.LerpToRef(last.position, now.position, f, at);
        Quaternion.SlerpToRef(last.rotation, now.rotation, f, q);
        const a = place(at, q, ends[0].clone()), b = place(at, q, ends[1].clone());
        const point = nearestOn(a, b, target!, p);
        const gap = Vector3.Distance(point, target!) - R - r;
        nearest = Math.min(nearest, gap);
        if (gap > 0) continue;
        // The normal, club into head; the contact on the swell's surface; its velocity there.
        const normal = target!.subtract(point).normalize();
        const contact = point.add(normal.scale(r));
        const c = place(at, q, centre.clone());
        const velocity = Vector3.Lerp(last.velocity, now.velocity, f).addInPlace(Vector3.Cross(Vector3.Lerp(last.spin, now.spin, f), contact.subtract(c)));
        const closing = Vector3.Dot(velocity, normal);
        // The club's mass there, with the pose as this step left it: the contact and its normal
        // carried with the hand from where it touched.
        striker.update();
        const back = Quaternion.Inverse(q), carry = now.rotation.multiply(back);
        const clubPoint = place(now.position, now.rotation, contact.subtract(at).applyRotationQuaternion(back));
        const clubNormal = normal.applyRotationQuaternion(carry);
        const clubKg = striker.along(segment, [clubPoint.x, clubPoint.y, clubPoint.z], [clubNormal.x, clubNormal.y, clubNormal.z]);
        // The head's at the struck point, on the striker's own head turned to face it: a half turn about up.
        const struckOffset = normal.scale(-R), turned = [-struckOffset.x, struckOffset.y, -struckOffset.z] as const;
        const hc = headCentre!, headPoint: [number, number, number] = [hc.x + turned[0], hc.y + turned[1], hc.z + turned[2]];
        const headKg = struck.along(head, headPoint, [-normal.x, normal.y, -normal.z]);
        landed = {
          energy: impactEnergy(clubKg, headKg, closing), closing, clubKg, headKg,
          at: +(blow.time - blow.pushing - (1 - f) * world.dt).toFixed(4),
          normal: [normal.x, normal.y, normal.z].map((x) => +x.toFixed(3)), along: +Vector3.Distance(contact, a).toFixed(3),
          point: [contact.x, contact.y, contact.z],
        };
      }
      if (!landed) {
        place(now.position, now.rotation, ends[1].clone()).subtractToRef(place(now.position, now.rotation, centre.clone()), scratch);
        peak = Math.max(peak, now.velocity.add(Vector3.Cross(now.spin, scratch)).length());
      }
    }
    // A swell already in the sphere when the pushes begin has not arrived: wait for it to leave.
    if (live && !watching) {
      const a = place(now.position, now.rotation, ends[0].clone()), b = place(now.position, now.rotation, ends[1].clone());
      watching = Vector3.Distance(nearestOn(a, b, target!, p), target!) > R + r;
    }
    last.position.copyFrom(now.position); last.rotation.copyFrom(now.rotation);
    last.velocity.copyFrom(now.velocity); last.spin.copyFrom(now.spin);
  });
  return {
    get landed() { return landed; },
    get fell() { return fell; },
    get nearest() { return nearest; },
    get peak() { return peak; },
    get target() { return target; },
    radius: R,
    dispose: () => hook.dispose(),
  };
}
