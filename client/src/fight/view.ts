// Two orthographic projections of one articulated fight.
//
// **Two flat views rather than one perspective one, on purpose.** The questions
// this page was built to answer are geometric and specific -- does the blade
// ever move, does a MID shield cover a HIGH club, does an arm reach further than
// its own length -- and a perspective camera makes every one of them a matter of
// opinion. A plan and an elevation share a scale, so a length on one is the same
// length on the other, and a gap you can see is a gap that is there.
//
// Nothing here computes where anything is. Every capsule, segment and face comes
// out of the trace exactly as `sim` published it; the only arithmetic is world
// raw units to pixels.

import type { FightFrame, FightHeader } from "./source.js";
import type { Contact, Pose, V3 } from "./trace.js";
import { at, add, scale, share, shieldCorners } from "./trace.js";

export type ViewKind = "plan" | "elevation";

export interface Camera {
  readonly kind: ViewKind;
  /** The panel in CSS pixels. The backing store may be denser; the transform
   *  set by the caller absorbs that, so nothing in here knows about it. */
  readonly width: number;
  readonly height: number;
  /** A raw world point, projected to canvas pixels. */
  point(v: V3): readonly [number, number];
  /** A raw world length, in pixels. Uniform: both axes share it. */
  px(raw: number): number;
  /** Depth away from the viewer, for back-to-front ordering. */
  depth(v: V3): number;
}

export interface Options {
  readonly showRegions: boolean;
  readonly showTargets: boolean;
  readonly showVelocity: boolean;
  readonly showContacts: boolean;
}

const ONE = 65536;

/** Hero first, monster second; everything else is chrome. */
const BODY_COLOURS = [
  { region: "#3d6ea8", edge: "#7fb6f5", weapon: "#d8ecff", shield: "#f0b95a", target: "#4e7fb8" },
  { region: "#a8503d", edge: "#f59a7f", weapon: "#ffe0d8", shield: "#f0b95a", target: "#b8674e" },
] as const;

const KIND_COLOURS = ["#ffe066", "#8ad4ff", "#ff5c7a"] as const;

export function bodyColours(index: number): (typeof BODY_COLOURS)[number] {
  return at(BODY_COLOURS, index % BODY_COLOURS.length);
}

export function contactColour(kind: number): string {
  return KIND_COLOURS[kind] ?? "#ffffff";
}

/**
 * A true bird's eye: `x` to the right and **`y` up**, centred with a fixed span.
 *
 * **The y flip is load-bearing and it disagrees with the legacy Canvas page on
 * purpose.** `web/main.js` draws the world through a bare `ctx.translate`, so
 * `+y` runs down its screen; a diagnostic that copied that would be a mirror of
 * the world the simulation describes. `actuator::shoulder` puts
 * `LimbSlot::LeftArm` at `(-sin yaw, cos yaw) * half_width` -- the +90 degree
 * side, which is a body's anatomical left only under a right-handed frame with
 * `y` up. Drawn `y` down, a Fighter facing screen-right holds its shield below
 * itself, every reader takes that for the right hand, and every swing's sense of
 * rotation is backwards. That is a page that cannot be used to judge a guard.
 * The elevation beside it is right-handed already, so this also stops the two
 * panels disagreeing about which way the world turns.
 *
 * Fixed rather than fitted to the frame: a camera that reframed itself around
 * whatever the bodies were doing would change the scale under a measurement, and
 * the whole point of a shared scale is that the eye can trust it across ticks.
 */
export function planCamera(
  width: number, height: number, centre: V3, spanRaw: number,
): Camera {
  const s = width / spanRaw;
  return {
    kind: "plan",
    width,
    height,
    point: (v) => [width / 2 + (v[0] - centre[0]) * s, height / 2 - (v[1] - centre[1]) * s],
    px: (raw) => raw * s,
    // Higher z is nearer the eye looking down.
    depth: (v) => -v[2],
  };
}

/**
 * A side elevation along a chosen azimuth, `z` up and the floor a real line.
 *
 * The azimuth is a control rather than a derived quantity because the useful one
 * changes with the question: along the line between the two bodies to read a
 * reach, across it to read a swing arc.
 */
export function elevationCamera(
  width: number, height: number, centre: V3, spanRaw: number, azimuth: number,
): Camera {
  const s = width / spanRaw;
  const ux = Math.cos(azimuth);
  const uy = Math.sin(azimuth);
  const along = (v: V3): number => v[0] * ux + v[1] * uy;
  const centreAlong = along(centre);
  // The floor sits low in the panel: a body is about two units tall and almost
  // everything interesting happens above it.
  const ground = height * 0.86;
  return {
    kind: "elevation",
    width,
    height,
    point: (v) => [width / 2 + (along(v) - centreAlong) * s, ground - v[2] * s],
    px: (raw) => raw * s,
    depth: (v) => v[0] * -uy + v[1] * ux,
  };
}

function capsule(
  ctx: CanvasRenderingContext2D, cam: Camera,
  a: V3, b: V3, radiusRaw: number, stroke: string, alpha: number,
): void {
  const p = cam.point(a);
  const q = cam.point(b);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.5, cam.px(radiusRaw) * 2);
  ctx.strokeStyle = stroke;
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  ctx.lineTo(q[0], q[1]);
  ctx.stroke();
  ctx.restore();
}

function line(
  ctx: CanvasRenderingContext2D, cam: Camera,
  a: V3, b: V3, stroke: string, width: number, dash: readonly number[],
): void {
  const p = cam.point(a);
  const q = cam.point(b);
  ctx.save();
  ctx.setLineDash([...dash]);
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  ctx.lineTo(q[0], q[1]);
  ctx.stroke();
  ctx.restore();
}

function dot(
  ctx: CanvasRenderingContext2D, cam: Camera, v: V3, radius: number, fill: string,
): void {
  const p = cam.point(v);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(p[0], p[1], radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawChrome(ctx: CanvasRenderingContext2D, cam: Camera, fight: FightHeader): void {
  const width = cam.width;
  const height = cam.height;
  ctx.save();
  ctx.strokeStyle = "#1e2733";
  ctx.lineWidth = 1;
  // One line per world unit, which is the only ruler this page offers and the
  // reason it is here: "the club cleared the shield" is a claim about a distance.
  const stepPx = cam.px(ONE);
  if (stepPx > 6) {
    if (cam.kind === "plan") {
      const originX = cam.point([0, 0, 0])[0];
      const originY = cam.point([0, 0, 0])[1];
      for (let x = originX % stepPx; x < width; x += stepPx) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = originY % stepPx; y < height; y += stepPx) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      // Negative height because the plan runs `y` up: the arena's far corner is
      // at a smaller screen `y` than its origin.
      ctx.strokeStyle = "#31415a";
      ctx.strokeRect(
        cam.point([0, 0, 0])[0], cam.point([0, 0, 0])[1],
        cam.px(fight.arena[0]), -cam.px(fight.arena[1]),
      );
    } else {
      for (let z = 0; z <= 3 * ONE; z += ONE) {
        const y = cam.point([0, 0, z])[1];
        ctx.strokeStyle = z === 0 ? "#3d5570" : "#1e2733";
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawPose(
  ctx: CanvasRenderingContext2D, cam: Camera, pose: Pose, options: Options,
): void {
  const colours = bodyColours(pose.id[0]);

  if (options.showRegions) {
    for (const region of pose.regions) {
      if (!region.present) continue;
      capsule(ctx, cam, region.lower, region.upper, region.radius, colours.region, 0.55);
    }
    // The edges last and thin, so two overlapping bodies stay two bodies.
    for (const region of pose.regions) {
      if (!region.present) continue;
      const p = cam.point(region.lower);
      const q = cam.point(region.upper);
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.lineCap = "round";
      ctx.lineWidth = 1;
      ctx.strokeStyle = colours.edge;
      ctx.beginPath();
      ctx.arc(p[0], p[1], Math.max(1.5, cam.px(region.radius)), 0, Math.PI * 2);
      ctx.stroke();
      if (p[0] !== q[0] || p[1] !== q[1]) {
        ctx.beginPath();
        ctx.arc(q[0], q[1], Math.max(1.5, cam.px(region.radius)), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Where the torso is pointing. The body yaw is the only rotation this model
  // has -- there is no pitch and no roll -- so a facing tick is the whole of it.
  const yaw = (pose.yaw / 65536) * Math.PI * 2;
  const nose: V3 = [
    pose.body[0] + Math.cos(yaw) * ONE * 0.9,
    pose.body[1] + Math.sin(yaw) * ONE * 0.9,
    pose.body[2] + ONE * 1.4,
  ];
  line(ctx, cam, [pose.body[0], pose.body[1], pose.body[2] + ONE * 1.4], nose, colours.edge, 1, [3, 3]);

  if (pose.shield !== null) {
    const corners = shieldCorners(pose.shield);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = colours.shield;
    ctx.strokeStyle = colours.shield;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    corners.forEach((corner, n) => {
      const p = cam.point(corner);
      if (n === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.restore();
    // Centre and normal, so the rebuilt rectangle can be seen to sit on the
    // published pose rather than merely believed to.
    dot(ctx, cam, pose.shield.centre, 2, colours.shield);
    line(ctx, cam, pose.shield.centre,
      add(pose.shield.centre, scale(pose.shield.normal, 0.45)), colours.shield, 1, []);
  }

  for (const weapon of pose.weapons) {
    if (weapon === null) continue;
    capsule(ctx, cam, weapon.hilt, weapon.tip, weapon.radius, colours.weapon, 0.95);
    dot(ctx, cam, weapon.tip, 2.5, colours.weapon);
  }

  if (options.showTargets) {
    pose.arms.forEach((arm) => {
      line(ctx, cam, arm.hand, arm.target, colours.target, 1, [2, 4]);
      const p = cam.point(arm.target);
      ctx.save();
      ctx.strokeStyle = colours.target;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 3.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  if (options.showVelocity) {
    // Thirty ticks of travel at the current rate. Half a second of intent,
    // which is long enough to see and short enough to stay on the panel.
    const AHEAD = 30;
    line(ctx, cam, pose.body, add(pose.body, scale(pose.vel, AHEAD)), "#9fe6a0", 1.5, []);
    pose.arms.forEach((arm) => {
      const absolute = add(pose.vel, arm.vel);
      line(ctx, cam, arm.hand, add(arm.hand, scale(absolute, AHEAD)), "#9fe6a0", 1.5, []);
    });
  }
}

function drawContact(
  ctx: CanvasRenderingContext2D, cam: Camera, fight: FightHeader, contact: Contact,
): void {
  const p = cam.point(contact.point);
  const colour = contactColour(contact.kind);
  // Size by the share this fact was allocated against the floor deducted from
  // exactly that share, so a contact that could never have paid for a wound
  // reads as the pinprick it is. Sized by the group ledger instead -- as it was
  // until 2026-08-10 -- the largest ring the function can draw went to a group
  // that dissipated nothing at all, and 23 such rings out-drew every wounding
  // contact in the fight.
  const over = share(contact) / Math.max(1, fight.contactEnergyFloor);
  const radius = 4 + Math.min(16, Math.log2(1 + over) * 3);
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = contact.cut + contact.thrust > 0 ? 2.5 : 1;
  ctx.beginPath();
  ctx.arc(p[0], p[1], radius, 0, Math.PI * 2);
  ctx.stroke();
  if (contact.severed) {
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p[0], p[1], radius + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  line(ctx, cam, contact.point, add(contact.point, scale(contact.normal, 0.4)), colour, 1, []);
}

// The header and one frame, never the whole fight: a view that could reach the
// frames could reach the *next* frame, and a panel that drew ahead of the tick
// the transport is parked on would be a picture that lies about the clock.
export function drawScene(
  ctx: CanvasRenderingContext2D, cam: Camera, fight: FightHeader, frame: FightFrame,
  options: Options,
): void {
  ctx.clearRect(0, 0, cam.width, cam.height);
  ctx.fillStyle = "#0b0f14";
  ctx.fillRect(0, 0, cam.width, cam.height);
  drawChrome(ctx, cam, fight);

  // Back to front, so an elevation of two bodies at different distances reads
  // as two bodies rather than as one interpenetrating tangle.
  const ordered = [...frame.poses].sort((a, b) => cam.depth(b.body) - cam.depth(a.body));
  for (const pose of ordered) {
    drawPose(ctx, cam, pose, options);
  }
  if (options.showContacts) {
    for (const contact of frame.contacts) {
      drawContact(ctx, cam, fight, contact);
    }
  }
}
