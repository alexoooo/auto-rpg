import { BENCH_READOUT } from "./config.ts";

/**
 * The bench's readout: everything the session plan asks a chain to be measured on.
 *
 * **Scalars in, scalars out, and no Babylon anywhere.** The page and the Node bench both feed
 * it, and they must feed it the same arithmetic or the two harnesses would disagree for a
 * second reason on top of the one they already disagree for. It is also what lets
 * `tests/golem-bench.test.mjs` exercise the instrument itself without a scene.
 *
 * **The two harnesses are never one column.** The page and the headless bench agree on
 * converged behaviour and disagree by about 9 % on the Warrior's peak transient with identical
 * code, and why has never been established. Every figure this produces has to be recorded
 * against the harness that took it. This file cannot enforce that; `docs/measurements.md` and
 * the reporting do.
 */

/**
 * One control step's worth of evidence.
 *
 * A single object the caller allocates once and mutates, rather than a fresh record per step:
 * this is fed at 240 Hz and the Warrior's own view publication is the place this directory
 * learned that an object per step is a real cost rather than a tidiness argument.
 */
export interface ReadoutSample {
  /** Seconds since the module was built. Monotonic; the exclusion windows are read off it. */
  t: number;
  /** The driven axis's commanded value, in its own unit. Zero for a chain with no axes. */
  commanded: number;
  /** The same axis, achieved. */
  achieved: number;
  tipX: number;
  tipY: number;
  tipZ: number;
  /** Whether a stroke is running. A stroke's target error is enormous by design. */
  stroking: boolean;
  /** Metres from the driven body to its own anchor, or null for a chain with no anchor. */
  anchorStray: number | null;
  /** Contacts of any kind since the previous sample. Opens the post-contact exclusion. */
  contacts: number;
  /** Of those, contacts between two bodies the same golem owns. Must be zero. */
  selfContacts: number;
}

export const blankSample = (): ReadoutSample => ({
  t: 0, commanded: 0, achieved: 0, tipX: 0, tipY: 0, tipZ: 0,
  stroking: false, anchorStray: null, contacts: 0, selfContacts: 0,
});

export interface ReadoutState {
  readonly steps: number;
  readonly seconds: number;
  /** Current and worst |commanded - achieved|, in the axis's unit. */
  readonly targetError: number;
  readonly peakTargetError: number;
  /**
   * The tip's speed now, metres per second, from consecutive positions.
   *
   * Differenced rather than read from the body, deliberately: a velocity read crosses the
   * Havok boundary and allocates (216 B a call for the linear read alone), and what is wanted
   * here is the speed of a *point* on the terminal, which `linear + w x r` answers correctly
   * for a driven blade and a differenced position answers correctly for anything.
   */
  readonly tipSpeed: number;
  /**
   * The peak tip speed **with both mandatory exclusions applied**: the first 0.6 s, and 0.25 s
   * after any contact.
   *
   * A limb keyframing onto its commanded pose is worth 77 m/s in a Warrior that never swings,
   * and a blade that is *struck* goes past 100 m/s. A peak that does not say which window it is
   * outside means nothing, so this is the only peak that may be quoted as a driven speed, and
   * `peakTipSpeedRaw` is published beside it so that the difference is visible rather than
   * implied.
   */
  readonly peakTipSpeedDriven: number;
  readonly peakTipSpeedRaw: number;
  readonly excludedStartupSteps: number;
  readonly excludedContactSteps: number;
  /**
   * How far the tip moved while nothing was commanding it to move, millimetres.
   *
   * The rung-0 noise floor, and the reason `pl.setActivationControl(body, 1)` is not optional:
   * Havok deactivates a body at rest, so this reads a perfect zero on a sleeping body however
   * badly it would shake awake.
   */
  readonly tipWanderMm: number;
  /**
   * Seconds from the last commanded step starting to the axis last being outside the band,
   * measured against the **live** command, or null if no step has completed.
   *
   * "Did the limb ever fall behind its own rate-limited command, and for how long." A slow
   * enough command is tracked inside the band the whole way and reads 0.000 s here, which is
   * the correct answer to that question and is *not* how long the move took. For that, see
   * `arrivalSeconds`.
   */
  readonly settleSeconds: number | null;
  /**
   * Seconds from the step starting to the axis reaching the step's **final** value and staying
   * inside the band, or null.
   *
   * The end-to-end reading, and the one a target-rate sweep wants: it contains the ramp as well
   * as the tracking. The two are reported separately because a single "settle" would answer one
   * of the two questions and be quoted for the other.
   */
  readonly arrivalSeconds: number | null;
  /** How far past its final commanded value the axis carried, in the axis's unit. */
  readonly overshoot: number;
  /** Control steps where the error was outside the band and was not converging. */
  readonly stuckSteps: number;
  readonly contacts: number;
  readonly selfContacts: number;
  /** Millimetres from the driven body to its own anchor, or null where there is no anchor. */
  readonly anchorStrayMm: number | null;
  readonly peakAnchorStrayMm: number | null;
}

export interface ReadoutOptions {
  /** The band the axis is called "arrived" inside, in the axis's own unit. */
  readonly settledBand: number;
}

/**
 * The instrument. One per benched module; `reset` when the module is rebuilt.
 *
 * Fields and assignments rather than TypeScript parameter properties, like everything else Node
 * loads directly: strip-only mode rejects a parameter property outright, and one of them
 * anywhere in an import graph blocks the whole harness.
 */
export class BenchReadout {
  private readonly band: number;
  private steps = 0;
  private last = -1;
  private previous: { x: number; y: number; z: number } | null = null;

  private targetError = 0;
  private peakTargetError = 0;
  private tipSpeed = 0;
  private peakDriven = 0;
  private peakRaw = 0;
  private excludedStartup = 0;
  private excludedContact = 0;
  private lastContactAt = Number.NEGATIVE_INFINITY;
  private contacts = 0;
  private selfContacts = 0;

  private restX = 0;
  private restY = 0;
  private restZ = 0;
  private resting = false;
  private wanderMm = 0;
  private insideBandSince: number | null = null;

  private lastCommand = 0;
  private stepStartedAt: number | null = null;
  private stepFrom = 0;
  private commandStillSince: number | null = null;
  private lastOutsideBandAt: number | null = null;
  private settleSeconds: number | null = null;
  private arrivalSeconds: number | null = null;
  /**
   * While a step is open, every sample's time and achieved value.
   *
   * Needed because arrival is measured against the step's *final* command, which is not known
   * until the command stops moving -- so the comparison has to be made retrospectively. Bounded
   * by the length of one step and cleared when the step closes.
   */
  private history: number[] = [];
  private overshoot = 0;

  private stuckSteps = 0;
  private errorWindow: number[] = [];

  private anchorStray: number | null = null;
  private peakAnchorStray: number | null = null;

  constructor(options: ReadoutOptions) {
    this.band = options.settledBand;
  }

  reset(): void {
    this.steps = 0;
    this.last = -1;
    this.previous = null;
    this.targetError = 0;
    this.peakTargetError = 0;
    this.tipSpeed = 0;
    this.peakDriven = 0;
    this.peakRaw = 0;
    this.excludedStartup = 0;
    this.excludedContact = 0;
    this.lastContactAt = Number.NEGATIVE_INFINITY;
    this.contacts = 0;
    this.selfContacts = 0;
    this.resting = false;
    this.wanderMm = 0;
    this.insideBandSince = null;
    this.lastCommand = 0;
    this.stepStartedAt = null;
    this.commandStillSince = null;
    this.lastOutsideBandAt = null;
    this.settleSeconds = null;
    this.arrivalSeconds = null;
    this.history = [];
    this.overshoot = 0;
    this.stuckSteps = 0;
    this.errorWindow = [];
    this.anchorStray = null;
    this.peakAnchorStray = null;
  }

  sample(next: ReadoutSample): void {
    const R = BENCH_READOUT;
    const dt = this.last < 0 ? 0 : next.t - this.last;
    const first = this.last < 0;
    this.last = next.t;
    this.steps += 1;

    this.contacts += next.contacts;
    this.selfContacts += next.selfContacts;
    if (next.contacts > 0) this.lastContactAt = next.t;

    this.targetError = Math.abs(next.commanded - next.achieved);
    if (this.targetError > this.peakTargetError) this.peakTargetError = this.targetError;

    // --- tip speed, and the two mandatory exclusion windows -------------------------------
    if (this.previous && dt > 0) {
      const dx = next.tipX - this.previous.x;
      const dy = next.tipY - this.previous.y;
      const dz = next.tipZ - this.previous.z;
      this.tipSpeed = Math.sqrt(dx * dx + dy * dy + dz * dz) / dt;
      if (this.tipSpeed > this.peakRaw) this.peakRaw = this.tipSpeed;

      const inStartup = next.t < R.startupExclusionSeconds;
      const inContact = next.t - this.lastContactAt < R.contactExclusionSeconds;
      if (inStartup) this.excludedStartup += 1;
      // Counted separately rather than as an else-if: a step can be inside both windows and a
      // census that hid one behind the other would understate the contact exclusion exactly
      // where contacts are most likely, which is the opening of a bout.
      if (inContact) this.excludedContact += 1;
      if (!inStartup && !inContact && this.tipSpeed > this.peakDriven) {
        this.peakDriven = this.tipSpeed;
      }
    }
    this.previous ??= { x: 0, y: 0, z: 0 };
    this.previous.x = next.tipX;
    this.previous.y = next.tipY;
    this.previous.z = next.tipZ;

    // --- is the command moving? ------------------------------------------------------------
    // A **rate**, against the previous sample, and not a displacement against a baseline that
    // updates itself. The first spelling of this compared the command against a `stableCommand`
    // that was refreshed on every step where the test came out false, so a command ramping
    // slowly enough never moved far enough between two samples to register -- and at a target
    // rate of 2.5 rad/s the limb sailed through most of its range while the instrument reported
    // it at rest, which is 796 mm of "noise floor" on a chain whose real floor is a fraction of
    // a millimetre. That is the green-test-that-asserts-nothing shape in an instrument rather
    // than in a test, and it was found by sweeping a number, not by reading the code.
    const commandRate = dt > 0 ? Math.abs(next.commanded - this.lastCommand) / dt : 0;
    const commandMoved = commandRate > R.commandStillRate;

    // --- the noise floor: how far the tip moves while nothing is asking it to -------------
    // Three conditions, and the third one is the one that was missing at first. A command that
    // has stopped moving is not the same thing as a limb that has stopped moving: after a chop
    // the cursor has been still the whole time while the limb swings back through most of its
    // range, and counting that as wander at rest read **1185 mm** on a chain whose real floor is
    // a fraction of a millimetre. Wander at rest means the limb is where it was told to be and
    // is staying there.
    // "Arrived" is not "inside the band this instant": it is inside the band and having been
    // there for `stepHoldSeconds`. Without the second half the reference point is planted the
    // moment a settling overshoot crosses back through the band edge, so the rest of the settle
    // is counted as wander -- 24.9 mm of it here, which is one band's width at this reach and
    // is a reading of the settle rather than of the floor.
    if (this.targetError > this.band) this.insideBandSince = null;
    else if (this.insideBandSince === null) this.insideBandSince = next.t;
    const arrived = this.insideBandSince !== null
      && next.t - this.insideBandSince >= R.stepHoldSeconds;
    const atRest = !next.stroking && !commandMoved && arrived
      && next.t >= R.startupExclusionSeconds;
    if (!atRest) {
      this.resting = false;
    } else if (!this.resting) {
      this.resting = true;
      this.restX = next.tipX;
      this.restY = next.tipY;
      this.restZ = next.tipZ;
    } else {
      const dx = next.tipX - this.restX;
      const dy = next.tipY - this.restY;
      const dz = next.tipZ - this.restZ;
      const wander = Math.sqrt(dx * dx + dy * dy + dz * dz) * 1000;
      if (wander > this.wanderMm) this.wanderMm = wander;
    }

    // --- step detection, settle time and overshoot ----------------------------------------
    //
    // A move opens when the command starts going somewhere and closes when it has been still
    // for `stepHoldSeconds` *and* the axis has been inside the band for just as long. A settle
    // time measured against a target that is still moving is not a settle time, and a settle
    // time measured against a rate-limited command is measured from where the command started
    // moving -- so it contains the ramp as well as the tracking, which is the honest reading
    // for a chain whose whole character is that its command is rate-limited.
    //
    // A completed move counts as a *step* only if it went further than `stepThreshold`. That
    // keeps a settle time from being published for the last millimetre of a slew.
    if (commandMoved) {
      if (this.stepStartedAt === null) {
        this.stepStartedAt = next.t;
        this.stepFrom = this.lastCommand;
        this.lastOutsideBandAt = next.t;
        this.overshoot = 0;
        this.history.length = 0;
      }
      this.commandStillSince = null;
      this.history.push(next.t, next.achieved);
    } else if (this.stepStartedAt !== null) {
      this.history.push(next.t, next.achieved);
      if (this.commandStillSince === null) this.commandStillSince = next.t;
      if (this.targetError > this.band) this.lastOutsideBandAt = next.t;
      const direction = Math.sign(next.commanded - this.stepFrom);
      const past = direction * (next.achieved - next.commanded);
      if (past > this.overshoot) this.overshoot = past;
      if (next.t - this.commandStillSince >= R.stepHoldSeconds
        && this.lastOutsideBandAt !== null
        && next.t - this.lastOutsideBandAt >= R.stepHoldSeconds) {
        if (Math.abs(next.commanded - this.stepFrom) > R.stepThreshold) {
          this.settleSeconds = this.lastOutsideBandAt - this.stepStartedAt;
          let arrivedAt = this.stepStartedAt;
          for (let index = 0; index < this.history.length; index += 2) {
            if (Math.abs(this.history[index + 1] - next.commanded) > this.band) {
              arrivedAt = this.history[index];
            }
          }
          this.arrivalSeconds = arrivedAt - this.stepStartedAt;
        }
        this.stepStartedAt = null;
        this.commandStillSince = null;
        this.history.length = 0;
      }
    }
    this.lastCommand = next.commanded;

    // --- stuck steps: an error that is outside the band and is not going anywhere ---------
    if (!first && !next.stroking && this.targetError > this.band) {
      this.errorWindow.push(this.targetError);
      if (this.errorWindow.length > R.stuckWindowSteps) this.errorWindow.shift();
      if (this.errorWindow.length === R.stuckWindowSteps) {
        let low = Infinity;
        let high = -Infinity;
        for (const value of this.errorWindow) {
          if (value < low) low = value;
          if (value > high) high = value;
        }
        if (high - low < R.stuckEpsilon) this.stuckSteps += 1;
      }
    } else {
      this.errorWindow.length = 0;
    }

    // --- the anchor, where one exists ------------------------------------------------------
    this.anchorStray = next.anchorStray;
    if (next.anchorStray !== null) {
      const mm = next.anchorStray * 1000;
      if (this.peakAnchorStray === null || mm > this.peakAnchorStray) this.peakAnchorStray = mm;
    }
  }

  state(): ReadoutState {
    return {
      steps: this.steps,
      seconds: this.last < 0 ? 0 : this.last,
      targetError: this.targetError,
      peakTargetError: this.peakTargetError,
      tipSpeed: this.tipSpeed,
      peakTipSpeedDriven: this.peakDriven,
      peakTipSpeedRaw: this.peakRaw,
      excludedStartupSteps: this.excludedStartup,
      excludedContactSteps: this.excludedContact,
      tipWanderMm: this.wanderMm,
      settleSeconds: this.settleSeconds,
      arrivalSeconds: this.arrivalSeconds,
      overshoot: this.overshoot,
      stuckSteps: this.stuckSteps,
      contacts: this.contacts,
      selfContacts: this.selfContacts,
      anchorStrayMm: this.anchorStray === null ? null : this.anchorStray * 1000,
      peakAnchorStrayMm: this.peakAnchorStray,
    };
  }
}

const fixed = (value: number, places: number): string => value.toFixed(places);

/**
 * The readout as one block of lines, for the page overlay and for the Node bench's stdout.
 *
 * One formatter for both, because a number that reads differently in the two places is a number
 * somebody will compare across harnesses without noticing they have done it. The caller names
 * its own harness on the line above.
 */
export function formatReadout(state: ReadoutState): readonly string[] {
  const stray = state.peakAnchorStrayMm === null
    ? "n/a (no anchor on this chain)"
    : `${fixed(state.peakAnchorStrayMm, 2)} mm peak, ${fixed(state.anchorStrayMm ?? 0, 2)} now`;
  return Object.freeze([
    `steps ${state.steps} over ${fixed(state.seconds, 2)} s`,
    `target error ${fixed(state.targetError, 4)} (peak ${fixed(state.peakTargetError, 4)})`,
    `settle ${state.settleSeconds === null ? "n/a" : `${fixed(state.settleSeconds, 3)} s`}`
      + `  arrival ${state.arrivalSeconds === null ? "n/a" : `${fixed(state.arrivalSeconds, 3)} s`}`
      + `  overshoot ${fixed(state.overshoot, 4)}`,
    `tip speed ${fixed(state.tipSpeed, 2)} m/s`,
    `peak tip speed, driven ${fixed(state.peakTipSpeedDriven, 2)} m/s`
      + ` (raw ${fixed(state.peakTipSpeedRaw, 2)};`
      + ` ${state.excludedStartupSteps} steps excluded as startup,`
      + ` ${state.excludedContactSteps} as post-contact)`,
    `tip wander at rest ${fixed(state.tipWanderMm, 3)} mm`,
    `anchor stray ${stray}`,
    `stuck steps ${state.stuckSteps}`,
    `contacts ${state.contacts}, self-contacts ${state.selfContacts}`,
  ]);
}
