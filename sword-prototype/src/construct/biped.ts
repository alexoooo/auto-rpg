import type { ActionController, ControllerContext, ControllerDiagnostic, ControllerFactory } from "./scheduler.ts";

type Mode = "move" | "turn" | "brace" | "recover";
type Side = "left" | "right";

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
const contacts = (context: ControllerContext): number => (["left", "right"] as const)
  .filter((side) => context.view.facts[`contact:${bindingFor(context, side).modules[0]}`] === true).length;

/** A two-support controller; every command crosses the same MotorWriter as every other Action. */
class BipedController implements ActionController {
  private readonly context: ControllerContext;
  private readonly mode: Mode;
  private phase = 0;
  private state = "ready";
  private progress = Number.POSITIVE_INFINITY;
  private cancelled = "";
  private stableS = 0;

  constructor(context: ControllerContext, mode: Mode) {
    this.context = context; this.mode = mode;
    bindingFor(context, "left"); bindingFor(context, "right");
    if (mode !== "recover" && contacts(context) < 1) {
      throw new Error(`biped ${mode} requires at least one measured foot contact`);
    }
  }

  enter(): void { this.state = this.mode; }

  step(dt: number): void {
    if (this.cancelled) return;
    const speed = this.mode === "move" ? numberParameter(this.context, "speed") :
      this.mode === "turn" ? Math.abs(numberParameter(this.context, "yaw")) : 0;
    this.phase = (this.phase + dt * (0.65 + speed * 0.55)) % 1;
    const upright = this.context.view.facts["core-upright"] !== false;
    const roll = Number(this.context.view.facts["core-roll-rad"] ?? 0);
    const pitch = Number(this.context.view.facts["core-pitch-rad"] ?? 0);
    const pitchCorrection = Math.max(-0.55, Math.min(0.55, pitch * 0.85));
    let greatestError = 0;
    for (const side of ["left", "right"] as const) {
      const binding = bindingFor(this.context, side);
      const sign = side === "left" ? -1 : 1;
      const cycle = (this.phase + (side === "left" ? 0 : 0.5)) % 1;
      const returning = cycle >= 0.72;
      const liftPhase = returning ? (cycle - 0.72) / 0.28 : 0;
      const lift = returning ? Math.sin(liftPhase * Math.PI) : 0;
      const stride = this.mode === "move"
        ? ((cycle / 0.72) * 2 - 1) * numberParameter(this.context, "forward") * (0.22 + speed * 0.10)
        : 0;
      const lateral = this.mode === "move" ? numberParameter(this.context, "right") * sign * 0.10 : 0;
      const rock = this.mode === "recover" ? Math.sin(this.phase * Math.PI * 2) * sign * 0.48 : 0;
      const hipX = this.mode === "brace" ? pitchCorrection + sign * roll * 0.14 :
        this.mode === "recover" ? Math.max(-0.65, Math.min(0.65, -pitch * 0.38 + rock)) : stride + lateral;
      const legLift = this.mode === "turn" ? lift * 0.22 : lift;
      const knee = this.mode === "brace" ? -0.20 : this.mode === "recover" ? -0.38 - Math.abs(rock) * 0.20 : -legLift * 0.62;
      const ankle = this.mode === "brace" ? 0.10 - pitchCorrection * 0.62 :
        this.mode === "recover" ? 0.22 + Math.abs(rock) * 0.14 : legLift * 0.34;
      const sole = this.mode === "brace" ? 0.08 - pitchCorrection * 0.38 :
        this.mode === "recover" ? 0.16 : legLift * 0.24;
      const targets: readonly [string, "x" | "y", number][] = [
        [binding.joints[0], "x", hipX], [binding.joints[1], "x", knee],
        [binding.joints[2], "x", ankle], [binding.joints[3], "x", sole],
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
      this.stableS = upright && contacts(this.context) === 2 ? this.stableS + dt : 0;
      this.state = this.stableS >= 0.25 ? "stable" : upright ? "settling" : "planting";
      this.progress = Math.hypot(roll, pitch);
    } else {
      this.state = this.mode;
      this.progress = this.mode === "move"
        ? Math.max(0, speed - Number(this.context.view.facts["core-speed-mps"] ?? 0)) : greatestError;
    }
  }

  done(): boolean { return this.mode === "recover" && this.state === "stable"; }
  cancel(reason: string): void { this.cancelled = reason; this.state = "cancelled"; }
  diagnostic(): ControllerDiagnostic { return { phase: this.state,
    detail: this.cancelled || `biped phase ${this.phase.toFixed(3)}`, progress: this.progress, epsilon: 0.03 }; }
}

const factory = (name: string, mode: Mode): ControllerFactory => Object.freeze({
  name, create: (context: ControllerContext) => new BipedController(context, mode),
});

export const BIPED_CONTROLLERS: readonly ControllerFactory[] = Object.freeze([
  factory("biped-move", "move"), factory("biped-turn", "turn"),
  factory("biped-brace", "brace"), factory("biped-recover", "recover"),
]);
