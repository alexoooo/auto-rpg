import type {
  ActionController,
  ControllerContext,
  ControllerDiagnostic,
  ControllerFactory,
} from "./scheduler.ts";

export interface GaitTarget {
  readonly joint: string;
  readonly angleRad: number;
}

export interface GaitInput {
  readonly phase: number;
  readonly forward: number;
  readonly right: number;
  readonly speed: number;
  readonly yaw?: number;
}

/**
 * Three exact support chains trade authority for surviving a severed limb. These are deliberately
 * lower than the full Warden gait: the number is a controller contract, not an inference from the
 * number of bindings that happened to remain live.
 */
export const SUPPORTED_QUADRUPED_CRAWL_V1 = Object.freeze({
  MAX_SPEED_MPS: 0.55,
  MAX_YAW_FRACTION: 0.35,
  GAIT_STABILITY_SCALE: 0.65,
});

const supportBindings = (context: ControllerContext) => Object.entries(context.group.bindings)
  .filter(([, binding]) => binding.joints.length === 4 && binding.modules.length === 1);

/** Roles and ordered chains come only from the configured group bindings. */
export function quadrupedTargets(context: ControllerContext, input: GaitInput): readonly GaitTarget[] {
  const rows: GaitTarget[] = [];
  const roles = supportBindings(context);
  if (roles.length < 3) throw new Error(`group "${context.group.id}" needs at least three configured limb bindings`);
  for (const [role, binding] of roles) {
    if (binding.joints.length !== 4 || binding.modules.length !== 1) {
      throw new Error(`group "${context.group.id}" binding "${role}" must have four joints and one contact module`);
    }
    // A four-beat crawl keeps three supports under the core. The former diagonal pair and
    // pre-crouched lower joints walked both 0 and pi bodies backward in the 200-step Lab probe.
    // Adjacent return slots are diagonal limbs. If solver contact acquisition straddles a slot
    // boundary, the remaining two supports are therefore the declared opposite diagonal.
    const diagonal = role.includes("front-left") ? 0 : role.includes("rear-right") ? 0.25 :
      role.includes("front-right") ? 0.5 : 0.75;
    const lateral = role.includes("left") ? -input.right : input.right;
    const contact = context.view.facts[`contact:${binding.modules[0]}`] === true;
    const slip = Math.max(0, Number(context.view.facts[`slip:${binding.modules[0]}`] ?? 0));
    const roll = Number(context.view.facts["core-roll-rad"] ?? 0);
    // A leg only receives the full stride while its measured contact is stable. A slipping
    // support shortens the stroke, and a support that disappeared is actively replanted.
    // This is intentionally driven from facts each solver step rather than from the gait clock.
    const traction = slip > 2 ? Math.max(0.82, 1 / (1 + (slip - 2) * 0.2)) : 1;
    // Three legs make the same slow power stroke while the fourth returns quickly. Independent
    // sine waves made half the planted feet oppose the other half and moved the 180 kg Warden
    // only 3 mm in four seconds. This piecewise cycle is a four-beat crawl by construction.
    const cycle = (input.phase + diagonal) % 1;
    const stroke = 0.42 + input.speed * 0.14;
    // The 18% return window leaves overlap between neighbouring legs so a just-landed foot can
    // acquire a solver contact before the next one lifts; exactly 25% produced two-support seams.
    const stanceFraction = 0.82;
    const returning = cycle >= stanceFraction;
    const returnPhase = returning ? (cycle - stanceFraction) / (1 - stanceFraction) : 0;
    const rawSwing = returning
      ? stroke - stroke * 2 * returnPhase
      : -stroke + stroke * 2 * (cycle / stanceFraction);
    const swing = rawSwing * traction;
    const lift = returning ? Math.sin(returnPhase * Math.PI) * stroke : 0;
    const side = role.includes("left") ? -1 : 1;
    const differentialForward = input.forward + side * (input.yaw ?? 0);
    const attitude = Math.abs(roll) > 0.5 ? Math.max(-0.035, Math.min(0.035, roll * side * 0.08)) : 0;
    const plant = !contact && Math.abs(roll) > 0.4 ? 0.025 : 0;
    rows.push(
      { joint: binding.joints[0], angleRad: swing * differentialForward + lateral * 0.18 },
      { joint: binding.joints[1], angleRad: -lift * 0.72 - plant - attitude },
      { joint: binding.joints[2], angleRad: lift * 0.36 + plant * 0.55 + attitude * 0.4 },
      { joint: binding.joints[3], angleRad: lift * 0.28 + plant * 0.45 + attitude * 0.6 },
    );
  }
  return rows;
}

const numeric = (context: ControllerContext, name: string, fallback = 0): number => {
  const value = context.request.parameters[name];
  return typeof value === "number" ? value : fallback;
};

const usableContacts = (context: ControllerContext): number => Object.values(context.group.bindings)
  .filter((binding) => binding.joints.length === 4 && binding.modules.length === 1 &&
    context.view.facts[`contact:${binding.modules[0]}`] === true)
  .length;

class LocomotionController implements ActionController {
  private readonly context: ControllerContext;
  private readonly mode: "move" | "turn" | "brace" | "recover" | "crawl";
  private readonly assisted: boolean;
  private phase = 0;
  private state = "ready";
  private cancelled = "";
  private progress = Number.POSITIVE_INFINITY;
  private stableS = 0;
  private readonly recoveryAxis: "roll" | "pitch";

  constructor(context: ControllerContext, mode: "move" | "turn" | "brace" | "recover" | "crawl", assisted = false) {
    this.context = context;
    this.mode = mode;
    this.assisted = assisted;
    this.recoveryAxis = Math.abs(Number(context.view.facts["core-roll-rad"] ?? 0)) >
      Math.abs(Number(context.view.facts["core-pitch-rad"] ?? 0)) ? "roll" : "pitch";
    // Recovery is precisely the action needed after the support set has collapsed. Requiring
    // three planted feet here made the Mind select recovery and the scheduler refuse it forever.
    if (mode !== "recover" && usableContacts(context) < 3) {
      throw new Error(`quadruped ${mode} requires at least three usable contact modules`);
    }
  }

  enter(): void { this.state = this.mode; }

  step(dt: number): void {
    if (this.cancelled !== "") return;
    const speed = this.mode === "move" || this.mode === "crawl" ? numeric(this.context, "speed") : 0;
    if (this.assisted) this.writeLocomotionRequest(speed);
    this.phase = (this.phase + dt * (0.75 + speed * 0.65)) % 1;
    const upright = this.context.view.facts["core-upright"] !== false;
    let targets: readonly GaitTarget[];
    if (this.mode === "brace" || (this.mode === "recover" && this.assisted)) {
      const roll = Number(this.context.view.facts["core-roll-rad"] ?? 0);
      targets = supportBindings(this.context).flatMap(([role, binding]) => [
        // These hinges rotate around local X, so front/rear -- not left/right -- widens
        // the support polygon. The earlier array-index alternation twisted each side apart.
        { joint: binding.joints[0], angleRad: role.includes("front") ? -0.25 : 0.25 },
        { joint: binding.joints[1], angleRad: -0.18 - Math.min(0.08, Math.abs(roll) * 0.2) },
        { joint: binding.joints[2], angleRad: 0.08 + Math.min(0.05, Math.abs(roll) * 0.15) },
        { joint: binding.joints[3], angleRad: 0.10 + Math.min(0.05, Math.abs(roll) * 0.15) },
      ]);
    } else if (this.mode === "recover") {
      const roll = Number(this.context.view.facts["core-roll-rad"] ?? 0);
      const pitch = Number(this.context.view.facts["core-pitch-rad"] ?? 0);
      targets = supportBindings(this.context).flatMap(([role, binding]) => {
        const frontRear = role.includes("front") ? -1 : 1;
        const side = role.includes("left") ? -1 : 1;
        // When the core lies on its nose, the front attachment is already the low side:
        // swing those legs under the body and fold the rear pair away. The opposite sign is
        // required on the tail. Using `pitch * frontRear` did the reverse and held the core
        // flat on its side indefinitely in the impulse-fall fixture.
        // A static plant can settle into a stable side face with no leg under the centre of mass.
        // Rock the dominant fallen axis through the same bounded motors so either lip can acquire
        // purchase; the solver and contacts, not a direct core torque, decide when it rises.
        const rock = Math.sin(this.phase * Math.PI * 2) * 0.52 *
          (this.recoveryAxis === "pitch" ? frontRear : side);
        const correction = Math.max(-0.55, Math.min(0.55,
          -pitch * frontRear * 0.42 + roll * side * 0.24 + rock));
        return [
          { joint: binding.joints[0], angleRad: frontRear * 0.24 + correction },
          { joint: binding.joints[1], angleRad: -0.24 - Math.min(0.34,
            Math.hypot(roll, pitch) * 0.12 + Math.max(0, rock) * 0.35) },
          { joint: binding.joints[2], angleRad: 0.10 + Math.max(0, rock) * 0.20 },
          { joint: binding.joints[3], angleRad: 0.12 + Math.max(0, rock) * 0.16 },
        ];
      });
      this.stableS = upright && usableContacts(this.context) >= 3 ? this.stableS + dt : 0;
      this.state = this.stableS >= 0.25 ? "stable" : upright ? "settling" : "planting";
    } else {
      const yaw = this.mode === "turn" || this.mode === "crawl" ? numeric(this.context, "yaw") : 0;
      targets = quadrupedTargets(this.context, {
        phase: this.phase,
        forward: this.mode === "move" || this.mode === "crawl" ? numeric(this.context, "forward") : 0,
        right: this.mode === "move" || this.mode === "crawl" ? numeric(this.context, "right") : yaw,
        speed: this.mode === "move" || this.mode === "crawl" ? speed : Math.abs(yaw),
        yaw,
      });
    }
    let targetError = 0;
    for (const target of targets) {
      const reading = this.context.view.joints[target.joint];
      if (!reading) throw new Error(`quadruped ${this.mode} cannot read joint "${target.joint}"`);
      const angleRad = Math.max(reading.minRad, Math.min(reading.maxRad, target.angleRad));
      targetError = Math.max(targetError, Math.abs(angleRad - reading.angleRad));
      this.context.motors.write({ joint: target.joint,
        angleRad,
        maxSpeedRadS: reading.maxSpeedRadS, maxForceNm: reading.maxForceNm });
    }
    if (this.mode === "move" || this.mode === "crawl") {
      this.progress = Math.max(0, speed - Number(this.context.view.facts["core-speed-mps"] ?? 0));
    } else if (this.mode === "turn") {
      this.progress = Math.max(0, Math.abs(numeric(this.context, "yaw")) -
        Math.abs(Number(this.context.view.facts["core-yaw-rate-rad-s"] ?? 0)));
    } else if (this.mode === "brace") this.progress = targetError;
    else this.progress = Math.hypot(Number(this.context.view.facts["core-roll-rad"] ?? 0),
      Number(this.context.view.facts["core-pitch-rad"] ?? 0));
  }

  done(): boolean { return this.mode === "recover" && this.state === "stable"; }
  cancel(reason: string): void { this.cancelled = reason; this.state = "cancelled"; }
  diagnostic(): ControllerDiagnostic { return { phase: this.state, detail: this.cancelled || `gait phase ${this.phase.toFixed(3)}`,
    progress: this.progress, epsilon: 0.03 }; }

  private writeLocomotionRequest(speed: number): void {
    const crawling = this.mode === "crawl";
    const moving = this.mode === "move" || crawling;
    const forward = moving ? numeric(this.context, "forward") : 0;
    const right = moving ? numeric(this.context, "right") : 0;
    const magnitude = Math.hypot(forward, right);
    const directionScale = magnitude > 1 ? 1 / magnitude : 1;
    const maximumSpeed = crawling ? SUPPORTED_QUADRUPED_CRAWL_V1.MAX_SPEED_MPS : 1.6;
    // Requests are fractions of the shared 1.6 m/s carrier, not fractions of this Action's own
    // ceiling. Dividing a 0.55 m/s crawl by 0.55 asked the carrier for its full 1.6 m/s authority.
    // The physical port separately gates fallback translation on every exact fresh binding;
    // normalization here only prevents the reduced Action ceiling from becoming full authority.
    const speedScale = moving
      ? Math.max(0, Math.min(maximumSpeed, speed) / 1.6) : 0;
    this.context.locomotion.request({
      localForward: forward * directionScale * speedScale,
      localRight: right * directionScale * speedScale,
      yaw: this.mode === "turn" ? numeric(this.context, "yaw") : crawling
        ? Math.max(-SUPPORTED_QUADRUPED_CRAWL_V1.MAX_YAW_FRACTION,
          Math.min(SUPPORTED_QUADRUPED_CRAWL_V1.MAX_YAW_FRACTION, numeric(this.context, "yaw"))) : 0,
      recover: this.mode === "recover",
    });
  }
}

const factory = (name: string, mode: "move" | "turn" | "brace" | "recover" | "crawl", assisted = false): ControllerFactory => Object.freeze({
  name,
  create: (context: ControllerContext) => new LocomotionController(context, mode, assisted),
});

export const LOCOMOTION_CONTROLLERS: readonly ControllerFactory[] = Object.freeze([
  factory("quadruped-move", "move"),
  factory("quadruped-turn", "turn"),
  factory("brace", "brace"),
  factory("recover", "recover"),
  factory("supported-quadruped-move", "move", true),
  factory("supported-quadruped-turn", "turn", true),
  factory("supported-quadruped-brace", "brace", true),
  factory("supported-quadruped-recover", "recover", true),
  factory("supported-quadruped-crawl", "crawl", true),
]);
