// The command surface's verdict tables (skill ceiling session 06; the write-up is
// `docs/analysis/2026-09-26-command-surface.md`), read from every `research/headroom.mjs --exp
// channel` run under `research/runs/headroom-channel-*`.
//
//   node research/command-surface-report.mjs [--runs research/runs]
//   node research/command-surface-report.mjs --include stance,stepadd,ruler --ruler-run ruler
//
// Repeated policy labels remain separate by run. Cross-run comparisons require the same
// measured protocol; a run uses its own ruler first, otherwise a unique compatible control or
// the explicitly named --ruler-run. Matching protocols do not prove unchanged source/physics:
// only combine historical runs whose neutral equivalence was separately established.
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
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { readResults } from "./runner.mjs";
import { HARNESS, RULER, pairedDifference, summarize } from "./headroom.mjs";

const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) : "-");
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : "-");
const band = (f, key, fmt) => `${fmt(f[key].mean)} [${fmt(f[key].low)}, ${fmt(f[key].high)}]`;

/** An expert's plan shares, % of its decisions, each jitter (`label~`) folded into its plan. */
function foldedLabels(expert) {
  if (!expert?.decisions) return "";
  const folded = {};
  for (const [label, n] of Object.entries(expert.labels ?? {})) folded[label.replace(/~$/, "")] = (folded[label.replace(/~$/, "")] ?? 0) + n;
  return Object.entries(folded).sort((x, y) => y[1] - x[1]).map(([name, n]) => `${name} ${pct(n / expert.decisions)}`).join(", ");
}

/** Cross-run controls must share the measured protocol. Unknown provenance is never comparable. */
export function sameProtocol(a, b) {
  if (!a.protocol || !b.protocol || !a.harness || !b.harness) return false;
  return a.harness === b.harness && ["maxSeconds", "settleSeconds", "locomotionMode"]
    .every(key => a.protocol[key] != null && a.protocol[key] === b.protocol[key]);
}

/** Prefer the run's own control. Never silently choose among several external controls. */
export function rulerControl(cells, subject, requestedRun = null) {
  const eligible = cells.filter(c => c.meta.a === RULER && c.meta.b === subject.meta.b
    && c.meta.body === subject.meta.body && sameProtocol(c, subject));
  const local = eligible.find(c => c.run === subject.run);
  if (local) return local;
  const external = requestedRun ? eligible.filter(c => c.run === requestedRun) : eligible;
  return external.length === 1 ? external[0] : null;
}

export function channelReport(cells, { rulerRun = null } = {}) {
  const lines = [];
  const print = line => lines.push(line);
  print(HARNESS);
  print("\n## Every cell");
  for (const c of cells) {
    print(`${c.run.replace("headroom-channel-", "").padEnd(18)} ${c.meta.a} vs ${c.meta.b} on ${c.meta.body}: n ${c.bouts} (${c.pairs} pairs)  `
      + `A ${band(c, "score", pct)} %  margin ${band(c, "margin", f3)}  ${c.seconds.toFixed(1)} s  wall ${c.wallSeconds.toFixed(0)} s a bout; cap ${c.protocol?.maxSeconds ?? "unknown"} s`);
  }

  const subjects = [...new Set(cells.filter(c => c.meta.a !== RULER).map(c => JSON.stringify([c.run, c.meta.a, c.meta.body])))];
  print("\n## Each channel expert, by run");
  for (const key of subjects) {
    const [run, subject, body] = JSON.parse(key);
    const own = cells.filter(c => c.run === run && c.meta.a === subject && c.meta.body === body);
    const h2h = own.find(c => c.meta.b === RULER);
    const vs = own.find(c => c.meta.b.includes("duelist"));
    const ruler = vs ? rulerControl(cells, vs, rulerRun) : null;
    print(`\n${subject} on ${body} (${run})`);
    if (h2h) {
      print(`  head to head vs ${RULER}: n ${h2h.bouts}  score ${band(h2h, "score", pct)} %  margin ${band(h2h, "margin", f3)} `
        + `(d ${f3(h2h.margin.d)})  A left ${pct(h2h.aLeft)} / right ${pct(h2h.aRight)} %  ${h2h.seconds.toFixed(1)} s`);
    }
    if (vs && ruler) {
      const score = pairedDifference(vs, ruler, "score");
      const margin = pairedDifference(vs, ruler, "margin");
      print(`  vs ${vs.meta.b}: channel ${band(vs, "score", pct)} % margin ${f3(vs.margin.mean)}; ruler ${band(ruler, "score", pct)} % `
        + `margin ${f3(ruler.margin.mean)} (${ruler.run}); paired over ${score.n} pairs: score ${pct(score.mean)} points, `
        + `margin ${f3(margin.mean)} [${f3(margin.ci?.low)}, ${f3(margin.ci?.high)}]`);
    }
    if (vs && !ruler) print("  No unique compatible ruler control; select --ruler-run to resolve external ambiguity.");
    for (const c of own.filter(x => x.meta.b !== RULER && !x.meta.b.includes("duelist"))) {
      print(`  vs ${c.meta.b}: n ${c.bouts}  score ${band(c, "score", pct)} %  margin ${band(c, "margin", f3)}`);
    }
    for (const [label, cell] of [["h2h", h2h], ["vs duelist", vs]]) {
      if (!cell) continue;
      const b = cell.behaviour;
      const labels = foldedLabels(cell.expert);
      print(`  what it did (${label}): targeted ${pct(b.targetedShare.a)} % (speed ${f3(b.targetSpeed.a)}, force ${f3(b.targetForce.a)}), stepping ${pct(b.steppingShare.a)} %, stanced ${pct(b.stancedShare.a)} % `
        + `(width ${f3(b.stanceWidth.a)}, |lead| ${f3(b.stanceLead.a)}, weight ${f3(b.stanceWeight.a)}), `
        + `strafe ${f3(b.strafe.a)} against ${f3(b.strafe.b)}, forward ${f3(b.forward.a)} against ${f3(b.forward.b)}, `
        + `gap ${f3(b.gapM.a)} m, in reach ${pct(b.inReachShare.a)} %, falls ${f3(b.falls.a)} against ${f3(b.falls.b)}`);
      print(`    plans: ${labels}`);
    }
  }

  print("\n## Head to head cells against one rival, paired on shared seeds");
  const h2hs = cells.filter((c) => c.name.includes("|h2h|"));
  for (let i = 0; i < h2hs.length; i += 1) for (let j = i + 1; j < h2hs.length; j += 1) {
    const x = h2hs[i], y = h2hs[j];
    if (x.meta.body !== y.meta.body || x.meta.b !== y.meta.b || x.meta.a === y.meta.a || !sameProtocol(x, y)) continue;
    const score = pairedDifference(x, y, "score");
    const margin = pairedDifference(x, y, "margin");
    if (score.n < 2) continue;
    print(`${x.meta.a} (${x.run}) minus ${y.meta.a} (${y.run}), both vs ${x.meta.b} on ${x.meta.body}, ${score.n} pairs: `
      + `score ${pct(score.mean)} points [${pct(score.ci.low)}, ${pct(score.ci.high)}]  margin ${f3(margin.mean)} [${f3(margin.ci.low)}, ${f3(margin.ci.high)}]`);
  }

  // Which of its plans the rival chose, so a channel list's swaps can be priced: a slot a channel takes
  // costs what the ruler would have chosen there. A label with `~` is that plan jittered.
  print(`\n## The rival's plans in each head to head (share of its decisions, a jitter folded into its plan)`);
  for (const c of h2hs) {
    const e = c.expertB;
    if (!e?.decisions) continue;
    print(`${c.meta.b} against ${c.meta.a} on ${c.meta.body} (${c.run.replace("headroom-channel-", "")}), ${e.decisions} decisions: ${foldedLabels(e)}`);
  }
  return lines.join("\n");
}

function main() {
  const { values } = parseArgs({ options: {
    runs: { type: "string", default: join("research", "runs") },
    include: { type: "string" }, "ruler-run": { type: "string" },
  } });
  const runName = name => name.startsWith("headroom-channel-") ? name : `headroom-channel-${name}`;
  const included = values.include ? new Set(values.include.split(",").map(runName)) : null;
  const cells = [];
  for (const dir of readdirSync(values.runs).filter(name => name.startsWith("headroom-channel-")).sort()) {
    if (included && !included.has(dir)) continue;
    const directory = join(values.runs, dir);
    if (!existsSync(join(directory, "results.jsonl"))) continue;
    const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
    const summary = summarize(readResults(directory));
    for (const [name, cell] of Object.entries(summary.cells)) cells.push({ run: dir, name, ...cell,
      protocol: manifest.protocol, harness: manifest.harness });
    if (summary.failed) console.log(`${dir}: ${summary.failed} bouts failed`);
  }
  console.log(channelReport(cells, { rulerRun: values["ruler-run"] ? runName(values["ruler-run"]) : null }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
