/**
 * **The empty-hand league**: Arena bouts between fighter minds, both sides bare-handed, played as
 * the Arena plays them unless asked (`Duel`: the game's 120 s cap, recovery left to continue, the
 * fuller bar winning at the cap), each pair at every gap asked and from both sides. Every bout is
 * kept, one JSON line each, so a run plays only the bouts it has not played before; a bout is
 * keyed by its two minds' configs, its gap and the run's `--epoch`, which a change to code the
 * minds share (the stance, the body, the rules) moves on.
 *
 * Ratings are Bradley-Terry fits on the Elo scale (400 points a factor of ten in odds), the pool's
 * mean at 1000:
 * - **win**: the verdict, a draw half each;
 * - **damage**: each side's share of the damage done in the bout (one less its foe's bar), half
 *   each where none was done.
 * Each entrant's row adds its win rate, damage done and taken a bout (in bars), falls and seconds
 * down a bout, and the share of the time both stood with their centres of mass within 0.5 m
 * across the ground (`close`).
 *
 * Usage:
 *   node research/empty-hand-league.mjs [--entrants classic,combat,...] [--modules file.mjs,...]
 *     [--against classic,combat] [--gaps 3,3.2,...] [--cap 120] [--epoch e1] [--store path]
 *     [--lanes 28] [--report-only]
 *
 * `--entrants` names presets (`PRESETS`) or entrants a `--modules` file exports by name (its
 * default export, an object of name to `MindConfig`). With `--against`, each entrant plays only
 * those (and they play each other), and the table rates every entrant the store holds bouts of.
 *
 * Harness: Node, the core's world on Rapier (`DEFAULT_ENGINE`), the Arena's room, 120 Hz.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isMainThread, parentPort, Worker } from "node:worker_threads";
import { buildBout } from "./bout.mjs";
import { PRESETS } from "../src/core/mind/controllers.ts";

/** Within how far across the ground two centres of mass count as close, m. */
const CLOSE = 0.5;

/** A key's text for a value: its JSON with the keys of every object sorted. */
const canonical = (value) => JSON.stringify(value, (_, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v);
const hashOf = (value) => createHash("sha1").update(canonical(value)).digest("hex").slice(0, 12);

/** One bout of `a` (left) against `b` (right) `gap` m apart, to its verdict or `cap` s: its row. */
async function boutRow({ a, b, gap, cap }) {
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-fighter", minds: { left: a, right: b },
    held: { left: "empty", right: "empty" }, recoverySeconds: null, capSeconds: cap, gap });
  try {
    const L = duel.duelists.left, R = duel.duelists.right, falls = [0, 0], down = [0, 0], was = [false, false];
    let close = 0, standing = 0;
    while (!duel.verdict) {
      world.step();
      const views = [L.body.view, R.body.view];
      for (let i = 0; i < 2; i++) {
        if (views[i].down) { down[i] += world.dt; if (!was[i]) falls[i]++; }
        was[i] = views[i].down;
      }
      if (!views[0].down && !views[1].down) {
        standing++;
        const p = views[0].stance.centre, q = views[1].stance.centre, dx = p.x - q.x, dz = p.z - q.z;
        if (dx * dx + dz * dz < CLOSE * CLOSE) close++;
      }
    }
    const bars = [L.pool.bar(), R.pool.bar()], winner = duel.verdict.winner;
    return { winner: winner === "left" ? 0 : winner === "right" ? 1 : null, ending: duel.verdict.ending, time: +duel.verdict.time.toFixed(2),
      bars: bars.map((x) => +x.toFixed(4)), falls, down: down.map((x) => +x.toFixed(2)), close: standing ? +(close / standing).toFixed(4) : 0 };
  } finally { dispose(); }
}

if (!isMainThread) {
  parentPort.on("message", async (job) => {
    try { parentPort.postMessage({ id: job.id, row: await boutRow(job) }); }
    catch (error) { parentPort.postMessage({ id: job.id, error: String(error?.stack ?? error) }); }
  });
} else if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2), arg = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i < 0 ? fallback : argv[i + 1]; };
  const list = (text) => text ? text.split(",").filter(Boolean) : [];
  const epoch = arg("epoch", "e1"), cap = Number(arg("cap", 120)), store = resolve(arg("store", "research/runs/empty-hand/bouts.jsonl"));
  const gaps = list(arg("gaps", "3,3.2,3.4,3.6,3.8,4,4.2,4.4,4.6,4.8,5")).map(Number);
  const lanes = Number(arg("lanes", Math.max(1, availableParallelism() - 4)));
  const known = Object.fromEntries(Object.entries(PRESETS).map(([name, preset]) => [name, preset.config]));
  for (const file of list(arg("modules"))) Object.assign(known, (await import(pathToFileURL(resolve(file)).href)).default);
  const entrants = list(arg("entrants", "classic,puncher,combat,brawler,scrapper,kicker,behaviours")), against = list(arg("against"));
  for (const name of [...entrants, ...against]) if (!known[name]) throw new Error(`no entrant ${name}: ${Object.keys(known).join(", ")}`);

  mkdirSync(dirname(store), { recursive: true });
  const rows = existsSync(store) ? readFileSync(store, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
  const keyOf = (ha, hb, gap) => `${epoch}|${ha}|${hb}|${gap}`;
  const played = new Set(rows.filter((r) => r.epoch === epoch).map((r) => keyOf(r.ha, r.hb, r.gap)));

  // The pairs to play: each entrant against each of `against` and those among themselves, or every pair of entrants.
  const pairs = [];
  const pair = (x, y) => { if (x !== y && !pairs.some(([p, q]) => (p === x && q === y) || (p === y && q === x))) pairs.push([x, y]); };
  if (against.length) { for (const x of entrants) for (const y of against) pair(x, y); for (const x of against) for (const y of against) pair(x, y); }
  else for (const x of entrants) for (const y of entrants) pair(x, y);
  const jobs = [];
  if (!argv.includes("--report-only")) {
    for (const [x, y] of pairs) for (const gap of gaps) for (const [p, q] of [[x, y], [y, x]]) {
      const ha = hashOf(known[p]), hb = hashOf(known[q]);
      if (!played.has(keyOf(ha, hb, gap))) { played.add(keyOf(ha, hb, gap)); jobs.push({ a: known[p], b: known[q], gap, cap, names: [p, q], ha, hb }); }
    }
  }
  if (jobs.length) {
    console.error(`playing ${jobs.length} bouts on ${Math.min(lanes, jobs.length)} lanes`);
    const started = Date.now();
    let next = 0, done = 0;
    await Promise.all(Array.from({ length: Math.min(lanes, jobs.length) }, () => new Promise((resolveLane, rejectLane) => {
      const worker = new Worker(new URL(import.meta.url));
      const feed = () => {
        if (next >= jobs.length) { worker.terminate(); resolveLane(); return; }
        const id = next++, job = jobs[id];
        worker.once("message", ({ row, error }) => {
          if (error) { worker.terminate(); rejectLane(new Error(error)); return; }
          const record = { epoch, a: job.names[0], b: job.names[1], ha: job.ha, hb: job.hb, gap: job.gap, cap, ...row };
          appendFileSync(store, JSON.stringify(record) + "\n");
          rows.push(record);
          if (++done % 20 === 0) console.error(`${done}/${jobs.length} in ${((Date.now() - started) / 60000).toFixed(1)} min`);
          feed();
        });
        worker.postMessage({ id, a: job.a, b: job.b, gap: job.gap, cap: job.cap });
      };
      feed();
    })));
  }

  // The table: every entrant named, rated over the bouts between any two of them in this epoch, at their current configs.
  const named = [...new Set([...entrants, ...against])], hash = Object.fromEntries(named.map((n) => [n, hashOf(known[n])]));
  const byHash = new Map(named.map((n) => [hash[n], n]));
  const games = rows.filter((r) => r.epoch === epoch && byHash.has(r.ha) && byHash.has(r.hb) && r.ha !== r.hb && gaps.includes(r.gap));
  const index = new Map(named.map((n, i) => [n, i]));
  const fit = (scoreOf) => {
    // Bradley-Terry by minorisation-maximisation: each strength the scores it took over its expected games.
    const n = named.length, s = new Array(n).fill(1), wins = new Array(n).fill(0), count = Array.from({ length: n }, () => new Array(n).fill(0));
    for (const g of games) {
      const i = index.get(byHash.get(g.ha)), j = index.get(byHash.get(g.hb)), x = scoreOf(g);
      wins[i] += x; wins[j] += 1 - x; count[i][j]++; count[j][i]++;
    }
    for (let k = 0; k < n; k++) { wins[k] += 0.5; for (let m = 0; m < n; m++) if (m !== k) count[k][m] += 0.5 / (n - 1); }
    for (let it = 0; it < 2000; it++) {
      for (let i = 0; i < n; i++) {
        let den = 0;
        for (let j = 0; j < n; j++) if (j !== i && count[i][j]) den += count[i][j] / (s[i] + s[j]);
        s[i] = den > 0 ? wins[i] / den : s[i];
      }
      const mean = s.reduce((t, x) => t + Math.log(x), 0) / n;
      for (let i = 0; i < n; i++) s[i] = Math.exp(Math.log(s[i]) - mean);
    }
    return s.map((x) => 1000 + 400 * Math.log10(x));
  };
  const win = fit((g) => g.winner === 0 ? 1 : g.winner === 1 ? 0 : 0.5);
  const damage = fit((g) => { const da = 1 - g.bars[1], db = 1 - g.bars[0]; return da + db > 1e-9 ? da / (da + db) : 0.5; });
  const table = named.map((n, i) => {
    let bouts = 0, won = 0, dealt = 0, taken = 0, falls = 0, down = 0, close = 0;
    for (const g of games) {
      const me = byHash.get(g.ha) === n ? 0 : byHash.get(g.hb) === n ? 1 : -1;
      if (me < 0) continue;
      bouts++; won += g.winner === me ? 1 : g.winner === null ? 0.5 : 0; dealt += 1 - g.bars[1 - me]; taken += 1 - g.bars[me];
      falls += g.falls[me]; down += g.down[me]; close += g.close;
    }
    return { name: n, win: Math.round(win[i]), damage: Math.round(damage[i]), bouts, wins: +(won / bouts).toFixed(3), dealt: +(dealt / bouts).toFixed(3),
      taken: +(taken / bouts).toFixed(3), falls: +(falls / bouts).toFixed(2), down: +(down / bouts).toFixed(1), close: +(close / bouts).toFixed(3) };
  }).sort((p, q) => q.win - p.win);
  console.log(`epoch ${epoch}, ${games.length} bouts, gaps ${gaps.join(",")}`);
  console.log("name".padEnd(22) + "win".padStart(6) + "damage".padStart(8) + "bouts".padStart(7) + "wins".padStart(7) + "dealt".padStart(7) + "taken".padStart(7) + "falls".padStart(7) + "down".padStart(7) + "close".padStart(7));
  for (const r of table) console.log(r.name.padEnd(22) + String(r.win).padStart(6) + String(r.damage).padStart(8) + String(r.bouts).padStart(7) + r.wins.toFixed(3).padStart(7)
    + r.dealt.toFixed(3).padStart(7) + r.taken.toFixed(3).padStart(7) + r.falls.toFixed(2).padStart(7) + r.down.toFixed(1).padStart(7) + r.close.toFixed(3).padStart(7));
}
