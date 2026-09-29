/**
 * **The scaling tables of REPORT.md** from `results/perf-*.json` (Node harness): ms a step by N,
 * the split at 8 humans, allocation and collections, and the headline, the most humans a 3 ms step
 * holds (linear between the two measured N that bracket it; ">" when the largest N measured is
 * under).
 *
 *     node research/physics-bakeoff/summarize-perf.mjs
 */
import { readFileSync } from "node:fs";

const TAGS = ["havok-today", "havok-real-today", "havok", "mujoco", "mujoco-1step", "mujoco-pile", "rapier", "rapier-simd"];
const BUDGET = 3;
const f = (x, d = 2) => (x >= 10 ? x.toFixed(1) : x.toFixed(d));

const data = TAGS.map((tag) => {
  try { return JSON.parse(readFileSync(new URL(`./results/perf-${tag}.json`, import.meta.url), "utf8")); } catch { return null; }
}).filter(Boolean);

function capacity(rows, pick) {
  const pts = rows.map((r) => [r.humans, pick(r)]).sort((a, b) => a[0] - b[0]);
  let prev = null;
  for (const [n, t] of pts) {
    if (t > BUDGET) {
      if (!prev) return "<1";
      const [n0, t0] = prev;
      return (n0 + ((BUDGET - t0) * (n - n0)) / (t - t0)).toFixed(0);
    }
    prev = [n, t];
  }
  return `>${pts.at(-1)[0]}`;
}

for (const kind of ["spaced", "pile"]) {
  const ns = [...new Set(data.flatMap((d) => d.rows.filter((r) => r.kind === kind).map((r) => r.humans)))].sort((a, b) => a - b);
  console.log(`\n### ${kind}: total ms a step, median (p95)\n`);
  console.log(`| setting | ${ns.map((n) => `N=${n}`).join(" | ")} | humans in ${BUDGET} ms (total) | (solver + read) |`);
  console.log(`|---|${ns.map(() => "---").join("|")}|---|---|`);
  for (const d of data) {
    const rows = d.rows.filter((r) => r.kind === kind);
    const cell = (n) => { const r = rows.find((x) => x.humans === n); return r ? `${f(r.total.median)} (${f(r.total.p95)})` : "-"; };
    console.log(`| ${d.tag} | ${ns.map(cell).join(" | ")} | ${capacity(rows, (r) => r.total.median)} | ${capacity(rows, (r) => r.solver.median + r.read.median)} |`);
  }
}

console.log(`\n### the split, ms a step, median (p95), and memory\n`);
console.log("| setting | layout N | solver | read | control | alloc B/step | GCs in timed steps | upright |");
console.log("|---|---|---|---|---|---|---|---|");
for (const d of data) for (const r of d.rows.filter((x) => x.humans === 8 || x.humans === 32)) {
  console.log(`| ${d.tag} | ${r.kind} ${r.humans} | ${f(r.solver.median, 3)} (${f(r.solver.p95, 3)}) | ${f(r.read.median, 3)} (${f(r.read.p95, 3)}) | ${f(r.control.median, 3)} (${f(r.control.p95, 3)}) | ${Number.isNaN(r.allocPerStep) || r.allocPerStep === null ? "n/a" : r.allocPerStep.toFixed(0)} | ${r.gcCount.join("/")} | ${r.upright.join("/")} of ${r.humans} |`);
}
