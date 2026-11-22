/**
 * **The value fitted to what followed** (`FittedValue`, `src/minds/option/fitted-value.ts`;
 * `assets/minds/fitted-value.json`): the life a body dealt and the life it took over each of
 * `HORIZONS` s after the states the game's Mind decided at, each fitted by boosted regression trees
 * to those states as the fitted leaf reads one (`readingAt`, `featuresOf`).
 *
 *   node research/minds/fitted-value.mjs collect <protocol> <from> <to> <dir>
 *   node research/minds/fitted-value.mjs fit <dir>... [--write]
 *
 * `collect` plays the match evaluation's `<protocol>` bouts `<from>` to `<to>`, the game's Mind on
 * both sides (`option`), and keeps in `<dir>` each tree search's root as read there
 * (`fitted-value-hook.mjs`), and each bout's lives at each step either changes. `fit` reads them,
 * holds out the bouts `HELD` names, fits each horizon's dealt and taken on the rest and says each
 * one's held-out R², and that of 2 dealt less taken read from the two beside trees fitted to it
 * alone (not kept): what fitting them apart loses; `--write` puts the models in the game's asset
 * with where they came from.
 */
import { register } from "node:module";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { binned, binsOf, boost, squared } from "./boosted-trees.mjs";

const OUT = "assets/minds/fitted-value.json", SCRIPT = "research/minds/fitted-value.mjs";
/** The seconds after a state what followed is read over. */
const HORIZONS = Object.freeze([3, 8, 20]);
/** The bouts held out of a fit: the drawn mirror's from its 108th. */
const HELD = (bout) => bout.startsWith("warrior-drawn/") && Number(bout.split("/")[1]) >= 108;
/** The trees: as many, as deep, at least so many states a leaf, so shrunk, each on a share of the states and of the features. */
const TREES = Object.freeze({ rounds: 300, rate: .03, depth: 4, minLeaf: 400, lambda: 50, subsample: .5, colsample: .7 });

const [mode, ...args] = process.argv.slice(2);
if (mode === "collect") await collect(...args);
else if (mode === "fit") await fitAll(args.filter((arg) => arg !== "--write"), args.includes("--write"));
else throw new Error("usage: fitted-value.mjs collect <protocol> <from> <to> <dir> | fit <dir>... [--write]");

/** Play bouts `from` to `to` of `protocol`, keeping each search's root and each bout's lives in `dir`. */
async function collect(protocol, from, to, dir) {
  register("./fitted-value-hook.mjs", import.meta.url);
  await import("../../tests/harness/preload-data.mjs");
  const { EVALUATIONS, playCase } = await import("../../src/app/node/evaluation.ts");
  const { DEFAULT_ENGINE } = await import("../../src/core/physics/engines.ts");
  const { isRefused } = await import("../../src/core/refusal.ts");
  const { graceAt } = await import("../../src/minds/option/percepts.ts");
  const { offeredOf, readingAt } = await import("../../src/minds/option/fitted-value.ts");
  const evaluation = EVALUATIONS.match, cases = evaluation.protocols[protocol], [subject] = evaluation.subjects(["option", "option"]);
  if (!cases) throw new Error(`no match protocol ${protocol}`);
  mkdirSync(dir, { recursive: true });
  for (const [i, condition] of cases.conditions.slice(Number(from), Number(to)).entries()) {
    const bout = `${protocol}/${Number(from) + i}`, world = cases.world([subject.value, subject.value], condition, cases.engine ?? DEFAULT_ENGINE, [{}, {}]);
    if (isRefused(world)) throw new Error(world.refused);
    let duel = null; const states = [], lives = [];
    globalThis.__searchRoot = (root, at) => {
      if (!duel || !root.focus) return;
      const offered = [];
      for (const pair of at.pairsAt(root)) { const terms = at.modelAt(pair, root); if (terms) offered.push(offeredOf(pair.option.kind, pair.option.open === true, terms)); }
      states.push({ side: root.focus.side === "left" ? "right" : "left", t: duel.clock, reading: readingAt(root, graceAt(root), offered) });
    };
    const played = await playCase(world, cases.seconds, (built) => {
      duel = built.duel; const reader = cases.read(built, condition);
      return { afterStep() {
        reader.afterStep();
        const now = [duel.life("left"), duel.life("right")], last = lives[lives.length - 1];
        if (!last || now.some((life, k) => life !== last[k + 1])) lives.push([duel.clock, ...now]);
      }, get ended() { return reader.ended; }, reading: () => reader.reading() };
    }, {});
    if (isRefused(played)) throw new Error(played.refused);
    appendFileSync(`${dir}/states-${protocol}-${from}.jsonl`, JSON.stringify({ bout, end: duel.clock, lives, states }) + "\n");
    console.log(`${bout}: ${states.length} states, ${duel.clock.toFixed(1)} s`);
  }
}

/** Fit each horizon to the states in `dirs`, say each one's held-out R², and with `write` keep them in the game's asset. */
async function fitAll(dirs, write) {
  const { FEATURES, featuresOf } = await import("../../src/minds/option/fitted-value.ts");
  const F = FEATURES.length, xs = [], after = HORIZONS.map(() => ({ dealt: [], taken: [] })), held = [], bouts = new Set();
  for (const dir of dirs) for (const name of readdirSync(dir).filter((file) => /^states-.*\.jsonl$/.test(file)).sort())
    for (const line of readFileSync(`${dir}/${name}`, "utf8").split("\n")) {
      if (!line) continue;
      const { bout, end, lives, states } = JSON.parse(line);
      bouts.add(bout);
      for (const { side, t, reading } of states) {
        xs.push(featuresOf(reading)); held.push(HELD(bout));
        HORIZONS.forEach((h, k) => { const { dealt, taken } = followed(lives, end, side, t, h); after[k].dealt.push(dealt); after[k].taken.push(taken); });
      }
    }
  const n = xs.length, X = new Float64Array(n * F);
  xs.forEach((x, i) => X.set(x, i * F));
  const train = [...Array(n).keys()].filter((i) => !held[i]), test = [...Array(n).keys()].filter((i) => held[i]);
  console.log(`${n} states of ${bouts.size} bouts: ${train.length} fitted, ${test.length} held out`);
  const edges = binsOf(X, n, F), B = binned(X, n, F, edges), models = [];
  const trees = (y) => { const base = mean(train, y), model = boost(B, F, edges, n, train, squared(train, y), { ...TREES, base }); return { base, trees: model.trees, pred: model.pred }; };
  for (const [k, h] of HORIZONS.entries()) {
    const dealtY = Float64Array.from(after[k].dealt), takenY = Float64Array.from(after[k].taken), dealt = trees(dealtY), taken = trees(takenY);
    const tradedY = Float64Array.from(dealtY, (d, i) => 2 * d - takenY[i]), traded = Float64Array.from(dealt.pred, (d, i) => 2 * d - taken.pred[i]), alone = trees(tradedY);
    console.log(`over ${h} s, R² held out (fitted): dealt ${r2(test, dealt.pred, dealtY).toFixed(3)} (${r2(train, dealt.pred, dealtY).toFixed(3)}), taken ${r2(test, taken.pred, takenY).toFixed(3)} (${r2(train, taken.pred, takenY).toFixed(3)}); 2 dealt less taken from the two ${r2(test, traded, tradedY).toFixed(3)}, fitted alone ${r2(test, alone.pred, tradedY).toFixed(3)}`);
    models.push({ dealt: { base: dealt.base, trees: dealt.trees }, taken: { base: taken.base, trees: taken.trees } });
  }
  if (!write) return;
  const commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  const origin = `${SCRIPT} fit at ${commit}: ${train.length} states of the game's Mind on both sides in ${[...bouts].filter((b) => !HELD(b)).length} bouts (${dirs.join(", ")}), ${test.length} held out`;
  writeFileSync(OUT, JSON.stringify({ origin, features: FEATURES, horizons: HORIZONS, models }) + "\n");
  console.log(`wrote ${OUT}: ${origin}`);
}

/** What `side` dealt and took over `h` s from `t` (to the bout's `end`), by its lives at each change (`lives`). */
function followed(lives, end, side, t, h) {
  const at = (when) => { let lo = 0, hi = lives.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (lives[m][0] <= when + 1e-9) lo = m; else hi = m - 1; } return lives[lo]; };
  const [, l0, r0] = at(t), [, l1, r1] = at(Math.min(t + h, end));
  const [own, foe] = side === "left" ? [l0 - l1, r0 - r1] : [r0 - r1, l0 - l1];
  return { dealt: foe, taken: own };
}

/** The mean of `y` over the states `idx`. */
function mean(idx, y) { return idx.reduce((s, i) => s + y[i], 0) / idx.length; }
/** The share of `y`'s spread over the states `idx` that `pred` reads. */
function r2(idx, pred, y) { const m = mean(idx, y); let se = 0, st = 0; for (const i of idx) { se += (pred[i] - y[i]) ** 2; st += (y[i] - m) ** 2; } return 1 - se / st; }
