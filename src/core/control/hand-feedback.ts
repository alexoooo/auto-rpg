import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { SegmentBody } from "../engine/engine.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { rigidPoints } from "../build/rigid.ts";
import { aimOf } from "../skills/strikes.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { motionAtToRef, pointOfToRef } from "./support.ts";

/** Permitted contact identity, detached from engine handles. */
export type ContactTarget = { readonly kind: "body"; readonly body: string; readonly segment: string }
  | { readonly kind: "object"; readonly id: string } | { readonly kind: "world" };

/** Trusted adapter maps physics bodies to permitted identities; only detached results enter a view. */
export type ContactIdentity = (other: SegmentBody | null) => ContactTarget | null;

export interface HandContact { readonly target: ContactTarget; readonly point: Vec3; readonly normal: Vec3; readonly impulse: number }

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
export function handFeedback(built: BuiltBody, identity?: ContactIdentity,
  external?: (hand: "left" | "right") => readonly HandContact[]) {
  const feedback = effectorFeedback(built, ["hand.left", "hand.right"], identity,
    external ? segment => external(segment === "hand.left" ? "left" : "right") : undefined);
  return { state: { left: feedback.state["hand.left"]!, right: feedback.state["hand.right"]! }, read: feedback.read };
}

/** The same trusted contact and motion sampler for any declared physical endpoint. */
export function effectorFeedback(built: BuiltBody, segments: readonly string[], identity?: ContactIdentity,
  external?: (segment: string) => readonly HandContact[]) {
  const make = () => ({ point: [0, 0, 0] as [number, number, number], velocity: [0, 0, 0] as [number, number, number],
    impulse: 0, contactPoint: null as Vec3 | null, ...(identity || external ? { contact: null as HandContact | null } : {}) });
  const state = Object.fromEntries(segments.map(name => [name, make()]));
  const own = new Set([...built.segments.values()].map(s => s.body));
  const hands = segments.map(name => {
    const segment = built.segments.get(name);
    if (!segment) throw new Error(`no feedback segment ${name}`);
    const points = rigidPoints(built.spec, segment.spec), declaration = built.spec.effectors?.find(e => e.segment === name);
    const aim = name === "hand.left" ? aimOf(built.spec, "left") : name === "hand.right" ? aimOf(built.spec, "right") : declaration?.point;
    const point = aim && points.get(aim)?.value;
    if (!point) throw new Error(`no feedback point ${name}`);
    return { hand: name, segment, point, strike: points.get("strike")?.value };
  });
  const point = new Vector3(), velocity = new Vector3(), spin = new Vector3();
  return { state, read() {
    for (const item of hands) {
      const out = state[item.hand]!;
      pointOfToRef(item.segment, item.segment.handPose?.applied === "fist" && item.strike ? item.strike : item.point, point);
      motionAtToRef(item.segment, point, velocity, spin);
      out.point[0] = point.x; out.point[1] = point.y; out.point[2] = point.z;
      out.velocity[0] = velocity.x; out.velocity[1] = velocity.y; out.velocity[2] = velocity.z;
      out.impulse = 0; out.contactPoint = null; if (identity || external) out.contact = null;
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
      for (const contact of external?.(item.hand) ?? []) {
        if (!(contact.impulse > 0) || !Number.isFinite(contact.impulse)) continue;
        out.impulse += contact.impulse;
        if (contact.impulse > strongest) { strongest = contact.impulse; out.contactPoint = [...contact.point]; }
        if (contact.impulse > (out.contact?.impulse ?? 0))
          out.contact = { ...contact, target: { ...contact.target }, point: [...contact.point], normal: [...contact.normal] };
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
    case "object": return target.id === foe ? "target" : "incidental";
    case "body": return target.body !== foe ? "incidental" : /^hand\.|^forearm\./.test(target.segment) ? "block" : "target";
    default: { const never: never = target; throw new Error(`unknown contact target ${never}`); }
  }
}
