import { NEUTRAL, type Intent } from "../mind.ts";
import type { Orders } from "../orders.ts";
import { distance, type Point } from "./map.ts";

export interface ControlMode { keyboard: boolean; facing: boolean }
export type Order = { kind: "idle" } | { kind: "attack-move"; destination: Point }
  | { kind: "lock"; target: string } | { kind: "force"; points: Point[]; drawing: boolean };
export const mouseOrdersEnabled = (mode: ControlMode): boolean => !mode.keyboard && !mode.facing;

/**
 * A dungeon order in the arena's vocabulary (`Orders` in `src/orders.ts`). A lock fights a body; the
 * dungeon's attack-move is the arena's too, a point to fight toward; a drawn route is a destination
 * that ignores who is in the way, named by its last point. The dungeon walks each by its own path
 * finder rather than by `OrderFollower`, whose straight line would walk into a wall.
 */
export function asOrders(order: Order): Orders | null {
  switch (order.kind) {
    case "idle": return null;
    case "lock": return { target: order.target, destination: null };
    case "attack-move": return { target: { x: order.destination.x, z: order.destination.z }, destination: null };
    case "force": {
      const last = order.points[order.points.length - 1];
      return last ? { target: null, destination: { x: last.x, z: last.z } } : null;
    }
    default: { const unknown: never = order; throw new Error(`No orders for ${JSON.stringify(unknown)}`); }
  }
}

/** One line for a party member's row: what it was told, read through `asOrders`, or what it does untold. */
export function orderLabel(order: Order, post: Point | null, hero: boolean): string {
  const orders = asOrders(order);
  if (orders === null) return post ? "holding" : hero ? "standing" : "with you";
  if (typeof orders.target === "string") return "fighting";
  return orders.target ? "attack-moving" : "force-moving";
}
export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
export const neutralIntent = (): Intent => ({ ...NEUTRAL, primary: { ...NEUTRAL.primary }, secondary: { ...NEUTRAL.secondary },
  natural: { ...NEUTRAL.natural }, posture: { ...NEUTRAL.posture } });

/** The camera's ground right/up vectors: eye is in the positive X/Z diagonal. */
export function screenMovement(right: number, up: number): Point {
  const norm = Math.max(1, Math.hypot(right, up));
  return { x: (-right - up) / Math.SQRT2 / norm, z: (right - up) / Math.SQRT2 / norm };
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
