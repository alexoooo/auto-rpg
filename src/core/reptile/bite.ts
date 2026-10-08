import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../build/build-body.ts";
import type { OwnBody } from "../mind/mind.ts";
import { channelName } from "../muscle/driver.ts";
import type { effectorTracker } from "../control/effector-tracker.ts";
import { chainTo, rootFrameToRef, intoFrameToRef, pointAtToRef } from "../control/kinematics.ts";
import { motionAtToRef, pointOfToRef, withinSupport } from "../control/support.ts";
import type { SupportedCommand } from "../control/supported-motor.ts";
import { advanceStrike, strikeTransition, STRIKE_EVENT, type StrikeCycleState } from "../skills/strike-cycle.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { Skill } from "../skills/skill.ts";
import type { QuadrupedView } from "./crawl.ts";
import { REPTILE_BITE } from "./tuning.ts";
import { scalarPathToRef } from "../control/point-path.ts";

/**
 * The jaw and what it hangs from: the segment with a `bite` point (`lower`), its joint (`hinge`),
 * the head the hinge hangs it from, which has a `mouth` point, and the joint that carries the head (`neck`).
 */
export function mouthOf(built: BuiltBody) {
  const lower = [...built.segments.values()].find(segment => segment.spec.points?.bite);
  const hinge = lower && chainTo(built, lower).at(-1), head = hinge?.parent, neck = head && chainTo(built, head).at(-1);
  if (!lower || !hinge || !head?.spec.points?.mouth || !neck) throw new Error(`${built.spec.model} has no jaw hinged to a head with a mouth`);
  return { lower, hinge, head, neck };
}

/** A finite physical jaw stroke uses the shared measured chamber, contact and withdrawal cycle. */
export function bite(own: OwnBody, tracker: ReturnType<typeof effectorTracker>, T = REPTILE_BITE) {
  const { lower, hinge, head, neck } = mouthOf(own.built);
  const jawName = channelName(hinge, 0), jaw = own.muscles.channel(jawName), tip = lower.spec.points!.bite!.value;
  const neckName = channelName(neck, 1), retract = neck.dofs[1]!.spec.min.value;
  const bodies = new Set([...own.built.segments.values()].map(p => p.body));
  const cycle: StrikeCycleState = { phase: null, time: 0, ready: 0, sequence: 0, velocity: [0, 0, 0], touching: false, impact: null };
  const state = { cycle, target: [0, 0, 0] as [number, number, number], launched: 0, returned: 0, failed: 0,
    shift: [0, 0] as [number, number],
    jaw: { sequence: -1, opening: false, time: 0, start: 0, rate: 0, sample: [0, 0, 0] as [number, number, number] } };
  const frame = { position: new Vector3(), rotation: new Quaternion() }, root = { position: new Vector3(), rotation: new Quaternion() };
  const at = new Vector3(), point = new Vector3(), velocity = new Vector3(), carried = new Vector3(), spin = new Vector3(), inverse = new Quaternion();
  const chamberPoint = pointAtToRef([hinge], [[T.open]], tip, new Vector3());
  const chamber: Vec3 = [chamberPoint.x, chamberPoint.y, chamberPoint.z];
  const strikePoint = pointAtToRef([hinge], [[T.open * T.contactAt]], tip, new Vector3());
  const aim = new Vector3(), offset = new Vector3(), mouth = head.spec.points!.mouth!.value;
  const support = (own.spec.effectors ?? []).filter(e => e.support).map(() => ({ corners: [new Vector3()] }));
  const loadedSupport: typeof support = [];
  const touching = (part: typeof head) => own.built.physics.contactsOf(part.body).some(c => c.other && !bodies.has(c.other) && c.impulse > 0);
  const withdraw = () => cycle.phase === "return" && (touching(head) || touching(lower));
  const resume = () => { strikeTransition(cycle, null, [0, 0, 0]); cycle.touching = false; state.jaw.sequence = -1; state.shift.fill(0); tracker.release(head.spec.name); };
  const skill: Skill<QuadrupedView> & { readonly state: typeof state; withdraw(): boolean; tracked(channel: number): readonly [number, number, number] | undefined; command(view: QuadrupedView, target: Vec3 | null, ready: boolean, dt: number, command: SupportedCommand, prepare: boolean): void } = {
    state, resume, withdraw, tracked: channel => channel === jaw ? state.jaw.sample : undefined, command(view, target, ready, dt, command, prepare) {
      const posture = command.posture as Record<string, number>, centre = command.centre as [number, number, number];
      rootFrameToRef(head, frame); pointOfToRef(lower, tip, at);
      motionAtToRef(lower, at, velocity, spin); motionAtToRef(head, at, carried, spin);
      velocity.subtractInPlace(carried).applyRotationQuaternionToRef(Quaternion.InverseToRef(frame.rotation, inverse), velocity);
      const rate: Vec3 = [velocity.x, velocity.y, velocity.z];
      intoFrameToRef(frame, [at.x, at.y, at.z], point);
      const measured: Vec3 = [point.x, point.y, point.z];
      if (cycle.phase === null && target && ready) { state.target.splice(0, 3, ...target); strikeTransition(cycle, "chamber", rate); }
      if (cycle.phase === "chamber" && target) state.target.splice(0, 3, ...target);
      offset.set(strikePoint.x - mouth[0], strikePoint.y - mouth[1], strikePoint.z - mouth[2]).applyRotationQuaternionToRef(frame.rotation, offset);
      aim.set(...state.target).subtractInPlace(offset);
      const angle = own.muscles.angle(jaw), clear = !touching(head) && !touching(lower);
      pointOfToRef(head, head.spec.points!.mouth!.value, point);
      const dx = point.x - aim.x, dy = point.y - aim.y, dz = point.z - aim.z;
      if (cycle.phase === "chamber" && ready) {
        state.shift[0] -= dx * dt / T.prepare; state.shift[1] -= dz * dt / T.prepare;
        const distance = Math.sqrt(state.shift[0] * state.shift[0] + state.shift[1] * state.shift[1]);
        if (distance > T.biteShift) { state.shift[0] *= T.biteShift / distance; state.shift[1] *= T.biteShift / distance; }
      } else if (cycle.phase !== "swing") state.shift.fill(0);
      if ((cycle.phase === "chamber" || cycle.phase === "swing") && ready) {
        let loaded = 0;
        support.forEach((sole, i) => { if (view.feet[i]!.contact) { sole.corners[0]!.copyFrom(view.feet[i]!.at); loadedSupport[loaded++] = sole; } });
        loadedSupport.length = loaded;
        const placed = withinSupport(loadedSupport, centre[0] + state.shift[0], centre[2] + state.shift[1], T.biteInset);
        centre[0] = placed[0]; centre[2] = placed[1];
      }
      const prepared = angle >= T.open - T.jawError && dx * dx + dy * dy + dz * dz <= T.biteAlign * T.biteAlign;
      const complete = cycle.phase === "swing" && cycle.time >= T.snap && angle < T.jawClosed;
      const event = advanceStrike(cycle, { at: measured, velocity: rate, home: tip, chamber: prepared ? measured : chamber,
        requested: !!target && !complete, down: view.down, supported: ready, prepared, released: clear && cycle.time >= T.release,
        touching: touching(lower), intended: true, aligned: true, contactVelocity: rate, seconds: T.biteTimeout },
        { near: T.biteNear, slow: T.biteSlow, hold: T.biteHold, prepareLimit: T.biteTimeout, returnLimit: T.biteReturnLimit, followSeconds: T.snap }, dt);
      if (event & STRIKE_EVENT.launch) state.launched++;
      if (event & STRIKE_EVENT.returned) state.returned++;
      if (event & STRIKE_EVENT.failed) state.failed++;
      const opening = cycle.phase === null && prepare || cycle.phase === "chamber" || cycle.phase === "return" && (!clear || cycle.time < T.release);
      const path = state.jaw;
      if (path.sequence !== cycle.sequence || path.opening !== opening) {
        path.sequence = cycle.sequence; path.opening = opening; path.time = 0;
        path.start = angle; path.rate = own.muscles.rate(jaw);
      } else path.time += dt;
      scalarPathToRef(path.start, path.rate, opening ? T.open : 0, path.time, opening ? T.prepare : T.snap, path.sample, cycle.phase === "swing" ? -T.closeRate : 0);
      posture[jawName] = path.sample[0];
      posture[neckName] = cycle.phase === "return" || cycle.phase === null && state.returned > 0 && !target ? retract : 0;
      if (cycle.phase === "chamber" || cycle.phase === "swing") {
        rootFrameToRef(own.muscles.dynamics.root.segment, root); intoFrameToRef(root, [aim.x, aim.y, aim.z], point);
        tracker.reach(head.spec.name, { places: [{ point: "mouth", position: [point.x, point.y, point.z] }], seconds: T.prepare, follows: true, sequence: cycle.sequence });
      } else tracker.release(head.spec.name);
    } };
  return skill;
}
