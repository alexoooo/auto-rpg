/**
 * What another body's parts press on this one with, over a short window (physical contact session 07).
 *
 * A standing carrier is keyframed, so the solver's contact forces cannot move it: they are resolved
 * and then thrown away. This reads them back. Every part of the body is watched through its own
 * collision observable, and each contact from a part of another body adds `-impulse * normal` --
 * the normal an observer is handed points away from it, toward what it touched -- to that step's
 * bucket for the body the part belongs to. `sample` folds the step into a rolling window, per source,
 * and hands back the window's mean force.
 *
 * **Three things are left out, each for a reason measured on the Node bout runner** (`.review/
 * press-probe.mjs`, stone x1 mirrors and the max giant against x1, 2026-09-24):
 *
 * - **Contacts with the floor, the room and this body's own parts.** A source names the parts it
 *   owns, and nothing else is a source.
 * - **A contact's first `BLOW_S`.** A blow is a contact; session 06 prices it as the momentum it
 *   moved (`Combat.transfer`), and the same contact must not reach the ledger twice. So each pair of
 *   parts carries an age, and the press counts it only once it has lasted past the blow. `ageS`
 *   answers the other half of that rule for `Combat`.
 * - **A source that is not standing.** A body lying on the floor is a heap under a carrier that
 *   holds its own height by keyframe, so a leg set down on it is pressed with whatever the keyframe
 *   takes, and the probe read 3.64 times this body's weight upward from a lying body's plate and feet.
 *   Nothing a lying body does pushes up that hard; the carrier does it to itself.
 *
 * Keyframed trunk against keyframed trunk reports no contact at all (0 events in 16 bouts), so two
 * bodies walking into each other reach this body through the pair resolver instead
 * (`resolvePhysicalSupportedPair`).
 *
 * **A source's horizontal force is capped at its own grip**, `GRIP * weight`. A carrier drives its
 * parts with a keyframe's authority, so the solver will report whatever force it takes to keep two
 * pressed limbs apart -- the probe read 9.3 times an x1 body's grip, sideways, from a max giant. A
 * real body pushes no harder than its feet hold the floor, so what a source can push with is the
 * smaller of the two, and two bodies of one weight can never push each other off their feet.
 *
 * **And its upward force at its own weight**, for the same reason read the other way up. A standing
 * body's parts hang off a keyframed carrier on the axes its joints lock, so a limb caught between two
 * carriers is squeezed by both keyframes at once and the solver reports whatever that takes. Measured
 * on x1 stone mirrors (`.review/lift-who.mjs`, Node bout runner, 8 bouts, 2026-09-24): four bodies
 * in eight bouts were "lifted", by 2.09 W from a wrist blade under the pelvis, 1.34 W from a roll ring
 * under the plate and 1.07 W from a wrist, where the Node lift bench says a whole x1 arm holds 0.53 W
 * (wrist blade) to 0.80 W (reach blade). So the physical reading fails here, and the fallback is a
 * rule: a body lifts no more than it weighs. Two bodies of one weight can never lift each other,
 * which is the owner's "x1 against x1 never lifts" as a construction rather than a hope.
 *
 * Node loads this file (the harness and the tests), so it imports types only.
 */
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { IPhysicsCollisionEvent } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";

export const CONTACT_PRESS = Object.freeze({
  /**
   * The window a force is averaged over, seconds. The plan's starting point, kept: a single
   * contact's impulse is dominated by how the solver resolved it, and a tenth of a second is 24
   * solver steps at 240 Hz.
   */
  WINDOW_S: 0.1,
  /**
   * How long a contact is a blow before it is a press, seconds. Session 01's impulsive strokes last
   * 2 to 9 solver steps (8 to 38 ms), and 50 ms is past the longest of them.
   */
  BLOW_S: 0.05,
  /**
   * Foot grip, `mu` in `mu * W`: `LOCOMOTION_BIPED.footFriction`, 0.55, the friction the sole was
   * swept to and the one a stone foot on a stone floor has. One constant for every body, because
   * the carrier is not a foot and has no friction of its own to ask.
   */
  GRIP: 0.55,
  GRAVITY_MPS2: 9.81,
  /**
   * How far past a weight or a grip a force has to be to count, as a fraction. A press from a body of
   * the same weight is capped at exactly this body's grip and weight, and rounding would otherwise
   * let it through by one part in 10^16.
   */
  MARGIN: 1e-9,
});

/** Another body, as a press reads it. */
export interface PressSource {
  /** Whether a contact from this physics body is one of this source's, still attached. */
  owns(body: PhysicsBody): boolean;
  /** Supported or staggered. A body that is fallen or rising presses nothing (see the header). */
  readonly standing: boolean;
  /** Its whole weight, newtons. */
  readonly weightN: number;
}

/** A window's mean force on this body from every source, newtons. */
export interface PressReading {
  /** Upward, from standing sources, each capped at its own weight. */
  readonly liftN: number;
  /** Horizontal, each source's own capped at its grip before they are summed. */
  readonly pushX: number;
  readonly pushZ: number;
}

export const NO_PRESS: PressReading = Object.freeze({ liftN: 0, pushX: 0, pushZ: 0 });

interface PairAge { first: number; last: number }

/** One source's rolling window: a ring of per-step impulses and their running sum. */
class SourceWindow {
  private readonly ring: Float64Array;
  private at = 0;
  readonly sum = [0, 0, 0];
  constructor(steps: number) { this.ring = new Float64Array(steps * 3); }
  push(x: number, y: number, z: number): void {
    const i = this.at * 3;
    this.sum[0] += x - this.ring[i]; this.sum[1] += y - this.ring[i + 1]; this.sum[2] += z - this.ring[i + 2];
    this.ring[i] = x; this.ring[i + 1] = y; this.ring[i + 2] = z;
    this.at = (this.at + 1) % (this.ring.length / 3);
  }
}

export class ContactPress {
  private readonly substepS: number;
  private readonly windowSteps: number;
  private readonly blowSteps: number;
  private readonly ownLive: (body: PhysicsBody) => boolean;
  private readonly watchers: [PhysicsBody, Observer<IPhysicsCollisionEvent>][] = [];
  /** This step's impulse on this body, by the other body's part. */
  private readonly bucket = new Map<PhysicsBody, number[]>();
  private readonly ages = new Map<PhysicsBody, Map<PhysicsBody, PairAge>>();
  private readonly windows = new Map<PressSource, SourceWindow>();
  private step = 0;

  constructor(substepS: number, ownLive: (body: PhysicsBody) => boolean) {
    if (!(substepS > 0)) throw new Error("a contact press needs a positive substep");
    this.substepS = substepS;
    this.windowSteps = Math.max(1, Math.round(CONTACT_PRESS.WINDOW_S / substepS));
    this.blowSteps = Math.round(CONTACT_PRESS.BLOW_S / substepS);
    this.ownLive = ownLive;
  }

  /** Watch one of this body's parts. */
  watch(body: PhysicsBody): void {
    body.setCollisionCallbackEnabled(true);
    const observer = body.getCollisionObservable().add((event) => this.record(body, event));
    if (observer) this.watchers.push([body, observer]);
  }

  /**
   * How long the contact between one of this body's parts and another body's part has lasted,
   * seconds, or 0 if they are not touching. A pair touching on the step before this one is still
   * touching; any gap starts it again.
   */
  ageS(own: PhysicsBody, other: PhysicsBody): number {
    const age = this.ages.get(own)?.get(other);
    return age && age.last >= this.step - 1 ? (this.step - age.first) * this.substepS : 0;
  }

  /** Whether a contact between these two parts is past its blow, so the press is counting it. */
  pressing(own: PhysicsBody, other: PhysicsBody): boolean {
    return this.ageS(own, other) >= this.blowSteps * this.substepS - 1e-12;
  }

  /**
   * Fold this step's contacts into the window and read it. Once per solver step, before the control
   * step that reads the result; a source not handed in on a step adds nothing to it.
   */
  sample(sources: readonly PressSource[]): PressReading {
    let liftN = 0, pushX = 0, pushZ = 0;
    for (const source of sources) {
      let x = 0, y = 0, z = 0;
      if (source.standing) {
        for (const [body, impulse] of this.bucket) {
          if (!source.owns(body)) continue;
          x += impulse[0]; y += impulse[1]; z += impulse[2];
        }
      }
      let window = this.windows.get(source);
      if (!window) this.windows.set(source, window = new SourceWindow(this.windowSteps));
      window.push(x, y, z);
      const span = this.windowSteps * this.substepS;
      const fx = window.sum[0] / span, fz = window.sum[2] / span;
      const horizontal = Math.hypot(fx, fz);
      const grip = CONTACT_PRESS.GRIP * source.weightN;
      const cap = horizontal > grip ? grip / horizontal : 1;
      liftN += Math.min(window.sum[1] / span, source.weightN);
      pushX += fx * cap; pushZ += fz * cap;
    }
    this.bucket.clear();
    this.step += 1;
    return Object.freeze({ liftN: Math.max(0, liftN), pushX, pushZ });
  }

  dispose(): void {
    for (const [body, observer] of this.watchers) body.getCollisionObservable().remove(observer);
    this.watchers.length = 0;
    this.bucket.clear();
    this.ages.clear();
    this.windows.clear();
  }

  private record(own: PhysicsBody, event: IPhysicsCollisionEvent): void {
    const other = event.collidedAgainst;
    if (!other || other === own || !this.ownLive(own) || this.ownLive(other)) return;
    let mine = this.ages.get(own);
    if (!mine) this.ages.set(own, mine = new Map());
    const prior = mine.get(other);
    if (prior && prior.last >= this.step - 1) prior.last = this.step;
    else mine.set(other, { first: this.step, last: this.step });
    if (this.step - mine.get(other)!.first < this.blowSteps) return;
    const impulse = event.impulse ?? 0;
    const normal = event.normal;
    if (!normal || !(impulse > 0)) return;
    let into = this.bucket.get(other);
    if (!into) this.bucket.set(other, into = [0, 0, 0]);
    into[0] -= impulse * normal.x; into[1] -= impulse * normal.y; into[2] -= impulse * normal.z;
  }
}
