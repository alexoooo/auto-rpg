import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltSegment } from "../build/build-body.ts";
import { centreOfToRef } from "./support.ts";

/**
 * The most an assist gives a body: a force, in the body's own weights, and a moment, in its
 * weights times a metre. Scaled by the body so one ceiling is the same help to a light body and a
 * heavy one.
 */
export interface AssistCeiling { readonly force: number; readonly moment: number }

export const NO_ASSIST: AssistCeiling = Object.freeze({ force: 0, moment: 0 });

/**
 * **The assist: a force and a moment on a body's root that no muscle gives.** It is not anatomy:
 * its ceiling is the fight's to set, from the character's balance (`balanceCeiling`,
 * `src/core/rules/rulebook.ts`), and everything it gives is metered. A mind asks it for a wrench
 * each step as it asks its muscles; what it is given is the ask shortened to the ceiling, a force
 * at the root's centre of mass and a moment through the solver step that follows, with the
 * muscles' torques. Asked for nothing, it gives nothing.
 */
export interface Assist {
  /** Whether it gives anything: a ceiling above none, and not withdrawn. */
  readonly on: boolean;
  /** The most it gives this body, N and N m. */
  readonly most: { readonly force: number; readonly moment: number };
  /** `force` and `moment` as they would be given: each shortened to its ceiling; one that is not finite, none; and none once withdrawn. */
  clipToRef(force: Vector3, moment: Vector3, givenForce: Vector3, givenMoment: Vector3): void;
  /** Ask for this wrench about the root's centre of mass, world, in the step about to be taken. The last ask of a step stands. */
  ask(force: Vector3, moment: Vector3): void;
  /** What the last step was given. */
  readonly given: { readonly force: Vector3; readonly moment: Vector3 };
  /** The steps metered, and the sums over them of the force's and the moment's sizes, N and N m: a mean is a sum over the steps. */
  readonly meter: { readonly steps: number; readonly force: number; readonly moment: number };
  /** Give nothing from now on: the fight this body's ceiling belonged to is over. */
  withdraw(): void;
  /** Whether its fight has withdrawn it. */
  readonly withdrawn: boolean;
}

/** `built`'s assist under `ceiling`, on `root`; `apply` gives the step's ask, and is the seam's to call (`embody`). */
export function createAssist(built: BuiltBody, root: BuiltSegment, ceiling: AssistCeiling): { assist: Assist; apply(): void } {
  const weight = [...built.segments.values()].reduce((sum, segment) => sum + segment.rigid.mass, 0) * Math.hypot(...built.physics.gravity);
  const most = { force: ceiling.force * weight, moment: ceiling.moment * weight };
  const asked = { force: new Vector3(), moment: new Vector3() }, given = { force: new Vector3(), moment: new Vector3() };
  const meter = { steps: 0, force: 0, moment: 0 };
  const at = new Vector3();
  let withdrawn = false;
  const on = (): boolean => !withdrawn && (most.force > 0 || most.moment > 0);
  const clip = (v: Vector3, limit: number, out: Vector3): void => {
    const size = v.length();
    if (!Number.isFinite(size) || size === 0 || limit <= 0) out.setAll(0);
    else out.copyFrom(v).scaleInPlace(Math.min(1, limit / size));
  };
  const assist: Assist = {
    get on() { return on(); },
    get withdrawn() { return withdrawn; },
    most, given, meter,
    clipToRef(force, moment, givenForce, givenMoment) {
      clip(force, withdrawn ? 0 : most.force, givenForce);
      clip(moment, withdrawn ? 0 : most.moment, givenMoment);
    },
    ask(force, moment) { asked.force.copyFrom(force); asked.moment.copyFrom(moment); },
    withdraw() { withdrawn = true; },
  };
  return {
    assist,
    apply() {
      if (!on()) { given.force.setAll(0); given.moment.setAll(0); return; }
      assist.clipToRef(asked.force, asked.moment, given.force, given.moment);
      asked.force.setAll(0); asked.moment.setAll(0);
      meter.steps += 1; meter.force += given.force.length(); meter.moment += given.moment.length();
      if (given.force.lengthSquared() > 0) root.body.applyForce(given.force, centreOfToRef(root, at));
      if (given.moment.lengthSquared() > 0) root.body.applyTorque(given.moment);
    },
  };
}
