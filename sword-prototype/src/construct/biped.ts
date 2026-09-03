import type { ActionController, ControllerContext, ControllerDiagnostic, ControllerFactory } from "./scheduler.ts";

type Mode = "move" | "combat-move" | "turn" | "brace" | "recover";
type Side = "left" | "right";

/** Conservative one-support authority. A physical sweep may lower these values, never bypass them. */
export const SUPPORTED_BIPED_LIMP_V1 = Object.freeze({
  MAX_SPEED_MPS: 0.64,
  MAX_STRAFE_FRACTION: 0.35,
  MAX_YAW_FRACTION: 0.45,
  GAIT_STABILITY_SCALE: 0.55,
});

/**
 * Combat-move plants both physical feet before advancing the admitted carrier. It is therefore a
 * stronger stance than the ordinary stationary brace: both support chains keep correcting while
 * the fighter carries a real weapon and off-hand guard. This changes only the action-owned
 * stability capacity -- no motor, transform, collision, or damage exception is introduced.
 */
export const SUPPORTED_BIPED_COMBAT_BRACE_V1 = Object.freeze({ CAPACITY_MULTIPLIER: 2.00 });

const numberParameter = (context: ControllerContext, name: string, fallback = 0): number => {
  const value = context.request.parameters[name];
  return typeof value === "number" ? value : fallback;
};
const bindingFor = (context: ControllerContext, side: Side) => {
  const binding = context.group.bindings[`${side}-foot`];
  if (!binding || binding.joints.length !== 4 || binding.modules.length !== 1) {
    throw new Error(`biped ${context.action.controller} requires binding "${side}-foot" with four ordered joints and one contact module`);
  }
  return binding;
};
const readingFor = (context: ControllerContext, joint: string, axis: "x" | "y" = "x") => {
  const reading = context.view.joints[`${joint}:${axis}`] ?? context.view.joints[joint];
  if (!reading) throw new Error(`biped ${context.action.controller} cannot read ${axis}-axis joint "${joint}"`);
  return reading;
};
const contacts = (context: ControllerContext, sides: readonly Side[] = ["left", "right"]): number => sides
  .filter((side) => context.view.facts[`contact:${bindingFor(context, side).modules[0]}`] === true).length;

export interface BipedBracePose {
  readonly kneeRad: number;
  readonly ankleRad: number;
  readonly soleRad: number;
}

/** The ordinary biped stance. Mounted Actions may author a different pose explicitly. */
export const BIPED_BRACE_POSE: Readonly<BipedBracePose> = Object.freeze({
  kneeRad: -0.20, ankleRad: 0.10, soleRad: 0.08,
});
const BIPED_PLANT_POSE: Readonly<BipedBracePose> = Object.freeze({
  kneeRad: 0, ankleRad: 0, soleRad: 0,
});
// The 0.30 rad boundary is pinned on both sides by the controller test and is exercised by
// both the 0.90 m recovery corpus and the full-size combat-interruption/historical-topple pair.
const SUPPORTED_RECOVERY_BRACE_TILT_RAD = 0.30;

/** The exact two-foot brace motor field, shared by brace and braced mounted attacks. */
export function writeBipedBrace(
  context: ControllerContext,
  pose: Readonly<BipedBracePose> = BIPED_BRACE_POSE,
  sides: readonly Side[] = ["left", "right"],
): number {
  if (![pose.kneeRad, pose.ankleRad, pose.soleRad].every(Number.isFinite)) {
    throw new Error("biped brace pose must be finite");
  }
  const roll = Number(context.view.facts["core-roll-rad"] ?? 0);
  const pitch = Number(context.view.facts["core-pitch-rad"] ?? 0);
  const pitchCorrection = Math.max(-0.55, Math.min(0.55, pitch * 0.85));
  let greatestError = 0;
  for (const side of sides) {
    const binding = bindingFor(context, side);
    const sign = side === "left" ? -1 : 1;
    const targets: readonly [string, "x" | "y", number][] = [
      [binding.joints[0], "x", pitchCorrection + sign * roll * 0.14],
      [binding.joints[1], "x", pose.kneeRad],
      [binding.joints[2], "x", pose.ankleRad - pitchCorrection * 0.62],
      [binding.joints[3], "x", pose.soleRad - pitchCorrection * 0.38],
      [binding.joints[0], "y", 0],
    ];
    for (const [joint, axis, target] of targets) {
      const reading = readingFor(context, joint, axis);
      const angleRad = Math.max(reading.minRad, Math.min(reading.maxRad, target));
      greatestError = Math.max(greatestError, Math.abs(angleRad - reading.angleRad));
      context.motors.write({ joint: `${joint}:${axis}`, angleRad,
        maxSpeedRadS: reading.maxSpeedRadS, maxForceNm: reading.maxForceNm });
    }
  }
  return greatestError;
}

/** A two-support controller; every command crosses the same MotorWriter as every other Action. */
class BipedController implements ActionController {
  private readonly context: ControllerContext;
  private readonly mode: Mode;
  private readonly supported: boolean;
  private readonly supportSides: readonly Side[];
  private readonly speedCeilingMps: number;
  private readonly strafeScale: number;
  private readonly yawScale: number;
  private phase = 0;
  private state = "ready";
  private progress = Number.POSITIVE_INFINITY;
  private cancelled = "";
  private stableS = 0;

  constructor(context: ControllerContext, mode: Mode, supported = false,
    supportSides: readonly Side[] = ["left", "right"], speedCeilingMps = 1.6,
    strafeScale = 1, yawScale = 1) {
    this.context = context; this.mode = mode; this.supported = supported;
    this.supportSides = Object.freeze([...supportSides]);
    this.speedCeilingMps = speedCeilingMps; this.strafeScale = strafeScale; this.yawScale = yawScale;
    if (this.supportSides.length === 0 || new Set(this.supportSides).size !== this.supportSides.length) {
      throw new Error(`biped ${context.action.controller} requires one or two distinct support sides`);
    }
    for (const side of this.supportSides) bindingFor(context, side);
    // The combat carrier has its own bounded world footprint. During a turn it can keep that
    // footprint supported while a real sole is between solver contacts; refusing the Action in
    // that narrow interval made an otherwise upright Effigy repeatedly fall into recover and
    // become a planted turret. Other biped modes retain the strict measured-foot admission.
    const carrierBridgedContact = supported && mode === "combat-move" &&
      context.view.facts["core-upright"] !== false;
    if (mode !== "recover" && contacts(context, this.supportSides) < 1 && !carrierBridgedContact) {
      throw new Error(`biped ${mode} requires at least one measured foot contact`);
    }
  }

  enter(): void { this.state = this.mode; }

  step(dt: number): void {
    if (this.cancelled) return;
    const previous = this.supported ? this.context.locomotion.sample().request : null;
    const measuredContacts = contacts(this.context, this.supportSides);
    const oneSupport = this.supported && this.supportSides.length === 1;
    if (this.supported) this.writeLocomotionRequest(!oneSupport || measuredContacts > 0);
    const turnNeedsReplant = this.supported && this.mode === "turn" &&
      measuredContacts < this.supportSides.length;
    if (this.mode === "brace" || turnNeedsReplant) {
      // The virtual carrier owns supported yaw. Once its physical turn gait is down to one
      // measured foot, continuing the 0.34 rad hip twist can fly the remaining terminal on the
      // next solver row. Replant the ordinary stance without reducing the carrier request.
      this.state = this.mode;
      this.progress = writeBipedBrace(this.context, turnNeedsReplant ? BIPED_PLANT_POSE : BIPED_BRACE_POSE);
      return;
    }
    if (this.supported && this.mode === "recover") {
      // Supported recovery has a bounded carrier actuator dedicated to righting the root.
      // Rocking both physical legs by a fixed 0.48 rad fought that actuator on short bodies:
      // a 0.90 m biped repeatedly crossed rising -> fallen instead of establishing support.
      // Keep a substantially fallen body in the neutral scale-independent plant while the
      // carrier does its job. Near upright, return to the ordinary brace so live combat contact
      // cannot withdraw a nearly recovered support group before its safe boundary completes.
      // The legacy unassisted controller retains its physical rocking gait below.
      const upright = this.context.view.facts["core-upright"] !== false;
      const roll = Number(this.context.view.facts["core-roll-rad"] ?? 0);
      const pitch = Number(this.context.view.facts["core-pitch-rad"] ?? 0);
      const pose = Math.hypot(roll, pitch) <= SUPPORTED_RECOVERY_BRACE_TILT_RAD
        ? BIPED_BRACE_POSE : BIPED_PLANT_POSE;
      writeBipedBrace(this.context, pose, this.supportSides);
      this.stableS = upright && measuredContacts === this.supportSides.length
        ? this.stableS + dt : 0;
      this.state = this.stableS >= 0.25 ? "stable" : upright ? "settling" : "planting";
      this.progress = Math.hypot(roll, pitch);
      return;
    }
    if (this.mode === "combat-move") {
      // Combat locomotion deliberately keeps both real support chains in their measured brace
      // while the supported carrier performs the declared translation/yaw. A swinging gait under
      // a 0.70 lateral turn repeatedly put a stone foot into its own next support footprint;
      // this is the bounded "walking is a game layer" accommodation, not direct body movement --
      // the carrier still has to clear the world and the brace motors still own every leg axis.
      this.state = "combat-move";
      this.progress = writeBipedBrace(this.context, BIPED_BRACE_POSE, this.supportSides);
      return;
    }
    if (oneSupport) {
      // A fallback leg cannot be both stance and swing. The carrier supplies the deliberately
      // reduced shuffle; the only surviving physical chain stays planted, and a missing fresh
      // contact stages STOP on this same controller boundary instead of air-walking through grace.
      this.state = measuredContacts > 0 ? "shuffle" : "planting";
      this.progress = writeBipedBrace(this.context, BIPED_BRACE_POSE, this.supportSides);
      return;
    }
    // `combat-move` returned above after planting its physical brace. Only the legacy/full gait
    // below swings a leg, so its local definition is intentionally just ordinary `move`.
    const moving = this.mode === "move";
    const speed = moving ? numberParameter(this.context, "speed") :
      this.mode === "turn" ? Math.abs(numberParameter(this.context, "yaw")) : 0;
    const phaseDrive = this.supported
      ? moving ? Math.max(Math.hypot(previous?.localForward ?? 0, previous?.localRight ?? 0),
          Math.abs(previous?.yaw ?? 0))
        : this.mode === "turn" ? Math.abs(previous?.yaw ?? 0) : previous?.recover === true ? 1 : 0
      : 0.65 + speed * 0.55;
    this.phase = (this.phase + dt * phaseDrive) % 1;
    const upright = this.context.view.facts["core-upright"] !== false;
    const roll = Number(this.context.view.facts["core-roll-rad"] ?? 0);
    const pitch = Number(this.context.view.facts["core-pitch-rad"] ?? 0);
    let greatestError = 0;
    for (const side of this.supportSides) {
      const binding = bindingFor(this.context, side);
      const sign = side === "left" ? -1 : 1;
      const cycle = (this.phase + (side === "left" ? 0 : 0.5)) % 1;
      const returning = cycle >= 0.72;
      const liftPhase = returning ? (cycle - 0.72) / 0.28 : 0;
      const lift = returning ? Math.sin(liftPhase * Math.PI) : 0;
      const stride = moving
        ? ((cycle / 0.72) * 2 - 1) * numberParameter(this.context, "forward") * (0.22 + speed * 0.10)
        : 0;
      const lateral = moving
        ? numberParameter(this.context, "right") * this.strafeScale * sign * 0.10 : 0;
      const rock = this.mode === "recover" ? Math.sin(this.phase * Math.PI * 2) * sign * 0.48 : 0;
      const hipX = this.mode === "recover" ? Math.max(-0.65, Math.min(0.65, -pitch * 0.38 + rock)) : stride + lateral;
      const legLift = this.mode === "turn" ? lift * 0.22 : lift;
      const knee = this.mode === "recover" ? -0.38 - Math.abs(rock) * 0.20 : -legLift * 0.62;
      const ankle = this.mode === "recover" ? 0.22 + Math.abs(rock) * 0.14 : legLift * 0.34;
      const sole = this.mode === "recover" ? 0.16 : legLift * 0.24;
      const targets: readonly [string, "x" | "y", number][] = [
        [binding.joints[0], "x", hipX], [binding.joints[1], "x", knee],
        [binding.joints[2], "x", ankle], [binding.joints[3], "x", sole],
        // The carrier, not this hip twist, supplies supported yaw. A full 0.34-rad gait twist
        // was safe while turning in place, but coupled with a 0.70 orbit request it repeatedly
        // pushed the stone torso over one support edge. A 0.12-rad acknowledgement still cost
        // the four-seed physical corpus standing time, so a combat-move plants the real feet and
        // delegates the yaw entirely to the declared supported carrier; this is not a transform
        // shortcut, because the carrier is the locomotion Action's actual physics authority.
        [binding.joints[0], "y", this.mode === "turn" ? numberParameter(this.context, "yaw") * 0.34 : 0],
      ];
      for (const [joint, axis, target] of targets) {
        const reading = readingFor(this.context, joint, axis);
        const angleRad = Math.max(reading.minRad, Math.min(reading.maxRad, target));
        greatestError = Math.max(greatestError, Math.abs(angleRad - reading.angleRad));
        this.context.motors.write({ joint: `${joint}:${axis}`, angleRad,
          maxSpeedRadS: reading.maxSpeedRadS, maxForceNm: reading.maxForceNm });
      }
    }
    if (this.mode === "recover") {
      this.stableS = upright && contacts(this.context, this.supportSides) === this.supportSides.length
        ? this.stableS + dt : 0;
      this.state = this.stableS >= 0.25 ? "stable" : upright ? "settling" : "planting";
      this.progress = Math.hypot(roll, pitch);
    } else {
      this.state = this.mode;
      this.progress = moving
        ? Math.max(0, speed - Number(this.context.view.facts["core-speed-mps"] ?? 0)) : greatestError;
    }
  }

  done(): boolean { return this.mode === "recover" && this.state === "stable"; }
  cancel(reason: string): void { this.cancelled = reason; this.state = "cancelled"; }
  diagnostic(): ControllerDiagnostic { return { phase: this.state,
    detail: this.cancelled || `biped ${this.supportSides.join("+")} support phase ${this.phase.toFixed(3)}`,
    progress: this.progress, epsilon: 0.03 }; }

  private writeLocomotionRequest(contactAuthorized = true): void {
    if (!contactAuthorized) {
      this.context.locomotion.request({ localForward: 0, localRight: 0, yaw: 0, recover: false });
      return;
    }
    const moving = this.mode === "move" || this.mode === "combat-move";
    const forward = moving ? numberParameter(this.context, "forward") : 0;
    const right = moving ? numberParameter(this.context, "right") * this.strafeScale : 0;
    const magnitude = Math.hypot(forward, right);
    const directionScale = magnitude > 1 ? 1 / magnitude : 1;
    const speedScale = moving
      ? Math.max(0, Math.min(this.speedCeilingMps / 1.6,
        numberParameter(this.context, "speed") / 1.6)) : 0;
    this.context.locomotion.request({ localForward: forward * directionScale * speedScale,
      localRight: right * directionScale * speedScale,
      yaw: (this.mode === "turn" || this.mode === "combat-move" || this.supportSides.length === 1)
        ? numberParameter(this.context, "yaw") * this.yawScale : 0,
      recover: this.mode === "recover" });
  }
}

const factory = (name: string, mode: Mode, supported = false): ControllerFactory => Object.freeze({
  name, create: (context: ControllerContext) => new BipedController(context, mode, supported),
});
const limpFactory = (side: Side): ControllerFactory => Object.freeze({
  name: `supported-biped-limp-${side}`,
  create: (context: ControllerContext) => new BipedController(context, "move", true, [side],
    SUPPORTED_BIPED_LIMP_V1.MAX_SPEED_MPS, SUPPORTED_BIPED_LIMP_V1.MAX_STRAFE_FRACTION,
    SUPPORTED_BIPED_LIMP_V1.MAX_YAW_FRACTION),
});

export const BIPED_CONTROLLERS: readonly ControllerFactory[] = Object.freeze([
  factory("biped-move", "move"), factory("biped-turn", "turn"),
  factory("biped-brace", "brace"), factory("biped-recover", "recover"),
  factory("supported-biped-move", "move", true), factory("supported-biped-turn", "turn", true),
  factory("supported-biped-brace", "brace", true), factory("supported-biped-recover", "recover", true),
  factory("supported-biped-combat-move", "combat-move", true),
  limpFactory("left"), limpFactory("right"),
]);
