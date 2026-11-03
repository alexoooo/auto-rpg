/** Pull main, check the result once, and commit a pending merge. Conflicts stay for a person to resolve. */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

export function pullMerge(cwd, { resume = false } = {}) {
  const started = performance.now();
  const command = (program, args, live = false) => {
    const result = spawnSync(program, args, { cwd, encoding: "utf8", stdio: live ? "inherit" : "pipe" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${program} ${args.join(" ")} failed (${result.status}).\n${result.stderr ?? ""}${result.stdout ?? ""}`);
    return (result.stdout ?? "").trim();
  };
  const git = (...args) => command("git", args);
  const stage = (name, action) => {
    const begin = performance.now();
    console.log(`${name}...`);
    const result = action();
    console.log(`${name}: ${((performance.now() - begin) / 1000).toFixed(1)}s`);
    return result;
  };
  const merging = () => existsSync(resolve(cwd, git("rev-parse", "--git-path", "MERGE_HEAD")));
  if (git("branch", "--show-current") !== "main") throw new Error("Run on main.");
  let before;
  if (resume) {
    if (!merging()) throw new Error("No pending merge to continue.");
    if (git("diff", "--name-only", "--diff-filter=U")) throw new Error("Resolve and stage the remaining conflicts first.");
    if (git("diff", "--name-only") || git("ls-files", "--others", "--exclude-standard")) throw new Error("Stage only the merge resolution; unrelated work remains outside the index.");
    before = git("rev-parse", "HEAD");
  } else {
    if (git("status", "--porcelain")) throw new Error("Working tree has local work. Leave it intact and handle the merge explicitly; this command never stashes or commits it.");
    before = git("rev-parse", "HEAD");
    stage("Fetch", () => git("fetch", "origin", "main"));
    const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", "FETCH_HEAD", "HEAD"], { cwd });
    if (ancestor.status === 0) { console.log("Already up to date."); return; }
    if (ancestor.status !== 1) throw new Error("Could not compare main with FETCH_HEAD.");
    try { stage("Merge", () => git("merge", "--no-edit", "--no-commit", "FETCH_HEAD")); }
    catch (error) {
      if (merging()) console.error("Resolve the conflicts, stage those files, then run npm run pull:merge -- --continue.");
      throw error;
    }
  }
  const head = git("rev-parse", "HEAD"), tree = git("write-tree");
  const changed = git("diff", before, "--name-only").split("\n").filter(Boolean);
  // A fast-forward has no staged diff; compare its committed trees instead.
  if (head !== before) changed.push(...git("diff", before, head, "--name-only").split("\n").filter(Boolean));
  stage("Whitespace and line endings", () => {
    git("diff", before, "--check");
    if (git("diff", before, "--numstat") !== git("diff", before, "--ignore-cr-at-eol", "--numstat")) throw new Error("Line ending gate failed.");
  });
  const npm = (args) => {
    const cli = process.env.npm_execpath ?? resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
    if (!existsSync(cli)) throw new Error("Run through npm run pull:merge so the npm executable is known.");
    command(process.execPath, [cli, ...args], true);
  };
  if (changed.some((path) => !path.endsWith(".md"))) {
    if (changed.includes("package-lock.json")) stage("Dependencies", () => npm(["ci"]));
    stage("Build and typecheck", () => npm(["run", "build"]));
    stage("Tests", () => npm(["test"]));
  } else console.log("Markdown only: check cited files and anchors before finishing a conflict resolution.");
  if (git("rev-parse", "HEAD") !== head || git("write-tree") !== tree || git("status", "--porcelain").split("\n").some((line) => line && (line.startsWith("??") || line[1] !== " "))) {
    throw new Error("Repository changed during checks. Inspect the work before committing.");
  }
  if (merging()) stage("Commit", () => git("commit", "--no-edit"));
  git("merge-base", "--is-ancestor", "FETCH_HEAD", "HEAD");
  console.log(`${git("log", "-1", "--format=%h %s")}\nTotal: ${((performance.now() - started) / 1000).toFixed(1)}s. No push.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--continue")) {
    console.error("Usage: npm run pull:merge [-- --continue]");
    process.exitCode = 1;
  } else {
    try { pullMerge(root, { resume: args[0] === "--continue" }); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
