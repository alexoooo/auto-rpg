/**
 * The posture audit and its tables (`docs/reference/postures.md`): for each row (`ROWS`), a support
 * between knees and hands and standing, whether the Warrior can hold itself still on it, the
 * least share of its strength that does, and what binds (`core-posture-trials.mjs`).
 *
 * Witness first: every row is searched from its seed posture. A row that holds nothing so is
 * searched again from `--seeds` random postures. Each stripped stop (`VARIANTS`) is searched on the
 * rows not held as built and the rows held leaning on that stop, from the built answer and from
 * random postures. Every row's answer is read again on the cone's friction. Where two held rows
 * stand on one ground, the postures between their answers are read too (`path`). Each answer is drawn
 * from the side and the front, `research/runs/postures/<row>, <variant>.svg`, and every record is
 * written to `research/runs/postures/records.json`. Each held answer is then put on the engine and
 * held by its motors (`least`), and handed to the game's stance (`handed`).
 *
 *   node research/core-posture.mjs [--workers 30] [--rows 'stand;half kneel, knee light'] [--variants built,knee]
 *     [--seeds 8] [--evals 1500]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { pointOfToRef } from "../src/core/control/support.ts";
import { defaultLanes } from "./bout-pool.mjs";
import { AUDITED, HOLD_HARNESS, posed, ROWS, rowName, SOLVERS, STATICS_HARNESS, staticBody, STRONG, VARIANTS } from "./core-posture-trials.mjs";

const args = process.argv.slice(2);
const option = (name, otherwise) => { const at = args.indexOf(`--${name}`); return at < 0 ? otherwise : args[at + 1]; };
const lanes = Number(option("workers", defaultLanes()));
const seeds = Number(option("seeds", 8));
const evals = Number(option("evals", 1500));
// Row names hold commas, so `--rows` takes them apart at semicolons.
const only = option("rows", null)?.split(";").map((name) => name.trim());
const variants = option("variants", Object.keys(VARIANTS).join(",")).split(",");
const OUT = new URL("./runs/postures/", import.meta.url);

/** Every job on `lanes` workers, each worker one posture at a time; the records in the jobs' order. */
async function run(jobs) {
  const records = new Array(jobs.length);
  const pool = Array.from({ length: Math.min(lanes, jobs.length) }, () => new Worker(new URL("./core-posture-worker.mjs", import.meta.url)));
  let next = 0;
  await Promise.all(pool.map((worker) => new Promise((resolve, reject) => {
    const feed = () => {
      if (next >= jobs.length) { worker.terminate(); resolve(); return; }
      const id = next++;
      worker.once("message", ({ result, error }) => {
        if (error) { reject(new Error(error)); return; }
        records[id] = result;
        feed();
      });
      worker.postMessage({ trial: "audit", evals, ...jobs[id], id });
    };
    feed();
  })));
  return records;
}

/** Each row, once a height for a row that scans them. */
const rows = ROWS.filter((row) => !only || only.includes(row.name))
  .flatMap((row) => (row.heights ?? [undefined]).map((height) => ({ row: row.name, height, name: rowName(row, height) })));

/** The best of `records` by held, then balanced, then share, then miss; and how many agree with it. */
function bestOf(records) {
  const rank = (r) => (r.held ? 0 : r.found && r.balanced ? 1 : r.found ? 2 : 3);
  const sorted = [...records].sort((a, b) => rank(a) - rank(b) || (a.share ?? Infinity) - (b.share ?? Infinity) || a.miss - b.miss || a.off - b.off);
  const best = sorted[0];
  const agree = records.filter((r) => rank(r) === rank(best) && (best.share === null || Math.abs((r.share ?? Infinity) - best.share) <= 0.02)).length;
  return { ...best, seeds: { of: records.length, agree } };
}

const started = Date.now();
const all = [];
// Witness first: each row from its seed.
const witness = await run(rows.map((r) => ({ row: r.row, height: r.height, seed: 0 })));
all.push(...witness);
// Rows that hold nothing from their seed: random seeds.
const unheld = rows.filter((_, k) => !witness[k].held);
const global = await run(unheld.flatMap((r) => Array.from({ length: seeds }, (_, s) => ({ row: r.row, height: r.height, seed: s + 1 }))));
all.push(...global);
const built = new Map(rows.map((r) => [r.name, bestOf(all.filter((x) => x.row === r.name && x.variant === "built" && x.friction === "box"))]));

// Each stripped stop: on rows not held, and on rows held leaning on it.
const stripped = variants.filter((v) => v !== "built");
const variantJobs = [];
for (const variant of stripped) {
  for (const r of rows) {
    const answer = built.get(r.name);
    const leans = answer.stops.some((s) => VARIANTS[variant].some((pattern) => pattern.test(s.channel)));
    if (answer.held && !leans) continue;
    variantJobs.push({ row: r.row, height: r.height, variant, seed: 0, start: answer.posture });
    for (let s = 1; s <= Math.ceil(seeds / 2); s++) variantJobs.push({ row: r.row, height: r.height, variant, seed: s });
  }
}
all.push(...await run(variantJobs));
// The cone's friction: each row's built answer read again.
all.push(...await run(rows.map((r) => ({ row: r.row, height: r.height, friction: "cone", seed: 0, start: built.get(r.name).posture }))));

// The paths on one ground: a row to one bearing less of what it touches, and a scanned row's
// heights each to the next, both ends held as built.
const base = new Map(ROWS.map((row) => [row.name, row]));
const bears = (r) => new Set(base.get(r.row).bear ?? base.get(r.row).touch);
const pairs = [];
for (const a of rows) for (const b of rows) {
  if (a === b || base.get(a.row).touch.join() !== base.get(b.row).touch.join()) continue;
  const next = a.row === b.row && a.height !== undefined && base.get(a.row).heights.indexOf(b.height) === base.get(a.row).heights.indexOf(a.height) + 1;
  const lighter = a.row !== b.row && [...bears(b)].every((name) => bears(a).has(name)) && bears(b).size < bears(a).size;
  if ((next || lighter) && built.get(a.name).held && built.get(b.name).held) pairs.push([a, b]);
}
const paths = await run(pairs.map(([a, b]) => ({ trial: "path", from: a.row, to: b.row, names: [a.name, b.name], start: built.get(a.name).posture, end: built.get(b.name).posture })));

// The stand hold: each held answer put on the engine and held by its motors, the least share that
// keeps it, by side and by the driver on the reference solver and by side on the game's; a stripped
// answer by side alone. Then the handover from each held answer as built.
const heldRows = rows.filter((r) => built.get(r.name).held);
const HOLDS = [{ drive: "side" }, { drive: "driver" }, { drive: "side", solver: "game" }];
const holdJobs = heldRows.flatMap((r) => HOLDS.map((hold) => ({ trial: "least", name: r.name, row: r.row, posture: built.get(r.name).posture, ...hold })));
const strippedHeld = [];
for (const variant of stripped) for (const r of rows) {
  const answer = bestOf(all.filter((x) => x.row === r.name && x.variant === variant && x.friction === "box"));
  if (answer.seeds.of > 0 && answer.held) strippedHeld.push({ trial: "least", name: r.name, row: r.row, posture: answer.posture, variant, drive: "side" });
}
const tagged = (jobs, records) => records.map((record, k) => ({ ...record, name: jobs[k].name }));
const holds = tagged([...holdJobs, ...strippedHeld], await run([...holdJobs, ...strippedHeld]));
const handJobs = heldRows.map((r) => ({ trial: "handed", name: r.name, row: r.row, posture: built.get(r.name).posture }));
const handovers = tagged(handJobs, await run(handJobs));

const answers = new Map();
for (const record of all) {
  const key = `${record.row}|${record.variant}|${record.friction}`;
  answers.set(key, [...(answers.get(key) ?? []), record]);
}
const best = new Map([...answers].map(([key, records]) => [key, bestOf(records)]));
const of = (name, variant = "built", friction = "box") => best.get(`${name}|${variant}|${friction}`);

const f2 = (v) => (v === null || v === undefined ? "-" : v.toFixed(2));
const verdict = (r) => (r.held ? "held" : !r.found ? "none found" : !r.balanced ? "unbalanced" : "too weak");
const stopsOf = (r) => r.stops.filter((s) => Math.abs(s.torque) >= 5).map((s) => `${s.channel} ${s.torque.toFixed(0)}`).join("; ") || "-";
const bindsOf = (r) => r.binds.slice(0, 4).join(", ") + (r.binds.length > 4 ? ", ..." : "");

console.log(`Harness: ${STATICS_HARNESS}. Body ${AUDITED}, nothing in its hands, no assist. ${rows.length} rows, ${seeds} random seeds where a seed posture holds nothing, ${evals} evaluations a search. ${((Date.now() - started) / 1000).toFixed(0)} s on ${lanes} workers.\n`);
console.log("### As built (friction: the bearing solve's box)\n");
console.log("| row | route | verdict | share | binds | stops bearing, N m | margin, m | centre, m | forces, N | seeds agree |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  const a = of(r.name);
  const forces = Object.entries(a.forces).map(([name, f]) => `${name} ${f.toFixed(0)}`).join("; ") || "-";
  console.log(`| ${r.name} | ${a.route} | ${verdict(a)} | ${f2(a.share)} | ${bindsOf(a) || "-"} | ${stopsOf(a)} | ${f2(a.margin)} | ${f2(a.height)} | ${forces} | ${a.seeds.agree}/${a.seeds.of} |`);
}
console.log("\n### A stop stripped (to 3 rad)\n");
console.log("| row | variant | verdict | share | built share | the stripped channels, from their own zero, rad | binds |");
console.log("|---|---|---|---|---|---|---|");
for (const r of rows) for (const variant of stripped) {
  const a = of(r.name, variant);
  if (!a) continue;
  const channels = Object.entries(a.angles).filter(([name]) => VARIANTS[variant].some((pattern) => pattern.test(name))).map(([name, v]) => `${name} ${v.toFixed(2)}`).join("; ");
  console.log(`| ${r.name} | ${variant} | ${verdict(a)} | ${f2(a.share)} | ${f2(of(r.name).share)} | ${channels} | ${bindsOf(a) || "-"} |`);
}
console.log("\n### Paths on one ground (the two ends' answers as built, 15 postures between)\n");
console.log("| from | to | verdict | greatest share | where | first lost: where, off m, overlap m |");
console.log("|---|---|---|---|---|---|");
for (const p of paths) {
  const lost = p.lost ? `${f2(p.lost.at)}, ${p.lost.off}, ${p.lost.overlap}${p.lost.between ? ` (${p.lost.between.join(", ")})` : ""}` : "-";
  console.log(`| ${p.from} | ${p.to} | ${p.held ? "held" : !p.found ? "lost" : !p.balanced ? "unbalanced" : "too weak"} | ${f2(p.share)} | ${f2(p.at)} | ${lost} |`);
}
console.log("\n### Friction: the box against the cone\n");
console.log("| row | box | cone | flips |");
console.log("|---|---|---|---|");
for (const r of rows) {
  const box = of(r.name), cone = of(r.name, "built", "cone");
  console.log(`| ${r.name} | ${verdict(box)} ${f2(box.share)} | ${verdict(cone)} ${f2(cone.share)} | ${box.held !== cone.held ? "yes" : ""} |`);
}
console.log(`\n### The stand hold (${HOLD_HARNESS})\n`);
console.log("Least `k` that keeps each segment within twice the strong control's drift (and at least the bar) of where it was put; `none` if even the most tried does not, `fell` if the strong control itself falls, each with its drift and worst channel.\n");
const solverName = (name) => { const s = SOLVERS[name]; return `${s.hz} Hz, ${s.iterations ? `${s.iterations} iterations of ${s.pgs} passes` : "the core's iterations"}`; };
console.log(`On the reference solver (${solverName("reference")}) and the game's (${solverName("game")}).\n`);
console.log(`| row | variant | statics share | by side, reference | by the driver, reference | by side, game | creep at ${STRONG}x, m (reference) | touched | leant on |`);
console.log("|---|---|---|---|---|---|---|---|---|");
const holdCell = (h) => (!h ? "-" : h.k !== null ? f2(h.k) : `${h.fell ? "fell" : "none"} (${h.at.drift} m, ${h.at.worst.channel})`);
for (const r of heldRows) {
  const mine = holds.filter((h) => h.name === r.name && h.variant === "built");
  const side = mine.find((h) => h.drive === "side" && h.solver === "reference"), driver = mine.find((h) => h.drive === "driver"), game = mine.find((h) => h.solver === "game");
  const at = side.k !== null ? side.at : side.creep;
  console.log(`| ${r.name} | built | ${f2(built.get(r.name).share)} | ${holdCell(side)} | ${holdCell(driver)} | ${holdCell(game)} | ${side.creep.drift} | ${at.touched.join(", ") || "-"} | ${at.leant.join(", ") || "-"} |`);
}
for (const h of holds.filter((x) => x.variant !== "built")) {
  const at = h.k !== null ? h.at : h.creep;
  console.log(`| ${h.name} | ${h.variant} | ${f2(of(h.name, h.variant).share)} | ${holdCell(h)} | - | - | ${h.creep.drift} | ${at.touched.join(", ") || "-"} | ${at.leant.join(", ") || "-"} |`);
}
console.log(`\n### The handover (the game's body and stance, on its solver: ${solverName("game")})\n`);
console.log("Stood: not down for its last 2 s and more, and its centre of mass within 5 cm of the height its stance asks.\n");
console.log("| row | centre put, m | stood | up after, s | centre at the end, m | asked, m | fastest segment at the end, m/s |");
console.log("|---|---|---|---|---|---|---|");
for (const h of handovers) console.log(`| ${h.name} | ${f2(built.get(h.name).height)} | ${h.stood ? "yes" : "no"} | ${h.seconds ?? "-"} | ${f2(h.centre)} | ${f2(h.asked)} | ${f2(h.peak)} |`);

mkdirSync(OUT, { recursive: true });
writeFileSync(new URL("records.json", OUT), JSON.stringify({ harness: STATICS_HARNESS, evals, seeds, records: all, best: Object.fromEntries(best), paths, holds, handovers }, null, 1));
const body = await staticBody();
for (const [key, record] of best) {
  const [name, variant, friction] = key.split("|");
  if (friction !== "box") continue;
  writeFileSync(new URL(`${name.replaceAll(/[^\w @.,-]/g, "")}, ${variant}.svg`, OUT), pictureOf(body, record));
}
body.dispose();

/**
 * `record`'s posture drawn from the side (z across, y up) and from the front (x across), each
 * segment as the outline of its shape's lowest points (`lowsOf`): a capsule a thick line, a box
 * its corners' hull.
 */
function pictureOf(body, record) {
  posed(body, record.posture);
  const at = new Vector3(), scale = 300, width = 900, height = 520, ground = 470;
  const views = [{ across: (p) => p.z, left: 230 }, { across: (p) => p.x, left: 680 }];
  const parts = [];
  for (const view of views) {
    parts.push(`<line x1="${view.left - 210}" y1="${ground}" x2="${view.left + 210}" y2="${ground}" stroke="#888"/>`);
    for (const segment of body.segments) {
      const points = body.lows.filter((low) => low.segment === segment).map((low) => {
        pointOfToRef(segment, low.at, at);
        return [view.left + scale * view.across(at), ground - scale * at.y, low.radius * scale];
      });
      const r = points[0][2];
      if (r > 0) parts.push(`<polyline points="${points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}" stroke="#4a6fa5" stroke-opacity="0.6" stroke-width="${(2 * r).toFixed(1)}" stroke-linecap="round" fill="none"/>`);
      else parts.push(`<polygon points="${hull2(points).map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}" fill="#4a6fa5" fill-opacity="0.45" stroke="#4a6fa5"/>`);
    }
  }
  const title = `${record.row}, ${record.variant}: ${record.held ? "held" : "not held"}, share ${record.share ?? "-"}, centre ${record.height} m`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/>` +
    `<text x="10" y="20" font-family="sans-serif" font-size="14">${title}</text><text x="20" y="40" font-family="sans-serif" font-size="12">side (facing right)</text><text x="480" y="40" font-family="sans-serif" font-size="12">front</text>${parts.join("")}</svg>`;
}

/** The convex hull of 2-D points, by the monotone chain. */
function hull2(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (from) => { const out = []; for (const q of from) { while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop(); out.push(q); } return out.slice(0, -1); };
  return [...chain(sorted), ...chain([...sorted].reverse())];
}
