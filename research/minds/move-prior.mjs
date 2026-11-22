/**
 * **The move prior** (`MovePrior`, `src/minds/option/move-prior.ts`; `assets/minds/move-prior.json`):
 * boosted trees scoring each Option on offer at a tree search's root, a softmax over the root's
 * Options fitted to the shares of the search's runs each went on beyond its first, so a search's
 * own choices teach where its runs go.
 *
 *   node research/minds/move-prior.mjs collect <mind.json> <protocol> <from> <to> <rows.jsonl>
 *   node --max-old-space-size=12000 research/minds/move-prior.mjs fit <rows.jsonl>... [--write]
 *
 * `collect` plays the match evaluation's `<protocol>` bouts `<from>` to `<to>`, the Mind
 * `<mind.json>` on both sides, and appends to `<rows.jsonl>` each tree search's root
 * (`move-prior-hook.mjs`), one line a bout's root: its bout (`b`), the root as the fitted value
 * reads a state (`f`, `featuresOf`), and each Option on offer as [kind, open, seconds, dealt,
 * taken, price, runs] (`l`, `PriorLine`). `fit` reads them, holds out the bouts `HELD` names, and
 * says in nats a root held out (the cross-entropy to its run shares) what uniform shares read, a
 * softmax of the price (its temperature fitted), and the trees every 50 rounds, with how often each
 * one's likeliest Option is the one run most; `--write` keeps the trees in the game's asset with
 * where they came from.
 */
import { register } from "node:module";
import { appendFileSync, createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { execSync } from "node:child_process";
import { binned, binsOf, boost } from "./boosted-trees.mjs";

const OUT = "assets/minds/move-prior.json", SCRIPT = "research/minds/move-prior.mjs";
/** The bouts held out of a fit: one in five, by a hash of the bout's name. */
const HELD = (bout) => { let h = 0; for (const c of bout) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 5 === 0; };
/** The trees: as many, as deep, at least so many Options a leaf, so shrunk, each on a share of the Options and of the features. */
const TREES = Object.freeze({ rounds: 200, rate: .1, depth: 5, minLeaf: 200, lambda: 1, subsample: .5, colsample: .8, base: 0 });

const [mode, ...args] = process.argv.slice(2);
if (mode === "collect") await collect(...args);
else if (mode === "fit") await fitAll(args.filter((arg) => arg !== "--write"), args.includes("--write"));
else throw new Error("usage: move-prior.mjs collect <mind.json> <protocol> <from> <to> <rows.jsonl> | fit <rows.jsonl>... [--write]");

/** Play bouts `from` to `to` of `protocol`, the Mind at `mindPath` on both sides, appending each search's root to `out`. */
async function collect(mindPath, protocol, from, to, out) {
  register("./move-prior-hook.mjs", import.meta.url);
  await import("../../tests/harness/preload-data.mjs");
  const { EVALUATIONS, playCase } = await import("../../src/app/node/evaluation.ts");
  const { DEFAULT_ENGINE } = await import("../../src/core/physics/engines.ts");
  const { isRefused } = await import("../../src/core/refusal.ts");
  const { graceAt } = await import("../../src/minds/option/percepts.ts");
  const { featuresOf, offeredOf, readingAt } = await import("../../src/minds/option/fitted-value.ts");
  const mind = JSON.parse(readFileSync(mindPath, "utf8")), evaluation = EVALUATIONS.match, cases = evaluation.protocols[protocol];
  if (!cases) throw new Error(`no match protocol ${protocol}`);
  const [subject] = evaluation.subjects([{ id: "mind", label: "mind", value: mind }, { id: "mind2", label: "mind", value: mind }]);
  const r4 = (x) => Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : 0;
  for (let n = Number(from); n < Number(to); n++) {
    const bout = `${protocol}/${n}`, world = cases.world([subject.value, subject.value], cases.conditions[n], cases.engine ?? DEFAULT_ENGINE, [{}, {}]);
    if (isRefused(world)) throw new Error(world.refused);
    let duel = null; const rows = [];
    globalThis.__searchLines = (root, at, edges) => {
      if (!duel || !root.focus || edges.length < 2) return;
      const offered = [];
      for (const pair of at.pairsAt(root)) { const terms = at.modelAt(pair, root); if (terms) offered.push(offeredOf(pair.option.kind, pair.option.open === true, terms)); }
      const reading = readingAt(root, graceAt(root), offered);
      if (!reading) return;
      rows.push({ b: bout, f: featuresOf(reading).map(r4), l: edges.map(({ pair, step, runs }) =>
        [pair.option.kind, pair.option.open === true ? 1 : 0, r4(step.terms.duration), r4(step.terms.dealt), r4(step.terms.taken), r4(at.price(step, root)), runs]) });
    };
    const played = await playCase(world, cases.seconds, (built) => {
      duel = built.duel; const reader = cases.read(built, cases.conditions[n]);
      return { afterStep() { reader.afterStep(); }, get ended() { return reader.ended; }, reading: () => reader.reading() };
    }, {});
    if (isRefused(played)) throw new Error(played.refused);
    appendFileSync(out, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    console.log(`${bout}: ${rows.length} roots, ${duel.clock.toFixed(1)} s`);
  }
}

/** Fit the trees to the roots in `files`, say each reading's held-out nats, and with `write` keep them in the game's asset. */
async function fitAll(files, write) {
  const { FEATURES } = await import("../../src/minds/option/fitted-value.ts");
  const { LINE_FEATURES, lineFeatures } = await import("../../src/minds/option/move-prior.ts");
  // Each root's run shares beyond the one run each Option has first; a root none of whose runs went further is left out.
  const roots = [], kindsSeen = new Map();
  for (const file of files) for await (const text of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
    if (!text) continue;
    const row = JSON.parse(text), extra = row.l.map((line) => Math.max(0, line[6] - 1)), sum = extra.reduce((s, v) => s + v, 0);
    if (sum <= 0) continue;
    for (const line of row.l) kindsSeen.set(line[0], (kindsSeen.get(line[0]) ?? 0) + 1);
    roots.push({ b: row.b, f: row.f, l: row.l, shares: extra.map((v) => v / sum) });
  }
  const kinds = [...kindsSeen.entries()].sort((a, b) => b[1] - a[1]).map(([kind]) => kind), F = FEATURES.length + LINE_FEATURES.length;
  let n = 0; for (const root of roots) n += root.l.length;
  const X = new Float32Array(n * F), share = new Float64Array(n), group = new Int32Array(roots.length + 1), PRICE = FEATURES.length + LINE_FEATURES.indexOf("price");
  { let i = 0; roots.forEach((root, g) => {
      group[g] = i;
      const lines = root.l.map(([kind, open, duration, dealt, taken, price]) => ({ kind, open: open === 1, duration, dealt, taken, price })), best = Math.max(...lines.map((line) => line.price));
      lines.forEach((line, k) => { X.set(root.f, i * F); X.set(lineFeatures(kinds, line, best), i * F + FEATURES.length); share[i] = root.shares[k]; i++; });
    }); group[roots.length] = i; }
  const train = [], test = [], trainLines = [];
  roots.forEach((root, g) => { if (HELD(root.b)) test.push(g); else { train.push(g); for (let i = group[g]; i < group[g + 1]; i++) trainLines.push(i); } });
  const bouts = new Set(roots.map((root) => root.b)), heldBouts = [...bouts].filter(HELD).length;
  console.log(`${roots.length} roots of ${bouts.size} bouts, ${(n / roots.length).toFixed(1)} Options a root: ${train.length} fitted, ${test.length} held out (${heldBouts} bouts)`);
  const p = new Float64Array(n);
  const softmax = (z, g) => { const a = group[g], b = group[g + 1]; let top = -Infinity, sum = 0; for (let i = a; i < b; i++) top = Math.max(top, z[i]); for (let i = a; i < b; i++) sum += p[i] = Math.exp(z[i] - top); for (let i = a; i < b; i++) p[i] /= sum; };
  const read = (z, gs) => { let nats = 0, hits = 0;
    for (const g of gs) { softmax(z, g); let likeliest = group[g], most = group[g];
      for (let i = group[g]; i < group[g + 1]; i++) { if (share[i] > 0) nats -= share[i] * Math.log(Math.max(p[i], 1e-12)); if (p[i] > p[likeliest]) likeliest = i; if (share[i] > share[most]) most = i; }
      if (likeliest === most) hits++; }
    return `${(nats / gs.length).toFixed(3)} nats, the most run likeliest ${(100 * hits / gs.length).toFixed(1)}%`; };
  let floor = 0; for (const g of test) for (let i = group[g]; i < group[g + 1]; i++) if (share[i] > 0) floor -= share[i] * Math.log(share[i]);
  console.log(`held out: the shares' own entropy ${(floor / test.length).toFixed(3)} nats; uniform ${read(new Float64Array(n), test)}`);
  let temperature = 1, least = Infinity;
  for (const t of [1, 3, 10, 30, 100, 300, 1000, 3000]) { const z = Float64Array.from({ length: n }, (_, i) => t * X[i * F + PRICE]); let nats = 0;
    for (const g of train) { softmax(z, g); for (let i = group[g]; i < group[g + 1]; i++) if (share[i] > 0) nats -= share[i] * Math.log(Math.max(p[i], 1e-12)); }
    if (nats < least) { least = nats; temperature = t; } }
  console.log(`held out: the price times ${temperature} ${read(Float64Array.from({ length: n }, (_, i) => temperature * X[i * F + PRICE]), test)}`);
  const gradients = (z, g, h) => { for (const r of train) { softmax(z, r); for (let i = group[r]; i < group[r + 1]; i++) { g[i] = p[i] - share[i]; h[i] = Math.max(p[i] * (1 - p[i]), 1e-6); } } };
  const edges = binsOf(X, n, F), B = binned(X, n, F, edges);
  const { trees } = boost(B, F, edges, n, trainLines, gradients, TREES, (round, z) => { if ((round + 1) % 50 === 0) console.log(`held out: the trees at ${round + 1} rounds ${read(z, test)}; fitted ${read(z, train)}`); });
  if (!write) return;
  const commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  const origin = `${SCRIPT} fit at ${commit}: ${train.length} roots in ${bouts.size - heldBouts} bouts (${files.join(", ")}), ${test.length} held out`;
  writeFileSync(OUT, JSON.stringify({ origin, features: [...FEATURES, ...LINE_FEATURES], kinds, trees: { base: TREES.base, trees } }) + "\n");
  console.log(`wrote ${OUT}: ${origin}`);
}
