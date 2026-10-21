/**
 * **Cleans the working copy** (`npm run clean`, `scripts/workspace.mjs` says what it may hold):
 *
 * - deletes crash dumps (`*.stackdump`) and Python bytecode (`__pycache__/`) wherever they lie,
 *   outside dependencies, toolchains and Git;
 * - deletes each piece of `.tmp/` work (an entry of `.tmp/`, or of `.tmp/worktrees/`) that nothing
 *   has touched for a day, or all of them with `--all`, and then forgets the worktrees so deleted
 *   (`git worktree prune`);
 * - lists the strays it leaves, for a person to move into `.tmp/`, keep in `.gitignore`, or delete.
 *
 * A deletion never follows a link: a worktree's `node_modules` junction goes, and the folder it
 * points at stays. A piece of work's age is the newest change to it or to what it directly holds.
 *
 *   npm run clean -- [--all] [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { ROOT, strays, TMP, WORKTREES } from "./workspace.mjs";

/** How long `.tmp/` work is kept untouched, ms. */
const STALE_MS = 24 * 60 * 60 * 1000;
/** Folders the garbage walk does not enter: Git's and dependencies anywhere; at the root, toolchains, agent state and `.tmp/` (cleaned by piece). */
const UNWALKED = new Set([".git", "node_modules"]), UNWALKED_AT_ROOT = new Set([".tools", ".claude", TMP]);

const { values } = parseArgs({ options: { all: { type: "boolean" }, "dry-run": { type: "boolean" } } });
const dry = values["dry-run"] === true;
const shown = (path) => relative(ROOT, path).replaceAll("\\", "/");

function remove(path, why) {
  console.log(`${dry ? "would delete" : "deleted"} ${shown(path)} (${why})`);
  if (!dry) rmSync(path, { recursive: true, force: true, maxRetries: 3 });
}

/** Crash dumps and Python bytecode under `folder`, links not followed. */
function garbageIn(folder, found = []) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isSymbolicLink() || UNWALKED.has(entry.name) || folder === ROOT && UNWALKED_AT_ROOT.has(entry.name)) continue;
    if (entry.isDirectory()) { if (entry.name === "__pycache__") found.push([path, "Python bytecode"]); else garbageIn(path, found); }
    else if (entry.name.endsWith(".stackdump")) found.push([path, "crash dump"]);
  }
  return found;
}

/** The newest change to `path` or to what it directly holds, ms since the epoch. */
function touched(path) {
  const own = lstatSync(path);
  if (!own.isDirectory() || own.isSymbolicLink()) return own.mtimeMs;
  return readdirSync(path).reduce((newest, name) => {
    try { return Math.max(newest, lstatSync(join(path, name)).mtimeMs); } catch { return newest; }
  }, own.mtimeMs);
}

/** The pieces of `.tmp/` work: its entries, the worktrees folder's entries in its place. */
function pieces() {
  const tmp = join(ROOT, TMP), worktrees = join(ROOT, WORKTREES);
  if (!existsSync(tmp)) return [];
  const listed = (folder) => readdirSync(folder).map((name) => join(folder, name));
  return listed(tmp).flatMap((path) => path === worktrees ? listed(worktrees) : [path]);
}

for (const [path, why] of garbageIn(ROOT)) remove(path, why);
const now = Date.now();
for (const path of pieces()) {
  const age = now - touched(path);
  if (values.all || age > STALE_MS) remove(path, values.all ? "all of .tmp" : `untouched ${(age / 3600000).toFixed(0)} h`);
}
if (!dry) execFileSync("git", ["worktree", "prune"], { cwd: ROOT });

const left = strays();
if (left.length) {
  console.log(`\n${left.length} strays left; move each into ${TMP}/, keep it in .gitignore, or delete it:`);
  for (const { path, why } of left) console.log(`  ${path} (${why})`);
  process.exitCode = 1;
} else console.log("no strays");
