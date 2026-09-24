/**
 * The grounded-tone bench: every arm's stroke and parry with its motor ceilings at a share of full.
 *
 *     node research/grounded-tone.mjs [--tones 1,0.6,0.4,0.25]
 *
 * Physical contact session 02 gives every downed body one motor tone, `GROUNDED_TONE` in
 * `src/golem/golem.ts`: a body on the ground still fights, but worse. The session's rule for the
 * value is the lowest share at which a grounded arm still completes a stroke without its anchor stray
 * passing twice its standing figure. This prints, per arm and per tone, the stroke's speed at the
 * mark, its miss, its bearing crossings and its peak anchor stray, and each parry arm's arrival, so
 * the choice and its table are read off one instrument. Node golem bench (`tests/harness/golem-bench.mjs`),
 * one module on the stand; the stand does not lie down, so this is the tone and nothing else.
 */
import { runParryBench, runStrokeBench } from "../tests/harness/golem-bench.mjs";

export const STROKE_ARMS = Object.freeze(["effector.wrist.blade", "effector.wrist.mace", "effector.wrist.fist",
  "effector.wrist.maul", "effector.skeletal.blade", "effector.skeletal.mace", "effector.anatomical.blade"]);
export const PARRY_ARMS = Object.freeze(["effector.wrist.plate", "effector.skeletal.plate", "effector.anatomical.plate"]);

const at = process.argv.indexOf("--tones");
const tones = (at > 0 ? process.argv[at + 1] : "1,0.6,0.4,0.25").split(",").map(Number);

const rows = [];
for (const moduleId of STROKE_ARMS) {
  for (const tone of tones) {
    const r = await runStrokeBench({ moduleId, tone: tone === 1 ? null : tone });
    rows.push({ kind: "stroke", moduleId, tone, speedAtMark: r.speedAtMark, missMetres: r.missMetres,
      crossings: r.sweptCrossings, peakTipSpeed: r.peakTipSpeedDriven, strayMm: r.peakAnchorStrayMm });
  }
}
for (const moduleId of PARRY_ARMS) {
  for (const tone of tones) {
    const r = await runParryBench({ moduleId, tone: tone === 1 ? null : tone });
    rows.push({ kind: "parry", moduleId, tone, arrivedSeconds: r.arrivedSeconds,
      travelMetres: r.travelMetres, overshootMm: r.overshootMm, rippleMm: r.settleRippleMm });
  }
}
const f = (value, digits) => value === null || value === undefined ? "--" : value.toFixed(digits);
console.log("stroke: module | tone | m/s at mark | miss m | swept crossings | peak tip m/s | stray mm | stray / standing");
for (const row of rows.filter((r) => r.kind === "stroke")) {
  const standing = rows.find((r) => r.kind === "stroke" && r.moduleId === row.moduleId && r.tone === 1);
  console.log(`${row.moduleId} | ${row.tone} | ${f(row.speedAtMark, 2)} | ${f(row.missMetres, 3)} | ${row.crossings} | ` +
    `${f(row.peakTipSpeed, 2)} | ${f(row.strayMm, 1)} | ${standing ? f(row.strayMm / standing.strayMm, 2) : "--"}`);
}
console.log("parry: module | tone | arrived s | travel m | overshoot mm | ripple mm");
for (const row of rows.filter((r) => r.kind === "parry")) {
  console.log(`${row.moduleId} | ${row.tone} | ${f(row.arrivedSeconds, 3)} | ${f(row.travelMetres, 3)} | ` +
    `${f(row.overshootMm, 1)} | ${f(row.rippleMm, 1)}`);
}
