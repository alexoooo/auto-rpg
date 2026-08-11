// The fight as two time series, because the two numbers that closed v2-17 are
// both rates and neither is visible in a single frame.
//
// The top band is how fast each blade tip is travelling, against
// `IMPACT_THRESHOLD`. The bottom band is the energy each tick's loudest contact
// was allocated, against `CONTACT_ENERGY_FLOOR`, which `channels()` deducts from
// exactly that allocation before a wound can be paid for. A fight that spends
// its whole length under both lines is the finding, drawn.
//
// **The lower band plots `share` and not the group ledger, and the difference
// is the whole panel.** `groupBefore` is the kinetic energy of every collider in
// a time-of-impact group, bodies included, copied into each of that group's
// rows; the floor is never charged against it. Plotting it here read 578 of this
// corpus's 2167 contacts as clearing the floor. The honest count, on the
// per-contact share the floor actually comes out of, is 9. One of those two
// pictures argues against the finding this page was built to show, and it is the
// one that was drawn until 2026-08-10.
//
// Both thresholds come out of the trace header, which reads them out of the Rust
// that owns them. Neither number is written down on this side.
//
// One disclosed inexactness, in the upper band. `IMPACT_THRESHOLD` is tested in
// `crates/sim/src/hand.rs` against a hand's tip speed **relative to its body**,
// and what is plotted is the published tip differenced in world space, so a
// walking fighter's feet are included. Measured on seed 3: 1234 of 7200
// body-frames cross the line as drawn against 1164 on the body-relative
// quantity, so about 6% of the crossings are the legs. The peak is unaffected --
// that body was standing still. The bar is a legacy-model bar either way, which
// `trace.rs` says at more length.

import type { Trace } from "./trace.js";
import { at, length, share, sub } from "./trace.js";
import { bodyColours, contactColour } from "./view.js";

export interface Series {
  /** Per body index, per frame: how far the blade tip moved in that tick, raw. */
  readonly tipSpeed: readonly (readonly number[])[];
  /** Per frame: the largest share of dissipated energy any one contact was
   *  allocated. The quantity `CONTACT_ENERGY_FLOOR` is deducted from. */
  readonly energy: readonly number[];
  /** Per frame: the kind of the loudest contact, or -1 for a quiet tick. */
  readonly loudest: readonly number[];
  /** Frames on which some contact billed cut or thrust. */
  readonly wounding: readonly boolean[];
  readonly peakSpeed: number;
  readonly peakEnergy: number;
}

function tipOf(trace: Trace, frame: number, body: number): readonly [number, number, number] | null {
  const pose = at(trace.frames, frame).poses.find((p) => p.id[0] === body);
  if (pose === undefined) return null;
  for (const weapon of pose.weapons) {
    if (weapon !== null) return weapon.tip;
  }
  return null;
}

export function buildSeries(trace: Trace): Series {
  const count = trace.frames.length;
  const tipSpeed = trace.bodies.map(() => new Array<number>(count).fill(0));
  const energy = new Array<number>(count).fill(0);
  const loudest = new Array<number>(count).fill(-1);
  const wounding = new Array<boolean>(count).fill(false);
  let peakSpeed = 0;
  let peakEnergy = 0;

  for (let f = 0; f < count; f += 1) {
    for (let b = 0; b < trace.bodies.length; b += 1) {
      const now = tipOf(trace, f, b);
      const before = f > 0 ? tipOf(trace, f - 1, b) : null;
      // A tip that has just appeared or just gone has no speed, as against a
      // speed of zero: a severed arm is not a still one.
      const speed = now !== null && before !== null ? length(sub(now, before)) : 0;
      at(tipSpeed, b)[f] = speed;
      peakSpeed = Math.max(peakSpeed, speed);
    }
    let peak = 0;
    let kind = -1;
    let wounded = false;
    for (const contact of at(trace.frames, f).contacts) {
      if (share(contact) > peak) {
        peak = share(contact);
        kind = contact.kind;
      }
      if (contact.cut + contact.thrust > 0) wounded = true;
    }
    energy[f] = peak;
    loudest[f] = kind;
    wounding[f] = wounded;
    peakEnergy = Math.max(peakEnergy, peak);
  }

  return { tipSpeed, energy, loudest, wounding, peakSpeed, peakEnergy };
}

interface Band {
  readonly top: number;
  readonly height: number;
  readonly max: number;
}

function bandY(band: Band, value: number): number {
  return band.top + band.height - (value / band.max) * band.height;
}

function label(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, colour: string): void {
  ctx.fillStyle = colour;
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText(text, x, y);
}

export function drawChart(
  ctx: CanvasRenderingContext2D, trace: Trace, series: Series, current: number,
  width: number, height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0b0f14";
  ctx.fillRect(0, 0, width, height);

  const count = trace.frames.length;
  const x = (frame: number): number => (frame / Math.max(1, count - 1)) * width;
  const gap = 8;
  // Both bands are scaled to hold their own threshold even when nothing in the
  // fight comes near it. A band auto-scaled to the data alone would put the
  // reference line off the top of the panel and quietly flatter the physics.
  const speed: Band = {
    top: 0, height: (height - gap) / 2,
    max: Math.max(series.peakSpeed, trace.impactThreshold) * 1.15,
  };
  const energy: Band = {
    top: (height - gap) / 2 + gap, height: (height - gap) / 2,
    max: Math.max(series.peakEnergy, trace.contactEnergyFloor) * 1.15,
  };

  for (const band of [speed, energy]) {
    ctx.fillStyle = "#0e141b";
    ctx.fillRect(0, band.top, width, band.height);
  }

  // The two reference lines.
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#ff9d9d";
  ctx.lineWidth = 1;
  const thresholdY = bandY(speed, trace.impactThreshold);
  ctx.beginPath();
  ctx.moveTo(0, thresholdY);
  ctx.lineTo(width, thresholdY);
  ctx.stroke();
  const floorY = bandY(energy, trace.contactEnergyFloor);
  ctx.beginPath();
  ctx.moveTo(0, floorY);
  ctx.lineTo(width, floorY);
  ctx.stroke();
  ctx.restore();
  label(ctx, 4, thresholdY - 3, "IMPACT_THRESHOLD", "#ff9d9d");
  label(ctx, 4, floorY - 3, "CONTACT_ENERGY_FLOOR", "#ff9d9d");
  label(ctx, 4, speed.top + 12, "blade tip travel per tick (world, feet included)", "#6f8296");
  label(ctx, 4, energy.top + 12, "energy allocated to the loudest contact", "#6f8296");

  series.tipSpeed.forEach((samples, body) => {
    ctx.strokeStyle = bodyColours(body).edge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    samples.forEach((value, frame) => {
      const px = x(frame);
      const py = bandY(speed, value);
      if (frame === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  });

  // Contacts are events, not a curve: one stem each, coloured by kind, so a
  // fight with two thousand of them still shows where they clustered.
  for (let frame = 0; frame < count; frame += 1) {
    const value = at(series.energy, frame);
    if (value === 0) continue;
    ctx.strokeStyle = contactColour(at(series.loudest, frame));
    ctx.globalAlpha = at(series.wounding, frame) ? 1 : 0.45;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x(frame), energy.top + energy.height);
    ctx.lineTo(x(frame), bandY(energy, value));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "#e8edf3";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x(current), 0);
  ctx.lineTo(x(current), height);
  ctx.stroke();
}

/** The frame index nearest a click, for scrubbing on the chart itself. */
export function frameAt(trace: Trace, canvas: HTMLCanvasElement, clientX: number): number {
  const bounds = canvas.getBoundingClientRect();
  const fraction = (clientX - bounds.left) / Math.max(1, bounds.width);
  const index = Math.round(fraction * (trace.frames.length - 1));
  return Math.min(trace.frames.length - 1, Math.max(0, index));
}
