/**
 * Reads results/fidelity-*.json and prints, per engine, every setting with both cases' verdicts,
 * the settings that pass both cases at each bar, sorted by case A's cost a step (a first guess at
 * cost; `perf.mjs` ranks the candidates on the scaling scene).
 *
 *     node research/physics-bakeoff/summarize-fidelity.mjs [engine ...] [--all]
 */
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const all = args.includes("--all");
const engines = args.filter((a) => !a.startsWith("--"));
const fmt = (x, p = 3) => (typeof x === "number" ? (Math.abs(x) >= 1000 ? x.toFixed(0) : +x.toPrecision(p)) : String(x));
const key = (s) => Object.entries(s).filter(([k]) => k !== "hz").map(([k, v]) => `${k}=${v}`).join(" ");

for (const engine of engines.length ? engines : ["havok", "mujoco", "rapier", "rapier-simd"]) {
  let data;
  try { data = JSON.parse(await readFile(new URL(`./results/fidelity-${engine}.json`, import.meta.url), "utf8")); } catch { continue; }
  const bySetting = new Map();
  for (const r of data.rows) {
    const k = key(r.settings);
    if (!bySetting.has(k)) bySetting.set(k, { settings: r.settings, A: [], B: null });
    if (r.kind === "A") bySetting.get(k).A.push(r); else bySetting.get(k).B = r;
  }
  console.log(`\n## ${engine} (init ${fmt(data.initMs)} ms)`);
  if (all) {
    console.log("setting | cond | A standing spin tilt drift ms | B hand wrist dev ring ms | today clean");
    for (const [k, v] of bySetting) for (const a of v.A) {
      const b = v.B ?? {};
      console.log(`${k} | x${a.cond} | ${a.error ? `ERROR ${a.error}` : `${a.standing ? "up" : "FELL"} ${fmt(a.footSpinRms)} ${fmt(a.footTiltMaxLate)} ${fmt(a.comDrift)} ${fmt(a.msPerStep)}`} | ${b.error ? `ERROR ${b.error}` : `${fmt(b.handJitterRms)} ${fmt(b.wristJitterRms)} ${fmt(b.deviation)} ${fmt(b.ringRms)} ${fmt(b.msPerStep)}`} | ${a.today && b.today ? "T" : "-"}${a.clean && b.clean ? "C" : "-"}`);
    }
  }
  for (const bar of ["today", "clean"]) {
    const pass = [];
    for (const [k, v] of bySetting) for (const a of v.A) if (a[bar] && v.B?.[bar]) pass.push({ k, a, b: v.B });
    pass.sort((x, y) => x.a.msPerStep - y.a.msPerStep);
    console.log(`${bar}: ${pass.length} passing of ${[...bySetting.values()].reduce((n, v) => n + v.A.length, 0)}`);
    for (const p of pass.slice(0, 8)) console.log(`  ${p.k} x${p.a.cond}: A spin ${fmt(p.a.footSpinRms)} tilt ${fmt(p.a.footTiltMaxLate)} drift ${fmt(p.a.comDrift)} (${fmt(p.a.msPerStep)} ms) | B hand ${fmt(p.b.handJitterRms)} wrist ${fmt(p.b.wristJitterRms)} dev ${fmt(p.b.deviation)} ring ${fmt(p.b.ringRms)} (${fmt(p.b.msPerStep)} ms)`);
  }
  // Each case alone at the cheapest few passing settings, for the record.
  for (const kind of ["A", "B"]) for (const bar of ["today", "clean"]) {
    const rows = data.rows.filter((r) => r.kind === kind && r[bar]).sort((x, y) => x.msPerStep - y.msPerStep);
    console.log(`case ${kind} alone, ${bar}: ${rows.length} pass; cheapest: ${rows.slice(0, 3).map((r) => `${key(r.settings)}${r.cond ? ` x${r.cond}` : ""} (${fmt(r.msPerStep)} ms)`).join("; ") || "none"}`);
  }
}
