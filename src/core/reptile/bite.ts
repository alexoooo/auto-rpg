import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltJoint, BuiltSegment } from "../build/build-body.ts";
import type { OwnBody } from "../mind/mind.ts";
import { channelName } from "../muscle/driver.ts";
import type { effectorTracker } from "../control/effector-tracker.ts";
import { chainTo, rootFrameToRef, intoFrameToRef, pointAtToRef } from "../control/kinematics.ts";
import { motionAtToRef, pointOfToRef, turnOfToRef, withinSupport } from "../control/support.ts";
import type { SupportedCommand } from "../control/supported-motor.ts";
import { advanceStrike, strikeTransition, STRIKE_EVENT, type StrikeCycleState } from "../skills/strike-cycle.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { Skill } from "../skills/skill.ts";
import type { QuadrupedView } from "./crawl.ts";
import { REPTILE_BITE } from "./tuning.ts";
import { scalarPathToRef } from "../control/point-path.ts";
import { unintendedContact, type EffectorFeedback } from "../control/effector-feedback.ts";
import { lowsOf } from "../control/ground.ts";
import { atan2 } from "../math/real.ts";

/** The jaw's physical clearance witnesses in the head's reference frame at a measured gape. */
function gapePoints(lower: BuiltSegment, hinge: BuiltJoint, angle: number) {
  return lowsOf(lower.spec.shape, lower.frame).map(low => {
    const point = pointAtToRef([hinge], [[angle]], low.at, new Vector3());
    return { at: [point.x, point.y, point.z] as Vec3, radius: low.radius };
  });
}

/**
 * The jaw and what it hangs from: the segment with a `bite` point (`lower`), its joint (`hinge`),
 * the head the hinge hangs it from, which has a `mouth` point, and the joint that carries the head (`neck`).
 */
export function mouthOf(built: BuiltBody) {
  const lower = [...built.segments.values()].find(segment => segment.spec.points?.bite);
  const hinge = lower && chainTo(built, lower).at(-1), head = hinge?.parent, neck = head && chainTo(built, head).at(-1);
  if (!lower || !hinge || !head?.spec.points?.mouth || !neck) throw new Error(`${built.spec.model} has no jaw hinged to a head with a mouth`);
  const teeth = (lower.spec.contacts ?? []).flatMap(contact => {
    if (!contact.surface.point || contact.shape.kind !== "hull") return [];
    const direction = contact.surface.point.direction.value;
    const projection = (point: Vec3) => point[0] * direction[0] + point[1] * direction[1] + point[2] * direction[2];
    const tip = contact.shape.points.reduce((best, point) => projection(point.value) > projection(best.value) ? point : best).value;
    return [{ name: contact.name, tip }];
  });
  return { lower, hinge, head, neck, teeth };
}

/** A finite physical jaw stroke uses the shared measured chamber, contact and withdrawal cycle. */
export function bite(own: OwnBody, tracker: ReturnType<typeof effectorTracker>, T = REPTILE_BITE, feedback?: EffectorFeedback, headFeedback?: EffectorFeedback) {
  const { lower, hinge, head, neck, teeth: tips } = mouthOf(own.built);
  const jawName = channelName(hinge, 0), jaw = own.muscles.channel(jawName), tip = lower.spec.points!.bite!.value;
  const neckName = channelName(neck, 1), retract = Math.max(neck.dofs[1]!.spec.min.value, -T.neckRetract);
  const neckPitch = own.muscles.channel(neckName);
  const bodies = new Set([...own.built.segments.values()].map(p => p.body));
  const cycle: StrikeCycleState = { phase: null, time: 0, ready: 0, sequence: 0, velocity: [0, 0, 0], touching: false, impact: null };
  const state = { cycle, target: [0, 0, 0] as [number, number, number], aim: [0, 0, 0] as [number, number, number], reach: 0, launched: 0, returned: 0, failed: 0, aborted: 0,
    selected: null as { foe: string; part: string; tooth?: string } | null, returnPitch: 0,
    shift: [0, 0] as [number, number],
    jaw: { sequence: -1, opening: false, time: 0, start: 0, rate: 0, sample: [0, 0, 0] as [number, number, number] } };
  const frame = { position: new Vector3(), rotation: new Quaternion() }, root = { position: new Vector3(), rotation: new Quaternion() };
  const at = new Vector3(), point = new Vector3(), velocity = new Vector3(), carried = new Vector3(), spin = new Vector3(), inverse = new Quaternion();
  const chamberPoint = pointAtToRef([hinge], [[T.open]], tip, new Vector3());
  const gape = gapePoints(lower, hinge, T.open);
  const chamber: [number, number, number] = [chamberPoint.x, chamberPoint.y, chamberPoint.z];
  const strikePoint = pointAtToRef([hinge], [[T.open * T.contactAt]], tip, new Vector3());
  const tooth = lower.spec.contacts!.find(c => c.surface.point)!;
  const toothDepth = tooth.shape.kind === "hull" ? Math.max(...tooth.shape.points.map(p => p.value[1])) - Math.min(...tooth.shape.points.map(p => p.value[1])) : 0;
  const teeth = lower.spec.contacts!.flatMap(c => c.shape.kind === "hull" && c.surface.point ? c.shape.points.map(p => p.value) : []);
  const halfWidth = Math.max(...teeth.map(p => Math.abs(p[0] - tip[0])));
  const aim = new Vector3(), offset = new Vector3(), mouth = head.spec.points!.mouth!.value;
  const support = (own.spec.effectors ?? []).filter(e => e.support).map(() => ({ corners: [new Vector3()] }));
  const loadedSupport: typeof support = [];
  const touching = (part: typeof head) => own.built.physics.contactsOf(part.body).some(c => (!c.other || !bodies.has(c.other)) && c.impulse > 0);
  const withdraw = () => cycle.phase === "return" && cycle.time >= T.prepare + T.release && (touching(head) || touching(lower));
  const resume = () => { strikeTransition(cycle, null, [0, 0, 0]); cycle.touching = false; state.selected = null; state.jaw.sequence = -1; state.shift.fill(0); tracker.release(head.spec.name); };
  const skill: Skill<QuadrupedView> & { readonly state: typeof state; withdraw(): boolean; tracked(channel: number): readonly [number, number, number] | undefined; response(channel: number): number | undefined; command(view: QuadrupedView, target: Vec3 | null, ready: boolean, dt: number, command: SupportedCommand, prepare: boolean, selection?: { foe: string; part: string; tooth?: string } | null): void } = {
    state, resume, withdraw, tracked: channel => channel === jaw ? state.jaw.sample : undefined,
    response: channel => channel === jaw && (cycle.phase === "swing" || cycle.phase === "return") ? T.biteResponse : undefined,
    command(view, target, ready, dt, command, prepare, selection) {
      const posture = command.posture as Record<string, number>, centre = command.centre as [number, number, number];
      rootFrameToRef(head, frame); pointOfToRef(lower, tip, at);
      motionAtToRef(lower, at, velocity, spin); motionAtToRef(head, at, carried, spin);
      velocity.subtractInPlace(carried).applyRotationQuaternionToRef(Quaternion.InverseToRef(frame.rotation, inverse), velocity);
      const rate: Vec3 = [velocity.x, velocity.y, velocity.z];
      intoFrameToRef(frame, [at.x, at.y, at.z], point);
      const measured: Vec3 = [point.x, point.y, point.z];
      if (cycle.phase === null && target && ready) { state.target.splice(0, 3, ...target); strikeTransition(cycle, "chamber", rate); state.reach = cycle.sequence; }
      if (cycle.phase === "chamber" && target) state.target.splice(0, 3, ...target);
      if (cycle.phase === "chamber") state.selected = selection ? { ...selection } : null;
      const strokeTip = tips.find(t => t.name === state.selected?.tooth)?.tip ?? tip;
      const ground = Math.min(...view.feet.map(foot => foot.ground));
      const floorAt = () => {
        let floor = Infinity;
        for (const low of gape) {
          point.set(...low.at).applyRotationQuaternionToRef(frame.rotation, point).addInPlace(frame.position);
          floor = Math.min(floor, point.y - low.radius);
        }
        return floor;
      };
      intoFrameToRef(frame, state.target, point);
      const pivot = hinge.spec.centre.value;
      const contactAngle = Math.max(0, Math.min(T.open, atan2(strokeTip[1] - pivot[1], strokeTip[2] - pivot[2])
        - atan2(point.y - pivot[1], point.z - pivot[2])));
      pointAtToRef([hinge], [[contactAngle]], strokeTip, strikePoint);
      offset.set(strikePoint.x - mouth[0], strikePoint.y - mouth[1], strikePoint.z - mouth[2]).applyRotationQuaternionToRef(frame.rotation, offset);
      aim.set(...state.target).subtractInPlace(offset);
      if (cycle.phase === "chamber") state.aim.splice(0, 3, aim.x, aim.y, aim.z);
      else if (cycle.phase === "swing") aim.set(...state.aim);
      const angle = own.muscles.angle(jaw), clear = !touching(head) && !touching(lower);
      const openingFloor = floorAt();
      pointOfToRef(head, head.spec.points!.mouth!.value, point);
      const dx = point.x - aim.x, dy = point.y - aim.y, dz = point.z - aim.z;
      if (cycle.phase === "chamber" && ready) {
        state.shift[0] -= dx * dt / T.prepare; state.shift[1] -= dz * dt / T.prepare;
        const distance = Math.sqrt(state.shift[0] * state.shift[0] + state.shift[1] * state.shift[1]);
        if (distance > T.biteShift) { state.shift[0] *= T.biteShift / distance; state.shift[1] *= T.biteShift / distance; }
      } else if (cycle.phase !== "chamber" && cycle.phase !== "swing") state.shift.fill(0);
      if (cycle.phase === "chamber" || cycle.phase === "swing") {
        let loaded = 0;
        support.forEach((sole, i) => { if (view.feet[i]!.contact) { sole.corners[0]!.copyFrom(view.feet[i]!.at); loadedSupport[loaded++] = sole; } });
        loadedSupport.length = loaded;
        if (loaded >= support.length - 1) {
          const placed = withinSupport(loadedSupport, centre[0] + state.shift[0], centre[2] + state.shift[1], T.biteInset);
          centre[0] = placed[0]; centre[2] = placed[1];
        }
      }
      intoFrameToRef(frame, state.target, point);
      const captured = Math.abs(point.x - strokeTip[0]) <= (state.selected?.tooth ? T.biteEntry : halfWidth + T.biteEntry)
        && point.y >= Math.min(measured[1], tip[1]) - T.biteEntry && point.y <= Math.max(measured[1], tip[1]) + T.biteEntry
        && point.z >= Math.min(measured[2], tip[2]) - T.biteEntry && point.z <= Math.max(measured[2], tip[2]) + T.biteEntry;
      const captureError = T.biteAlign;
      const prepared = captured && openingFloor > ground + T.biteEntry && angle >= T.open - T.jawError
        && dx * dx + dy * dy + dz * dz <= captureError * captureError;
      const complete = cycle.phase === "swing" && cycle.time >= T.snap && angle < T.jawClosed;
      const contact = feedback?.contact, identity = contact?.target, obstruction = feedback?.obstruction?.target;
      const blocked = unintendedContact(feedback, state.selected?.foe) || unintendedContact(headFeedback, state.selected?.foe)
        || !!obstruction && !(obstruction.kind === "body" && obstruction.body === state.selected?.foe);
      const intended = !blocked && (contact ? identity?.kind === "body" && identity.body === state.selected?.foe : !feedback?.impulse);
      if (contact) { velocity.set(...contact.normal).applyRotationQuaternionToRef(Quaternion.InverseToRef(turnOfToRef(lower, inverse), inverse), velocity); }
      const direction = tooth.surface.point!.direction.value;
      const aligned = !contact || velocity.x * direction[0] + velocity.y * direction[1] + velocity.z * direction[2] >= tooth.surface.point!.alignment.value;
      const phase = cycle.phase;
      const event = advanceStrike(cycle, { at: measured, velocity: rate, home: chamber, chamber: prepared ? measured : chamber,
        requested: !!target && !blocked, complete, down: view.down, supported: ready, prepared, released: clear && cycle.time >= T.release && angle >= T.open - T.jawError
          && Math.abs(own.muscles.angle(own.muscles.channel(neckName))) <= T.jawError,
        touching: feedback ? feedback.impulse > 0 : touching(lower), intended, aligned,
        contactVelocity: rate, closing: own.muscles.rate(jaw) < 0, contactDepth: feedback?.compression, seconds: T.snap },
        { near: T.biteNear, slow: T.biteSlow, hold: T.biteHold, prepareLimit: T.biteTimeout, returnLimit: T.biteReturnLimit, followSeconds: T.snap,
          impact: { impactSeconds: T.contactSeconds, impactTravel: toothDepth } }, dt);
      if (event & STRIKE_EVENT.launch) { state.launched++; cycle.touching = false; }
      if (event & STRIKE_EVENT.returned) state.returned++;
      if (event & STRIKE_EVENT.failed) state.failed++;
      if (event & STRIKE_EVENT.aborted) state.aborted++;
      if (phase !== "return" && cycle.phase === "return") state.returnPitch = own.muscles.angle(neckPitch);
      const opening = cycle.phase === null && prepare || cycle.phase === "chamber" || cycle.phase === "return";
      const path = state.jaw;
      if (path.sequence !== cycle.sequence || path.opening !== opening) {
        path.sequence = cycle.sequence; path.opening = opening; path.time = 0;
        path.start = angle; path.rate = own.muscles.rate(jaw);
      } else path.time += dt;
      scalarPathToRef(path.start, path.rate, opening ? T.open : 0, path.time, opening ? T.prepare : T.snap, path.sample, cycle.phase === "swing" ? -T.closeRate : 0);
      posture[jawName] = path.sample[0];
      posture[neckName] = cycle.phase === "return" && !clear
        ? cycle.time >= T.prepare || openingFloor <= ground + T.biteEntry ? retract : state.returnPitch : 0;
      if (cycle.phase === "chamber" || cycle.phase === "swing") {
        rootFrameToRef(own.muscles.dynamics.root.segment, root); intoFrameToRef(root, [aim.x, aim.y, aim.z], point);
        tracker.reach(head.spec.name, { places: [{ point: "mouth", position: [point.x, point.y, point.z] }], seconds: T.prepare, follows: true, sequence: state.reach });
      } else tracker.release(head.spec.name);
    } };
  return skill;
}
