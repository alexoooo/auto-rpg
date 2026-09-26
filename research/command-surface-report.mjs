// The command surface's verdict tables (skill ceiling session 06; the write-up is
// `docs/analysis/2026-09-26-command-surface.md`), read from every `research/headroom.mjs --exp
// channel` run under `research/runs/headroom-channel-*`.
//
//   node research/command-surface-report.mjs [--runs research/runs]
//
// Every cell of every run, one line each: A's score and bar margin over corner-swapped seed pairs
// with a bootstrap interval. Then, for each channel expert:
// - **head to head** against the ruler holding the channel at neutral is the verdict, since session 05
//   found footwork pays against an opponent that can punish without it;
// - **headroom**: its score and margin against the family duelist, and the ruler's on the same seed
//   pairs, with their paired difference. The ruler's cell is read from whichever run has it: every
//   channel run draws one seed schedule (`exp` "channel", keyed by body), and the null control makes
//   the neutral ruler the same bouts whatever flags built the body;
// - what it did: the share of frames it named a step or held a stance, and the plans it chose most.
// And every pair of head-to-head cells on one body against one rival, paired on their shared seeds
// (the diagnostics: the keys control, a faster step).
//
// Harness: the Node bout runner, research runner (`research/headroom-worker.mjs`), supported
// locomotion, research PROTOCOL.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readResults } from "./runner.mjs";
import { HARNESS, RULER, pairedDifference, summarize } from "./headroom.mjs";

const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) : "-");
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : "-");
const band = (f, key, fmt) => `${fmt(f[key].mean)} [${fmt(f[key].low)}, ${fmt(f[key].high)}]`;

function main() {
  const { values } = parseArgs({ options: { runs: { type: "string", default: join("research", "runs") } } });
  const cells = [];
  for (const dir of readdirSync(values.runs).filter((name) => name.startsWith("headroom-channel-")).sort()) {
    const file = join(values.runs, dir, "results.jsonl");
    if (!existsSync(file)) continue;
    const summary = summarize(readResults(join(values.runs, dir)));
    for (const [name, cell] of Object.entries(summary.cells)) cells.push({ run: dir, name, ...cell });
    if (summary.failed) console.log(`${dir}: ${summary.failed} bouts failed`);
  }
  console.log(HARNESS);
  console.log("\n## Every cell");
  for (const c of cells) {
    console.log(`${c.run.replace("headroom-channel-", "").padEnd(18)} ${c.meta.a} vs ${c.meta.b} on ${c.meta.body}: n ${c.bouts} (${c.pairs} pairs)  `
      + `A ${band(c, "score", pct)} %  margin ${band(c, "margin", f3)}  ${c.seconds.toFixed(1)} s  wall ${c.wallSeconds.toFixed(0)} s a bout`);
  }

  const find = (a, b, body) => cells.find((c) => c.meta.a === a && c.meta.b === b && c.meta.body === body);
  const subjects = [...new Set(cells.filter((c) => c.meta.a !== RULER).map((c) => `${c.meta.a}|${c.meta.body}`))];
  console.log("\n## Each channel expert");
  for (const key of subjects) {
    const [subject, body] = key.split("|");
    const h2h = find(subject, RULER, body);
    const vs = cells.find((c) => c.meta.a === subject && c.meta.body === body && c.meta.b.includes("duelist"));
    const ruler = vs ? find(RULER, vs.meta.b, body) : null;
    console.log(`\n${subject} on ${body}`);
    if (h2h) {
      console.log(`  head to head vs ${RULER}: n ${h2h.bouts}  score ${band(h2h, "score", pct)} %  margin ${band(h2h, "margin", f3)} `
        + `(d ${f3(h2h.margin.d)})  A left ${pct(h2h.aLeft)} / right ${pct(h2h.aRight)} %  ${h2h.seconds.toFixed(1)} s`);
    }
    if (vs && ruler) {
      const score = pairedDifference(vs, ruler, "score");
      const margin = pairedDifference(vs, ruler, "margin");
      console.log(`  vs ${vs.meta.b}: channel ${band(vs, "score", pct)} % margin ${f3(vs.margin.mean)}; ruler ${band(ruler, "score", pct)} % `
        + `margin ${f3(ruler.margin.mean)}; paired over ${score.n} pairs: score ${pct(score.mean)} points, `
        + `margin ${f3(margin.mean)} [${f3(margin.ci?.low)}, ${f3(margin.ci?.high)}]`);
    }
    for (const c of cells.filter((x) => x.meta.a === subject && x.meta.body === body && x.meta.b !== RULER && !x.meta.b.includes("duelist"))) {
      console.log(`  vs ${c.meta.b}: n ${c.bouts}  score ${band(c, "score", pct)} %  margin ${band(c, "margin", f3)}`);
    }
    for (const [label, cell] of [["h2h", h2h], ["vs duelist", vs]]) {
      if (!cell) continue;
      const b = cell.behaviour;
      const labels = Object.entries(cell.expert.labels ?? {}).sort((x, y) => y[1] - x[1]).slice(0, 7)
        .map(([name, n]) => `${name} ${pct(n / cell.expert.decisions)}`).join(", ");
      console.log(`  what it did (${label}): stepping ${pct(b.steppingShare.a)} %, stanced ${pct(b.stancedShare.a)} % `
        + `(width ${f3(b.stanceWidth.a)}, |lead| ${f3(b.stanceLead.a)}, weight ${f3(b.stanceWeight.a)}), `
        + `strafe ${f3(b.strafe.a)} against ${f3(b.strafe.b)}, forward ${f3(b.forward.a)} against ${f3(b.forward.b)}, `
        + `gap ${f3(b.gapM.a)} m, in reach ${pct(b.inReachShare.a)} %, falls ${f3(b.falls.a)} against ${f3(b.falls.b)}`);
      console.log(`    plans: ${labels}`);
    }
  }

  console.log("\n## Head to head cells against one rival, paired on shared seeds");
  const h2hs = cells.filter((c) => c.name.includes("|h2h|"));
  for (let i = 0; i < h2hs.length; i += 1) for (let j = i + 1; j < h2hs.length; j += 1) {
    const x = h2hs[i], y = h2hs[j];
    if (x.meta.body !== y.meta.body || x.meta.b !== y.meta.b || x.meta.a === y.meta.a) continue;
    const score = pairedDifference(x, y, "score");
    const margin = pairedDifference(x, y, "margin");
    if (score.n < 2) continue;
    console.log(`${x.meta.a} minus ${y.meta.a}, both vs ${x.meta.b} on ${x.meta.body}, ${score.n} pairs: `
      + `score ${pct(score.mean)} points [${pct(score.ci.low)}, ${pct(score.ci.high)}]  margin ${f3(margin.mean)} [${f3(margin.ci.low)}, ${f3(margin.ci.high)}]`);
  }

  // Which of its plans the rival chose, so a channel list's swaps can be priced: a slot a channel takes
  // costs what the ruler would have chosen there. A label with `~` is that plan jittered.
  console.log(`\n## The rival's plans in each head to head (share of its decisions, a jitter folded into its plan)`);
  for (const c of h2hs) {
    const e = c.expertB;
    if (!e?.decisions) continue;
    const folded = {};
    for (const [label, n] of Object.entries(e.labels ?? {})) folded[label.replace(/~$/, "")] = (folded[label.replace(/~$/, "")] ?? 0) + n;
    const labels = Object.entries(folded).sort((x, y) => y[1] - x[1]).map(([name, n]) => `${name} ${pct(n / e.decisions)}`).join(", ");
    console.log(`${c.meta.b} against ${c.meta.a} on ${c.meta.body} (${c.run.replace("headroom-channel-", "")}), ${e.decisions} decisions: ${labels}`);
  }
}

main();
