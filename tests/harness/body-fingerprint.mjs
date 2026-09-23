/**
 * The body fingerprint: a digest of what every stone, human and skeleton body *does*, compared
 * across two commits.
 *
 * **Why it exists.** The skeleton plan (deleted once it landed; read it at
 * `git show f40c5f7:docs/plans/2026-09-22-skeleton-00-overview.md`) refactors
 * code every stone and human body runs through -- the armour seam, the arm chains, the torso and
 * head builders, every shell builder -- and promises that neither family moves by a single bit.
 * Nothing in `tests/` could check that promise on 2026-09-22. Every determinism test compares two
 * runs **in one process**, so a change that moves stone physics deterministically passes all of
 * them; the exact pins (swing inertia against `STROKE_INERTIA.ref`, the wrist cast masses, the
 * fatal weights, the default dimensions) are build-time and never run a solver step; and the
 * behavioural tests assert floors, which a moved body clears. This file hashes the bodies' motion
 * and compares the hash with one taken on another commit, in another process.
 *
 *     node tests/harness/body-fingerprint.mjs --out .review/fp-before.json
 *     node tests/harness/body-fingerprint.mjs --out .review/fp-after.json --against .review/fp-before.json
 *     node tests/harness/body-fingerprint.mjs --out .review/fp-after.json --against .review/fp-before.json --may-move "skeleton|skull"
 *     node tests/harness/body-fingerprint.mjs --only bout: --out .review/fp-bouts.json --against .review/fp-before.json
 *
 * **What runs.** Fifteen six-second bouts through `runBout` (`BOUTS` below), each on a fresh Havok
 * instance with `locomotionMode: "supported"`, chosen so every named stone build, every human
 * build and every registered module is in a fight (`every_registered_module_fights_in_a_bout` in
 * `tests/body-fingerprint.test.mjs` holds the last) -- the six bodies built inline by `stone` and
 * `inline` exist because no named build uses the reach chain, the pitch chain's mace and fist, the
 * human mace and whip, or the skeleton's whip and fist. Then one bench per registered module, read
 * from `GOLEM_MODULES` rather than listed: `runGolemBench` for every effector, `runTorsoBench`
 * for every trunk (headless) and every head (trunkless), and `runGolemLocomotion` for every key of
 * `LOCOMOTION_MODULES`. The human legs are not in that last table and are covered by the bouts.
 *
 * **What a bout hashes.** Every solver substep (240 Hz, from `onSample`), each side left then
 * right, each of `unit.limbs` in order: `limb.part.mesh.position` x/y/z, its
 * `rotationQuaternion` x/y/z/w, `limb.health` and `severed ? 1 : 0`, as the bytes of one
 * `Float64Array`. **`mesh.position` and `mesh.rotationQuaternion` and nothing else**: every golem
 * body is a scene-root node, so those two fields are its world transform, and reading them stamps
 * nothing -- `getWorldMatrix()` and `absolutePosition` stamp the render id when read (`AGENTS.md`),
 * and an instrument that changed what it measures would be measuring itself. Every combat report
 * goes in as `JSON.stringify(event)` as it is emitted, and the result's
 * `{ winner, ending, text, deathRegion, seconds, left, right }` goes in last.
 *
 * **What a bench hashes.** `JSON.stringify(result)`. JSON prints every finite double in its
 * shortest round-trip form, so the digest is exact over every finite reading; a non-finite one
 * prints as `null`, so a reading that changed from `Infinity` to `NaN` would not show.
 *
 * **Why every run gets its own Havok.** `freshHavok()` per bout, and `createHeadlessArena` builds
 * a fresh instance per bench run. The bout runner's own note records that a shared instance's
 * allocator and solver history flipped a winner with every command equal, and a fingerprint whose
 * digest depended on which sections ran before it could not be compared with a partial run.
 * Sections run one after another, never concurrently: Havok's wasm state is realm-global, and two
 * arenas stepping in one realm change each other's outcomes (`AGENTS.md`, house rules).
 *
 * **What it does not see.** Shell meshes carry no body, so a purely cosmetic change is invisible
 * here; so are UI text, labels and button order. The skeleton plan checks those by test in the
 * sessions that touch them.
 *
 * **The file.** `--out` writes `{ "version": 1, "sections": { name: sha256 hex } }`, sections
 * sorted by name, and prints only the first 16 hex digits of each. `--against` prints one line
 * per section -- `same`, `MOVED`, `new`, `GONE`, or `moved (allowed)` for a moved section whose
 * name matches `--may-move` -- and exits 1 on any `MOVED` or `GONE`. `new` is not a failure:
 * sessions 06 and 07 add skeleton sections on purpose. A `GONE` section fails whether or not it
 * matches `--may-move`. `--only <prefix>` runs only the sections whose names start with it, for
 * bisecting; its file is marked `"partial": true` with its prefix beside it, is refused as a
 * baseline, and when compared against a whole baseline is compared over that prefix alone.
 *
 * **Measured, the Node harness (NullEngine, real Havok 1.3.14 on Babylon 9.18.1, no rendering),
 * 2026-09-22, at commit 1b2e693 plus this file:** the whole fingerprint is 43 sections in 14.1 s
 * and 14.6 s of section time over two separate processes, 14.7 s and 15.3 s of process wall time.
 * A bout takes 0.44 to 1.73 s (the human mirror is the slowest), a stone effector bench 0.03 to
 * 0.12 s, an anatomical one 0.28 to 0.81 s, a torso or head 0.05 to 0.10 s, a walk 0.12 to 0.36 s.
 * The two processes agreed on all 43 sections. Sections run alone through `--only` (`bench:`,
 * `walk:`, `head:` and two single late bouts) agreed with the whole run, so no section's digest
 * depends on what ran before it. `CHAIN_REACH.foreMass` edited to 1.01 times itself in the file
 * moved all eleven bouts with a stone wrist or reach arm in them and left
 * `bout:human-warrior~human-maul` reading `same`.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { defaultGolemSetup, golemSetupRefusal } from "../../src/golem/build.ts";
import { humanSetup } from "../../src/golem/humanoid/presets.ts";
import { skeletonSetup } from "../../src/golem/skeleton/presets.ts";
import { GOLEM_MODULES } from "../../src/golem/registry.ts";
import { namedBuild } from "../../src/golem/roster.ts";
import { freshHavok, runBout } from "./bout-runner.mjs";
import { LOCOMOTION_MODULES, runGolemBench, runGolemLocomotion } from "./golem-bench.mjs";
import { runTorsoBench } from "./golem-torso-bench.mjs";

export const FINGERPRINT_VERSION = 1;

/** Seconds per bout. Long enough for every row to trade blows; short enough to run twelve. */
export const BOUT_SECONDS = 6;

/** Doubles per limb per substep: position x/y/z, rotation x/y/z/w, health, severed. */
const LIMB_DOUBLES = 9;

// ------------------------------------------------------------------------------- the bouts

/** A side named by its build in `PLAYABLE_BUILDS`. Refused at load rather than in a fight. */
const named = (name) => {
  const build = namedBuild(name);
  if (!build) throw new Error(`body-fingerprint: no playable build named "${name}"`);
  return Object.freeze({ label: name, setup: build.setup });
};

/** A side built inline, passed through the same refusal a build off the setup screen meets. */
const inline = (label, setup) => {
  const refusal = golemSetupRefusal(setup);
  if (refusal !== null) throw new Error(`body-fingerprint: inline side "${label}" is refused: ${refusal}`);
  return Object.freeze({ label, setup: Object.freeze(setup) });
};

/** The default stone golem with both sockets replaced. */
const stone = (label, [primaryChain, primaryTerminal], [secondaryChain, secondaryTerminal]) =>
  inline(label, {
    ...defaultGolemSetup(),
    primary: { chain: primaryChain, terminal: primaryTerminal },
    secondary: { chain: secondaryChain, terminal: secondaryTerminal },
  });

const STONE = ["golem-duelist", "golem-fencer"];
const HUMANS = ["humanoid-duelist", "humanoid-duelist"];
const HUMAN_STONE = ["humanoid-duelist", "golem-duelist"];
const SKELETON_STONE = ["skeleton-duelist", "golem-duelist"];
const SKELETON_HUMAN = ["skeleton-duelist", "humanoid-duelist"];
const SKELETONS = ["skeleton-duelist", "skeleton-duelist"];

const ROWS = [
  [named("default"), named("two-blades"), STONE],
  [named("mace"), named("maul"), STONE],
  [named("whip"), named("fists"), STONE],
  [named("ram-capped"), named("ram-blade"), STONE],
  [named("wheel"), named("multileg"), STONE],
  [named("plated"), named("pitch-blade"), STONE],
  [stone("reach-blade", ["reach", "blade"], ["reach", "plate"]),
    stone("reach-maul", ["reach", "maul"], ["reach", "maul"]), STONE],
  [stone("reach-mace", ["reach", "mace"], ["reach", "fist"]),
    stone("pitch-mace", ["pitch", "mace"], ["pitch", "fist"]), STONE],
  [named("human-warrior"), named("human-maul"), HUMANS],
  [named("human-unarmed"), named("mace"), HUMAN_STONE],
  [named("human-dual-swords"), named("default"), HUMAN_STONE],
  [inline("human-mace-whip", humanSetup("mace", "whip")), named("default"), HUMAN_STONE],
  [named("skeleton-warrior"), named("default"), SKELETON_STONE],
  [named("skeleton-mace"), named("human-warrior"), SKELETON_HUMAN],
  [named("skeleton-maul"), inline("skeleton-whip-fist", skeletonSetup("whip", "fist")), SKELETONS],
];

/**
 * The fifteen bouts, in the order they were added. Seeds for bout `i` are
 * `[0x5ce1e700 + 2 * i, 0x5ce1e701 + 2 * i]`, so a row appended later leaves every earlier row's
 * seeds -- and so its digest -- where they were.
 */
export const BOUTS = Object.freeze(ROWS.map(([left, right, [leftPolicy, rightPolicy]], index) =>
  Object.freeze({
    name: `bout:${left.label}~${right.label}`,
    left,
    right,
    policies: Object.freeze({ left: leftPolicy, right: rightPolicy }),
    seeds: Object.freeze([0x5ce1e700 + 2 * index, 0x5ce1e701 + 2 * index]),
  })));

/** One bout's digest, as full sha256 hex. */
export async function fingerprintBout(spec) {
  const hash = createHash("sha256");
  let scratch = new Float64Array(0);
  const result = runBout({
    left: spec.policies.left,
    right: spec.policies.right,
    leftUnit: "golem",
    rightUnit: "golem",
    leftGolem: spec.left.setup,
    rightGolem: spec.right.setup,
    seeds: [...spec.seeds],
    locomotionMode: "supported",
    maxSeconds: BOUT_SECONDS,
    physics: await freshHavok(),
    onSample: ({ left, right }) => {
      const count = left.limbs.length + right.limbs.length;
      if (scratch.length !== count * LIMB_DOUBLES) scratch = new Float64Array(count * LIMB_DOUBLES);
      let at = 0;
      for (const unit of [left, right]) {
        for (const limb of unit.limbs) {
          const mesh = limb.part.mesh;
          const position = mesh.position;
          const rotation = mesh.rotationQuaternion;
          scratch[at] = position.x;
          scratch[at + 1] = position.y;
          scratch[at + 2] = position.z;
          scratch[at + 3] = rotation.x;
          scratch[at + 4] = rotation.y;
          scratch[at + 5] = rotation.z;
          scratch[at + 6] = rotation.w;
          scratch[at + 7] = limb.health;
          scratch[at + 8] = limb.severed ? 1 : 0;
          at += LIMB_DOUBLES;
        }
      }
      hash.update(scratch);
    },
    onEvent: (event) => { hash.update(JSON.stringify(event)); },
  });
  const { winner, ending, text, deathRegion, seconds, left, right } = result;
  hash.update(JSON.stringify({ winner, ending, text, deathRegion, seconds, left, right }));
  return hash.digest("hex");
}

// ------------------------------------------------------------------------------ the benches

/**
 * One bench run's digest, as full sha256 hex.
 *
 * `kind` is one of four, and anything else throws by name rather than falling through to a
 * default -- a ternary chain with a default branch is a silent substitution (`AGENTS.md`).
 */
export async function fingerprintBench(kind, id) {
  let result;
  switch (kind) {
    case "bench": result = await runGolemBench({ moduleId: id }); break;
    case "torso": result = await runTorsoBench({ torsoId: id, headId: null }); break;
    case "head": result = await runTorsoBench({ torsoId: null, headId: id }); break;
    case "walk": result = await runGolemLocomotion({ moduleId: id }); break;
    default: throw new Error(`body-fingerprint: no bench kind "${kind}"`);
  }
  return createHash("sha256").update(JSON.stringify(result)).digest("hex");
}

/**
 * Every section, in run order: the bouts, then the benches in registry order.
 *
 * The bench lists are read from the registry and from `LOCOMOTION_MODULES` rather than written
 * here, which is the rule `EFFECTOR_IDS` in `tests/golem-bench.test.mjs` follows: a module
 * registered later is fingerprinted without anybody remembering to add it.
 */
export function fingerprintSections() {
  const sections = BOUTS.map((spec) => ({ name: spec.name, run: () => fingerprintBout(spec) }));
  const bench = (kind, mode) => {
    for (const option of GOLEM_MODULES) {
      if (option.mode !== mode) continue;
      sections.push({ name: `${kind}:${option.id}`, run: () => fingerprintBench(kind, option.id) });
    }
  };
  bench("bench", "effector");
  bench("torso", "torso");
  bench("head", "head");
  for (const key of Object.keys(LOCOMOTION_MODULES)) {
    sections.push({ name: `walk:${key}`, run: () => fingerprintBench("walk", key) });
  }
  const seen = new Set();
  for (const { name } of sections) {
    if (seen.has(name)) throw new Error(`body-fingerprint: two sections are named "${name}"`);
    seen.add(name);
  }
  return sections;
}

/**
 * Run the fingerprint, one section after another.
 *
 * With `only`, the sections whose names start with it, and the returned record says so: it
 * carries `partial: true` and the prefix, which is what refuses it as a baseline. A prefix that
 * matches nothing throws, because an empty partial file compares nothing and would read as a pass.
 * `onSection` is called with `{ name, digest, seconds }` as each section finishes.
 */
export async function fingerprint({ only = "", onSection = null } = {}) {
  const chosen = fingerprintSections().filter((section) => section.name.startsWith(only));
  if (chosen.length === 0) throw new Error(`body-fingerprint: no section name starts with "${only}"`);
  const digests = new Map();
  for (const section of chosen) {
    const started = performance.now();
    const digest = await section.run();
    digests.set(section.name, digest);
    onSection?.({ name: section.name, digest, seconds: (performance.now() - started) / 1000 });
  }
  const sections = {};
  for (const name of [...digests.keys()].sort()) sections[name] = digests.get(name);
  return only === ""
    ? { version: FINGERPRINT_VERSION, sections }
    : { version: FINGERPRINT_VERSION, partial: true, only, sections };
}

// ------------------------------------------------------------------------------ comparing two

/** The statuses that fail a comparison. `new` and `moved (allowed)` do not. */
const FAILING = new Set(["MOVED", "GONE"]);

/**
 * One `{ name, status }` per section, sorted by name.
 *
 * `before` must be a whole fingerprint: a partial one is refused, because every section it did
 * not run would read `new` and a baseline that silently covers less than it claims is not one.
 * `after` may be partial, and is then compared over its own prefix alone, so that a bisecting
 * `--only` run does not report every section it skipped as `GONE`. `mayMove` is a pattern or
 * null; a section whose name matches it and whose digest moved reads `moved (allowed)`. It never
 * excuses a `GONE`.
 */
export function compareFingerprints(before, after, mayMove = null) {
  if (before.partial) {
    throw new Error("body-fingerprint: a partial fingerprint (--only) cannot be a baseline");
  }
  if (before.version !== after.version) {
    throw new Error(`body-fingerprint: version ${before.version} and version ${after.version} are not comparable`);
  }
  if (after.partial && typeof after.only !== "string") {
    throw new Error("body-fingerprint: a partial fingerprint must name the prefix it ran");
  }
  // A fresh, stateless copy: a global or sticky pattern carries `lastIndex` between `test` calls.
  const pattern = mayMove === null ? null
    : new RegExp(mayMove instanceof RegExp ? mayMove.source : mayMove,
      mayMove instanceof RegExp ? mayMove.flags.replace(/[gy]/g, "") : "");
  const scope = after.partial ? after.only : "";
  const names = new Set([
    ...Object.keys(before.sections).filter((name) => name.startsWith(scope)),
    ...Object.keys(after.sections),
  ]);
  return [...names].sort().map((name) => {
    const was = Object.hasOwn(before.sections, name) ? before.sections[name] : undefined;
    const is = Object.hasOwn(after.sections, name) ? after.sections[name] : undefined;
    let status;
    if (was === undefined) status = "new";
    else if (is === undefined) status = "GONE";
    else if (was === is) status = "same";
    else if (pattern !== null && pattern.test(name)) status = "moved (allowed)";
    else status = "MOVED";
    return { name, status };
  });
}

/** Whether a comparison fails the run. */
export const comparisonFails = (rows) => rows.some((row) => FAILING.has(row.status));

// ------------------------------------------------------------------------------ the command line

function parseArgs(argv) {
  const args = { out: null, against: null, mayMove: null, only: "" };
  const flags = { "--out": "out", "--against": "against", "--may-move": "mayMove", "--only": "only" };
  for (let index = 0; index < argv.length; index += 1) {
    const key = flags[argv[index]];
    if (!key) throw new Error(`body-fingerprint: unknown argument "${argv[index]}"`);
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`body-fingerprint: ${argv[index]} needs a value`);
    args[key] = value;
    index += 1;
  }
  if (args.mayMove !== null && args.against === null) {
    throw new Error("body-fingerprint: --may-move only means something with --against");
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // Read and vetted before the run, so a bad baseline costs no thirty seconds.
  const baseline = args.against === null ? null : JSON.parse(await readFile(args.against, "utf8"));
  if (baseline?.partial) {
    throw new Error(`body-fingerprint: ${args.against} is partial (--only) and cannot be a baseline`);
  }
  const started = performance.now();
  const record = await fingerprint({
    only: args.only,
    onSection: ({ name, digest, seconds }) => {
      process.stdout.write(`${name.padEnd(48)} ${digest.slice(0, 16)}  ${seconds.toFixed(2)} s\n`);
    },
  });
  const total = (performance.now() - started) / 1000;
  process.stdout.write(`${Object.keys(record.sections).length} sections in ${total.toFixed(1)} s`
    + ` (the Node harness)${record.partial ? `, partial: only "${record.only}"` : ""}\n`);
  if (args.out !== null) {
    await mkdir(dirname(resolve(args.out)), { recursive: true });
    await writeFile(args.out, `${JSON.stringify(record, null, 2)}\n`);
    process.stdout.write(`wrote ${args.out}\n`);
  }
  if (baseline === null) return;
  const rows = compareFingerprints(baseline, record, args.mayMove);
  process.stdout.write(`\nagainst ${args.against}:\n`);
  for (const { name, status } of rows) process.stdout.write(`  ${status.padEnd(16)} ${name}\n`);
  const counts = {};
  for (const { status } of rows) counts[status] = (counts[status] ?? 0) + 1;
  process.stdout.write(`${Object.entries(counts).map(([status, n]) => `${n} ${status}`).join(", ")}\n`);
  if (comparisonFails(rows)) process.exitCode = 1;
}

// `process.argv[1] &&` first: under `node -e` there is no script path, and `pathToFileURL`
// throws on `undefined`. Importing this module runs nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
