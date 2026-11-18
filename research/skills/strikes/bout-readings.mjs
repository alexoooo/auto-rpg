/**
 * What saved Arena bouts (`strike-bouts.mjs --save`) show of how a fight went and of what its minds
 * expected, each file a row:
 *
 *   node --import ./tests/harness/preload-data.mjs research/skills/strikes/bout-readings.mjs <label>=<file> [<label>=<file> ...] [--pairs] [--prices] [--spread] [--profiles <file>]
 *
 * **Silence**: of each bout after its first committed punch, the share spent in gaps over `QUIET` s
 * with no punch begun by either side; punches and landed blows (at least `LANDED`) a bout; how bouts
 * ended; with `--spread`, each label's silent and standing shares with a 95% bootstrap over its
 * bouts. **Pairs** (`--pairs`): each pairing's sides apart, punches thrown and landed, the median
 * landed blow, wins. **Prices** (`--prices`), what each mind expected against what the fight gave
 * it, each summed over the bouts, a ratio over 1 a price above what the fight gave:
 * - **a punch**: the terms of the strike offered with its limb (`Engagement.offers`) at the decision
 *   it began at, against the life its blows took (each wound's damage at its part's cost in life,
 *   `lifeFactor`, under the Arena's rules, over the foe's hit points, as a profile's trial counts what
 *   it dealt) and the life
 *   its body lost over the seconds it was priced to run;
 * - **a second in reach** (closer than the foe's priced reach, `reachOf`): what holding there was
 *   priced a second (the hold offer's taken over its duration) against the life the body lost, from
 *   each decision to the next;
 * - **out of reach**, at each decision by what it chose (to walk, to hold, else): the chosen offer's
 *   taken against the life the body lost over the seconds it priced.
 */
import { readFileSync } from "node:fs";

/** A silence is this long with no punch begun by either side, s. */
const QUIET = 3;
/** A landed blow takes at least this much life, HP (`strike-bouts.mjs`). */
const LANDED = .5;
/** The profiles a mind prices its foe by, unless `--profiles <file>` names those the bouts were played with. */
const PROFILES = "assets/skills/strikes/strike-profiles/strike-profiles.json";

const args = process.argv.slice(2), pairs = args.includes("--pairs"), prices = args.includes("--prices"), spread = args.includes("--spread");
const at = args.indexOf("--profiles"), profiles = at < 0 ? PROFILES : args.splice(at, 2)[1];
const files = args.filter((arg) => !arg.startsWith("--")).map((arg) => { const at = arg.indexOf("="); return [arg.slice(0, at), arg.slice(at + 1)]; });
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
const punchesOf = (bout) => bout.sides.flatMap((side) => side.attempts.filter((a) => a.action === "straight-punch" && a.committed));
const dealtBy = (attempt) => sum(attempt.wounds.map((w) => w.damage));

console.log(`Silence: share of a bout after its first punch in gaps over ${QUIET} s with no punch begun, and of it with both bodies standing (NaN where a bout kept no stretches down); landed at least ${LANDED} hp`);
console.log("label".padEnd(24), "bouts  len  silent%  standing%  1st  punches/bout  landed/bout  hp/bout  knockout  drained  time  downs/bout");
const loaded = files.map(([label, file]) => [label, JSON.parse(readFileSync(file, "utf8"))]);
for (const [label, all] of loaded) {
  const rows = all.map(([, bout]) => {
    const punches = punchesOf(bout), times = punches.map((a) => a.began).sort((a, b) => a - b), first = times[0] ?? bout.seconds;
    const marks = [...times, bout.seconds];
    let silent = 0, down = 0;
    for (let i = 1; i < marks.length; i++) {
      const from = marks[i - 1], to = marks[i];
      if (to - from <= QUIET) continue;
      silent += to - from;
      for (const [a, b] of bout.grounded ?? []) down += Math.max(0, Math.min(b, to) - Math.max(a, from));
    }
    const dealt = punches.map(dealtBy);
    return { len: bout.seconds, first, silent, standing: bout.grounded ? silent - down : NaN, punches: punches.length, landed: dealt.filter((hp) => hp >= LANDED).length, hp: sum(dealt), ending: bout.ending,
      downs: bout.downs ? bout.downs[0].length + bout.downs[1].length : NaN };
  });
  const n = rows.length, fought = sum(rows.map((r) => r.len - r.first)), ends = (kind) => rows.filter((r) => r.ending === kind).length;
  console.log(label.padEnd(24), String(n).padStart(5), (sum(rows.map((r) => r.len)) / n).toFixed(0).padStart(4), (100 * sum(rows.map((r) => r.silent)) / fought).toFixed(0).padStart(8), (100 * sum(rows.map((r) => r.standing)) / fought).toFixed(0).padStart(10),
    median(rows.map((r) => r.first)).toFixed(1).padStart(5), (sum(rows.map((r) => r.punches)) / n).toFixed(1).padStart(13), (sum(rows.map((r) => r.landed)) / n).toFixed(2).padStart(12),
    (sum(rows.map((r) => r.hp)) / n).toFixed(2).padStart(8), String(n - ends("drained") - ends("time")).padStart(9), String(ends("drained")).padStart(8), String(ends("time")).padStart(5),
    (sum(rows.map((r) => r.downs)) / n).toFixed(2).padStart(11));
  if (spread) {
    // The shares over bouts drawn again with replacement, 2,000 times, from a seeded stream.
    let word = 7;
    const draw = () => { word = (word + 0x6d2b79f5) | 0; let t = Math.imul(word ^ (word >>> 15), 1 | word); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const share = (of, key) => 100 * sum(of.map((r) => r[key])) / sum(of.map((r) => r.len - r.first));
    const interval = (key) => {
      const xs = Array.from({ length: 2000 }, () => share(rows.map(() => rows[Math.floor(draw() * n)]), key)).sort((a, b) => a - b);
      return `${share(rows, key).toFixed(1)} (${xs[50].toFixed(1)} to ${xs[1949].toFixed(1)})`;
    };
    console.log(`  ${label}: silent ${interval("silent")}%, standing ${interval("standing")}%`);
  }
}

if (pairs) {
  console.log("\nPairs: each side's punches, landed (at least 0.5 hp) a bout-minute, the median landed blow, wins left-right");
  for (const [label, all] of loaded) {
    const byPair = new Map();
    for (const [key, bout] of all) { const [left, right] = key.split(" "), pair = `${left} v ${right}`; (byPair.get(pair) ?? byPair.set(pair, []).get(pair)).push(bout); }
    for (const [pair, bouts] of byPair) {
      const minutes = sum(bouts.map((b) => b.seconds)) / 60;
      const side = (i) => {
        const thrown = bouts.flatMap((b) => b.sides[i].attempts.filter((a) => a.action === "straight-punch" && a.committed)), landed = thrown.map(dealtBy).filter((hp) => hp >= LANDED);
        return `${String(thrown.length).padStart(4)} thrown ${String(landed.length).padStart(4)} landed (${(landed.length / minutes).toFixed(2)} a minute) median ${landed.length ? median(landed).toFixed(2) : "none"} hp`;
      };
      const wins = ["left", "right"].map((s) => bouts.filter((b) => b.winner === s).length);
      console.log(`${label.padEnd(16)} ${pair.padEnd(20)} ${String(bouts.length).padStart(3)} bouts | left ${side(0)} | right ${side(1)} | wins ${wins[0]}-${wins[1]}`);
    }
  }
}

/** How far a foe of `foe` is priced to reach a body of `body`, m centre to centre: its measured strikes' farthest start begun clear, both standing and empty-handed (`ProfileReading.reach`). */
function reachOf(foe, body) {
  let reach = 0;
  for (const profile of JSON.parse(readFileSync(profiles, "utf8")).profiles) {
    if (profile.measured.body !== foe || profile.target?.body !== body) continue;
    for (const trial of profile.trials) if (!trial.letGo && !trial.start.held && trial.start.phase === "clear" && !trial.start.postures) reach = Math.max(reach, trial.start.range);
  }
  return reach;
}

/** What a chosen offer is, by its name: a walk (to close or keep away), a hold, a strike, else. */
const kindOf = (name) => / to /.test(name) ? "walk" : name === "hold" ? "hold" : /^[a-z-]+ (hand|foot)\./.test(name) ? "strike" : "else";

if (prices) {
  const [{ lifeFactor }, { rulebook }, { duelSpec }] = await Promise.all([import("../../../src/combat/pool.ts"), import("../../../src/combat/rulebook.ts"), import("../../../src/game/arena/duel.ts")]);
  const rules = rulebook("arena"), specs = new Map();
  /** The life `attempt`'s wounds took of a body of `model`, over its hit points. */
  const lifeTaken = (attempt, model, hp) => {
    const spec = specs.get(model) ?? specs.set(model, duelSpec({ left: model, right: model }, "left")).get(model);
    return sum(attempt.wounds.map((w) => w.damage * lifeFactor(rules, spec, w.part))) / hp;
  };
  console.log("\nPrices: what each mind expected against what the fight gave it; % of a life, each a mean");
  console.log("label".padEnd(24), "of".padEnd(20), "count  expected dealt  given dealt  ratio   expected taken  given taken  ratio");
  for (const [label, all] of loaded) {
    const rows = new Map(), reaches = new Map();
    const add = (row, dealt, given, taken, lost) => { const r = rows.get(row) ?? rows.set(row, { n: 0, dealt: 0, given: 0, taken: 0, lost: 0 }).get(row); r.n++; r.dealt += dealt; r.given += given; r.taken += taken; r.lost += lost; };
    for (const [key, bout] of all) {
      if (!bout.decisions || !bout.hp) throw new Error(`${label}: saved without decisions (schema ${bout.schema})`);
      const models = key.split(" ").slice(0, 2);
      // Each side's life at a time: the last reading at or before it, of either side's decisions, then the bout's end.
      const lives = [...bout.decisions[0].map((d) => [d[0], d[6], d[7]]), ...bout.decisions[1].map((d) => [d[0], d[7], d[6]]), [bout.seconds, bout.bars[0], bout.bars[1]]].sort((a, b) => a[0] - b[0]);
      const lifeAt = (t, s) => { let lo = 0, hi = lives.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lives[mid][0] <= t + 1e-9) lo = mid; else hi = mid - 1; } return lives[lo][1 + s]; };
      const lost = (s, from, seconds) => lifeAt(from, s) - lifeAt(Math.min(bout.seconds, from + seconds), s);
      for (const s of [0, 1]) {
        const body = models[s], foe = models[1 - s], pair = `${foe} ${body}`;
        if (!reaches.has(pair)) reaches.set(pair, reachOf(foe, body));
        const reach = reaches.get(pair), decisions = bout.decisions[s];
        decisions.forEach(([t, apart, name, duration, , taken, , , holding], i) => {
          if (apart < reach) {
            const next = decisions[i + 1]?.[0] ?? bout.seconds, dt = next - t;
            if (holding !== null) add("seconds in reach", 0, 0, holding * dt, lost(s, t, dt));
          } else if (duration !== null) add(`out of reach, ${kindOf(name)}`, 0, 0, taken, lost(s, t, duration));
        });
        // Each punch: the strike offered with its limb at the last decision at or before it began.
        for (const attempt of bout.sides[s].attempts) {
          if (!attempt.committed || attempt.action !== "straight-punch") continue;
          let at = null;
          for (const d of decisions) { if (d[0] > attempt.began + 1e-9) break; at = d; }
          const offer = at?.[9]?.find(([n]) => n === `${attempt.action} ${attempt.effector}`);
          if (!offer || offer[1] === null) continue;
          const [, duration, dealt, taken] = offer;
          const given = lifeTaken(attempt, foe, bout.hp[1 - s]);
          add(at[1] < reach ? "punch, in reach" : "punch, from out", dealt, given, taken, lost(s, attempt.began, duration));
          add("punch", dealt, given, taken, lost(s, attempt.began, duration));
        }
      }
    }
    const ratio = (a, b) => b > 0 ? (a / b).toFixed(2) : "-";
    for (const row of ["punch", "punch, in reach", "punch, from out", "seconds in reach", "out of reach, walk", "out of reach, hold", "out of reach, strike", "out of reach, else"]) {
      const r = rows.get(row);
      if (!r) continue;
      console.log(label.padEnd(24), row.padEnd(20), String(r.n).padStart(5), (100 * r.dealt / r.n).toFixed(2).padStart(15), (100 * r.given / r.n).toFixed(2).padStart(12), ratio(r.dealt, r.given).padStart(6),
        (100 * r.taken / r.n).toFixed(2).padStart(16), (100 * r.lost / r.n).toFixed(2).padStart(12), ratio(r.taken, r.lost).padStart(6));
    }
    const punch = rows.get("punch"), held = rows.get("seconds in reach");
    if (punch && held) console.log(`${"".padEnd(24)} a punch's dealt over a second in reach's taken, each as priced over as given: ${(punch.dealt / punch.given / (held.taken / held.lost)).toFixed(2)};`
      + ` reach, centre to centre: ${[...reaches].map(([p, m]) => `${p} ${m.toFixed(3)} m`).join(", ")}`);
  }
}
