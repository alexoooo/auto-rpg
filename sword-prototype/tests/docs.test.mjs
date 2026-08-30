// Every backticked file reference and line anchor in this prototype, under a
// check that fails when one stops pointing at something.
//
// **The failure this removes.** Sessions 17 and 23 deleted eleven scripts and six
// `src/learning` modules between them, and nothing noticed that a hundred-odd
// backticked references went on naming them. A reference that resolves nowhere
// costs a reader the time it takes to search for a file that is not there, and it
// is invisible in review because it is one token inside a paragraph that reads
// correctly. Measured at 503bd0a over the coverage space below: 1,887 code-span
// file references, and 50 that the rule below cannot verify -- 19 of them outside
// `docs/plans/`.
//
// **Coverage space, stated because four measurements in this effort were exact
// over the wrong space.** Every `.ts` `.tsx` `.mjs` `.cjs` `.js` `.jsx` `.md` file
// under `sword-prototype/`, excluding `node_modules`, `dist`, `.deps-stage`,
// `public`, `asset-src`, `.git` and the gitignored `.review`. 127 files at
// 503bd0a, 128 once this change's two additions land. `docs/plans/` is scanned but
// counted rather than gated -- see the pin below.
//
// **And one more exclusion, which is this file.** A checker has to quote every
// spelling it parses, including a bare continuation with nothing to continue and
// an anchor that is deliberately past the end of its file, so sweeping the grammar
// documentation would make it fail its own grammar. The cost is real and is stated
// rather than hidden: references written in this file are not checked by it. They
// are all quotations of references that are checked where they actually live.
//
// **What a reference is.** A code span whose content has no whitespace and ends in
// a known file extension, optionally carrying a line anchor. Four anchor
// spellings exist in this tree and `docs/measurements.md` names all four:
// `path#Lnnn` (and `#Lnnn-Lmmm`), the colon form `` `options.ts:258` ``, the comma
// list `` `tests/learning.test.mjs:147,151` ``, and the bare continuation
// `` `:105` `` that carries the file named just before it. The continuation is
// live in source, not just quoted in prose: `src/learning/tournament.ts` writes
// `research-policy.ts:98` and then `:95` and `:54-56` on the two lines after it.
//
// **Why the anchor rule is "in range" and not "on a declaration".** The repository
// root's `tools/check_docs.js` requires an anchor to land on a declaration, an
// attribute or the first line of a comment block. Run over this tree it is wrong
// far more often than it is right: of the 206 anchors the first sweep found,
// **101 land mid-statement** and almost all of them are correct, because this
// prototype's house style points at the line that does the thing --
// `measure.mjs:348` is `for (const side of sides) side.combat.advance(FRAME);`.
// Adopting that rule would mean re-pointing a hundred correct anchors at the
// nearest `export` above them, which is worse prose and no more durable.
//
// **The limit that follows from that, stated because it bit during this change.**
// This gate sees an anchor that runs off the end of a file and an anchor that names
// a file which is not there. It cannot see an anchor that still lands inside its file
// and now points at the wrong line -- which is what *every* line-shifting edit above
// an anchor produces. Adding one comment line to `src/main.ts` rotted three plan
// anchors by one, and the suite stayed green, because a shift of one moves neither
// `lineOutOfRange` nor `noSuchFile` and therefore does not move `PLAN_SURFACE`. So:
// **an edit that changes a file's line count is invisible here.** Keep such an edit
// line-neutral, or re-point what it moved by hand. The repository root's
// `tools/check_docs.js` catches this for Markdown links because it compares the
// anchor's text against its target; nothing catches it for a code span, and this
// gate does not pretend to.
//
// A symbol-proximity heuristic was tried and rejected as an assertion for the same
// reason in reverse: it reported roughly 45 rotted anchors, and hand-checking found
// clean false positives -- `src/learning/tournament.ts:232` names `lookaheadMind`
// and anchors `lookahead.ts:294`, which is the *call* rather than the declaration,
// and both are right. `tools/check_docs.js` documents that asymmetry from the other
// side: it accepts an anchor landing on a call of the symbol it names, "which is why
// the gate is a rot detector and not a symbol resolver". So the exact rule -- the
// file resolves and every line named is inside it -- is what is gated here, and no
// number produced by a heuristic is called a count of stale anchors.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(ROOT, "..");

// Not scanned: build output, vendored code, binary asset sources, and `.review`,
// which is gitignored scratch.
const SCAN_SKIP = new Set(["node_modules", "dist", ".deps-stage", "public", "asset-src", ".review", ".git"]);
// Not searched when resolving a reference either, and for a sharper reason: a
// reference that resolves only inside `dist/` resolves to a build artifact, and one
// that resolves only inside `.review/` resolves to a file that exists on exactly one
// machine. Both would make this test pass here and fail on a fresh clone, which is
// the defect it exists to remove. The first sweep of this tree put `.review` and
// `dist` in its resolution tree, and at 503bd0a that scored **146** durable
// references whose target begins `.review/` as resolving. (145 of those 146 reach
// the scratch rule; the odd one is a brace expansion the shape rule takes first. The
// two numbers name two populations and this file used to use 145 for both.)
//
// **This set is enforced on every resolution branch, which it was not at first.** The
// exact-path branch called `existsSync` on `ROOT/target` and honoured nothing, so a
// durable reference to `dist/assets/index.js` or `.deps-stage/package.json` passed --
// both directories exist today -- and `node_modules/...` spans reported as tree hits.
// `skipped` below is what closes it.
const RESOLVE_SKIP = new Set(["node_modules", "dist", ".deps-stage", ".review", ".git"]);
const SCAN_EXT = /\.(?:ts|tsx|mjs|cjs|js|jsx|md)$/;
// **A whitelist, and the coverage paragraph above says which files are scanned, not
// which references are judged -- so this is the second half of the coverage space.**
// A span whose extension is not here is not a reference at all as far as this gate is
// concerned. Measured over the live tree: nineteen spans name a plausible file with
// an extension that was outside it, and eleven of those were real, resolvable
// pointers -- `public/assets/warrior.glb` five times, `asset-src/build_warrior.py`
// twice, plus bare basenames. `glb`, `py` and `jsonl` are here because of them, and
// `the_extension_whitelist_covers_every_path_shaped_span` keeps the list honest from
// the other side: any span containing a `/` and ending in an extension must have that
// extension here, so the next asset type cannot slip out of the judged population
// silently the way these eleven did.
const FILE_EXT = /\.(?:ts|tsx|mjs|cjs|js|jsx|md|json|html|css|bin|txt|yml|yaml|toml|wasm|glb|obj|py|jsonl)$/i;

// A code span, CommonMark-style: a run of N backticks closed by a run of exactly N.
// The lookarounds matter -- without them a match starts inside a run and
// `` `:105` `` (a span quoted inside a span) is silently invisible, which is how the
// first sweep of this tree missed four references in `docs/measurements.md`.
const SPAN = /(?<!`)(`+)(?!`)([^\n]+?)(?<!`)\1(?!`)/g;
// `path`, `path:12`, `path:12-20`, `path:2,119,141-144`, `path#L12`, `path#L12-L20`.
const ANCHOR = /^(.*?)(?::((?:\d+(?:-\d+)?)(?:,\d+(?:-\d+)?)*)|#L(\d+)(?:-L?(\d+))?)$/;
// How far back a bare `:105` may look for the file name it continues. Every live
// continuation in this tree is within two lines; five is slack, not a search.
//
// **The nearest preceding file name is a guess, and it is wrong far more often than
// the verdicts show.** Hand-checked one at a time over the session-17 plan, which held
// 17 of the tree's 48 continuations when the check was taken on 2026-08-25: **nine**
// guessed a file the prose does not mean. Two of the nine produced a verdict, because
// the wrongly-guessed carrier also happened to be too short. The other seven were
// silent, and the clearest guessed `docs/measurements.md` -- six thousand lines, so it
// absorbs any line number a plan will ever write. **That file was deleted with the
// landed plan set on 2026-08-26 and the count is not re-takeable**; it is dated rather
// than restated, because the deletion removed 32 continuations and any later total is
// over a different population. `docs/measurements.md` carries the evidence.
//
// So the verdict below measures "the guess was wrong **and** out of range", not "the
// carrier is unverified", and it is named for the former. **The silent class is
// uncatchable by this rule and is not counted anywhere**: a guess that lands on a long
// enough file is indistinguishable from a correct one.
//
// Widening the window does not help: the true carrier is a section heading fourteen
// lines up in three cases, and a bolded bullet subject past two intervening file
// names in three more. One cheap catch was proposed and **measured, then rejected** --
// "a bare continuation never legitimately carries a `.md` file, so a `.md` carrier is
// wrong by construction". It does: the session-16 plan wrote "Update the perception and
// learning sections of `docs/design.md` -- `#L84` documents ...", a correct `.md`
// carrier, and `docs/measurements.md` has three more of the same shape -- which is what
// keeps the heuristic falsified now that the plan file is deleted. It would have been
// wrong four times to catch one.
//
// The record carries the carrier it guessed, so checking one takes a single step.
const CONTINUATION_LINES = 5;

// ---------------------------------------------------------------- pinned records
//
// Each of these bounds a population from both sides. A pin that only forbids growth
// is satisfied by somebody deleting the thing it watches.

// Spans written with a `..` or `.` path segment. A relative href's base is the
// document that contained the link, and when a document *quotes* somebody else's
// href that document is not this one -- `docs/measurements.md` quotes
// `../../scripts/train-ppo.mjs#L99999` because it is the deliberately out-of-range
// probe that proved `tools/check_docs.js` reaches this directory, and "fixing" it
// would destroy the evidence. Excluded by rule; pinned as whole records so the hole
// cannot quietly grow. Measured 2026-08-25 over the coverage space above, on the
// working tree at 503bd0a that adds this test.
const RELATIVE_HREF_SPANS = [
  { file: "docs/measurements.md", span: "../tools/check_docs.js" },
  { file: "docs/measurements.md", span: "../../scripts/train-ppo.mjs#L99999" },
];

// A durable document may name a file that does not exist yet only if a live plan
// promises it. This is one pinned record and not a resolution rule, and the
// difference was measured rather than reasoned about: "named in a plan" resolved as
// "promised by a plan" for an afternoon, and under mutation it excused a
// re-introduced `kinds.ts`, because `combat-followups-99-found-not-fixed.md` names
// that file precisely in order to say no such file has ever existed. So the excuse is
// this list, and what is derived is its justification -- the reference must still
// resolve nowhere and a live plan must still name it, which means the commit that
// deletes the plan set turns it red. Measured 2026-08-25 on the working tree at
// 503bd0a that adds this test.
const PROMISED_BY_A_PLAN = [
  { file: "docs/measurements.md", span: "tournament-v1.json" },
];

// The registry's re-added trap, kept visible rather than commented. A path can be
// deleted and later restored; `scripts/fetch-textures.mjs` was, and it is why
// resolution checks the working tree before the registry and why the registry is the
// deletion log *minus* what exists. Pinned from both sides: a second re-added path
// has to be looked at, and if this one stops being re-added somebody has to re-pin.
// Measured 2026-08-25 at 503bd0a.
const DELETED_AND_BACK = [
  "asset-src/armour/quaternius-knight/Helmet3.obj",
  "scripts/fetch-textures.mjs",
];

// The two files outside this prototype that a durable reference may name. The
// prototype is standalone and may not import from `../client`, `../crates`,
// `../tools`, `../web` or `../warrior-prototype` -- it may still *talk about* the
// repository's own gate and design document, and it does. Pinned as targets rather
// than as occurrences, because the count of mentions is prose and moves; the set of
// things outside the boundary that get named is a decision. An earlier version of
// this comment carried a count instead, said "three references name it" when there
// were five, and named only one of the two files.
const NAMED_OUTSIDE_THE_PROTOTYPE = ["DESIGN.md", "tools/check_docs.js"];

// Every durable reference that resolves only inside `node_modules`. The dependency
// tree makes 6,049 distinct basenames resolvable, so this branch is the widest in the
// resolver: a durable `` `index.js` `` would be green and no such file exists here.
// Eight live references need it, all naming a Babylon module or asset a comment
// explains, so the branch is pinned to them as whole records rather than left open.
// Eight targets, and two of them are here *because* the exact-path branch is now
// guarded: a span carrying its own `node_modules/` prefix used to report as a tree
// hit, and `HavokPhysics.wasm` is found by the lazy suffix walk of the dependency
// tree, which is the only reason that walk exists.
// Measured 2026-08-25 on the working tree that adds this test.
const RESOLVED_IN_NODE_MODULES = [
  "@babylonjs/core/Culling/ray.js",
  "@babylonjs/core/Engines/nullEngine.js",
  "@babylonjs/core/Physics/joinedPhysicsEngineComponent.js",
  "@babylonjs/core/Rendering/edgesRenderer.js",
  "@babylonjs/core/Rendering/outlineRenderer.js",
  "@babylonjs/loaders/glTF/2.0/glTFLoader.js",
  "HavokPhysics.wasm",
  "node_modules/@babylonjs/core/Physics/v2/Plugins/havokPlugin.js",
];

// A glob and a brace expansion are excused because neither is a path -- but neither
// is checked either, so `` `src/nope-*.ts` `` and `` `src/{nope,alsonope}.ts` `` are
// both green, and that is a smuggling route rather than a rule. Bounded by pinning
// the targets in the durable surface; each is either a real glob/brace reference or a
// deliberately interpolated trainer artifact name that cannot resolve literally. All
// of them real. Bare extensions (`` `.ts` ``, 24 durable spans over 7 targets) are
// deliberately *not* pinned -- a bare extension has no path in it at all, so nothing
// can be hidden inside one, and pinning a population that grows whenever somebody
// writes the words "a .ts file" would be re-pinned without thought.
// Measured 2026-08-25 on the working tree that adds this test.
const NOT_A_PATH_TARGETS = [
  ".review/rem2/cutseeds-{before,after}.json",
  "asset-src/learning/{baseline,engagement-baseline,unpromoted}-v1.json",
  "candidate-${artifact.candidate}.json",
  "candidate-${id}.json",
  "candidate-boundary-${artifact.candidate}.json",
  "candidate-boundary-${id}.json",
  "scripts/*.mjs",
  "tests/*.mjs",
];

// **The scratch exclusion is the largest hole and it is deliberately not pinned by
// count.** 165 durable references over 88 distinct targets, 11.7 % of the durable
// population, and a count pin would be the wrong instrument: AGENTS.md requires every
// measurement to name its harness, harnesses are throwaway probes under `.review/`,
// and this tree gains measurements every session -- so a both-sided count would go red
// on correct work and be re-pinned reflexively, which trains exactly the habit the
// pins exist to prevent. What is bounded instead is the *shape* of what the rule may
// excuse, which does not move when a measurement is added, plus a deliberately coarse
// share so the population cannot come to dominate the surface without anyone noticing.
// Measured 2026-08-25 on the working tree that adds this test: 165 / 1,409 = 11.7 %.
const SCRATCH_SHARE_OF_DURABLE = { min: 0.02, max: 0.25 };

// `docs/plans/` is deleted in the commit that finishes the topic, so repairing its
// anchors is work about to be thrown away and that every session would redo. The plan
// surface is counted rather than gated, and pinned from both sides: a session that
// rots more is told, and a session that repairs some is told to re-pin. The field
// names say what the rule actually measured; none of them means "stale", because this
// rule cannot see staleness, only absence and range.
//
// **Re-measured 2026-08-26, and the population changed character rather than size.**
// The three landed session plans -- 15, 16 and 17 -- were deleted and the overview was
// slimmed from 1,526 lines to 231, which took 98 anchored spans and 32 bare
// continuations out of the judged set. Five of the six fields went to zero as a result,
// and the survivors are all one thing: **a plan naming a file it intends to create.**
// `tests/recorder.test.mjs`, `tests/preflight.test.mjs`, `tests/ceilings.test.mjs`,
// `tests/engagement.test.mjs`, `scripts/freeze-tournament.mjs` and `ledger.jsonl` do
// not exist because nobody has run sessions 18 and 20 through 23 yet. Session 19 added
// `tests/ledger.test.mjs`, `tests/plateau.test.mjs` and `tests/deployment.test.mjs`, so
// `noSuchFile` is
// now a count of unbuilt work, and it should fall as those sessions land rather than
// stay put -- which is the opposite of what this pin meant a day ago, and is why the
// reason is written here instead of only the number.
//
// **It rises when a session is split, and 13 -> 10 -> 15 -> 8 is the whole story of that.**
// Session 19 took it to 10 by building three of the named files. Splitting session 18 then
// took it to 15: the then-live recorder implementation plan named `src/recorder.ts`,
// `src/learning/gates.ts` and `scripts/measure-engagement.mjs`, none of which existed, and
// names `tests/recorder.test.mjs` and `tests/engagement.test.mjs` a second time each --
// this tally counts occurrences, not distinct paths. Session 18a built all five, removing
// seven occurrences and taking the count to 8. Session 20 then built
// `tests/preflight.test.mjs`, taking it to 7. So a rise here means a plan got more specific
// about what it will create, and a fall means somebody created it. Both are correct; neither
// is a repair.
//
// **Re-measured 2026-08-30 after completed/deprecated plans were pruned and the
// supported-locomotion sessions were added: 13 missing and zero ambiguous.** The
// remaining misses are files those live sessions promise to create. The two former
// ambiguous `ppo.ts` references belonged to removed historical plan prose.
const PLAN_SURFACE = {
    noSuchFile: 5,
  ambiguousFile: 0,
  anchorIntoDeletedFile: 0,
  orphanContinuation: 0,
  continuationOutsideGuessedCarrier: 0,
  lineOutOfRange: 0,
};

// ----------------------------------------------------------------------- scanning

function walk(dir, skip, keep, out = []) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full, skip, keep, out);
    else if (item.isFile() && keep(item.name)) out.push(path.relative(ROOT, full).replaceAll("\\", "/"));
  }
  return out;
}

/** Every code span on one line, including spans quoted inside a wider span. */
function codeSpans(line) {
  const found = [];
  for (const match of line.matchAll(SPAN)) {
    found.push(match[2].trim());
    if (match[1].length > 1) {
      for (const inner of match[2].matchAll(/`([^`]+)`/g)) found.push(inner[1].trim());
    }
  }
  return found;
}

/** Every line number a span names: `:2,119,141-144` -> [2, 119, 141, 144]. */
function linesNamed(match) {
  if (match[2]) return match[2].split(",").flatMap((part) => part.split("-")).map(Number);
  return match[3] ? [Number(match[3]), ...(match[4] ? [Number(match[4])] : [])] : [];
}

/**
 * Every file reference in the scanned tree, with its anchor resolved.
 *
 * The carrier state is what makes a bare `:105` checkable: the last file name seen
 * in this file, and how long ago. A continuation with no carrier within
 * `CONTINUATION_LINES` is reported as an orphan rather than silently dropped,
 * because a dropped reference reads exactly like a passing one.
 */
function references(files) {
  const found = [];
  for (const rel of files) {
    const lines = fs.readFileSync(path.join(ROOT, rel), "utf8").split(/\r?\n/);
    let carrier = null;
    let carrierAt = -Infinity;
    lines.forEach((text, index) => {
      for (const span of codeSpans(text)) {
        if (/\s/.test(span)) continue;
        const match = ANCHOR.exec(span);
        let target = match ? match[1] : span;
        let kind = match ? "anchored" : "plain";
        if (match && target === "") {
          if (carrier === null || index - carrierAt > CONTINUATION_LINES) {
            found.push({ file: rel, line: index + 1, span, target: null, kind: "orphan", lines: [] });
            continue;
          }
          target = carrier;
          kind = "continuation";
        } else if (!FILE_EXT.test(target)) {
          continue;
        } else {
          carrier = target;
          carrierAt = index;
        }
        found.push({ file: rel, line: index + 1, span, target, kind, lines: match ? linesNamed(match) : [] });
      }
    });
  }
  return found;
}

// --------------------------------------------------------------------- exclusions
//
// Stated rules, not an allowlist. Each says what the span *is*, so no reference is
// excused for being inconvenient. The first is shapes that are not paths at all; the
// two below it are paths that a reader cannot follow from here, and both are pinned
// as whole records above so that neither can quietly grow.

function notAPath(target) {
  // `` `.ts` `` names an extension, not a file.
  if (/^\.[A-Za-z0-9]+$/.test(target)) return "bare-extension";
  // `scripts/*.mjs` names a set.
  if (target.includes("*")) return "glob";
  // `cutseeds-{before,after}.json` names two files in one span.
  if (target.includes("{") || target.includes("}")) return "brace-expansion";
  return null;
}

/**
 * A relative href, whose base is whichever document the link was written in. Quoted
 * in a second document it cannot be resolved from there, and resolving it against
 * the quoting document would be resolving a different path than the one meant.
 */
function baseDependent(target) {
  const segments = target.split("/");
  return segments.includes("..") || segments.includes(".");
}

/**
 * Provenance for a measurement rather than a pointer a reader can follow. `.review/`
 * is gitignored, so these exist only on the machine that took the measurement --
 * which is exactly why AGENTS.md wants them named, and exactly why they cannot be
 * required to resolve. `the_scratch_exclusion_rests_on_review_actually_being_gitignored`
 * checks the premise rather than assuming it.
 */
function isScratch(target) {
  return target === ".review" || target.startsWith(".review/");
}

// ---------------------------------------------------------------------- resolving

function readRegistry() {
  const markdown = fs.readFileSync(path.join(ROOT, "docs", "deleted-paths.md"), "utf8");
  const block = /<!-- BEGIN GENERATED -->\r?\n([\s\S]*?)<!-- END GENERATED -->/.exec(markdown);
  assert.ok(block, "docs/deleted-paths.md has lost its generated block");
  return block[1].split(/\r?\n/).filter(Boolean).map((line) => {
    const entry = /^- `(.+)`$/.exec(line);
    assert.ok(entry, `docs/deleted-paths.md: not a registry entry: ${line}`);
    return entry[1];
  });
}

function gitDeletions() {
  // Loudly, never skipped. A skipped check reads as a passed one, and that is the
  // exact defect this whole effort keeps removing -- so an absent git is a failure
  // of this test rather than a reason to stop asking.
  let log;
  try {
    log = execFileSync(
      "git",
      ["log", "--no-renames", "--diff-filter=D", "--name-only", "--pretty=format:", "--", "sword-prototype/"],
      { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    assert.fail(`git history is not readable, so the deleted-path registry cannot be checked: ${error.message}`);
  }
  // `--no-renames` is load-bearing: with rename detection on git reports 49 paths
  // here instead of 56, because a rename is one modification rather than a deletion
  // plus an addition, and the 7 it drops are old names this tree still references.
  return [...new Set(log.split(/\r?\n/).filter(Boolean).map((p) => p.replace(/^sword-prototype\//, "")))].sort();
}

function suffixIndex(paths) {
  const index = new Map();
  for (const entry of paths) {
    const parts = entry.split("/");
    for (let i = 0; i < parts.length; i++) {
      const suffix = parts.slice(i).join("/");
      if (!index.has(suffix)) index.set(suffix, []);
      index.get(suffix).push(entry);
    }
  }
  return index;
}

function makeResolver(registry) {
  const tree = walk(ROOT, RESOLVE_SKIP, () => true);
  const treeIndex = suffixIndex(tree);
  const registryIndex = suffixIndex(registry);
  let vendored = null;
  // Whether a path lies inside a directory resolution does not search. Without this
  // the exact-path branch honoured nothing and `RESOLVE_SKIP`'s comment was a claim
  // the code did not keep.
  const skipped = (target) => RESOLVE_SKIP.has(target.split("/")[0]);

  return function resolve(target) {
    // The working tree first, always. A path can be deleted and later re-added, and
    // asking the registry first would answer "deleted, fine" for a live file.
    const exact = path.join(ROOT, target);
    if (!skipped(target) && fs.existsSync(exact) && fs.statSync(exact).isFile()) {
      return { where: "tree", files: [exact] };
    }
    const bySuffix = treeIndex.get(target);
    if (bySuffix) return { where: "tree", files: bySuffix.map((p) => path.join(ROOT, p)) };
    // One level up. The prototype is standalone and imports nothing from the
    // repository, but it does talk about the repository's own documents;
    // `NAMED_OUTSIDE_THE_PROTOTYPE` pins which ones, so this branch cannot quietly
    // become a way for anything above the directory to resolve.
    const atRepo = path.join(REPO, target);
    if (!skipped(target) && fs.existsSync(atRepo) && fs.statSync(atRepo).isFile()) {
      return { where: "repo", files: [atRepo] };
    }
    // Dependencies. A span may carry the `node_modules/` prefix itself -- which the
    // exact-path branch above now refuses, because `node_modules` is a skipped
    // directory -- or name a package subpath directly.
    for (const prefix of [target, path.join("node_modules", target)]) {
      if (prefix === target && !target.startsWith("node_modules/")) continue;
      const candidate = path.join(ROOT, prefix);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return { where: "node_modules", files: [candidate] };
    }
    if (vendored === null) {
      const modules = path.join(ROOT, "node_modules");
      // Loudly, for the same reason as the git log below: eight references name a file
      // inside `@babylonjs`, and without the dependency tree they would report as
      // typos. An absent `node_modules` is a failure of this test, not a skip.
      assert.ok(fs.existsSync(modules), "node_modules is absent, so references into dependencies cannot be checked -- run npm ci");
      vendored = suffixIndex(walk(modules, new Set([".git"]), () => true));
    }
    const inVendor = vendored.get(target);
    if (inVendor) return { where: "node_modules", files: [path.join(ROOT, inVendor[0])] };
    if (registryIndex.has(target)) return { where: "deleted", files: [] };
    return null;
  };
}

/**
 * The live plan file that names `target`, or null.
 *
 * **This is not a resolution step and it was one for an afternoon, which was a
 * mistake worth recording.** "Named in a plan" is not "promised by a plan":
 * `combat-followups-99-found-not-fixed.md` names `kinds.ts` in order to say that
 * no such file has ever existed, so a resolution step that consulted the plan set
 * excused a re-introduced `kinds.ts` -- verified by mutation, which is how it was
 * caught. So the excuse is a pinned record instead, and this function only checks
 * that the one record on it still has a plan behind it.
 */
function namedByALivePlan(target) {
  for (const rel of walk(path.join(ROOT, "docs", "plans"), new Set(), (name) => name.endsWith(".md"))) {
    for (const line of fs.readFileSync(path.join(ROOT, rel), "utf8").split(/\r?\n/)) {
      for (const span of codeSpans(line)) {
        if (/\s/.test(span)) continue;
        const named = (ANCHOR.exec(span) ?? [null, span])[1];
        if (!named || !FILE_EXT.test(named)) continue;
        if (named === target || named.endsWith("/" + target)) return rel;
      }
    }
  }
  return null;
}

// --------------------------------------------------------------------- the sweep

const SELF = "tests/docs.test.mjs";
const scanned = walk(ROOT, SCAN_SKIP, (name) => SCAN_EXT.test(name)).filter((rel) => rel !== SELF).sort();
const registry = readRegistry();
const resolve = makeResolver(registry);
const all = references(scanned);
const durable = (reference) => !reference.file.startsWith("docs/plans/");

/**
 * One reference judged. Returns `null` when it passes, otherwise a whole record --
 * where it is written, what it says, and which rule it failed -- because a count
 * with no records attached cannot be acted on.
 */
function judge(reference) {
  const at = { file: reference.file, line: reference.line, span: reference.span };
  if (reference.kind === "orphan") return { ...at, why: "orphanContinuation" };
  if (notAPath(reference.target) || baseDependent(reference.target) || isScratch(reference.target)) return null;
  const found = resolve(reference.target);
  if (!found) return { ...at, why: "noSuchFile" };
  if (reference.lines.length === 0) return null;
  if (found.files.length === 0) return { ...at, why: "anchorIntoDeletedFile" };
  if (found.files.length > 1) return { ...at, why: "ambiguousFile", candidates: found.files.length };
  // The last line, not the number of pieces `split` returns. A newline-terminated
  // file yields a trailing empty piece, so counting pieces made this rule lenient by
  // exactly one and let an anchor one past the end pass.
  const body = fs.readFileSync(found.files[0], "utf8").replace(/\r?\n$/, "");
  const total = body === "" ? 0 : body.split(/\r?\n/).length;
  const outside = reference.lines.filter((line) => line < 1 || line > total);
  if (outside.length === 0) return null;
  // Named for what it measures: the guessed carrier resolved, and a line the span
  // names is outside it. That is "wrong guess **and** out of range" -- a wrong guess
  // against a long enough file is silent, and seven of this tree's nine known wrong
  // guesses are. See the note on CONTINUATION_LINES.
  const why = reference.kind === "continuation" ? "continuationOutsideGuessedCarrier" : "lineOutOfRange";
  return { ...at, why, outside, total, carrier: reference.kind === "continuation" ? reference.target : undefined };
}

// The two verdicts that mean "the anchor does not land", kept together so neither
// test can silently stop covering one of them.
const DOES_NOT_LAND = new Set(["lineOutOfRange", "continuationOutsideGuessedCarrier"]);
const excused = new Set(PROMISED_BY_A_PLAN.map((record) => `${record.file}|${record.span}`));
const isExcused = (record) => excused.has(`${record.file}|${record.span}`);

function tally(records) {
  const counts = {
    noSuchFile: 0, ambiguousFile: 0, anchorIntoDeletedFile: 0,
    orphanContinuation: 0, continuationOutsideGuessedCarrier: 0, lineOutOfRange: 0,
  };
  for (const record of records) counts[record.why]++;
  return counts;
}

// ------------------------------------------------------------------------- tests

test("the_scanner_reads_all_four_anchor_spellings_and_refuses_the_shapes_that_are_not_paths", () => {
  // The extractor asserted against literal text, because every later test reads its
  // output and a test that reads the reporter rather than the thing reported is the
  // failure this repository produces most.
  assert.deepEqual(codeSpans("see `src/weapon.ts:12` and `` `:105` `` here"), [
    "src/weapon.ts:12",
    "`:105`",
    ":105",
  ]);
  assert.deepEqual(ANCHOR.exec("options.ts:258").slice(1, 3), ["options.ts", "258"]);
  assert.deepEqual(linesNamed(ANCHOR.exec("tests/learning.test.mjs:147,151")), [147, 151]);
  assert.deepEqual(linesNamed(ANCHOR.exec("scripts/measure.mjs:221,364-370")), [221, 364, 370]);
  assert.deepEqual(linesNamed(ANCHOR.exec("src/fighter.ts#L1577-L1596")), [1577, 1596]);
  assert.deepEqual(linesNamed(ANCHOR.exec("train-ppo.mjs#L182")), [182]);
  assert.equal(ANCHOR.exec(":54-56")[1], "");
  assert.deepEqual(
    ["`.ts`", "scripts/*.mjs", "a-{b,c}.json"].map(notAPath),
    [null, "glob", "brace-expansion"],
  );
  assert.equal(notAPath(".ts"), "bare-extension");
  assert.deepEqual([".././x.ts", "./x.ts", "src/x.ts"].map(baseDependent), [true, true, false]);
  assert.deepEqual([".review/x.mjs", ".reviewer/x.mjs"].map(isScratch), [true, false]);
});

test("a_bare_line_continuation_carries_the_file_named_just_before_it", () => {
  // `src/learning/tournament.ts` is the live instance, and it is the reason this
  // spelling is supported at all rather than skipped as unparseable.
  const carried = all.filter((r) => r.kind === "continuation" && r.file === "src/learning/tournament.ts");
  assert.deepEqual(
    carried.map((r) => ({ span: r.span, target: r.target, lines: r.lines })),
    [
      { span: ":95", target: "research-policy.ts", lines: [95] },
      { span: ":54-56", target: "research-policy.ts", lines: [54, 56] },
      { span: ":291", target: "lookahead.ts", lines: [291] },
    ],
  );
});

test("the_scratch_exclusion_rests_on_review_actually_being_gitignored", () => {
  // The rule that lets a `.review/...` reference through is "it is provenance for a
  // measurement, gitignored by design". If somebody starts checking `.review` in,
  // that argument is void and these references have to be resolved like any other.
  //
  // Asked of git rather than of `.gitignore`'s text: the question is whether the path
  // is ignored, and a literal-line match answers a different one -- it would miss a
  // rule written `/.review` or one inherited from a parent `.gitignore`, and it would
  // not notice a later negation un-ignoring it.
  let ignored;
  try {
    execFileSync("git", ["check-ignore", "-q", "--", ".review/probe.mjs"], { cwd: ROOT, stdio: "ignore" });
    ignored = true;
  } catch (error) {
    if (error.status === 1) ignored = false;
    else assert.fail(`git check-ignore is not usable, so the scratch rule's premise cannot be checked: ${error.message}`);
  }
  assert.equal(ignored, true, "git no longer ignores .review/, so provenance references there must resolve like any other");
});

test("the_deleted_path_register_is_exactly_what_git_deleted_and_has_not_brought_back", () => {
  const log = gitDeletions();
  const absent = log.filter((entry) => !fs.existsSync(path.join(ROOT, entry)));
  // Whole record both ways: nothing invented, nothing missing, order included. Order
  // is byte order, which is what `.sort()` gives and what `LC_ALL=C sort` gives; the
  // regeneration command in the register's header pins the locale for that reason.
  assert.deepEqual(registry, absent, "docs/deleted-paths.md disagrees with git -- regenerate it with the command in its header, and note that the LC_ALL=C in that command is load-bearing");
  for (const entry of registry) {
    assert.ok(log.includes(entry), `${entry} is in the registry but git never deleted it`);
    assert.equal(fs.existsSync(path.join(ROOT, entry)), false, `${entry} is in the registry but exists`);
  }
});

test("a_path_that_was_deleted_and_added_back_is_kept_out_of_the_register", () => {
  // The trap this registry design walks into if nobody watches it: "in the deletion
  // log" does not mean "absent now".
  const log = gitDeletions();
  const back = log.filter((entry) => fs.existsSync(path.join(ROOT, entry)));
  assert.deepEqual(back, DELETED_AND_BACK);
  for (const entry of back) assert.equal(registry.includes(entry), false);
  // And resolution must answer "tree" for it, not "deleted".
  for (const entry of back) assert.equal(resolve(entry).where, "tree");
});

test("every_durable_code_span_file_reference_resolves_or_is_excluded_by_a_stated_rule", () => {
  const failures = all.filter(durable).map(judge).filter(Boolean)
    .filter((r) => !DOES_NOT_LAND.has(r.why))
    .filter((r) => !isExcused(r));
  assert.deepEqual(failures, [], `durable references this rule cannot verify:\n${JSON.stringify(failures, null, 2)}`);
});

test("every_durable_line_anchor_lands_inside_the_file_it_names", () => {
  // Both spellings of "the anchor does not land": a stale anchor, and a bare
  // continuation whose carrier this rule had to guess. Zero of each here.
  const failures = all.filter(durable).map(judge).filter(Boolean).filter((r) => DOES_NOT_LAND.has(r.why));
  assert.deepEqual(failures, [], `durable anchors that do not land:\n${JSON.stringify(failures, null, 2)}`);
});

test("the_durable_spans_excused_as_base_dependent_hrefs_are_exactly_the_two_on_record", () => {
  const found = all
    .filter(durable)
    .filter((r) => r.target !== null && !notAPath(r.target) && baseDependent(r.target))
    .map((r) => ({ file: r.file, span: r.span }));
  assert.deepEqual(found, RELATIVE_HREF_SPANS);
});

test("the_durable_reference_excused_by_a_live_plan_still_has_a_live_plan_behind_it", () => {
  // The excuse is a pinned record, so it cannot spread. What is derived is the
  // justification: each record must still resolve nowhere -- otherwise the excuse is
  // stale and should be dropped -- and a live plan must still name it, so the commit
  // that deletes the plan set turns this red rather than leaving a durable document
  // pointing at a file nobody is going to write.
  for (const record of PROMISED_BY_A_PLAN) {
    const reference = all.find((r) => r.file === record.file && r.span === record.span);
    assert.ok(reference, `${record.file} no longer writes \`${record.span}\`; drop the record`);
    assert.equal(resolve(reference.target), null, `\`${record.span}\` resolves now; drop the record`);
    const plan = namedByALivePlan(reference.target);
    assert.match(plan ?? "", /^docs\/plans\/.+\.md$/, `no live plan names \`${record.span}\``);
  }
});

test("only_the_two_pinned_files_outside_this_prototype_are_named_by_a_durable_reference", () => {
  const outside = [...new Set(
    all.filter(durable)
      .filter((r) => r.target !== null && !notAPath(r.target) && !baseDependent(r.target) && !isScratch(r.target))
      .filter((r) => resolve(r.target)?.where === "repo")
      .map((r) => r.target),
  )].sort();
  assert.deepEqual(outside, [...NAMED_OUTSIDE_THE_PROTOTYPE].sort());
});

test("the_durable_references_that_only_the_dependency_tree_can_resolve_are_exactly_the_ones_on_record", () => {
  // The widest branch in the resolver, held to a list. Without this a durable
  // `` `index.js` `` resolves against one of 6,049 vendored basenames and reads green.
  const vendored = [...new Set(
    all.filter(durable)
      .filter((r) => r.target !== null && !notAPath(r.target) && !baseDependent(r.target) && !isScratch(r.target))
      .filter((r) => resolve(r.target)?.where === "node_modules")
      .map((r) => r.target),
  )].sort();
  assert.deepEqual(vendored, [...RESOLVED_IN_NODE_MODULES].sort());
});

test("the_spans_excused_as_not_being_paths_are_exactly_the_targets_on_record", () => {
  // Globs and brace expansions are excused unchecked, so they are a smuggling route
  // unless the set is bounded. Bare extensions are excluded from this pin on purpose
  // -- see the note on NOT_A_PATH_TARGETS.
  const smuggled = [...new Set(
    all.filter(durable)
      .filter((r) => r.target !== null)
      .filter((r) => notAPath(r.target) === "glob" || notAPath(r.target) === "brace-expansion")
      .map((r) => r.target),
  )].sort();
  assert.deepEqual(smuggled, [...NOT_A_PATH_TARGETS].sort());
});

test("the_scratch_exclusion_is_bounded_by_shape_and_by_share_rather_than_by_a_count", () => {
  // Same precedence `judge` uses: a target that is not a path at all is taken by the
  // shape rule before the scratch rule ever sees it, so `cutseeds-{before,after}.json`
  // is bounded by NOT_A_PATH_TARGETS rather than here.
  const scratch = all.filter(durable).filter((r) => r.target !== null && !notAPath(r.target) && isScratch(r.target));
  const judged = all.filter(durable).filter((r) => r.target !== null).length;
  // Shape: every excused target is a plain path under .review/. Nothing with a glob,
  // a brace or a `..` segment may be waved through as provenance, so the rule cannot
  // be widened by accident and cannot hide a path that ought to resolve.
  const misshapen = scratch
    .filter((r) => !/^\.review\/[A-Za-z0-9_.\/-]+\.[A-Za-z0-9]+$/.test(r.target) || r.target.includes(".."))
    .map((r) => ({ file: r.file, line: r.line, span: r.span }));
  assert.deepEqual(misshapen, [], `scratch targets that are not plain paths:\n${JSON.stringify(misshapen, null, 2)}`);
  // Share: coarse on purpose, because the population grows every time somebody takes
  // a measurement and names its harness, which AGENTS.md requires.
  const share = scratch.length / judged;
  assert.ok(
    share > SCRATCH_SHARE_OF_DURABLE.min && share < SCRATCH_SHARE_OF_DURABLE.max,
    `provenance references are ${(share * 100).toFixed(1)} % of the durable surface (${scratch.length} of ${judged}), outside the pinned band`,
  );
});

test("the_extension_whitelist_covers_every_path_shaped_span", () => {
  // FILE_EXT decides which references are judged at all, so an extension missing from
  // it removes a whole class from the population silently -- which is how eleven real
  // `.glb` and `.py` pointers sat outside the check. Any span containing a `/` and
  // ending in something extension-shaped must have that extension on the list.
  const outside = [];
  for (const rel of scanned) {
    const lines = fs.readFileSync(path.join(ROOT, rel), "utf8").split(/\r?\n/);
    lines.forEach((text, i) => {
      for (const span of codeSpans(text)) {
        if (/\s/.test(span) || !span.includes("/")) continue;
        const bare = span.replace(/[#:].*$/, "");
        if (!/\.[A-Za-z0-9]{1,6}$/.test(bare) || FILE_EXT.test(bare)) continue;
        outside.push({ file: rel, line: i + 1, span });
      }
    });
  }
  assert.deepEqual(outside, [], `path-shaped spans whose extension is not judged -- add it to FILE_EXT, or write the span so it does not read as a path:\n${JSON.stringify(outside, null, 2)}`);
});

test("the_plan_sets_unverifiable_references_are_pinned_from_both_sides", () => {
  // Not gated: completed session files are pruned and a topic's remaining live set is
  // deleted when it closes, so repairing its anchors is work about to be thrown away.
  // Pinned so that rotting more is reported and repairing some forces a re-pin. Every
  // entry today is a plan naming a file it intends to create; see PLAN_SURFACE for why
  // that makes the pin read differently.
  const records = all.filter((r) => !durable(r)).map(judge).filter(Boolean);
  assert.deepEqual(tally(records), PLAN_SURFACE, `plan surface moved:\n${JSON.stringify(records, null, 2)}`);
});
