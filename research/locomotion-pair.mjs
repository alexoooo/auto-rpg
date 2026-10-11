/**
 * **Two locomotion readings, run by run** (`research/locomotion-run.mjs --out`): each run of A
 * matched to B's of the same model, track, pace, wind and seed. Per group: the runs, the falls in
 * each, the runs only one of them fell in (a two-sided sign test on those), the mean speed along
 * the track over the runs both held, and the mean time up (to the fall, or the whole run).
 *
 *   node research/locomotion-pair.mjs A.jsonl B.jsonl [model] [track] [pace] [wind]
 *
 * The fields after the files group the runs; with none, one line for all of them.
 */
import { readFileSync } from "node:fs";

const [a, b, ...by] = process.argv.slice(2);
if (!a || !b) throw new Error("two readings to pair");

/** A reading's runs by their key. */
const load = (file) => new Map(readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line))
  .map((r) => [`${r.model}|${r.track}|${r.pace}|${r.wind.rate}:${r.wind.strength}|${r.seed}`, r]));

/** Two-sided sign test: the chance of a split as uneven as `x` against `y` under even odds. */
function sign(x, y) {
  const n = x + y;
  if (!n) return 1;
  let p = 0, c = 1;
  for (let i = 0; i <= Math.min(x, y); i++) { p += c; c = c * (n - i) / (i + 1); }
  return Math.min(1, 2 * p / 2 ** n);
}

const A = load(a), B = load(b), groups = new Map();
for (const [key, ra] of A) {
  const rb = B.get(key);
  if (!rb) continue;
  const group = by.map((f) => f === "wind" ? `${ra.wind.rate}:${ra.wind.strength}` : ra[f]).join(" ") || "all";
  const s = groups.get(group) ?? { n: 0, fa: 0, fb: 0, onlyA: 0, onlyB: 0, both: 0, sa: 0, sb: 0, ta: 0, tb: 0 };
  const fa = ra.fell !== null, fb = rb.fell !== null;
  s.n++; s.fa += fa; s.fb += fb; s.onlyA += fa && !fb; s.onlyB += fb && !fa;
  if (!fa && !fb) { s.both++; s.sa += ra.mean; s.sb += rb.mean; }
  s.ta += ra.fell ?? ra.gait.seconds; s.tb += rb.fell ?? rb.gait.seconds;
  groups.set(group, s);
}
console.log(`A ${a}\nB ${b}\ngroup: runs | falls A B | only A fell, only B fell (sign test p) | speed of runs both held A B | time up A B`);
for (const [group, s] of [...groups].sort(([x], [y]) => x.localeCompare(y, undefined, { numeric: true }))) {
  console.log(`${group}: ${s.n} | ${s.fa} ${s.fb} | ${s.onlyA} ${s.onlyB} (p ${sign(s.onlyA, s.onlyB).toFixed(3)})`
    + ` | ${(s.sa / Math.max(1, s.both)).toFixed(3)} ${(s.sb / Math.max(1, s.both)).toFixed(3)} | ${(s.ta / s.n).toFixed(1)} ${(s.tb / s.n).toFixed(1)}`);
}
