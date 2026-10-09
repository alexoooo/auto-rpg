import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { SegmentBody } from "../engine/engine.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { rigidPoints } from "../build/rigid.ts";
import { effectorAim } from "./effectors.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { motionAtToRef, pointOfToRef } from "./support.ts";

/** Permitted contact identity, detached from engine handles: a body's segment says whether its body covers with it (`Marks.guards`). */
export type ContactTarget = { readonly kind: "body"; readonly body: string; readonly segment: string; readonly guard: boolean }
  | { readonly kind: "object"; readonly id: string } | { readonly kind: "world" };

/** Trusted adapter maps physics bodies to permitted identities; only detached results enter a view. */
export type ContactIdentity = (other: SegmentBody | null) => ContactTarget | null;

export interface EffectorContact { readonly target: ContactTarget; readonly point: Vec3; readonly normal: Vec3; readonly impulse: number; readonly compression?: number }

/** Own striking-point motion and external touch; no engine objects or opponent intentions. */
export interface EffectorFeedback {
  readonly point: Vec3;
  readonly velocity: Vec3;
  readonly impulse: number;
  readonly contactPoint: Vec3 | null;
  /** Strongest permitted external contact; present only with a trusted identity adapter. */
  readonly contact?: EffectorContact | null;
  /** Loaded contact outside the selected striking regions, when regions are requested. */
  readonly obstructed?: boolean;
  /** Strongest loaded contact outside the selected regions, with detached identity. */
  readonly obstruction?: EffectorContact | null;
  /** All loaded external identities when a physical endpoint is explicitly selected. */
  readonly contacts?: readonly ContactTarget[];
  /** Greatest measured normal compression among selected striking-region contacts. */
  readonly compression?: number;
}

/** Trusted contact and motion sampler for any declared physical endpoint, sampled before control from the last completed physics step. */
export function effectorFeedback(built: BuiltBody, segments: readonly string[], identity?: ContactIdentity,
  external?: (segment: string) => readonly EffectorContact[], points?: Readonly<Record<string, { readonly point: string; readonly regions?: readonly string[] }>>) {
  const make = () => ({ point: [0, 0, 0] as [number, number, number], velocity: [0, 0, 0] as [number, number, number],
    impulse: 0, contactPoint: null as Vec3 | null, ...(identity || external ? { contact: null as EffectorContact | null } : {}),
    ...(points ? { obstructed: false, obstruction: null as EffectorContact | null, contacts: [] as ContactTarget[], compression: 0 } : {}) });
  const state = Object.fromEntries(segments.map(name => [name, make()]));
  const own = new Set([...built.segments.values()].map(s => s.body));
  const parts = segments.map(name => {
    const segment = built.segments.get(name);
    if (!segment) throw new Error(`no feedback segment ${name}`);
    const declared = rigidPoints(built.spec, segment.spec), point = declared.get(points?.[name]?.point ?? effectorAim(built.spec, name))?.value;
    if (!point) throw new Error(`no feedback point ${name}`);
    const regions = points?.[name]?.regions;
    const shapes = regions && segment.rigid.owners.flatMap((owner, i) => owner.kind === "region" && regions.includes(owner.region.name) ? [i] : []);
    return { name, segment, point, shapes, strike: declared.get("strike")?.value };
  });
  const point = new Vector3(), velocity = new Vector3(), spin = new Vector3();
  return { state, read() {
    for (const item of parts) {
      const out = state[item.name]!;
      pointOfToRef(item.segment, item.segment.handPose?.applied === "fist" && item.strike ? item.strike : item.point, point);
      motionAtToRef(item.segment, point, velocity, spin);
      out.point[0] = point.x; out.point[1] = point.y; out.point[2] = point.z;
      out.velocity[0] = velocity.x; out.velocity[1] = velocity.y; out.velocity[2] = velocity.z;
      out.impulse = 0; out.contactPoint = null; if (identity || external) out.contact = null;
      if (points) { out.obstructed = false; out.obstruction = null; out.contacts!.length = 0; out.compression = 0; }
      let strongest = 0;
      for (const contact of built.physics.contactsOf(item.segment.body)) {
        if ((contact.other && own.has(contact.other)) || !(contact.impulse > 0)) continue;
        const permitted = identity?.(contact.other);
        if (points) out.contacts!.push({ ...(permitted ?? { kind: "world" as const }) });
        const pairs = item.shapes ? contact.pairs.filter(pair => item.shapes!.includes(pair.mine)) : [contact];
        if (item.shapes && !pairs.length) {
          out.obstructed = true;
          if (contact.impulse > (out.obstruction?.impulse ?? 0)) out.obstruction = {
            target: { ...(identity?.(contact.other) ?? { kind: "world" as const }) },
            point: [...contact.point], normal: [...contact.normal], impulse: contact.impulse };
        }
        for (const pair of pairs) {
          if (points && "compression" in pair && pair.compression !== undefined) out.compression = Math.max(out.compression!, pair.compression);
          out.impulse += pair.impulse;
          if (pair.impulse > strongest) { strongest = pair.impulse; out.contactPoint = [...pair.point]; }
          const target = permitted;
          if (target && pair.impulse > (out.contact?.impulse ?? 0))
            out.contact = { target: { ...target }, point: [...pair.point], normal: [...pair.normal], impulse: pair.impulse,
              ...("compression" in pair ? { compression: pair.compression } : {}) };
        }
      }
      for (const contact of external?.(item.name) ?? []) {
        if (!(contact.impulse > 0) || !Number.isFinite(contact.impulse)) continue;
        if (points) out.contacts!.push({ ...contact.target });
        if (points && contact.compression !== undefined) out.compression = Math.max(out.compression!, contact.compression);
        out.impulse += contact.impulse;
        if (contact.impulse > strongest) { strongest = contact.impulse; out.contactPoint = [...contact.point]; }
        if (contact.impulse > (out.contact?.impulse ?? 0))
          out.contact = { ...contact, target: { ...contact.target }, point: [...contact.point], normal: [...contact.normal] };
      }
    }
  } };
}

/** Every loaded identity must belong to the selected opponent before a stroke continues. */
export function unintendedContact(feedback: EffectorFeedback | undefined, foe: string | undefined): boolean {
  return feedback?.contacts?.some(target => target.kind !== "body" || target.body !== foe) ?? false;
}

/** Contact response is a policy observation; it changes no blow or wound rule. */
export function contactResponse(feedback: EffectorFeedback | undefined, foe: string): "target" | "block" | "world" | "incidental" | null {
  const target = feedback?.contact?.target;
  if (!target) return null;
  switch (target.kind) {
    case "world": return "world";
    case "object": return target.id === foe ? "target" : "incidental";
    case "body": return target.body !== foe ? "incidental" : target.guard ? "block" : "target";
    default: { const never: never = target; throw new Error(`unknown contact target ${never}`); }
  }
}
