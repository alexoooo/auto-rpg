/** The merge command preserves local work, stops on conflicts and failed checks, and resumes a resolved merge. */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { pullMerge } from "../scripts/pull-merge.mjs";

test("pull_merge_checks_before_committing_and_preserves_work_on_refusal", () => {
  const parent = resolve(".tmp");
  mkdirSync(parent, { recursive: true });
  const fixture = mkdtempSync(join(parent, "pull-merge-test-"));
  const cwd = join(fixture, "work"), remote = join(fixture, "origin.git");
  mkdirSync(cwd);
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const write = (path, text) => writeFileSync(join(cwd, path), text);
  const commit = (message) => { git("add", "."); git("commit", "-m", message); };
  try {
    git("init", "--bare", remote);
    git("init", "-b", "main");
    git("config", "user.name", "Merge test"); git("config", "user.email", "merge@example.invalid");
    git("config", "commit.gpgsign", "false"); git("config", "core.autocrlf", "false");
    write("room.md", "base\n");
    write("package.json", JSON.stringify({ scripts: { build: "node -e \"process.exit(23)\"", test: "node -e \"process.exit(24)\"" } }));
    commit("base"); git("remote", "add", "origin", remote); git("push", "origin", "main");
    const base = git("rev-parse", "HEAD");
    pullMerge(cwd);
    assert.equal(git("rev-parse", "HEAD"), base);
    write("room.md", "local work\n");
    assert.throws(() => pullMerge(cwd), /local work/);
    assert.equal(readFileSync(join(cwd, "room.md"), "utf8"), "local work\n");
    git("restore", "room.md");
    git("checkout", "-b", "incoming"); write("room.md", "incoming\n"); commit("incoming"); git("push", "origin", "HEAD:main");
    git("checkout", "main"); write("room.md", "ours\n"); commit("ours");
    assert.throws(() => pullMerge(cwd), /failed/);
    assert.ok(git("diff", "--name-only", "--diff-filter=U").includes("room.md"));
    assert.throws(() => pullMerge(cwd, { resume: true }), /remaining conflicts/);
    write("room.md", "ours and incoming\n"); git("add", "room.md");
    pullMerge(cwd, { resume: true });
    assert.equal(git("show", "-s", "--format=%P", "HEAD").split(" ").length, 2);
    assert.equal(git("status", "--porcelain"), "");
    git("checkout", "incoming"); write("code.js", "export const ready = true;\n"); commit("code"); git("push", "origin", "HEAD:main");
    git("checkout", "main");
    const before = git("rev-parse", "HEAD");
    assert.throws(() => pullMerge(cwd), /failed/);
    assert.equal(git("rev-parse", "HEAD"), before, "a failed build must leave the merge uncommitted");
    assert.notEqual(git("diff", "--cached", "--name-only"), "", "the pending merge stays available to fix");
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
