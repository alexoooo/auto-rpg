/**
 * **The working copy holds only what it should** (`strays`, `scripts/workspace.mjs`): its tracked
 * files, work in progress inside tracked folders, what the repository's `.gitignore` keeps, and
 * `.tmp/`. On a scratch repository holding one of each kind of path, the strays are exactly the
 * untracked file and folder at the root, what a folder of toolchains holds beside its kept
 * toolchain, the folder hidden through `.git/info/exclude`, the crash dump, and in `research/runs/`
 * a loose file, a folder with no README and an entry its folder's README does not name, and the
 * file added to Git past the rule that ignores it; on this working copy there are none.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { strays } from "../scripts/workspace.mjs";

test("strays_are_the_untracked_outside_tracked_folders_the_hidden_and_the_garbage_and_nothing_kept", () => {
  const root = mkdtempSync(join(tmpdir(), "auto-rpg-workspace-"));
  try {
    const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
    const put = (path, text = "x\n") => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
    git("init", "-q");
    put(".gitignore", "node_modules/\n.tmp/\n/research/runs/\n.tools/kit/\n__pycache__/\n*.stackdump\n");
    put("src/a.ts");
    put("research/b.mjs");
    git("add", ".");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "fixture");
    for (const kept of ["src/wip.ts", "src/new/c.ts", "node_modules/x/index.js", ".tmp/probe/run.log", ".tmp/worktrees/w/a.ts",
      "research/runs/seed/actor.pt", ".claude/worktrees/z/a.ts", ".tools/kit/bin/kit.exe", "research/gone/__pycache__/m.pyc"]) put(kept);
    for (const stray of ["notes.txt", "scratch/a.json", ".snap/copy/a.ts", "research/bash.exe.stackdump", ".tools/probe.mjs", ".tools/old/a.log",
      "research/old/__pycache__/m.pyc", "research/old/bash.exe.stackdump", "research/runs/rows.jsonl", "research/runs/seed/trace.log",
      "research/runs/bare/a.json"]) put(stray);
    put("research/runs/seed/README.md", "- `actor.pt`: the actor the next run starts from\n");
    appendFileSync(join(root, ".git/info/exclude"), "\n/.snap/\n**/.claude/worktrees/\n");
    put(".tools/kit/forced.cfg");
    git("add", "-f", ".tools/kit/forced.cfg");
    assert.deepEqual(strays(root).map(({ path }) => path),
      [".snap/", ".tools/kit/forced.cfg", ".tools/old/", ".tools/probe.mjs", "notes.txt", "research/bash.exe.stackdump", "research/old/bash.exe.stackdump",
        "research/runs/bare/", "research/runs/rows.jsonl", "research/runs/seed/trace.log", "scratch/"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the_working_copy_holds_no_strays", () => {
  const found = strays();
  assert.deepEqual(found, [], `${found.length} strays (npm run clean deletes crash dumps and stale .tmp/ work, and lists the rest):\n`
    + found.map(({ path, why }) => `  ${path} (${why})`).join("\n"));
});
