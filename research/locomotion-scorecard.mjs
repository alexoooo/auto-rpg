/**
 * **The locomotion scorecard**: one fixed reading of a gait on the locomotion test bed
 * (`research/locomotion-run.mjs`: Node stand, Rapier, 120 Hz), so that two gaits, or two settings
 * of one, are read on the same thing. On the Warrior and the Rogue:
 *
 * - **the lines**: forward, right, back and left at 0.3 to 2.0 m/s, 20 s each, under gusts of 20 N
 *   once a second, which hardly push but make each seed a run of its own; 10 seeds;
 * - **the turns**: the square and the circle at 0.5, 0.7 and 1.0 m/s, 30 s each, under 50 N gusts;
 *   10 seeds.
 *
 * It prints, per body and line, the fastest pace at which 9 seeds in 10 held (`HELD`) and every
 * slower one did too, the mean speed along the line there, and the runs that fell at each pace;
 * per body and turn, the falls at each pace. Its runs go to `<out>-lines.jsonl` and
 * `<out>-turns.jsonl`, for `research/locomotion-pair.mjs` to read against another reading's.
 *
 *   node research/locomotion-scorecard.mjs --out research/runs/locomotion-scorecard/base [--quick] [any locomotion-run.mjs argument]
 *
 * `--quick` reads 4 seeds in place of 10. Everything else is passed to `locomotion-run.mjs` as it
 * is: `--legs`, `--stance`, `--physique`, `--sole`, `--models`, a probe's flags, `--workers`.
 * The whole card is 1,280 runs; on the development host (30 lanes) it takes a few minutes.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The share of seeds a pace must hold on for a line to count as held at it. */
const HELD = 0.9;
const LINES = ["forward", "right", "back", "left"], TURNS = ["square", "circle"];
const LINE_PACES = [0.3, 0.5, 0.7, 1, 1.2, 1.4, 1.7, 2], TURN_PACES = [0.5, 0.7, 1];

const argv = process.argv.slice(2);
const at = argv.indexOf("--out");
if (at < 0) throw new Error("--out names the reading");
const out = argv[at + 1], quick = argv.includes("--quick");
const passed = argv.filter((a, i) => i !== at && i !== at + 1 && a !== "--quick");
const seeds = Array.from({ length: quick ? 4 : 10 }, (_, i) => i + 1).join(",");
const harness = fileURLToPath(new URL("./locomotion-run.mjs", import.meta.url));

/** One leg of the card, its runs written fresh to `file`. */
function read(file, tracks, paces, wind, seconds) {
  if (existsSync(file)) rmSync(file);
  const run = spawnSync(process.execPath, [harness, "--tracks", tracks.join(","), "--paces", paces.join(","), "--winds", wind,
    "--seeds", seeds, "--seconds", String(seconds), "--out", file, ...passed], { stdio: ["ignore", "ignore", "inherit"] });
  if (run.status !== 0) throw new Error(`locomotion-run.mjs ended ${run.status}`);
  return readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line));
}

const started = Date.now();
const lines = read(`${out}-lines.jsonl`, LINES, LINE_PACES, "1:20", 20);
const turns = read(`${out}-turns.jsonl`, TURNS, TURN_PACES, "1:50", 30);
const models = [...new Set(lines.map((r) => r.model))];
console.log(`scorecard ${out}: ${lines.length + turns.length} runs in ${((Date.now() - started) / 60000).toFixed(1)} min; ${passed.join(" ") || "the harness's defaults"}`);
for (const model of models) {
  const held = [];
  for (const track of LINES) {
    let fastest = null, holding = true;
    const falls = [];
    for (const pace of LINE_PACES) {
      const runs = lines.filter((r) => r.model === model && r.track === track && r.pace === pace);
      const up = runs.filter((r) => r.fell === null);
      falls.push(runs.length - up.length);
      holding &&= up.length >= HELD * runs.length;
      if (holding) fastest = { pace, mean: up.reduce((s, r) => s + r.mean, 0) / up.length };
    }
    held.push(fastest?.pace ?? 0);
    console.log(`${model} ${track}: held ${fastest ? `${fastest.pace} (${fastest.mean.toFixed(2)} m/s along)` : "none"}; fell by pace ${falls.join(",")}`);
  }
  for (const track of TURNS) {
    const falls = TURN_PACES.map((pace) => turns.filter((r) => r.model === model && r.track === track && r.pace === pace && r.fell !== null).length);
    console.log(`${model} ${track}: fell by pace ${falls.join(",")} of ${seeds.split(",").length}`);
  }
  console.log(`${model} lines held ${held.join("/")} (forward/right/back/left)`);
}
