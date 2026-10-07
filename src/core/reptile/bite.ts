import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { OwnBody } from "../mind/mind.ts";
import type { effectorTracker } from "../control/effector-tracker.ts";
import { rootFrameToRef, intoFrameToRef, pointAtToRef } from "../control/kinematics.ts";
import { motionAtToRef, pointOfToRef } from "../control/support.ts";
import { advanceStrike, strikeTransition, STRIKE_EVENT, type StrikeCycleState } from "../skills/strike-cycle.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { Skill } from "../skills/skill.ts";
import type { QuadrupedView } from "./crawl.ts";
import { REPTILE_CONTROL as T } from "./tuning.ts";
import { scalarPathToRef } from "../control/point-path.ts";

/** A finite physical jaw stroke uses the shared measured chamber, contact and withdrawal cycle. */
export function bite(own: OwnBody, tracker: ReturnType<typeof effectorTracker>) {
  const jaw = own.muscles.channel("jaw axis0"), head = own.built.segments.get("head")!, lower = own.built.segments.get("jaw")!;
  const hinge = own.built.joints.get("jaw")!, tip = lower.spec.points!.bite!.value;
  const retract = own.built.joints.get("neck")!.dofs[1]!.spec.min.value;
  const bodies = new Set([...own.built.segments.values()].map(p => p.body));
  const cycle: StrikeCycleState = { phase: null, time: 0, ready: 0, sequence: 0, velocity: [0, 0, 0], touching: false, impact: null };
  const state = { cycle, target: [0, 0, 0] as [number, number, number], launched: 0, returned: 0, failed: 0,
    jaw: { sequence: -1, opening: false, time: 0, start: 0, rate: 0, sample: [0, 0, 0] as [number, number, number] } };
  const frame = { position: new Vector3(), rotation: new Quaternion() }, root = { position: new Vector3(), rotation: new Quaternion() };
  const at = new Vector3(), point = new Vector3(), velocity = new Vector3(), carried = new Vector3(), spin = new Vector3(), inverse = new Quaternion();
  const chamberPoint = pointAtToRef([hinge], [[T.open]], tip, new Vector3());
  const chamber: Vec3 = [chamberPoint.x, chamberPoint.y, chamberPoint.z];
  const aim = new Vector3(), offset = new Vector3(), mouth = head.spec.points!.mouth!.value;
  const touching = (part: typeof head) => own.built.physics.contactsOf(part.body).some(c => c.other && !bodies.has(c.other) && c.impulse > 0);
  const withdraw = () => cycle.phase === "return" && (touching(head) || touching(lower));
  const resume = () => { strikeTransition(cycle, null, [0, 0, 0]); cycle.touching = false; state.jaw.sequence = -1; tracker.release("head"); };
  const skill: Skill<QuadrupedView> & { readonly state: typeof state; withdraw(): boolean; tracked(channel: number): readonly [number, number, number] | undefined; command(view: QuadrupedView, target: Vec3 | null, ready: boolean, dt: number, posture: Record<string, number>, prepare: boolean): void } = {
    state, resume, withdraw, tracked: channel => channel === jaw ? state.jaw.sample : undefined, command(view, target, ready, dt, posture, prepare) {
      rootFrameToRef(head, frame); pointOfToRef(lower, tip, at);
      motionAtToRef(lower, at, velocity, spin); motionAtToRef(head, at, carried, spin);
      velocity.subtractInPlace(carried).applyRotationQuaternionToRef(Quaternion.InverseToRef(frame.rotation, inverse), velocity);
      const rate: Vec3 = [velocity.x, velocity.y, velocity.z];
      intoFrameToRef(frame, [at.x, at.y, at.z], point);
      const measured: Vec3 = [point.x, point.y, point.z];
      if (cycle.phase === null && target && ready) { state.target.splice(0, 3, ...target); strikeTransition(cycle, "chamber", rate); }
      offset.set(tip[0] - mouth[0], tip[1] - mouth[1], tip[2] - mouth[2]).applyRotationQuaternionToRef(frame.rotation, offset);
      aim.set(...state.target).subtractInPlace(offset);
      const angle = own.muscles.angle(jaw), clear = !touching(head) && !touching(lower);
      pointOfToRef(head, head.spec.points!.mouth!.value, point);
      const dx = point.x - aim.x, dy = point.y - aim.y, dz = point.z - aim.z;
      const prepared = angle >= T.open - T.jawError && dx * dx + dy * dy + dz * dz <= T.biteNear * T.biteNear;
      const complete = cycle.phase === "swing" && cycle.time >= T.snap && angle < T.jawClosed;
      const event = advanceStrike(cycle, { at: measured, velocity: rate, home: tip, chamber,
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
      scalarPathToRef(path.start, path.rate, opening ? T.open : 0, path.time, opening ? T.prepare : T.snap, path.sample);
      posture["jaw axis0"] = path.sample[0];
      posture["neck axis1"] = cycle.phase === "return" ? retract : 0;
      if (cycle.phase === "chamber" || cycle.phase === "swing") {
        rootFrameToRef(own.muscles.dynamics.root.segment, root); intoFrameToRef(root, [aim.x, aim.y, aim.z], point);
        tracker.reach("head", { places: [{ point: "mouth", position: [point.x, point.y, point.z] }], seconds: T.prepare, follows: true, sequence: cycle.sequence });
      } else tracker.release("head");
    } };
  return skill;
}
