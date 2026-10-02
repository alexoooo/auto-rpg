import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltSegment } from "./build/build-body.ts";
import { contactMass, type ContactMass } from "./build/contact-mass.ts";
import type { SegmentBody } from "./engine/engine.ts";
import { impactEnergy } from "./rules/impact.ts";
import type { Vec3 } from "./spec/quantity.ts";
import type { World } from "./world.ts";

/**
 * **New touches, read from the engine's contacts**: what a blow is (`src/core/rules/blows.ts`) and
 * what a sound is (`src/audio/body-sounds.ts`). After every step (`World.afterStep`), each watched
 * segment the solver pushed on another watched body, or on something fixed
 * (`PhysicsWorld.contactsOf`), has touched it, unless the touch was already under way.
 *
 * - **A touch begins the step the solver first pushes on it**, and lasts as its reader says
 *   (`lasts`): while the solver goes on pushing, or until the two are no longer in contact. Two
 *   are in contact from a little way off (`Contact`), so a body coming down is in contact a step
 *   or two before it is pushed on, and that is no touch yet.
 * - **The closing speed** is the two points' velocities along the contact's normal, from the
 *   bodies' velocities as the step before left them: the step a touch lands in has already met
 *   it. Something fixed does not move. A touch that was not closing is none.
 * - **Its energy** (`TouchWatch.priced`) is `impactEnergy` of the masses the contact meets on each
 *   side (`contactMass`, joints free and each body floating), and of something fixed, a mass
 *   nothing moves.
 */

/** A segment of a body that is watched. */
export interface Part<B> {
  readonly body: B;
  readonly segment: BuiltSegment;
}

/** **A new touch**: a segment met another watched body's, or something fixed, and was closing on it. */
export interface Touch<B> {
  /** The world's clock when it landed, s. */
  readonly time: number;
  readonly of: Part<B>;
  /** What it met; null for something fixed. */
  readonly on: Part<B> | null;
  /** Where, world, m, and the normal, `of` into `on`. */
  readonly point: Vec3;
  readonly normal: Vec3;
  /** The closing speed along the normal, m/s. */
  readonly closing: number;
}

export interface TouchWatch<B> {
  /** Its memory (`src/core/state.ts`). */
  readonly state: object;
  /**
   * The masses `touch` meets on each side, kg (`Infinity` for something fixed), and its energy, J.
   * Read from the bodies as they stand: good only while the touch is being heard.
   */
  priced(touch: Touch<B>): { readonly ofKg: number; readonly onKg: number; readonly energy: number };
  dispose(): void;
}

interface TouchOptions<B> {
  /** The segments whose contacts are read, in this order; all of a body's, in its own order, if not given. */
  readonly segments?: readonly string[];
  /**
   * How long a touch lasts, from the step the solver first pushes on it: `pushed`, while the
   * solver pushes on it (one let go of for a step lands again); `contact`, while the two are in
   * contact (it lands again only once they have parted).
   */
  readonly lasts: "pushed" | "contact";
  /** Whether a contact is one to read at all: asked every step, before the touch is remembered. */
  counts(of: Part<B>, on: Part<B> | null): boolean;
}

interface Owned<B> extends Part<B> {
  /** Its place among the watch's segments: its key in a touch, and its place in `TouchState.last`. */
  readonly key: number;
  readonly masses: ContactMass;
  /** The centre of mass in the segment's own frame. */
  readonly local: Vector3;
}

/** **What a touch watch remembers.** */
interface TouchState {
  /** The touches under way as the last step left them, by their two keys: one under way lands nothing. */
  touching: Set<string>;
  /** Each segment's velocities and centre as the last step left them, in the segments' order. */
  readonly last: { readonly velocity: Vector3; readonly spin: Vector3; readonly centre: Vector3 }[];
}

/** Read the new touches of `bodies` in `world`; `heard` is told each as it lands, in the step it lands. */
export function watchTouches<B extends { readonly built: BuiltBody }>(
  world: World, bodies: readonly B[], options: TouchOptions<B>, heard: (touch: Touch<B>) => void,
): TouchWatch<B> {
  const owners = new Map<SegmentBody, Owned<B>>();
  const state: TouchState = { touching: new Set(), last: [] };
  const massesOf = new Map<B, ContactMass>();
  for (const body of bodies) {
    const masses = contactMass(body.built);
    massesOf.set(body, masses);
    for (const segment of body.built.segments.values()) {
      if (owners.has(segment.body)) throw new Error(`${body.built.spec.model}'s ${segment.spec.name} is another watched body's`);
      const { origin, x, y, z } = segment.frame, c = segment.rigid.centre, d = [c[0] - origin[0], c[1] - origin[1], c[2] - origin[2]];
      const local = new Vector3(...[x, y, z].map((a) => d[0]! * a[0] + d[1]! * a[1] + d[2]! * a[2]) as [number, number, number]);
      owners.set(segment.body, { key: state.last.length, body, segment, masses, local });
      state.last.push({ velocity: new Vector3(), spin: new Vector3(), centre: new Vector3() });
    }
  }
  const remember = () => {
    for (const owned of owners.values()) {
      const { segment } = owned, last = state.last[owned.key]!;
      segment.body.linearVelocityToRef(last.velocity);
      segment.body.angularVelocityToRef(last.spin);
      owned.local.applyRotationQuaternionToRef(segment.node.rotationQuaternion!, last.centre).addInPlace(segment.node.position);
    }
  };
  remember();
  const read = bodies.flatMap((body) => options.segments
    ? options.segments.flatMap((name) => { const segment = body.built.segments.get(name); return segment ? [owners.get(segment.body)!] : []; })
    : [...body.built.segments.values()].map((segment) => owners.get(segment.body)!));
  /** The velocity of `owned`'s segment at `point` as the last step left it. */
  const velocityAt = (owned: Owned<B>, point: Vector3): Vector3 => {
    const last = state.last[owned.key]!;
    return last.velocity.add(Vector3.Cross(last.spin, point.subtract(last.centre)));
  };
  /** The bodies whose contact mass has this step's pose: it is taken once a body a step. */
  const posed = new Set<ContactMass>();
  const massAt = (owned: Owned<B>, point: Vec3, normal: Vec3): number => {
    if (!posed.has(owned.masses)) { owned.masses.update(); posed.add(owned.masses); }
    return owned.masses.along(owned.segment, point, normal);
  };
  /** Whether a step's touches are being told: outside it, a pose taken is not kept. */
  let telling = false;

  const hook = world.afterStep(() => {
    const now = new Set<string>();
    telling = true;
    for (const part of read) {
      for (const contact of world.physics.contactsOf(part.segment.body)) {
        const on = contact.other === null ? null : owners.get(contact.other);
        // A body that is not watched is no touch.
        if (on === undefined || !options.counts(part, on)) continue;
        const key = on ? `${part.key}:${on.key}` : `${part.key}:f${contact.fixed}`;
        const pushed = contact.impulse > 0, under = state.touching.has(key);
        if (pushed || (under && options.lasts === "contact")) now.add(key);
        if (!pushed || under) continue;
        const point = new Vector3(...contact.point), normal = new Vector3(...contact.normal);
        const closing = Vector3.Dot(on ? velocityAt(part, point).subtract(velocityAt(on, point)) : velocityAt(part, point), normal);
        // A touch that was not closing is none: a hand laid on, or brushing past.
        if (!(closing > 0)) continue;
        heard({ time: world.time, of: part, on, point: contact.point, normal: contact.normal, closing });
      }
    }
    telling = false;
    posed.clear();
    state.touching = now;
    remember();
  });

  return {
    state,
    priced(touch) {
      const of = owners.get(touch.of.segment.body), on = touch.on ? owners.get(touch.on.segment.body) : null;
      if (!of || on === undefined) throw new Error("a touch is priced by the watch that read it");
      if (!telling) posed.clear();
      const ofKg = massAt(of, touch.point, touch.normal);
      const onKg = on ? massAt(on, touch.point, touch.normal) : Infinity;
      return { ofKg, onKg, energy: impactEnergy(ofKg, onKg, touch.closing) };
    },
    dispose: () => hook.dispose(),
  };
}
