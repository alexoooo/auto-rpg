import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { SegmentBody } from "../engine/engine.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { rigidPoints } from "../build/rigid.ts";
import { aimOf } from "../skills/strikes.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { motionAtToRef, pointOfToRef } from "./support.ts";

/** Permitted contact identity, detached from engine handles. */
export type ContactTarget = { readonly kind: "body"; readonly body: string; readonly segment: string } | { readonly kind: "world" };

/** Trusted adapter maps physics bodies to permitted identities; only detached results enter a view. */
export type ContactIdentity = (other: SegmentBody | null) => ContactTarget | null;

interface HandContact { readonly target: ContactTarget; readonly point: Vec3; readonly normal: Vec3; readonly impulse: number }

/** Own striking-point motion and external touch; no engine objects or opponent intentions. */
export interface HandFeedback {
  readonly point: Vec3;
  readonly velocity: Vec3;
  readonly impulse: number;
  readonly contactPoint: Vec3 | null;
  /** Strongest permitted external contact; present only with a trusted identity adapter. */
  readonly contact?: HandContact | null;
}

/** A positive touch beginning this step; pressure carried from the preceding step is not new. */
export function newHandContact(wasTouching: boolean, current: Pick<HandFeedback, "impulse"> | undefined): boolean {
  return !wasTouching && (current?.impulse ?? 0) > 0;
}

/** Trusted body adapter, sampled before control from the last completed physics step. */
export function handFeedback(built: BuiltBody, identity?: ContactIdentity) {
  const make = () => ({ point: [0, 0, 0] as [number, number, number], velocity: [0, 0, 0] as [number, number, number],
    impulse: 0, contactPoint: null as Vec3 | null, ...(identity ? { contact: null as HandContact | null } : {}) });
  const state = { left: make(), right: make() };
  const own = new Set([...built.segments.values()].map(s => s.body));
  const hands = (["left", "right"] as const).map(hand => {
    const segment = built.segments.get(`hand.${hand}`)!;
    return { hand, segment, point: rigidPoints(built.spec, segment.spec).get(aimOf(built.spec, hand))!.value };
  });
  const point = new Vector3(), velocity = new Vector3(), spin = new Vector3();
  return { state, read() {
    for (const item of hands) {
      const out = state[item.hand];
      pointOfToRef(item.segment, item.point, point); motionAtToRef(item.segment, point, velocity, spin);
      out.point[0] = point.x; out.point[1] = point.y; out.point[2] = point.z;
      out.velocity[0] = velocity.x; out.velocity[1] = velocity.y; out.velocity[2] = velocity.z;
      out.impulse = 0; out.contactPoint = null; if (identity) out.contact = null;
      let strongest = 0;
      for (const contact of built.physics.contactsOf(item.segment.body)) {
        if ((contact.other && own.has(contact.other)) || !(contact.impulse > 0)) continue;
        out.impulse += contact.impulse;
        if (contact.impulse > strongest) {
          strongest = contact.impulse; out.contactPoint = [...contact.point];
        }
        const target = identity?.(contact.other);
        if (target && contact.impulse > (out.contact?.impulse ?? 0))
          out.contact = { target: { ...target }, point: [...contact.point], normal: [...contact.normal], impulse: contact.impulse };
      }
    }
  } };
}

/** Contact response is a policy observation; it changes no blow or wound rule. */
export function contactResponse(feedback: HandFeedback | undefined, foe: string): "target" | "block" | "world" | "incidental" | null {
  const target = feedback?.contact?.target;
  if (!target) return null;
  switch (target.kind) {
    case "world": return "world";
    case "body": return target.body !== foe ? "incidental" : /^hand\.|^forearm\./.test(target.segment) ? "block" : "target";
    default: { const never: never = target; throw new Error(`unknown contact target ${never}`); }
  }
}
