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

import type { FightHeader, FightSource } from "./source.js";
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

function tipOf(source: FightSource, frame: number, body: number): readonly [number, number, number] | null {
  const pose = source.frameAt(frame).poses.find((p) => p.id[0] === body);
  if (pose === undefined) return null;
  for (const weapon of pose.weapons) {
    if (weapon !== null) return weapon.tip;
  }
  return null;
}

/** The same arrays, still being written to as a streamed fight grows. */
interface GrowingSeries {
  readonly tipSpeed: number[][];
  readonly energy: number[];
  readonly loudest: number[];
  readonly wounding: boolean[];
  peakSpeed: number;
  peakEnergy: number;
}

// **The one function here that is handed the whole source rather than the
// header.** Two rates over every frame of the fight cannot be built from one
// frame, so widening this is not an abstraction leak -- it is what the series is.
// Everything downstream then works off the series and never reaches back.
//
// **Extended in place rather than rebuilt, and that is a cost and not a taste.**
// A streamed fight delivers 121 chunks and every one of them adds frames to
// plot. Rebuilding from frame 0 each time is quadratic -- about 1.7 million
// `frameAt` calls over one 3,600-tick duel, against 14,400 done once -- and the
// page would spend more time drawing the chart than the worker spends producing
// the fight. So the series is a growing object and `buildSeries` appends to the
// one it is given.
export function buildSeries(source: FightSource, previous?: Series): Series {
  const count = source.frameCount();
  const series: GrowingSeries = previous === undefined
    ? {
      tipSpeed: source.header.bodies.map(() => []),
      energy: [], loudest: [], wounding: [], peakSpeed: 0, peakEnergy: 0,
    }
    // The arrays behind a `Series` are the ones this function wrote, so the cast
    // is over its own output rather than over a caller's. A `Series` handed in
    // from anywhere else would be a claim this cannot check -- and there is
    // nowhere else, because nothing but this function constructs one.
    : (previous as unknown as GrowingSeries);
  const { tipSpeed, energy, loudest, wounding } = series;
  const from = energy.length;
  for (let b = 0; b < tipSpeed.length; b += 1) at(tipSpeed, b).length = count;
  energy.length = count;
  loudest.length = count;
  wounding.length = count;
  let peakSpeed = series.peakSpeed;
  let peakEnergy = series.peakEnergy;

  for (let f = from; f < count; f += 1) {
    for (let b = 0; b < source.header.bodies.length; b += 1) {
      const now = tipOf(source, f, b);
      const before = f > 0 ? tipOf(source, f - 1, b) : null;
      // A tip that has just appeared or just gone has no speed, as against a
      // speed of zero: a severed arm is not a still one.
      const speed = now !== null && before !== null ? length(sub(now, before)) : 0;
      at(tipSpeed, b)[f] = speed;
      peakSpeed = Math.max(peakSpeed, speed);
    }
    let peak = 0;
    let kind = -1;
    let wounded = false;
    for (const contact of source.frameAt(f).contacts) {
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

  series.peakSpeed = peakSpeed;
  series.peakEnergy = peakEnergy;
  return series;
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

/**
 * How many frames a series spans.
 *
 * The series has one entry a frame and it is the thing being plotted, so it is
 * its own extent. Reading the count off the header instead would make the chart
 * depend on a field a growing live recording has to keep rewriting, and the
 * failure mode of that disagreement is an axis that is silently the wrong width.
 */
function span(series: Series): number {
  return series.energy.length;
}

export function drawChart(
  ctx: CanvasRenderingContext2D, fight: FightHeader, series: Series, current: number,
  width: number, height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0b0f14";
  ctx.fillRect(0, 0, width, height);

  const count = span(series);
  const x = (frame: number): number => (frame / Math.max(1, count - 1)) * width;
  const gap = 8;
  // Both bands are scaled to hold their own threshold even when nothing in the
  // fight comes near it. A band auto-scaled to the data alone would put the
  // reference line off the top of the panel and quietly flatter the physics.
  const speed: Band = {
    top: 0, height: (height - gap) / 2,
    max: Math.max(series.peakSpeed, fight.impactThreshold) * 1.15,
  };
  const energy: Band = {
    top: (height - gap) / 2 + gap, height: (height - gap) / 2,
    max: Math.max(series.peakEnergy, fight.contactEnergyFloor) * 1.15,
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
  const thresholdY = bandY(speed, fight.impactThreshold);
  ctx.beginPath();
  ctx.moveTo(0, thresholdY);
  ctx.lineTo(width, thresholdY);
  ctx.stroke();
  const floorY = bandY(energy, fight.contactEnergyFloor);
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

/**
 * The frame index nearest a click, for scrubbing on the chart itself.
 *
 * Off the same `span` the chart drew, so the click cannot land on a different
 * axis from the one under the pointer.
 */
export function frameAt(series: Series, canvas: HTMLCanvasElement, clientX: number): number {
  const bounds = canvas.getBoundingClientRect();
  const fraction = (clientX - bounds.left) / Math.max(1, bounds.width);
  const index = Math.round(fraction * (span(series) - 1));
  return Math.min(span(series) - 1, Math.max(0, index));
}
