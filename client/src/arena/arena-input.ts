import type { EntityKey } from "../fight/trace.js";

export const EMBODIED_COMMAND_BYTES = 61;
export const EMBODIED_COMMAND_LAYOUT_VERSION = 2;
export const EMBODIED_COMMAND_KIND = 2;
const ONE_RAW = 65_536;
const HALF_HEIGHT_RAW = ONE_RAW / 2;

/** Provisional half-turn/second baseline; arena-07 owns foreground calibration. */
export const BODY_TURN_INPUT_TURNS_PER_SECOND = 0.5;

type MovementCode = "KeyW" | "KeyA" | "KeyS" | "KeyD" | "KeyQ" | "KeyE";
const MOVEMENT_CODES = new Set<string>(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"]);

/** Pure keyboard state and the canonical 61-byte host command encoder. */
export class ArenaInput {
  readonly #held = new Set<MovementCode>();
  #yaw = 0;
  #armLive = false;

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

  clear(): void {
    this.#held.clear();
    this.#armLive = false;
  }

  setYaw(raw: number): void { this.#yaw = raw & 0xffff; }
  setArmLive(live: boolean): void { this.#armLive = live; }
  get active(): boolean { return this.#held.size !== 0 || this.#armLive; }

  encode(opponent: EntityKey | null): Uint8Array {
    const forward = Number(this.#held.has("KeyW")) - Number(this.#held.has("KeyS"));
    const left = Number(this.#held.has("KeyQ")) - Number(this.#held.has("KeyE"));
    const magnitude = Math.hypot(forward, left);
    const scale = magnitude > 1 ? ONE_RAW / magnitude : ONE_RAW;
    const moveX = Math.trunc(forward * scale);
    const moveY = Math.trunc(left * scale);

    const turn = Number(this.#held.has("KeyA")) - Number(this.#held.has("KeyD"));
    const turnRaw = Math.round(BODY_TURN_INPUT_TURNS_PER_SECOND * ONE_RAW / 60);
    this.#yaw = (this.#yaw + turn * turnRaw) & 0xffff;

    const bytes = new Uint8Array(EMBODIED_COMMAND_BYTES);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, EMBODIED_COMMAND_LAYOUT_VERSION, true);
    view.setUint8(2, EMBODIED_COMMAND_KIND);
    view.setInt32(4, moveX, true);
    view.setInt32(8, moveY, true);
    view.setUint16(12, this.#yaw, true);
    const attacking = this.active && opponent !== null;
    view.setUint8(14, attacking ? 1 : 0);
    view.setUint32(15, attacking ? opponent[0] : 0, true);
    view.setUint32(19, attacking ? opponent[1] : 0, true);
    // Neutral arm placeholders. Session 06 replaces only the primary arm.
    view.setInt32(25, HALF_HEIGHT_RAW, true);
    view.setInt32(39, HALF_HEIGHT_RAW, true);
    return bytes;
  }
}
