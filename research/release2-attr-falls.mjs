/**
 * Release 2's question 13(a): what stability and recovery do to falls, read from a finished
 * `research/headroom.mjs --exp attributes` run. For each cell: bouts, A's share (draws a half), and
 * each side's falls a minute and share of the bout spent down, from the rows' own `sides`. A is the
 * attributed body; B is the x1 body.
 *
 *     node research/release2-attr-falls.mjs <run directory> [...]
 *
 * Harness: whatever the run's was -- the Node bout runner through the research runner, research
 * `PROTOCOL`. Write-up: `docs/analysis/2026-09-26-release-2-questions.md`, section 4.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function attrFalls(rows) {
  const cells = new Map();
  for (const r of rows.filter((x) => x.status === "ok")) {
    if (!cells.has(r.cell)) cells.set(r.cell, []);
    cells.get(r.cell).push(r);
  }
  const bSide = (r) => (r.aSide === "left" ? "right" : "left");
  const perMin = (rs, pick) => 60 * rs.reduce((a, r) => a + r.sides[pick(r)].falls, 0) / rs.reduce((a, r) => a + r.seconds, 0);
  const down = (rs, pick) => rs.reduce((a, r) => a + r.sides[pick(r)].downShare * r.seconds, 0) / rs.reduce((a, r) => a + r.seconds, 0);
  return [...cells].map(([cell, rs]) => ({ cell, bouts: rs.length,
    share: rs.reduce((a, r) => a + (r.winner === r.aSide ? 1 : r.winner ? 0 : 0.5), 0) / rs.length,
    aFallsPerMin: perMin(rs, (r) => r.aSide), bFallsPerMin: perMin(rs, bSide),
    aDown: down(rs, (r) => r.aSide), bDown: down(rs, bSide),
    seconds: rs.reduce((a, r) => a + r.seconds, 0) / rs.length }));
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("release2-attr-falls.mjs")) {
  for (const dir of process.argv.slice(2)) {
    const rows = readFileSync(join(dir, "results.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    console.log(`\n${dir}\n| cell | bouts | A share | A falls/min | B falls/min | A down % | B down % | bout s |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);
    for (const c of attrFalls(rows)) {
      console.log(`| ${c.cell} | ${c.bouts} | ${(100 * c.share).toFixed(1)} | ${c.aFallsPerMin.toFixed(2)} | ${c.bFallsPerMin.toFixed(2)} | ${(100 * c.aDown).toFixed(1)} | ${(100 * c.bDown).toFixed(1)} | ${c.seconds.toFixed(1)} |`);
    }
  }
}
