/**
 * **What the working copy may hold** beside its tracked files, and what is left over.
 *
 * - Disposable work (probes, logs, before-readings, screenshots) goes in `.tmp/<task>/`, a worktree
 *   in `.tmp/worktrees/<name>/`. `npm run clean` (`scripts/clean.mjs`) deletes what is a day old.
 * - What is kept outside Git (dependencies, builds, toolchains, research runs, editor state) is
 *   named in the repository's `.gitignore`, one entry each. Claude Code keeps its own state under
 *   `.claude/`, ignored through `.git/info/exclude`.
 * - An untracked file inside a folder Git tracks (`src/`, `tests/`, ...) is work in progress; one
 *   anywhere else is a stray.
 * - A crash dump (`*.stackdump`, left by a Git Bash that died) is ignored so that none is
 *   committed, and is garbage wherever it lies.
 *
 * `strays()` names every path these rules do not allow: `tests/workspace.test.mjs` fails on them and
 * `npm run clean` lists them.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The working copy's root. */
export const ROOT = fileURLToPath(new URL("../", import.meta.url));

/** Where disposable work goes, and where in it the worktrees go. */
export const TMP = ".tmp", WORKTREES = ".tmp/worktrees";

/** The `.gitignore` patterns whose paths are garbage, not kept: `npm run clean` deletes them. */
export const GARBAGE = Object.freeze(["*.stackdump"]);

/** What only Claude Code's own ignore rules may keep. */
const AGENT_STATE = ".claude/";

const git = (root, args, input) => execFileSync("git", args, { cwd: root, encoding: "utf8", input, maxBuffer: 64 << 20 });
const fields = (output) => output.split("\0").filter((field) => field !== "");

/**
 * The rule that ignores each of `paths` (a folder's ending in a slash), in order: the file it is in
 * and its pattern, or null where none does.
 */
function rules(root, paths) {
  if (!paths.length) return [];
  let output;
  // Every path answers with four fields, empty where no rule matches: the rule's file, its line, its
  // pattern, the path. The command exits 1 when no path is ignored, which is an answer too.
  try { output = git(root, ["check-ignore", "-v", "-n", "-z", "--stdin"], paths.join("\0") + "\0"); }
  catch (error) { if (error.status !== 1) throw error; output = error.stdout; }
  const answer = output.split("\0");
  return paths.map((_, k) => answer[4 * k] ? { source: answer[4 * k], pattern: answer[4 * k + 2] } : null);
}

/** Why `rule` does not keep its path, or null where it does. */
function unkept(rule) {
  if (rule === null) return "untracked outside the tracked folders";
  if (rule.source !== ".gitignore") return `hidden by ${rule.source}, not kept by .gitignore`;
  return GARBAGE.includes(rule.pattern) ? "garbage" : null;
}

/**
 * Every path under `root` outside its tracked tree that the rules above do not allow, each with why:
 * an untracked one outside the tracked folders, an ignored one that the repository's `.gitignore`
 * does not keep, or garbage. A folder all of whose contents are such is named once; an untracked
 * folder that holds something kept is named by what else it holds.
 */
export function strays(root = ROOT) {
  const tracked = new Set(fields(git(root, ["ls-tree", "-d", "--name-only", "-z", "HEAD"])));
  const entries = fields(git(root, ["status", "--porcelain=v1", "-z", "--ignored=traditional", "--untracked-files=normal"]))
    .filter((entry) => entry.startsWith("?? ") || entry.startsWith("!! "))
    .map((entry) => ({ ignored: entry.startsWith("!!"), path: entry.slice(3) }))
    .filter(({ path }) => !path.startsWith(AGENT_STATE));
  const found = [];
  const held = (folder) => readdirSync(join(root, folder), { withFileTypes: true }).map((entry) => folder + entry.name + (entry.isDirectory() ? "/" : ""));
  const judge = (paths) => rules(root, paths).forEach((rule, k) => {
    const why = unkept(rule);
    if (why) found.push({ path: paths[k], why });
  });
  // A folder Git reports ignored may be so only because all it holds is: such a folder is judged by what it holds.
  const judgeIgnored = (paths) => rules(root, paths).forEach((rule, k) => {
    if (rule === null && paths[k].endsWith("/")) judgeIgnored(held(paths[k]));
    else { const why = unkept(rule); if (why) found.push({ path: paths[k], why }); }
  });
  judgeIgnored(entries.filter((entry) => entry.ignored).map((entry) => entry.path));
  for (const { path } of entries.filter((entry) => !entry.ignored)) {
    const slash = path.indexOf("/");
    if (slash > 0 && slash < path.length - 1 && tracked.has(path.slice(0, slash))) continue;
    if (!path.endsWith("/")) { found.push({ path, why: unkept(null) }); continue; }
    const holds = held(path);
    if (rules(root, holds).some((rule) => rule !== null && unkept(rule) === null)) judge(holds);
    else found.push({ path, why: unkept(null) });
  }
  return found.sort((a, b) => a.path.localeCompare(b.path));
}
