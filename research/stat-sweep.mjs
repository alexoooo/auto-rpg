/**
 * What one golem stat does to a fight, measured on bouts.
 *
 *     node research/stat-sweep.mjs --stat movement --levels 0.75,0.9,1,1.1,1.25,1.5 \
 *       --pairs 192 --workers 24 --dir research/runs/stat-movement
 *     node research/stat-sweep.mjs --edge wheel --pairs 192 --dir research/runs/edge-wheel
 *     node research/stat-sweep.mjs --attributes max,max-normal-body,size-weight-max  *       --pairs 192 --dir research/runs/giant
 *
 * The plan was `docs/plans/2026-09-23-attributes-02-sweep-instrument.md` (in git at fd4285a); the
 * tables it produces go into `docs/analysis/2026-09-23-attribute-measurements.md`.
 *
 * **A job is one half of a block.** A block is a mind pair and a seed pair, played twice with the
 * same seeds: once with the modified body on the left and once on the right, so arena side cancels
 * inside the block rather than across a pool. The modified body carries `attributes: { [stat]:
 * level }` -- at x1 too, explicitly, so the null row runs the same setup path every other row does --
 * and the other body carries none. Each side's mind is seeded from its own seed and the pair is
 * reversed with the sides, which is `comparisonJobs` in `research/search.mjs` and the reason for
 * the memory `probe-minds-need-side-correct-seeds`.
 *
 * **The seeds do not depend on the level.** Every level plays the same blocks, so a level can be
 * paired block by block against the control level (x1, or `control` under `--edge`), and that
 * paired difference -- the `vs control` columns -- carries none of the variance that comes from
 * which minds and which seeds a block drew. The level's own columns keep that variance and are
 * the ones to read an absolute effect off.
 *
 * **`--edge <build>` is the instrument's known-answer check.** No stat is live when this lands, so
 * nothing here can move a stat; instead the modified corner is a whole named build from
 * `NAMED_BUILDS` against the base build, beside a control level where both are the base. A large
 * known edge that does not read as an edge is a sweep wired to the wrong side.
 *
 * **`--attributes <preset>,...` sweeps whole attribute sets** (`ATTRIBUTE_PRESETS`) rather than
 * one stat: each preset is a level whose modified corner carries that set, beside a control whose
 * corner carries every stat at an explicit 1. It is how an all-max giant is measured against a x1
 * body (`docs/plans/2026-09-23-physical-contact-01-measure.md` (in git at 30dcb8c)).
 *
 * Execution is `runJobs` in `research/runner.mjs`: isolated worker lanes, one bout per worker at a
 * time, a fresh Havok per bout, resumable from `results.jsonl` -- never `Promise.all` over bouts,
 * because one realm runs one Havok arena at a time (`AGENTS.md`). The research `PROTOCOL` sets
 * the cap and `locomotionMode: "supported"`.
 */
import { join, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { ATTRIBUTES, ATTRIBUTE_IDS, isAttributeId } from "../src/golem/attributes.ts";
import { mulberry32 } from "../src/rng.ts";
import { PROTOCOL, seed } from "./schedule.mjs";
import { refuseSideDecided } from "./side-mirror.mjs";

export const HARNESS = "Node harness, research runner, supported locomotion";

/** The overkill probe's four: designed minds that disagree about how to fight. */
export const PROBE_MINDS = Object.freeze(["golem-champion", "golem-miser", "golem-brawler", "golem-duelist"]);

export const DEFAULT_LEVELS = Object.freeze([0.75, 0.9, 1, 1.1, 1.25, 1.5]);

/** Every stat at an explicit value, from a function of its row; a row that is not live stays at 1. */
const everyStat = (valueOf) => Object.freeze(Object.fromEntries(ATTRIBUTE_IDS.map((id) =>
  [id, ATTRIBUTES[id].live ? valueOf(ATTRIBUTES[id], id) : 1])));

/**
 * Whole attribute sets, by name. `max` is every live row at its ceiling; `max-normal-body` the same
 * with the body's size and weight left at 1; `size-weight-max` only those two at their ceilings.
 * The three split the giant into what its body does and what everything else does.
 */
export const ATTRIBUTE_PRESETS = Object.freeze({
  max: () => everyStat((row) => row.max),
  "max-normal-body": () => everyStat((row, id) => (id === "size" || id === "weight" ? 1 : row.max)),
  "size-weight-max": () => everyStat((row, id) => (id === "size" || id === "weight" ? row.max : 1)),
});

const levelKey = (value) => `x${value.toFixed(2)}`;
const other = (side) => (side === "left" ? "right" : "left");
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * The levels a sweep runs, each a key, a setup for the modified corner and whether it is the
 * control. A stat's control is its x1 row when the levels include one; an edge's is `control`.
 */
export function sweepLevels(subject, base, levels, namedBuild) {
  if (subject.kind === "stat") {
    if (!isAttributeId(subject.stat)) {
      throw new Error(`there is no attribute "${subject.stat}"; the stats are ${ATTRIBUTE_IDS.join(", ")}`);
    }
    if (new Set(levels).size !== levels.length) throw new Error("a level is listed twice");
    return levels.map((value) => {
      if (!Number.isFinite(value) || value <= 0) throw new Error(`level ${value} is not a positive multiplier`);
      return { key: levelKey(value), value, control: value === 1,
        setup: { ...base, attributes: { [subject.stat]: value } } };
    });
  }
  if (subject.kind === "attributes") {
    if (!subject.presets.length) throw new Error("name at least one attribute preset");
    if (new Set(subject.presets).size !== subject.presets.length) throw new Error("a preset is listed twice");
    return [
      { key: "control", value: null, control: true, setup: { ...base, attributes: everyStat(() => 1) } },
      ...subject.presets.map((name) => {
        const preset = ATTRIBUTE_PRESETS[name];
        if (!preset) throw new Error(`there is no attribute preset "${name}"; they are ${Object.keys(ATTRIBUTE_PRESETS).join(", ")}`);
        return { key: name, value: null, control: false, setup: { ...base, attributes: preset() } };
      }),
    ];
  }
  return [
    { key: "control", value: null, control: true, setup: base },
    { key: `edge:${subject.build}`, value: null, control: false, setup: namedBuild(subject.build) },
  ];
}

/**
 * Every job of a sweep. `blocks` is per level, so a level runs `2 * blocks` bouts.
 *
 * Blocks cycle through the ordered mind pairs -- modified mind first -- so every pair is played
 * `blocks / pairs` times whatever the minds are. A job's `pair` is its block's key without the
 * level, which is what pairs a level with its control.
 */
export function sweepJobs({ levels, blocks, minds, runSeed }) {
  if (!Number.isInteger(blocks) || blocks < 1) throw new Error("blocks must be a positive integer");
  const combos = minds.flatMap((a) => minds.map((b) => [a, b]));
  const jobs = [];
  for (const [round, level] of levels.entries()) {
    for (let k = 0; k < blocks; k++) {
      const minded = combos[k % combos.length];
      const pair = `${minded[0]}~${minded[1]}/${Math.floor(k / combos.length)}`;
      const seeds = [seed(runSeed, pair, "modified"), seed(runSeed, pair, "other")];
      for (const modified of ["left", "right"]) {
        const onLeft = modified === "left";
        jobs.push({
          id: `${level.key}/${pair}/${modified}`, round, block: `${level.key}/${pair}`, pair,
          level: level.key, modified, minds: minded,
          left: onLeft ? minded[0] : minded[1], right: onLeft ? minded[1] : minded[0],
          leftBuild: onLeft ? level.key : "base", rightBuild: onLeft ? "base" : level.key,
          seeds: onLeft ? seeds : [seeds[1], seeds[0]],
        });
      }
    }
  }
  return jobs;
}

/** The modified corner's score for one bout: a win 1, a draw 1/2. */
export const modifiedScore = (row) => (row.winner === null ? 0.5 : row.winner === row.modified ? 1 : 0);

/** The modified corner's final bar minus the other's, for one bout. */
export function modifiedMargin(row) {
  const [left, right] = row.vitality;
  return row.modified === "left" ? left - right : right - left;
}

/** Mean over sample standard deviation, or null where it has no meaning. */
export function cohensD(values) {
  if (values.length < 2) return null;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return variance > 0 ? m / Math.sqrt(variance) : null;
}

/**
 * A percentile bootstrap over whole blocks. `research/search.mjs` has the same one; it is repeated
 * rather than imported because that module pulls the candidate registry, and this one is loaded by
 * a test with no bouts in it.
 */
export function interval(values, runSeed = 20260923, iterations = 4000) {
  if (!values.length || values.some((v) => !Number.isFinite(v))) throw new Error("interval needs finite block values");
  const random = mulberry32(runSeed);
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    let total = 0;
    for (let j = 0; j < values.length; j++) total += values[Math.floor(random() * values.length)];
    samples.push(total / values.length);
  }
  samples.sort((a, b) => a - b);
  return { mean: mean(values), low: samples[Math.floor(iterations * 0.025)], high: samples[Math.floor(iterations * 0.975)] };
}

/** Rows gathered into whole side-swap blocks, keyed by block. A block with one half is refused. */
export function blocksOf(rows) {
  const blocks = new Map();
  for (const row of rows) {
    if (row.status !== "ok") continue;
    const block = blocks.get(row.block) ?? { level: row.level, pair: row.pair, minds: row.minds, rows: {} };
    if (block.rows[row.modified]) throw new Error(`block ${row.block} has two ${row.modified} halves`);
    block.rows[row.modified] = row;
    blocks.set(row.block, block);
  }
  for (const [key, block] of blocks) {
    if (!block.rows.left || !block.rows.right) throw new Error(`incomplete side-swap block ${key}`);
  }
  return blocks;
}

function figures(blocks, controlMargins) {
  const list = [...blocks];
  const score = list.map((b) => (modifiedScore(b.rows.left) + modifiedScore(b.rows.right)) / 2);
  const margin = list.map((b) => (modifiedMargin(b.rows.left) + modifiedMargin(b.rows.right)) / 2);
  const bouts = list.flatMap((b) => [b.rows.left, b.rows.right]);
  const endings = {};
  for (const row of bouts) endings[row.ending] = (endings[row.ending] ?? 0) + 1;
  const out = {
    blocks: list.length,
    bouts: bouts.length,
    winRate: interval(score),
    bySide: Object.fromEntries(["left", "right"].map((side) => [side, mean(list.map((b) => modifiedScore(b.rows[side])))])),
    draws: bouts.filter((row) => row.winner === null).length,
    margin: { ...interval(margin), d: cohensD(margin) },
    seconds: mean(bouts.map((row) => row.seconds)),
    dealt: mean(bouts.map((row) => row.sides[row.modified].damage)),
    taken: mean(bouts.map((row) => row.sides[other(row.modified)].damage)),
    endings,
  };
  // Knockdowns and the share of a bout spent down, for each corner. Rows written before the worker
  // counted them carry neither field, and a level with any such row reports none rather than a
  // mean over the ones that happen to have it.
  if (bouts.every((row) => row.sides.left.knockdowns !== undefined && row.sides.right.knockdowns !== undefined)) {
    const share = (row, side) => row.sides[side].downSeconds / Math.max(row.seconds, 1e-9);
    out.down = {
      knockdowns: mean(bouts.map((row) => row.sides[row.modified].knockdowns)),
      otherKnockdowns: mean(bouts.map((row) => row.sides[other(row.modified)].knockdowns)),
      share: mean(bouts.map((row) => share(row, row.modified))),
      otherShare: mean(bouts.map((row) => share(row, other(row.modified)))),
    };
  }
  // Modules severed, per corner, on the same rule: a level with any row written before the worker
  // counted them reports none.
  if (bouts.every((row) => row.sides.left.severs !== undefined && row.sides.right.severs !== undefined)) {
    out.severs = {
      mine: mean(bouts.map((row) => row.sides[row.modified].severs)),
      other: mean(bouts.map((row) => row.sides[other(row.modified)].severs)),
    };
  }
  // Contacts a bout and the share of them that were real blows, per corner, on the same rule. The
  // share is pooled -- real blows over contacts across the level -- because a bout with no contact
  // has no share of its own.
  if (bouts.every((row) => row.sides.left.realBlows !== undefined && row.sides.right.realBlows !== undefined)) {
    const pooled = (side) => {
      const contacts = bouts.reduce((sum, row) => sum + row.sides[side(row)].hits, 0);
      return contacts ? bouts.reduce((sum, row) => sum + row.sides[side(row)].realBlows, 0) / contacts : null;
    };
    out.blows = {
      contacts: mean(bouts.map((row) => row.sides[row.modified].hits)),
      otherContacts: mean(bouts.map((row) => row.sides[other(row.modified)].hits)),
      share: pooled((row) => row.modified),
      otherShare: pooled((row) => other(row.modified)),
    };
  }
  if (controlMargins) {
    const delta = list.map((b, i) => {
      const control = controlMargins.get(b.pair);
      if (control === undefined) throw new Error(`block ${b.pair} has no control to pair with`);
      return margin[i] - control;
    });
    out.vsControl = { ...interval(delta), d: cohensD(delta) };
  }
  return out;
}

/**
 * Every level's figures, pooled and split by mind pair.
 *
 * `margin` is the modified corner's final bar minus the other's, averaged over a block's two bouts;
 * its `d` is the mean over the standard deviation of those block margins, the criterion the memory
 * `paired-effect-size-criterion` names. `vsControl` is the same margin minus the control level's on
 * the same block, and is absent from the control itself and from a sweep that has none.
 */
export function summarizeSweep(rows, levels) {
  const blocks = blocksOf(rows);
  // Sorted by block, because rows arrive in whatever order the workers finished them and the
  // bootstrap draws by index: unsorted, one run's interval read 43.6..54.3 and its rerun 43.8..54.2.
  const byLevel = (key) => [...blocks.values()].filter((b) => b.level === key)
    .sort((a, b) => a.pair.localeCompare(b.pair));
  const control = levels.find((level) => level.control);
  const controlMargins = control ? new Map(byLevel(control.key).map((b) =>
    [b.pair, (modifiedMargin(b.rows.left) + modifiedMargin(b.rows.right)) / 2])) : null;
  return levels.map((level) => {
    const own = byLevel(level.key);
    if (!own.length) return { key: level.key, value: level.value, control: level.control, blocks: 0 };
    const paired = level.control ? null : controlMargins;
    const minds = [...new Set(own.map((b) => b.minds.join(" vs ")))];
    return {
      key: level.key, value: level.value, control: level.control,
      ...figures(own, paired),
      byMinds: Object.fromEntries(minds.map((name) => [name,
        figures(own.filter((b) => b.minds.join(" vs ") === name), paired)])),
    };
  });
}

const pct = (x) => `${(100 * x).toFixed(1)}`;
const num = (x, digits = 3) => (x === null || x === undefined ? "--" : x.toFixed(digits));
const band = (i, f) => `${f(i.mean)} [${f(i.low)}, ${f(i.high)}]`;

export function markdownSweep(summary, header) {
  const lines = [
    `# ${header.title}`, "",
    `${HARNESS}; cap ${header.protocol.maxSeconds} s; base build \`${header.build}\`; minds ${header.minds.join(", ")}; seed ${header.seed}.`,
    "Win rate counts a draw as half. Margin is the modified corner's final bar minus the other's, per side-swap block; d is its mean over its standard deviation. The control-paired columns subtract the control level's margin on the same block.", "",
    "| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const level of summary) {
    if (!level.blocks) { lines.push(`| ${level.key} | 0 | | | | | | | | | | |`); continue; }
    lines.push(`| ${level.key}${level.control ? " (control)" : ""} | ${level.bouts} | ${band(level.winRate, pct)} | ${pct(level.bySide.left)} / ${pct(level.bySide.right)} | ${band(level.margin, num)} | ${num(level.margin.d, 2)} | ${level.vsControl ? band(level.vsControl, num) : "--"} | ${num(level.vsControl?.d, 2)} | ${level.draws} | ${level.seconds.toFixed(1)} | ${level.dealt.toFixed(2)} | ${level.taken.toFixed(2)} |`);
  }
  const ran = summary.filter((level) => level.blocks);
  if (ran.length) {
    const names = Object.keys(ran[0].byMinds).sort();
    lines.push("", "Win % of the modified corner by mind pair, modified mind first:", "",
      `| Minds | ${ran.map((level) => level.key).join(" | ")} |`, `| --- |${ran.map(() => " ---: |").join("")}`);
    for (const name of names) lines.push(`| ${name} | ${ran.map((level) => level.byMinds[name] ? pct(level.byMinds[name].winRate.mean) : "--").join(" | ")} |`);
    if (ran.every((level) => level.down)) {
      lines.push("", "Knockdowns per bout and the share of a bout spent fallen or rising, modified corner first:", "",
        "| Level | Knockdowns | Other's knockdowns | Time down % | Other's time down % |", "| --- | ---: | ---: | ---: | ---: |");
      for (const level of ran) lines.push(`| ${level.key} | ${level.down.knockdowns.toFixed(2)} | ${level.down.otherKnockdowns.toFixed(2)} | ${pct(level.down.share)} | ${pct(level.down.otherShare)} |`);
    }
    if (ran.every((level) => level.severs)) {
      lines.push("", "Modules severed per bout, modified corner first:", "",
        "| Level | Severed | Other's severed |", "| --- | ---: | ---: |");
      for (const level of ran) lines.push(`| ${level.key} | ${level.severs.mine.toFixed(2)} | ${level.severs.other.toFixed(2)} |`);
    }
    if (ran.every((level) => level.blows)) {
      lines.push("", "Contacts per bout and the share of them above the weapon's energy floor, modified corner first:", "",
        "| Level | Contacts | Other's contacts | Real blows % | Other's real blows % |", "| --- | ---: | ---: | ---: | ---: |");
      const share = (x) => (x === null ? "--" : pct(x));
      for (const level of ran) lines.push(`| ${level.key} | ${level.blows.contacts.toFixed(1)} | ${level.blows.otherContacts.toFixed(1)} | ${share(level.blows.share)} | ${share(level.blows.otherShare)} |`);
    }
    const endings = [...new Set(ran.flatMap((level) => Object.keys(level.endings)))].sort();
    lines.push("", "Endings:", "", `| Level | ${endings.join(" | ")} |`, `| --- |${endings.map(() => " ---: |").join("")}`);
    for (const level of ran) lines.push(`| ${level.key} | ${endings.map((e) => level.endings[e] ?? 0).join(" | ")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({ options: {
    stat: { type: "string" }, edge: { type: "string" }, attributes: { type: "string" }, levels: { type: "string" },
    pairs: { type: "string", default: "192" }, workers: { type: "string", default: "24" },
    build: { type: "string", default: "default" }, minds: { type: "string" },
    seed: { type: "string", default: "20260923" }, dir: { type: "string" },
  } });
  if ([values.stat, values.edge, values.attributes].filter(Boolean).length !== 1) {
    throw new Error("name exactly one of --stat <id>, --edge <named build> or --attributes <preset,...>");
  }
  const [{ PLAYABLE_BUILDS }, { golemSetupRefusal }, { runJobs }, { fingerprint }] = await Promise.all([
    import("../src/golem/roster.ts"), import("../src/golem/build.ts"),
    import("./runner.mjs"), import("./fingerprint.mjs"),
  ]);
  // Every playable build, not only the stone roster, so a stat can be swept on a skeleton or a human.
  const namedBuild = (name) => {
    const found = PLAYABLE_BUILDS.find((build) => build.name === name);
    if (!found) throw new Error(`there is no named build "${name}"; they are ${PLAYABLE_BUILDS.map((b) => b.name).join(", ")}`);
    return found.setup;
  };
  const subject = values.stat ? { kind: "stat", stat: values.stat }
    : values.attributes ? { kind: "attributes", presets: values.attributes.split(",") }
      : { kind: "edge", build: values.edge };
  const base = namedBuild(values.build);
  const levels = sweepLevels(subject, base,
    values.levels ? values.levels.split(",").map(Number) : [...DEFAULT_LEVELS], namedBuild);
  for (const level of levels) {
    const refusal = golemSetupRefusal(level.setup);
    if (refusal) throw new Error(`${level.key}: ${refusal}`);
  }
  const minds = values.minds ? values.minds.split(",") : [...PROBE_MINDS];
  refuseSideDecided(minds, "a stat sweep");
  const blocks = Number(values.pairs), runSeed = Number(values.seed);
  const jobs = sweepJobs({ levels, blocks, minds, runSeed });
  const directory = resolve(values.dir ?? `research/runs/${values.stat ? `stat-${values.stat}`
    : values.attributes ? `attributes-${subject.presets.join("+")}` : `edge-${values.edge}`}`);
  const manifest = {
    version: 1, kind: "stat-sweep", fingerprint: fingerprint().hash, protocol: PROTOCOL,
    subject, build: values.build, minds, blocks, seed: runSeed, runtime: { node: process.version },
    levels: levels.map(({ key, value, control }) => ({ key, value, control })),
    builds: [{ name: "base", setup: base }, ...levels.map((level) => ({ name: level.key, setup: level.setup }))],
    candidates: [],
  };
  console.log(`${jobs.length} bouts (${levels.length} levels x ${blocks} blocks x 2) into ${directory}`);
  const started = Date.now();
  const rows = await runJobs(directory, manifest, jobs, { workers: Number(values.workers),
    onProgress: ({ done, total, failures }) => console.log(`  ${done}/${total}, ${failures} failed, ${((Date.now() - started) / 1000).toFixed(0)} s`) });
  const failed = rows.filter((row) => row.status !== "ok");
  if (failed.length) throw new Error(`${failed.length} bouts failed; first: ${failed[0].error}`);
  const summary = summarizeSweep(rows, levels);
  const title = subject.kind === "stat" ? `Stat sweep: ${subject.stat}`
    : subject.kind === "attributes" ? `Attribute presets against ${values.build}: ${subject.presets.join(", ")}`
      : `Known edge: ${subject.build} against ${values.build}`;
  const markdown = markdownSweep(summary, { title, protocol: PROTOCOL, build: values.build, minds, seed: runSeed });
  writeFileSync(join(directory, "sweep.json"), `${JSON.stringify({ manifest: { ...manifest, builds: undefined }, summary }, null, 2)}\n`);
  writeFileSync(join(directory, "sweep.md"), markdown);
  console.log(markdown);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
