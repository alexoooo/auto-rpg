import { NEUTRAL, type Intent } from "../mind.ts";
import { distance, type Point } from "./map.ts";
import { CAMERA_AZIMUTH, cameraToward } from "./camera.ts";

export interface ControlMode { keyboard: boolean; facing: boolean }
export type Order = { kind: "idle" } | { kind: "attack-move"; destination: Point }
  | { kind: "lock"; target: string } | { kind: "force"; points: Point[]; drawing: boolean };
export const mouseOrdersEnabled = (mode: ControlMode): boolean => !mode.keyboard && !mode.facing;
export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
export const neutralIntent = (): Intent => ({ ...NEUTRAL, primary: { ...NEUTRAL.primary }, secondary: { ...NEUTRAL.secondary },
  natural: { ...NEUTRAL.natural }, posture: { ...NEUTRAL.posture } });

/** Keys on the screen's axes as a step on the ground, for a camera standing `toward` of the hero: screen up is
 * `-toward`, away from the camera, and screen right is `(-toward.z, toward.x)`. At `CAMERA_AZIMUTH` they are +z and +x. */
export function screenMovement(right: number, up: number, toward: Point = cameraToward(CAMERA_AZIMUTH)): Point {
  const norm = Math.max(1, Math.hypot(right, up));
  return { x: (-right * toward.z - up * toward.x) / norm, z: (right * toward.x - up * toward.z) / norm };
}

export function composeIntent(base: Intent, facing: number, move: Point | null, look: Point | null): Intent {
  const result = { ...base, primary: { ...base.primary }, secondary: { ...base.secondary },
    natural: { ...base.natural }, posture: { ...base.posture } };
  if (move) {
    result.forward = Math.max(-1, Math.min(1, move.x * Math.sin(facing) + move.z * Math.cos(facing)));
    result.strafe = Math.max(-1, Math.min(1, move.x * Math.cos(facing) - move.z * Math.sin(facing)));
  }
  if (look && Math.hypot(look.x, look.z) > 0.08)
    result.turn = Math.max(-1, Math.min(1, wrapAngle(Math.atan2(look.x, look.z) - facing) * 2));
  return result;
}

/** Pointer state lives outside the DOM so cancellation and click/drag arbitration are testable. */
export class DungeonCommands {
  mode: ControlMode = { keyboard: false, facing: false };
  order: Order = { kind: "idle" };
  cursor: Point | null = null;
  right = 0;
  up = 0;
  revision = 0;
  private press: { screen: Point; ground: Point; target: string | null; dragging: boolean } | null = null;
  setMode(mode: ControlMode): void { this.mode = { ...mode }; this.clear(); }
  clear(): void { this.order = { kind: "idle" }; this.press = null; this.right = this.up = 0; this.revision++; }
  down(screen: Point, ground: Point, target: string | null): void {
    if (!mouseOrdersEnabled(this.mode)) return;
    this.press = { screen: { ...screen }, ground: { ...ground }, target, dragging: false };
  }
  move(screen: Point, ground: Point | null): void {
    if (ground) this.cursor = { ...ground };
    const press = this.press; if (!press) return;
    if (!press.dragging && distance(screen, press.screen) >= 6) {
      press.dragging = true; this.order = { kind: "force", points: [{ ...press.ground }], drawing: true }; this.revision++;
    }
    if (press.dragging && ground && this.order.kind === "force" &&
      (!this.order.points.length || distance(this.order.points[this.order.points.length - 1], ground) > 0.35)) {
      this.order.points.push({ ...ground });
    }
  }
  upPointer(): void {
    const press = this.press; this.press = null;
    if (!press) return;
    if (press.dragging) { if (this.order.kind === "force") this.order.drawing = false; }
    else { this.order = press.target ? { kind: "lock", target: press.target } : { kind: "attack-move", destination: press.ground }; this.revision++; }
  }
  cancelPointer(): void { this.press = null; if (this.order.kind === "force") this.order.drawing = false; }
}
