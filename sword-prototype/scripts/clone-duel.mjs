// CR2: does the clone fight like the mind it was copied from? Paired, seed by seed.
//
//   node scripts/clone-duel.mjs [--seeds 128] [--cap 60] [--opponent golem-fencer]
//                               [--arms driver,clone,policy] [--seed 20260919]
//                               [--tables clone=snapshots/cr-clone.json,ao=snapshots/x.json]
//
// `driver` and `policy` are built in -- the hand-coded mind and the shipped fitted one. Any other
// arm name must be given a table by `--tables`, which is what lets a snapshot from an older physics
// be re-rated on exactly this instrument rather than on a second one that merely resembles it.
//
// ## What this is for
//
// CR1 asks whether the clone reproduces the driver's **command** on a state the driver visited.
// That is a per-ask question and a supervised one, and it is answered on held-out bouts by
// `clone-policy.mjs fit`. It is not the question that matters.
//
// The question that matters is whether reproducing the commands reproduces the *fighting*, and
// those come apart for a reason that is not subtle: this is closed-loop control at twelve hertz
// over roughly five hundred asks a bout, so a clone that is right on 95 % of asks is wrong
// twenty-five times, each time from a state its own previous error put it in. **Behaviour cloning
// has exactly one reliable failure mode and this is the instrument that sees it.**
//
// Every arm plays the same seeds against the same opponent seeds, so bout `i` of one arm met the
// same body under the same streams as bout `i` of every other and the difference of two arms is a
// paired column with its own interval -- the same property CQ gave the behaviour columns, for the
// same reason. A score alone cannot referee this: the record's own bar
// *"cannot see a 2.5-fold change in completed strokes a bout at all"*.

import { availableParallelism } from "node:os";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NL = /\r?\n/;

const flagOf = (argv, name, fallback) => {
  const at = argv.indexOf(name);
  return at === -1 || at + 1 >= argv.length ? fallback : argv[at + 1];
};

const mean = (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const sem = (xs) => {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length);
};

/** One arm over some seeds, in a child, so a crashed bout cannot take the table with it. */
async function cell({ arm, seeds, cap, opponent, tablePath }) {
  const { freshHavok, runBout } = await import("./bout-runner.mjs");
  const { golemDriver, DRIVER } = await import("../src/golem/styles/driver.ts");
  const { golemPolicy } = await import("../src/golem/policy.ts");
  const { POLICY_WEIGHTS } = await import("../src/golem/policy-weights.ts");
  const { GOLEM_TACTICS_V4 } = await import("../src/golem/tactics-v4.ts");
  const { golemFencer } = await import("../src/golem/tactics-v2.ts");
  const { golemBrawler } = await import("../src/golem/styles/brawler.ts");
  const { idleMind } = await import("../src/mind.ts");
  const { defaultGolemSetup } = await import("../src/golem/build.ts");

  /**
   * The rung the arm is being measured on.
   *
   * The owner asked for a ladder -- *"a dummy, and then some kind of intermediate AI, and then the
   * good hand-coded policy"* -- and until this took more than two names it could only ever report
   * the top of it. `idle` is the dummy and AR is the warning that comes with it: damage against a
   * body that never steps away is a function of mass in contact rather than of blade speed, so a
   * win there measures shoving and is not rung one in any useful sense.
   */
  const opponentOf = (seed) => {
    if (opponent === "golem-brawler") return golemBrawler(seed);
    if (opponent === "golem-idle" || opponent === "idle") return idleMind();
    if (opponent === "golem-driver") {
      const it = golemDriver(seed, DRIVER);
      return { name: "golem-driver", driven: it, decide: (v, dt) => it.decide(v, dt) };
    }
    return golemFencer(seed);
  };

  const loaded = tablePath === null
    ? null : JSON.parse(readFileSync(resolve(ROOT, tablePath), "utf8"));
  const physics = await freshHavok();
  const rows = [];

  for (const seed of seeds) {
    let driven = null;
    let left = null;
    // What the mind *asks for*, not what the body managed: CR3 found the clone's failure entirely
    // in its gate rates -- a commit on six asks in ten against the driver's one in eleven -- and a
    // duel that reports only the outcome cannot see that at all.
    const gates = { asks: 0, commit: 0, abort: 0, parry: 0 };
    const watch = (reading, view, command) => {
      gates.asks += 1;
      if (command.commit >= 0.5) gates.commit += 1;
      if (command.abort >= 0.5) gates.abort += 1;
      if (command.parry >= 0.5) gates.parry += 1;
    };
    if (arm === "driver") {
      driven = golemDriver(seed, DRIVER, watch);
      left = { name: "golem-driver", driven, decide: (v, dt) => driven.decide(v, dt) };
    } else {
      // Greedy, always: the mean of the head is what a played mind does, and CP measured what
      // sampling costs a stroke. An arm drawn from its own spread would be a different mind.
      const table = loaded ?? POLICY_WEIGHTS;
      const mind = golemPolicy(seed, table, GOLEM_TACTICS_V4, null, false, watch);
      driven = mind.driven;
      left = { name: `golem-${arm}`, driven, decide: (v, dt) => mind.decide(v, dt) };
    }
    const right = opponentOf(seed + 17);
    const bout = runBout({
      left: `golem-${arm}`, right: opponent,
      leftUnit: "golem", rightUnit: "golem",
      leftGolem: defaultGolemSetup(), rightGolem: defaultGolemSetup(),
      locomotionMode: "supported", seeds: [seed, seed + 17], maxSeconds: cap, physics,
      leftMind: left, rightMind: right,
    });
    const me = bout.left;
    const them = bout.right;
    rows.push({
      seed,
      score: bout.winner === "left" ? 1 : bout.winner === null ? 0.5 : 0,
      decided: bout.winner === null ? 0 : 1,
      seconds: bout.seconds,
      strokes: driven.strokes,
      aborts: driven.aborts,
      completion: driven.strokes === 0 ? 0 : (driven.strokes - driven.aborts) / driven.strokes,
      damage: me.damage,
      taken: them.damage,
      hits: me.hits,
      contacts: me.speeds.length,
      speed: mean(me.speeds),
      peak: me.peakTipDriven,
      retreat: me.retreatTime,
      inside: me.insidePunchRange,
      asked: gates.asks,
      commitRate: gates.asks === 0 ? 0 : gates.commit / gates.asks,
      abortRate: gates.asks === 0 ? 0 : gates.abort / gates.asks,
      parryRate: gates.asks === 0 ? 0 : gates.parry / gates.asks,
    });
  }
  return { arm, rows };
}

const COLUMNS = [
  "score", "decided", "seconds", "strokes", "completion", "damage", "taken",
  "hits", "contacts", "speed", "peak", "retreat", "inside",
  "asked", "commitRate", "abortRate", "parryRate",
];

async function main(argv) {
  const count = Number(flagOf(argv, "--seeds", "128"));
  const cap = Number(flagOf(argv, "--cap", "60"));
  const base = Number(flagOf(argv, "--seed", "20260919"));
  const opponent = flagOf(argv, "--opponent", "golem-fencer");
  const shards = Math.max(1, Math.min(availableParallelism(), 16));

  // `policy` is the shipped fitted mind and is here as the floor, not as a contender: it is what
  // thirteen sessions of gradient bought, and a clone that cannot beat it has not earned the phase.
  const arms = (flagOf(argv, "--arms", "driver,clone,policy"))
    .split(",").map((a) => a.trim()).filter((a) => a !== "");
  const tables = Object.fromEntries((flagOf(argv, "--tables", "clone=snapshots/cr-clone.json"))
    .split(",").filter((part) => part.trim() !== "").map((part) => {
      const at = part.indexOf("=");
      if (at === -1) throw new Error(`--tables wants name=path, got "${part}"`);
      return [part.slice(0, at).trim(), part.slice(at + 1).trim()];
    }));
  // Refused rather than quietly fetching `POLICY_WEIGHTS`, which would report the shipped mind
  // under a snapshot's name and be indistinguishable in the table from a real reading of it.
  for (const arm of arms) {
    if (arm !== "driver" && arm !== "policy" && tables[arm] === undefined) {
      throw new Error(`arm "${arm}" has no table; pass --tables ${arm}=path/to/weights.json`);
    }
  }
  if (arms.length < 2) throw new Error("a paired table wants at least two arms");

  const seeds = Array.from({ length: count }, (_, i) => base + i * 101);
  const slice = Math.ceil(seeds.length / shards);
  const plan = arms.flatMap((arm) => Array.from({ length: shards }, (_, s) => ({
    arm, seeds: seeds.slice(s * slice, (s + 1) * slice), cap, opponent,
    tablePath: tables[arm] ?? null,
  }))).filter((c) => c.seeds.length > 0);

  console.log(`clone duel: ${arms.join(", ")} against ${opponent}, ${count} paired seeds`
    + ` at cap ${cap} s, ${plan.length} cells`);

  const runOne = (c) => new Promise((done) => {
    execFile(process.execPath, [process.argv[1], "--child", JSON.stringify(c)], {
      encoding: "utf8", cwd: ROOT, maxBuffer: 1 << 27,
    }, (error, stdout, stderr) => {
      const line = (stdout ?? "").split(NL).find((l) => l.startsWith("|CELL|"));
      if (line === undefined) {
        const why = (stderr ?? "").trim().split(NL).filter((l) => l.trim() !== "").pop();
        done({ arm: c.arm, failed: why ?? "no output", rows: [] });
      } else done(JSON.parse(line.slice(6)));
    });
  });

  const lanes = Math.max(1, Math.min(availableParallelism(), plan.length));
  const results = new Array(plan.length);
  let next = 0;
  const lane = async () => {
    while (next < plan.length) {
      const at = next++;
      results[at] = await runOne(plan[at]);
    }
  };
  await Promise.all(Array.from({ length: lanes }, lane));

  for (const f of results.filter((r) => r.failed)) console.log(`FAILED ${f.arm}: ${f.failed}`);

  /** One arm's rows, back in seed order, so two arms line up bout for bout. */
  const bySeed = (arm) => {
    const rows = results.filter((r) => r.arm === arm).flatMap((r) => r.rows);
    const out = new Map();
    for (const row of rows) out.set(row.seed, row);
    return out;
  };
  const table = Object.fromEntries(arms.map((arm) => [arm, bySeed(arm)]));
  const shared = seeds.filter((s) => arms.every((arm) => table[arm].has(s)));

  console.log("");
  console.log(`| column | ${arms.join(" | ")} |`);
  console.log(`| --- | ${arms.map(() => "---:").join(" | ")} |`);
  for (const column of COLUMNS) {
    const cells = arms.map((arm) => mean(shared.map((s) => table[arm].get(s)[column])));
    console.log(`| ${column} | ${cells.map((c) => c.toFixed(4)).join(" | ")} |`);
  }

  // Everything is differenced against the first arm, which is the reference by construction --
  // for CR that is the driver, and for a snapshot re-rating it is whatever the caller put first.
  const ref = arms[0];
  const rest = arms.slice(1);
  console.log("");
  console.log(`Paired against ${ref} over ${shared.length} shared seeds,`
    + " mean difference and two sigma:");
  console.log("");
  console.log(`| column | ${rest.map((a) => `${a} - ${ref}`).join(" | ")} |`);
  console.log(`| --- | ${rest.map(() => "---:").join(" | ")} |`);
  for (const column of COLUMNS) {
    const cells = rest.map((arm) => {
      const d = shared.map((s) => table[arm].get(s)[column] - table[ref].get(s)[column]);
      const m = mean(d);
      return `${m >= 0 ? "+" : ""}${m.toFixed(4)} +-${(2 * sem(d)).toFixed(4)}`;
    });
    console.log(`| ${column} | ${cells.join(" | ")} |`);
  }

  if (arms.includes("clone") && arms.includes("driver")) {
    const gap = mean(shared.map((s) => table.clone.get(s).score))
      - mean(shared.map((s) => table.driver.get(s).score));
    console.log("");
    console.log(`CR2: the clone is ${Math.abs(gap).toFixed(4)} ${gap >= 0 ? "above" : "below"}`
      + ` the driver on score. Registered bar: within 0.10, refused beyond 0.20.`);
  }
}

const RUN_AS = process.argv[1] ?? "";
const childAt = process.argv.indexOf("--child");
if (RUN_AS.endsWith("clone-duel.mjs") && childAt !== -1) {
  cell(JSON.parse(process.argv[childAt + 1]))
    .then((out) => console.log(`|CELL|${JSON.stringify(out)}`))
    .catch((error) => { console.error(error); process.exit(1); });
} else if (RUN_AS.endsWith("clone-duel.mjs")) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
