/**
 * The x1 control band: the per-body damage and knockdowns a bout of a sweep's control row, with a
 * 95 % bootstrap interval over side-swap blocks.
 *
 *     node research/control-band.mjs research/runs/pc01/giant [--level control]
 *
 * The physical-contact set (`docs/plans/2026-09-23-physical-contact-00-overview.md` (in git at 30dcb8c)) gates every
 * behaviour-changing session on an x1-vs-x1 control whose damage and knockdowns sit "within the
 * band session 01 records". This prints that band from any `research/stat-sweep.mjs` run directory,
 * so the session that is being judged and the baseline are read by one instrument. In an x1 mirror
 * both corners are the same body, so a block's reading is the mean over its two bouts and both sides.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** A deterministic 95 % bootstrap interval of the mean over `values`. */
export function bootstrapInterval(values, draws = 4000, seed = 20260923) {
  let state = seed >>> 0;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  const means = [];
  for (let d = 0; d < draws; d += 1) {
    let sum = 0;
    for (let i = 0; i < values.length; i += 1) sum += values[Math.floor(next() * values.length)];
    means.push(sum / values.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(draws * 0.025)], means[Math.floor(draws * 0.975)]];
}

/** Per-block per-body readings for one level of a sweep's rows. */
export function blockReadings(rows, level = "control") {
  const blocks = new Map();
  for (const row of rows) {
    if (row.status !== "ok" || row.level !== level) continue;
    const list = blocks.get(row.block) ?? [];
    list.push(row);
    blocks.set(row.block, list);
  }
  const perBody = (list, field) => mean(list.flatMap((row) => [row.sides.left[field], row.sides.right[field]]));
  return [...blocks.values()].map((list) => ({
    damage: perBody(list, "damage"),
    knockdowns: perBody(list, "knockdowns"),
    seconds: mean(list.map((row) => row.seconds)),
  }));
}

export function controlBand(rows, level = "control") {
  const blocks = blockReadings(rows, level);
  if (blocks.length === 0) throw new Error(`no ok rows at level "${level}"`);
  const band = (field) => ({ mean: mean(blocks.map((b) => b[field])), interval: bootstrapInterval(blocks.map((b) => b[field])) });
  return { blocks: blocks.length, damage: band("damage"), knockdowns: band("knockdowns"), seconds: band("seconds") };
}

function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: node research/control-band.mjs <sweep dir> [--level <key>]");
  const at = process.argv.indexOf("--level");
  const level = at > 0 ? process.argv[at + 1] : "control";
  const rows = readFileSync(join(dir, "results.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const band = controlBand(rows, level);
  const show = (b, digits) => `${b.mean.toFixed(digits)} [${b.interval[0].toFixed(digits)}, ${b.interval[1].toFixed(digits)}]`;
  console.log(`${dir}, level ${level}: ${band.blocks} blocks`);
  console.log(`damage / body / bout      ${show(band.damage, 2)}`);
  console.log(`knockdowns / body / bout  ${show(band.knockdowns, 2)}`);
  console.log(`seconds / bout            ${show(band.seconds, 1)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
