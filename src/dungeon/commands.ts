import { distance, type Point } from "./map.ts";
import { CAMERA_AZIMUTH, cameraToward } from "./camera.ts";
import type { Command, DrawnRoute } from "../core/command/commands.ts";
import { hypot } from "../core/math/real.ts";

interface ControlMode { keyboard: boolean; facing: boolean }
export const mouseOrdersEnabled = (mode: ControlMode): boolean => !mode.keyboard && !mode.facing;

/** Keys on the screen's axes as a step on the ground, for a camera standing `toward` of the hero: screen up is
 * `-toward`, away from the camera, and screen right is `(-toward.z, toward.x)`. At `CAMERA_AZIMUTH` they are +z and +x. */
export function screenMovement(right: number, up: number, toward: Point = cameraToward(CAMERA_AZIMUTH)): Point {
  const norm = Math.max(1, hypot(right, up));
  return { x: (-right * toward.z - up * toward.x) / norm, z: (right * toward.x - up * toward.z) / norm };
}

/**
 * The left button's commands, with pointer state outside the DOM so cancellation and click/drag
 * arbitration are testable: a click on the floor sends a go to that point, a click on an enemy an
 * attack on it, and a drag a go along the route it draws, which grows as the pointer moves.
 */
export class DungeonCommands {
  mode: ControlMode = { keyboard: false, facing: false };
  cursor: Point | null = null;
  right = 0;
  up = 0;
  /** Whether the member the keys steer walks, not runs: Caps Lock is on. */
  walk = false;
  private press: { screen: Point; ground: Point; target: string | null; dragging: boolean } | null = null;
  /** The route the pointer is drawing; null once it is drawn. */
  private route: DrawnRoute | null = null;
  private readonly send: (command: Command) => void;
  constructor(send: (command: Command) => void) { this.send = send; }
  setMode(mode: ControlMode): void { this.mode = { ...mode }; this.clear(); }
  clear(): void { this.cancelPointer(); this.right = this.up = 0; }
  down(screen: Point, ground: Point, target: string | null): void {
    if (!mouseOrdersEnabled(this.mode)) return;
    this.press = { screen: { ...screen }, ground: { ...ground }, target, dragging: false };
  }
  move(screen: Point, ground: Point | null): void {
    if (ground) this.cursor = { ...ground };
    const press = this.press; if (!press) return;
    if (!press.dragging && distance(screen, press.screen) >= 6) {
      press.dragging = true; this.route = { points: [{ ...press.ground }], drawing: true };
      this.send({ kind: "go", route: this.route });
    }
    const route = this.route;
    if (press.dragging && ground && route && (!route.points.length || distance(route.points[route.points.length - 1], ground) > 0.35)) {
      route.points.push({ ...ground });
    }
  }
  upPointer(): void {
    const press = this.press; this.press = null;
    if (!press) return;
    if (press.dragging) this.finish();
    else this.send(press.target ? { kind: "attack", foe: press.target } : { kind: "go", destination: press.ground });
  }
  cancelPointer(): void { this.press = null; this.finish(); }
  /** The route being drawn is drawn. */
  private finish(): void { if (this.route) this.route.drawing = false; this.route = null; }
}
