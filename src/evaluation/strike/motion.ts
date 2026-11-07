import { acos } from "../../core/math/real.ts";
import { wrap } from "../../core/math/turn.ts";
import { Quaternion, Vector3 } from "../../core/math/vector.ts";
import { jointAngles } from "../../core/bodies/build/joint-state.ts";
import { rigidPoints } from "../../core/bodies/build/rigid.ts";
import { pointOfToRef, turnOfToRef } from "../../core/bodies/read-motion.ts";
import type { BuiltBody } from "../../core/bodies/build/build-body.ts";
import type { Vec3 } from "../../core/quantity.ts";
import type { Phase } from "../../skills/framework/action.ts";

/** Guard proximity, stillness, facing and continuous hold used by the swing motion observation. */
const GUARD = Object.freeze({ within: .05, still: .3, angle: 10 * Math.PI / 180, hold: .2 });
/** A monotonic wrist channel's greatest allowed travel in the opposite direction, rad. */
const REVERSAL = 15 * Math.PI / 180;

type Turn = readonly [number, number, number, number];
type Label = Phase | "after";
type Sample = { time: number; hand: Vec3; swell: Vec3; club: Turn; chest: Turn; wrist: number[];
  relativeHand: Vec3; relativeSwell: Vec3; relativeTurn: Turn; tilt: number; touching: boolean };
type WristTravel = { channel: string; positive: number; negative: number; leastReversal: number };
type Interval = { label: Label; from: number; to: number; steps: number; contactSteps: number;
  handTravel: number; swellTravel: number; clubTravel: number; chestTravel: number; maxTilt: number; wrist: WristTravel[] };

export type SwingMotion = {
  readonly limits: typeof GUARD & { readonly reversal: number };
  /** Executor phase labels partition diagnostics; they do not establish physical phase completion. */
  readonly intervals: readonly Interval[];
  readonly coverage: { readonly course: false; readonly clearance: false; readonly physicalStrokeEnd: false };
  readonly guard: { readonly captured: number | null; readonly ownerReleased: number | null; readonly settledAtRelease: boolean | null;
    readonly held: number; readonly recovered: number | null; readonly handError: number | null; readonly swellError: number | null;
    readonly handSpeed: number | null; readonly swellSpeed: number | null; readonly angle: number | null };
  /** Unobstructed committed motion that exceeds the reversal allowance even in its better monotonic direction. */
  readonly chatter: boolean;
};

const xyz = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const xyzw = (q: Quaternion): Turn => [q.x, q.y, q.z, q.w];
const distance = (a: Vec3, b: Vec3): number => Math.sqrt(a.reduce((sum, v, k) => sum + (v - b[k]!) * (v - b[k]!), 0));
const angle = (a: Turn, b: Turn): number => 2 * acos(Math.min(1, Math.abs(a.reduce((sum, v, k) => sum + v * b[k]!, 0))));

/** Native-step physical motion of one held swing, including the unowned motion after its executor ends. */
export function swingMotion(body: BuiltBody, effector: string) {
  const hand = body.segments.get(effector), chest = body.segments.get("upperTrunk");
  const wrist = [...body.joints.values()].find(joint => joint.spec.child === effector);
  if (!hand || !chest || !wrist) throw new Error(`cannot observe the swing of ${effector}`);
  const swell = rigidPoints(body.spec, hand.spec).get("swell");
  if (!swell) throw new Error(`${effector} holds no swell to observe`);
  const point = new Vector3(), origin = new Vector3(), relative = new Vector3(), up = new Vector3();
  const clubTurn = new Quaternion(), chestTurn = new Quaternion(), inverse = new Quaternion(), relativeTurn = new Quaternion();
  const angles: number[] = [];
  const state = {
    last: null as Sample | null, guard: null as Sample | null, intervals: [] as Interval[],
    released: null as number | null, releaseSettled: null as boolean | null,
    hold: 0, recovered: null as number | null,
    errors: null as null | { hand: number; swell: number; handSpeed: number; swellSpeed: number; angle: number },
  };
  function sample(time: number): Sample {
    const handAt = xyz(pointOfToRef(hand!, hand!.frame.origin, point));
    const swellAt = xyz(pointOfToRef(hand!, swell!.value, point));
    pointOfToRef(chest!, chest!.frame.origin, origin);
    turnOfToRef(hand!, clubTurn); turnOfToRef(chest!, chestTurn);
    Quaternion.InverseToRef(chestTurn, inverse);
    const against = (at: Vec3): Vec3 => xyz(relative.set(at[0] - origin.x, at[1] - origin.y, at[2] - origin.z).applyRotationQuaternionToRef(inverse, relative));
    inverse.multiplyToRef(clubTurn, relativeTurn);
    up.set(0, 1, 0).applyRotationQuaternionToRef(chestTurn, up);
    return { time, hand: handAt, swell: swellAt, club: xyzw(clubTurn), chest: xyzw(chestTurn),
      wrist: [...jointAngles(wrist!, angles)], relativeHand: against(handAt), relativeSwell: against(swellAt), relativeTurn: xyzw(relativeTurn),
      tilt: acos(Math.max(-1, Math.min(1, up.y))), touching: body.physics.contactsOf(hand!.body).some(contact => contact.impulse > 0) };
  }
  return {
    take(time: number, phase: Phase | null): void {
      const now = sample(time), was = state.last;
      state.last = now;
      if (!state.guard && phase === null) return;
      state.guard ??= was ?? now;
      const label = phase ?? "after";
      let interval = state.intervals.at(-1);
      if (!interval || interval.label !== label) {
        interval = { label, from: was?.time ?? time, to: time, steps: 0, contactSteps: 0, handTravel: 0, swellTravel: 0,
          clubTravel: 0, chestTravel: 0, maxTilt: 0,
          wrist: wrist!.dofs.map(dof => ({ channel: `${wrist!.spec.name} ${dof.spec.positive}`, positive: 0, negative: 0, leastReversal: 0 })) };
        state.intervals.push(interval);
      }
      interval.to = time; interval.steps++; interval.contactSteps += Number(now.touching);
      interval.maxTilt = Math.max(interval.maxTilt, now.tilt);
      if (was) {
        interval.handTravel += distance(was.hand, now.hand); interval.swellTravel += distance(was.swell, now.swell);
        interval.clubTravel += angle(was.club, now.club); interval.chestTravel += angle(was.chest, now.chest);
        interval.wrist.forEach((channel, k) => {
          const delta = wrap(now.wrist[k]! - was.wrist[k]!);
          channel.positive += Math.max(0, delta); channel.negative += Math.max(0, -delta);
          channel.leastReversal = Math.min(channel.positive, channel.negative);
        });
        const dt = time - was.time;
        state.errors = { hand: distance(now.relativeHand, state.guard.relativeHand), swell: distance(now.relativeSwell, state.guard.relativeSwell),
          handSpeed: distance(now.relativeHand, was.relativeHand) / dt, swellSpeed: distance(now.relativeSwell, was.relativeSwell) / dt,
          angle: angle(now.relativeTurn, state.guard.relativeTurn) };
        const error = state.errors;
        const settled = error.hand <= GUARD.within && error.swell <= GUARD.within && error.handSpeed <= GUARD.still
          && error.swellSpeed <= GUARD.still && error.angle <= GUARD.angle;
        if (label === "release" || label === "after") {
          state.hold = settled ? state.hold + dt : 0;
          if (state.hold >= GUARD.hold) state.recovered ??= time;
        }
        if (label === "after" && state.released === null) { state.released = time; state.releaseSettled = state.hold >= GUARD.hold; }
      }
    },
    reading(): SwingMotion {
      const error = state.errors;
      return { limits: { ...GUARD, reversal: REVERSAL }, intervals: state.intervals,
        coverage: { course: false, clearance: false, physicalStrokeEnd: false },
        guard: { captured: state.guard?.time ?? null, ownerReleased: state.released, settledAtRelease: state.releaseSettled,
          held: state.hold, recovered: state.recovered, handError: error?.hand ?? null, swellError: error?.swell ?? null,
          handSpeed: error?.handSpeed ?? null, swellSpeed: error?.swellSpeed ?? null, angle: error?.angle ?? null },
        chatter: state.intervals.some(interval => interval.label === "commit" && interval.contactSteps === 0
          && interval.wrist.some(channel => channel.leastReversal > REVERSAL)) };
    },
  };
}
