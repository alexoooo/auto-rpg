import type { EntityKey, Pose, V3 } from "../fight/trace.js";
import type { StageCameraBasis } from "./stage-camera.js";
import { CURSOR_HAND_SPAN_ARM_LENGTHS } from "./arena-hand-cursor.js";

export const EMBODIED_COMMAND_BYTES = 61;
export const EMBODIED_COMMAND_LAYOUT_VERSION = 2;
export const EMBODIED_COMMAND_KIND = 2;
export const ONE_RAW = 65_536;
export const HUMAN_ARM_RESTING_EFFORT = ONE_RAW / 2;

/** Provisional session-06 values. Arena-07 owns foreground calibration. */
export const VIRTUAL_HAND_SENSITIVITY = 0.006;
export const EXTEND_DRAG_SENSITIVITY = 0.004;
export const TOUCH_PINCH_SPREAD_RATIO = 0.75;
export const SWING_DRAG_DEAD_ZONE_PX = 6;
export const SWING_DRAG_FULL_EFFORT_PX_S = 900;
export const VIRTUAL_HAND_REFERENCE_VIEWPORT_PX = 1_000;

/** Mirrored from Rust's `PLAYER_TURN_LEAD_RAW`; arena-07 owns its feel. */
export const BODY_TURN_INPUT_LEAD_RAW = 8_192;

type MovementCode = "KeyW" | "KeyA" | "KeyS" | "KeyD" | "KeyQ" | "KeyE";
const MOVEMENT_CODES = new Set<string>(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"]);
export type HumanArm = 0 | 1;
export type WeaponChannel = "cut" | "extend";

export interface ArmAnatomy {
  readonly standingHeight: number;
  readonly shoulderHeight: number;
  readonly armLength: number;
}

export interface ArmTargetState {
  readonly bearing: number;
  readonly height: number;
  readonly reach: number;
  readonly effort: number;
  readonly plane: number;
}

type MutableTarget = { bearing: number; height: number; reach: number; effort: number; plane: number };
type ButtonState = { down: boolean; order: number; travel: number };
type ExtendAnchor = Readonly<{ direction: V3; distance: number; cursorY: number }>;

export type AbsoluteWeaponResult = Readonly<{ changed: boolean; saturated: boolean }>;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
function dot(a: V3, b: V3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function add(a: V3, b: V3): V3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale(a: V3, by: number): V3 { return [a[0] * by, a[1] * by, a[2] * by]; }
function minus(a: V3, b: V3): V3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function length(a: V3): number { return Math.hypot(a[0], a[1], a[2]); }
function unit(a: V3): V3 {
  const magnitude = length(a);
  return magnitude === 0 ? [0, 0, 0] : scale(a, 1 / magnitude);
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function radiansOf(raw: number): number { return raw * Math.PI * 2 / ONE_RAW; }
function rawAngle(radians: number): number {
  return Math.round(radians * ONE_RAW / (Math.PI * 2));
}
function wrapAngle(raw: number): number { return ((raw % ONE_RAW) + ONE_RAW) % ONE_RAW; }

/** Pure keyboard state plus the stored direct-hand command. */
export class ArenaInput {
  readonly #held = new Set<MovementCode>();
  readonly #buttons: Record<WeaponChannel, ButtonState> = {
    cut: { down: false, order: 0, travel: 0 },
    extend: { down: false, order: 0, travel: 0 },
  };
  #buttonOrder = 0;
  #limb: HumanArm = 1;
  #anatomy: ArmAnatomy | null = null;
  #minReach = ONE_RAW / 4;
  #pose: Pose | null = null;
  #target: MutableTarget | null = null;
  #restTarget: MutableTarget | null = null;
  #lastAbsoluteHand: V3 | null = null;
  #extendAnchor: ExtendAnchor | null = null;
  #armAvailable = false;
  #posedStandingHeight = 0;

  keyDown(code: string): boolean {
    if (!MOVEMENT_CODES.has(code)) return false;
    this.#held.add(code as MovementCode);
    return true;
  }
  keyUp(code: string): boolean {
    if (!MOVEMENT_CODES.has(code)) return false;
    this.#held.delete(code as MovementCode);
    return true;
  }

  configureArm(limb: HumanArm, anatomy: ArmAnatomy, armMinReach: number): void {
    this.#limb = limb;
    this.#anatomy = anatomy;
    this.#minReach = clamp(armMinReach, 1, ONE_RAW);
    this.#pose = null;
    this.#target = null;
    this.#restTarget = null;
    this.#lastAbsoluteHand = null;
    this.#extendAnchor = null;
    this.#armAvailable = false;
  }

  /** Latest publication wins. The target itself remains in torso command space. */
  synchronize(pose: Pose): boolean {
    this.#pose = pose;
    const region = pose.regions[this.#limb + 2];
    if (region === undefined || !region.present
      || (pose.severed & (1 << (this.#limb + 2))) !== 0) {
      this.#armAvailable = false;
      return false;
    }
    this.#armAvailable = true;
    const shoulderDrop = this.#anatomy === null ? 0
      : this.#anatomy.shoulderHeight - (region.lower[2] - pose.body[2]);
    this.#posedStandingHeight = this.#anatomy === null ? 0
      : Math.max(1, this.#anatomy.standingHeight - shoulderDrop);
    if (this.#target === null && this.#anatomy !== null) {
      const shoulder = region.lower;
      const desired = pose.arms[this.#limb].target;
      const planarX = desired[0] - shoulder[0];
      const planarY = desired[1] - shoulder[1];
      const world = Math.atan2(planarY, planarX);
      this.#target = {
        bearing: wrapAngle(rawAngle(world) - pose.yaw),
        height: clamp(Math.trunc((desired[2] - pose.body[2]) * ONE_RAW / this.#posedStandingHeight), 0, ONE_RAW),
        reach: clamp(Math.trunc(Math.hypot(planarX, planarY) * ONE_RAW / this.#anatomy.armLength), this.#minReach, ONE_RAW),
        effort: HUMAN_ARM_RESTING_EFFORT,
        plane: 0,
      };
      // The cursor's centre is the guard the fight opened with, expressed in
      // torso command space. It is never re-read from later publications: those
      // publications contain the cursor's own prior request, and adopting one
      // as a new rest would add the same edge offset again on every tick.
      this.#restTarget = { ...this.#target };
    }
    return this.#target !== null;
  }

  buttonTransition(channel: WeaponChannel, down: boolean): void {
    const button = this.#buttons[channel];
    if (button.down === down) return;
    button.down = down;
    if (down) {
      button.order = ++this.#buttonOrder;
      button.travel = 0;
      if (channel === "extend") this.#extendAnchor = null;
    } else if (channel === "extend") {
      this.#extendAnchor = null;
    }
  }

  get weaponOwner(): WeaponChannel {
    const cut = this.#buttons.cut;
    const extend = this.#buttons.extend;
    if (extend.down && (!cut.down || extend.order > cut.order)) return "extend";
    return "cut";
  }

  /** Consume exactly one relative CSS-pixel delta in exactly one channel. */
  moveWeapon(dx: number, dy: number, elapsedMs: number, viewportHeight: number,
    basis: StageCameraBasis, channel = this.weaponOwner): boolean {
    if (this.#target === null || this.#pose === null || this.#anatomy === null
      || !Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return false;
    const region = this.#pose.regions[this.#limb + 2];
    if (region === undefined || !region.present) return false;
    const shoulder = region.lower;
    const hand = this.desiredHand();
    if (hand === null) return false;
    const viewportScale = VIRTUAL_HAND_REFERENCE_VIEWPORT_PX / Math.max(1, viewportHeight);
    const powered = this.#buttons[channel].down;
    const travel = Math.hypot(dx, dy);
    if (powered) this.#buttons[channel].travel += travel;
    const pastDeadZone = powered && this.#buttons[channel].travel > SWING_DRAG_DEAD_ZONE_PX;
    const speed = elapsedMs > 0 ? travel * 1_000 / elapsedMs : 0;
    this.#target.effort = pastDeadZone
      ? Math.round(HUMAN_ARM_RESTING_EFFORT + HUMAN_ARM_RESTING_EFFORT
        * clamp(speed / SWING_DRAG_FULL_EFFORT_PX_S, 0, 1))
      : HUMAN_ARM_RESTING_EFFORT;

    if (channel === "extend") {
      const offset = minus(hand, shoulder);
      const distance = length(offset);
      if (distance === 0) return false;
      const push = -dy * EXTEND_DRAG_SENSITIVITY * viewportScale * this.#anatomy.armLength;
      let low = 0;
      let high = Number.POSITIVE_INFINITY;
      const planar = Math.hypot(offset[0], offset[1]);
      if (planar > 0) {
        low = Math.max(low, this.#minReach * this.#anatomy.armLength / (ONE_RAW * planar));
        high = Math.min(high, this.#anatomy.armLength / planar);
      }
      const baseZ = shoulder[2] - this.#pose.body[2];
      if (offset[2] > 0) high = Math.min(high, (this.#posedStandingHeight - baseZ) / offset[2]);
      else if (offset[2] < 0) high = Math.min(high, -baseZ / offset[2]);
      const next = add(shoulder, scale(offset, clamp((distance + push) / distance, low, high)));
      this.#adoptHand(next, shoulder);
      return true;
    }

    const screen: V3 = [
      basis.right[0] * dx - basis.up[0] * dy,
      basis.right[1] * dx - basis.up[1] * dy,
      basis.right[2] * dx - basis.up[2] * dy,
    ];
    const worldDelta = scale(screen, VIRTUAL_HAND_SENSITIVITY * viewportScale * this.#anatomy.armLength);
    const next = add(hand, worldDelta);
    this.#adoptHand(next, shoulder);
    if (pastDeadZone) this.#adoptPlane(worldDelta, shoulder);
    return true;
  }

  /**
   * Place the mouse-controlled hand from one absolute unit-disc sample.
   *
   * Touch deliberately continues through {@link moveWeapon}. The desktop
   * cursor has no baseline delta: cut/placement is a pure rest-anchor mapping,
   * while an extension freezes the ray and starting cursor height at its first
   * owned sample so revisiting a point revisits an exact distance.
   */
  placeWeapon(
    qx: number,
    qy: number,
    cursorY: number,
    travelCss: number,
    elapsedMs: number,
    basis: StageCameraBasis,
    channel = this.weaponOwner,
  ): AbsoluteWeaponResult {
    if (this.#target === null || this.#restTarget === null || this.#pose === null
      || this.#anatomy === null || ![qx, qy, cursorY, travelCss, elapsedMs].every(Number.isFinite)) {
      return Object.freeze({ changed: false, saturated: false });
    }
    const shoulder = this.#pose.regions[this.#limb + 2]?.lower;
    if (shoulder === undefined) return Object.freeze({ changed: false, saturated: false });
    const before = this.desiredHand();
    if (before === null) return Object.freeze({ changed: false, saturated: false });

    const powered = this.#buttons[channel].down;
    const travel = Math.max(0, travelCss);
    if (powered) this.#buttons[channel].travel += travel;
    const pastDeadZone = powered && this.#buttons[channel].travel > SWING_DRAG_DEAD_ZONE_PX;
    const speed = elapsedMs > 0 ? travel * 1_000 / elapsedMs : 0;
    this.#target.effort = pastDeadZone
      ? Math.round(HUMAN_ARM_RESTING_EFFORT + HUMAN_ARM_RESTING_EFFORT
        * clamp(speed / SWING_DRAG_FULL_EFFORT_PX_S, 0, 1))
      : HUMAN_ARM_RESTING_EFFORT;

    let requested: V3;
    if (channel === "extend" && powered) {
      if (this.#extendAnchor === null) {
        const offset = minus(before, shoulder);
        const distance = length(offset);
        if (distance === 0) return Object.freeze({ changed: false, saturated: false });
        this.#extendAnchor = Object.freeze({ direction: unit(offset), distance, cursorY });
      }
      const distance = this.#extendAnchor.distance
        - (cursorY - this.#extendAnchor.cursorY) * EXTEND_DRAG_SENSITIVITY * this.#anatomy.armLength;
      requested = add(shoulder, scale(this.#extendAnchor.direction, Math.max(0, distance)));
    } else {
      const rest = this.#handOf(this.#restTarget);
      if (rest === null) return Object.freeze({ changed: false, saturated: false });
      const span = this.#anatomy.armLength * CURSOR_HAND_SPAN_ARM_LENGTHS;
      requested = add(rest, add(scale(basis.right, qx * span), scale(basis.up, qy * span)));
    }

    const saturated = this.#adoptHand(requested, shoulder);
    const after = this.desiredHand();
    if (after === null) return Object.freeze({ changed: false, saturated });
    const gesture = minus(after, this.#lastAbsoluteHand ?? before);
    if (channel === "cut" && pastDeadZone && length(gesture) > 0) {
      this.#adoptPlane(gesture, shoulder);
    }
    this.#lastAbsoluteHand = after;
    return Object.freeze({ changed: length(minus(after, before)) > 0, saturated });
  }

  #adoptHand(hand: V3, shoulder: V3): boolean {
    if (this.#target === null || this.#pose === null || this.#anatomy === null) return false;
    const planarX = hand[0] - shoulder[0];
    const planarY = hand[1] - shoulder[1];
    if (planarX !== 0 || planarY !== 0) {
      this.#target.bearing = wrapAngle(rawAngle(Math.atan2(planarY, planarX)) - this.#pose.yaw);
    }
    const height = Math.round((hand[2] - this.#pose.body[2]) * ONE_RAW
      / this.#posedStandingHeight);
    const reach = Math.round(Math.hypot(planarX, planarY) * ONE_RAW
      / this.#anatomy.armLength);
    this.#target.height = clamp(height, 0, ONE_RAW);
    this.#target.reach = clamp(reach, this.#minReach, ONE_RAW);
    return height !== this.#target.height || reach !== this.#target.reach;
  }

  #adoptPlane(gesture: V3, shoulder: V3): void {
    const hand = this.desiredHand();
    if (hand === null || this.#target === null) return;
    const axis = unit(minus(hand, shoulder));
    if (length(axis) === 0) return;
    let zero = minus([0, 0, -1], scale(axis, dot([0, 0, -1], axis)));
    if (length(zero) < 1e-9) zero = minus([1, 0, 0], scale(axis, dot([1, 0, 0], axis)));
    zero = unit(zero);
    const around = unit(cross(axis, zero));
    const tangent = minus(gesture, scale(axis, dot(gesture, axis)));
    if (length(tangent) < 1e-9) return;
    const next = rawAngle(Math.atan2(dot(tangent, around), dot(tangent, zero)));
    const prior = this.#target.plane;
    const turns = Math.round((prior - next) / ONE_RAW);
    this.#target.plane = next + turns * ONE_RAW;
  }

  desiredHand(): V3 | null {
    return this.#target === null ? null : this.#handOf(this.#target);
  }

  #handOf(target: MutableTarget): V3 | null {
    if (this.#pose === null || this.#anatomy === null) return null;
    const shoulder = this.#pose.regions[this.#limb + 2]?.lower;
    if (shoulder === undefined) return null;
    const world = radiansOf(this.#pose.yaw + target.bearing);
    const radius = this.#anatomy.armLength * target.reach / ONE_RAW;
    return [shoulder[0] + Math.cos(world) * radius, shoulder[1] + Math.sin(world) * radius,
      this.#pose.body[2] + this.#posedStandingHeight * target.height / ONE_RAW];
  }

  get armTarget(): ArmTargetState | null {
    // Keep the nearest-equivalent signed accumulator observable here. Encoding
    // wraps it to the ABI's u16, but continuity must be decided before that
    // lossy boundary or a seam-crossing gesture appears to reverse a turn.
    return this.#target === null ? null : Object.freeze({ ...this.#target });
  }

  clear(): void {
    this.#held.clear();
    this.releaseArm();
  }

  releaseArm(): void {
    for (const button of Object.values(this.#buttons)) {
      button.down = false;
      button.travel = 0;
    }
    if (this.#target !== null) this.#target.effort = HUMAN_ARM_RESTING_EFFORT;
    this.#extendAnchor = null;
    this.#lastAbsoluteHand = null;
  }
  setArmLive(live: boolean): void { if (!live) this.clear(); }
  get active(): boolean { return this.#held.size !== 0; }

  encode(opponent: EntityKey | null, publishedYaw: number): Uint8Array {
    const forward = Number(this.#held.has("KeyW")) - Number(this.#held.has("KeyS"));
    const left = Number(this.#held.has("KeyA")) - Number(this.#held.has("KeyD"));
    const magnitude = Math.hypot(forward, left);
    const movementScale = magnitude > 1 ? ONE_RAW / magnitude : ONE_RAW;
    const turn = Number(this.#held.has("KeyQ")) - Number(this.#held.has("KeyE"));

    const bytes = new Uint8Array(EMBODIED_COMMAND_BYTES);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, EMBODIED_COMMAND_LAYOUT_VERSION, true);
    view.setUint8(2, EMBODIED_COMMAND_KIND);
    view.setInt32(4, Math.trunc(forward * movementScale), true);
    view.setInt32(8, Math.trunc(left * movementScale), true);
    view.setUint16(12, publishedYaw + turn * BODY_TURN_INPUT_LEAD_RAW, true);
    // Opponent intent is stable fight context. A pointer button is arm power,
    // not permission to rewrite the navigation/intent envelope.
    const attacking = opponent !== null;
    view.setUint8(14, attacking ? 1 : 0);
    view.setUint32(15, attacking ? opponent![0] : 0, true);
    view.setUint32(19, attacking ? opponent![1] : 0, true);
    view.setInt32(25, HUMAN_ARM_RESTING_EFFORT, true);
    view.setInt32(39, HUMAN_ARM_RESTING_EFFORT, true);
    if (this.#target !== null && this.#armAvailable) {
      const at = this.#limb === 0 ? 23 : 37;
      view.setUint16(at, wrapAngle(this.#target.bearing), true);
      view.setInt32(at + 2, this.#target.height, true);
      view.setInt32(at + 6, this.#target.reach, true);
      view.setInt32(at + 10, this.#target.effort, true);
      view.setUint16(this.#limb === 0 ? 57 : 59, wrapAngle(this.#target.plane), true);
    }
    return bytes;
  }
}
