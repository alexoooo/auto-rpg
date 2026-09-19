/**
 * How far a point moved from where it was when a disturbance landed, how long it took to come
 * back, and **how many times it changed its mind on the way**: a ring-down meter.
 *
 * It began life as `BobMeter` inside `golem-torso-bench.mjs`, measuring a head nodding after a
 * shove, and it is shared because the complaint that prompted this file is not about heads:
 * *"the golem looks like a collective of bobbleheads, every body part springs and jiggles
 * around."* Every motorised joint in a golem is a Havok POSITION motor, which is a spring with no
 * damper, so the same measurement is wanted at the wrist, the waist, the neck and the legs.
 *
 * **It only means anything with `setActivationControl(body, 1)` set on every body**, which both
 * runners do before a single reading is believed: Havok deactivates a body at rest, and a
 * sleeping limb reads a perfect zero however badly it would shake awake.
 *
 * ## Why this is not `BenchReadout`
 *
 * Nothing in `src/golem/readout.ts` can see a ring, and the four reasons are worth keeping
 * written down, because three of them look like bugs until you see the intent:
 *
 * - `tipWanderMm` is gated on `atRest`, which needs the tip slower than `restTipSpeed` 0.05 m/s.
 *   That is exactly the condition a bouncing tip violates. It is a **noise floor**, deliberately,
 *   and its own comment records being tightened twice to keep settles out of it.
 * - `settleSeconds` only opens on a *commanded* step bigger than `stepThreshold`, and reads
 *   `view.axes[0]` alone -- which on an arm chain is **reach in metres**, so a wrist flicked
 *   through a radian of roll moves it by nothing at all.
 * - `overshoot` records one excursion and resets. A limb that overshoots once and a limb that
 *   overshoots twelve times report the same number, and the difference between those two *is* the
 *   complaint.
 * - `stuckSteps` wants the error nearly constant over 24 steps, so an oscillation reads zero.
 *
 * A meter armed by an *event* rather than by a command sidesteps all four: it reads only while
 * the thing is moving, which is the window the other four are blind in.
 */

/**
 * Both readings this file exists for, from one window over one point.
 *
 * `bandMm` is the floor: the standing noise of the thing being measured, below which a wobble is
 * not a wobble. It is only ever a floor -- see `state()` for the bar that usually wins.
 */
export class RingMeter {
  constructor(bandMm) {
    this.bandMm = bandMm;
    this.rest = null;
    this.peakMm = 0;
    this.startedAt = null;
    this.closesAt = 0;
    this.history = [];
    // The displacement itself, flat `[dx, dy, dz, ...]`, kept because the axis to count
    // reversals along is not known until the peak is.
    this.offsets = [];
    this.axis = null;
  }

  /**
   * Plant the reference the instant the disturbance is applied, not a step later, and say when
   * the window shuts.
   *
   * **The window is the correction, and the first draft did not have one.** Without it the meter
   * ran to the end of the script and the "bob" it reported was the *guard* and the *lunge* that
   * come after the shove -- 490 mm of it, which is a head deliberately nodding half a metre and
   * not a head being knocked. A measurement that keeps reading after the thing it is measuring
   * has finished is the same defect as a peak with no exclusion window.
   */
  arm(at, closesAt, x, y, z) {
    this.rest = { x, y, z };
    this.startedAt = at;
    this.closesAt = closesAt;
    this.peakMm = 0;
    this.history.length = 0;
    this.offsets.length = 0;
    this.axis = null;
  }

  sample(at, x, y, z) {
    if (!this.rest || at > this.closesAt) return;
    const dx = x - this.rest.x, dy = y - this.rest.y, dz = z - this.rest.z;
    const metres = Math.hypot(dx, dy, dz);
    const mm = metres * 1000;
    if (mm > this.peakMm) {
      this.peakMm = mm;
      // The direction of the furthest excursion, which is the honest axis of the ring. Recorded
      // as it happens and used backwards, the way `parryProbe` reads its own travel direction.
      this.axis = metres > 0 ? { x: dx / metres, y: dy / metres, z: dz / metres } : null;
    }
    this.history.push(at, mm);
    this.offsets.push(dx, dy, dz);
  }

  /**
   * How long the knock took to decay to a tenth of itself, and how many times it reversed.
   *
   * **A fraction of its own peak rather than a fixed band, and that is the correction this meter
   * needed most.** A fixed 8 mm band never closed at any setting swept, because it is *below the
   * standing noise floor of the thing being measured*: a trunk's own tip wanders about 20 mm at
   * rest and a head's about 30 mm, so "still outside 8 mm" was a statement about the floor rather
   * than about the shove, and every row reported the window's own length back as a settle time.
   * A tenth of the peak scales with the blow, which is what a decay time has to do.
   *
   * Read retrospectively, which is why the samples are kept: the peak is not known until the
   * window closes.
   */
  state() {
    const bar = Math.max(this.bandMm, this.peakMm * 0.1);
    let lastOutside = this.startedAt;
    for (let index = 0; index < this.history.length; index += 2) {
      if (this.history[index + 1] > bar) lastOutside = this.history[index];
    }
    const { directionChanges, reversalTimes, reversalPeaksMm } = this.reversals(bar);
    return {
      peakMm: this.peakMm,
      settleSeconds: this.startedAt === null ? null : lastOutside - this.startedAt,
      // How long the window was open, so a settle time equal to it is visibly a window and not a
      // measurement.
      windowSeconds: this.startedAt === null ? null : this.closesAt - this.startedAt,
      barMm: bar,
      directionChanges,
      reversalTimes,
      reversalPeaksMm,
      // A ring decays and a runaway does not, which is the difference between the owner's two
      // sentences -- "springs and jiggles" and "flying around as if it's about to come off".
      // One boolean off the envelope tells them apart, and a row that does not carry it cannot.
      growing: reversalPeaksMm.length > 1
        && reversalPeaksMm[reversalPeaksMm.length - 1] > reversalPeaksMm[0],
    };
  }

  /**
   * How many times the excursion turned round: the column the owner's complaint is in.
   *
   * **Counted on a signed projection, not on the distance from rest.** A distance is unsigned, so
   * it has a local maximum at each end of a swing *and* a local minimum at every crossing of the
   * rest point, and counting its extrema reports twice the truth. Projecting onto the axis of the
   * furthest excursion makes the swing a signed scalar with one extremum per reversal.
   *
   * **The deadband is the same `bar` the settle uses**, so a row cannot report a settle at one
   * threshold and a wobble count at another. A retreat from the running extreme by more than
   * `bar` is a reversal; anything smaller is the floor, not a bounce. That is hysteresis rather
   * than a sign test on a derivative, which would count solver noise as direction changes.
   *
   * `CONFIG.arm.gripAngularDamping`'s table is what this column is for, and what it should be
   * compared against: the Warrior's arm went from 10 direction changes over 0.68 s undamped to 2
   * over 0.10 s at the strongest damping swept.
   */
  reversals(bar) {
    if (!this.axis) return { directionChanges: 0, reversalTimes: [], reversalPeaksMm: [] };
    const { x: ux, y: uy, z: uz } = this.axis;
    let extreme = 0, heading = 0, count = 0;
    const times = [];
    const peaks = [];
    for (let index = 0; index < this.offsets.length; index += 3) {
      const along =
        (this.offsets[index] * ux + this.offsets[index + 1] * uy + this.offsets[index + 2] * uz)
        * 1000;
      if (heading === 0) {
        if (Math.abs(along) > bar) { heading = Math.sign(along); extreme = along; }
        continue;
      }
      if (heading > 0 ? along > extreme : along < extreme) { extreme = along; continue; }
      if (Math.abs(along - extreme) > bar) {
        count += 1;
        times.push(this.history[(index / 3) * 2]);
        // The excursion the swing reached before it turned, which is the envelope one sample at
        // a time. Recorded here rather than derived later because `extreme` is about to be reset.
        peaks.push(Math.abs(extreme));
        heading = -heading;
        extreme = along;
      }
    }
    return { directionChanges: count, reversalTimes: times, reversalPeaksMm: peaks };
  }
}
