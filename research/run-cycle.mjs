/**
 * **A person's run cycle, from a clip**: the angles a leg's hip, knee and ankle go through from one
 * landing of its sole to the next, as a Fourier series in the cycle's phase, written to
 * `assets/core/run-cycle.json` for the run that tracks it (`src/core/skills/locomotion/cycle-run.ts`).
 *
 * Each clip is read as `research/run-feasibility.mjs` reads it (`clipMotion`, `feasibility`: its
 * longest steady stretch, filtered at `--cutoff` Hz, in the plane the run goes in), the Warrior's
 * segments carried on it to say when each sole bears. A leg's phase is 0 as its sole lands and
 * 0.5 as the other's lands, running on evenly between landings; both legs' frames are read as one
 * leg's, the right half a cycle on. Each channel is fitted by least squares with `HARMONICS`
 * harmonics; the angles are anatomical (from the clip's zero pose, as a source's ranges read), hip
 * flexion from the pelvis. Beside them: the clip's speed and leg (hip to knee to ankle), the
 * cycle's period, the phase its sole leaves at, and the pelvis's mean lean forward of its zero
 * pose. Times and speeds are the clip's own; a body of another leg takes them by Froude.
 *
 *   node research/run-cycle.mjs <clip.bvh>[@rate] [...] [--cutoff 8] [--out assets/core/run-cycle.json]
 *
 * The clips are the CMU Graphics Lab's (mocap.cs.cmu.edu) in cgspeed's BVH conversion; they stay
 * outside the repository, and only this table of them is committed.
 */
import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { bodyModel, clipMotion, feasibility } from "./run-feasibility.mjs";
import { modelSpec } from "../src/core/models.ts";

/** The harmonics each channel's series has. */
const HARMONICS = 6;
const CHANNELS = { hip: "hip flexion", knee: "knee flexion", ankle: "ankle dorsiflexion" };
const TAU = 2 * Math.PI;

const basis = (phase) => [1, ...Array.from({ length: HARMONICS }, (_, k) => [Math.cos(TAU * (k + 1) * phase), Math.sin(TAU * (k + 1) * phase)]).flat()];
/** The least-squares series through `samples`, each [phase, angle], by the normal equations. */
function fit(samples) {
  const m = 2 * HARMONICS + 1, A = Array.from({ length: m }, () => new Array(m + 1).fill(0));
  for (const [phase, y] of samples) { const x = basis(phase); for (let i = 0; i < m; i++) { A[i][m] += x[i] * y; for (let j = 0; j < m; j++) A[i][j] += x[i] * x[j]; } }
  for (let i = 0; i < m; i++) {
    let p = i; for (let k = i + 1; k < m; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    [A[i], A[p]] = [A[p], A[i]];
    for (let k = 0; k < m; k++) if (k !== i) { const f = A[k][i] / A[i][i]; for (let j = i; j <= m; j++) A[k][j] -= f * A[i][j]; }
  }
  return A.map((row, i) => row[m] / row[i]);
}
const wrap = (x) => ((x % 1) + 1) % 1;

function cycleOf(file, rate, cutoff, body) {
  const motion = clipMotion(file, rate, cutoff);
  const { rows } = feasibility(motion, body);
  const dt = motion.dt;
  // Each sole's landings, and the left leg's phase at each: 0 at its own, 0.5 at the right's, a turn more each time round.
  const marks = [];
  for (let i = 1; i < rows.length; i++) for (const side of ["left", "right"]) {
    if (!rows[i].bore.includes(side) || rows[i - 1].bore.includes(side)) continue;
    const want = side === "left" ? 0 : 0.5;
    let turns = marks.length ? Math.floor(marks.at(-1).phase) : 0;
    if (marks.length && turns + want <= marks.at(-1).phase) turns += 1;
    marks.push({ i, phase: turns + want });
  }
  if (marks.length < 3) throw new Error(`${basename(file)}: ${marks.length} landings in its steady stretch, fewer than a cycle's`);
  const phaseAt = (i) => {
    let k = 0; while (k + 2 < marks.length && i >= marks[k + 1].i) k++;
    const a = marks[k], b = marks[k + 1];
    return a.phase + (i - a.i) * (b.phase - a.phase) / (b.i - a.i);
  };
  const samples = { hip: [], knee: [], ankle: [] }, leaving = [];
  rows.forEach((row, i) => {
    const phase = phaseAt(i);
    for (const [side, shift] of [["left", 0], ["right", 0.5]]) {
      for (const [key, channel] of Object.entries(CHANNELS)) samples[key].push([wrap(phase - shift), row.legs[side].reading[channel]]);
      if (i > 0 && !row.bore.includes(side) && rows[i - 1].bore.includes(side)) leaving.push(wrap(phase - shift));
    }
  });
  const series = Object.fromEntries(Object.entries(samples).map(([key, s]) => [key, fit(s)]));
  const residual = Object.fromEntries(Object.entries(samples).map(([key, s]) => [key,
    Math.sqrt(s.reduce((sum, [phase, y]) => { const e = basis(phase).reduce((q, x, k) => q + x * series[key][k], 0) - y; return sum + e * e; }, 0) / s.length)]));
  const round = (x) => +x.toFixed(5);
  return {
    clip: basename(file, ".bvh"), leg: round(motion.legLength), speed: round(motion.speed),
    period: round((marks.at(-1).i - marks[0].i) * dt / (marks.at(-1).phase - marks[0].phase)),
    leaves: round(leaving.reduce((a, b) => a + b, 0) / leaving.length), lean: round(-rows.reduce((a, r) => a + r.trunk, 0) / rows.length),
    residual: Object.fromEntries(Object.entries(residual).map(([k, v]) => [k, +v.toFixed(3)])),
    ...Object.fromEntries(Object.entries(series).map(([k, v]) => [k, v.map(round)])),
  };
}

const { values: options, positionals } = parseArgs({ allowPositionals: true, options: {
  cutoff: { type: "string", default: "8" }, out: { type: "string", default: "assets/core/run-cycle.json" },
} });
if (!positionals.length) throw new Error("usage: node research/run-cycle.mjs <clip.bvh>[@rate] [...] [--cutoff hz] [--out file]");
const body = bodyModel(modelSpec("workshop-fighter"));
const cycles = positionals.map((arg) => { const [file, rate] = arg.split("@"); return cycleOf(file, rate ? Number(rate) : undefined, Number(options.cutoff), body); })
  .sort((a, b) => a.speed / Math.sqrt(a.leg) - b.speed / Math.sqrt(b.leg));
for (const c of cycles) console.log(`${c.clip}: ${c.speed} m/s on a ${c.leg} m leg, a cycle of ${c.period} s, the sole leaving at ${c.leaves}, leaning ${c.lean}; residual ${JSON.stringify(c.residual)}`);
writeFileSync(options.out, JSON.stringify({
  harness: `research/run-cycle.mjs: CMU clips in cgspeed's BVH, filtered at ${options.cutoff} Hz, read in the plane; the Warrior's segments carried on each to say when a sole bears`,
  harmonics: HARMONICS, cycles,
}, null, 1) + "\n");
