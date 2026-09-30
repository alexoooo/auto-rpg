/**
 * Comments describe the code as it is. A comment that names a work session, a plan stage, a
 * history entry, a commit or code that no longer exists is a journal entry; the story of a change
 * belongs in its commit message. Only comments are read: strings (a provenance record such as
 * `path@sha`, a binding key) are data, and data may name anything.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(import.meta.dirname, "..");

/** What a comment may not say, each with the reason a reader gets when it does. */
const JOURNAL = [
  [/\bH\d{2}\b/, "cites a history entry"],
  [/\bsessions? \d/i, "names a work session"],
  [/\bstage \d/i, "names a plan stage"],
  [/\bHavok\b/i, "names an engine the game no longer has"],
  [/\bgolems?\b/i, "names the deleted golem"],
  [/\bold path\b/i, "names the deleted old path"],
  [/\buntil \d{4}-\d\d-\d\d/, "dates a change"],
  [/\b(commit|in git at) [0-9a-f]{7,}/i, "cites a commit"],
  [/docs\/(plans|analysis)\/|docs\/history\.md/, "cites a plan or the project's history"],
];

/** Every comment in `text`, a JavaScript or TypeScript source, with its line. */
export function commentsOf(text, fileName = "file.ts") {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const seen = new Set();
  const out = [];
  const take = (ranges) => {
    for (const range of ranges ?? []) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      const { line } = source.getLineAndCharacterOfPosition(range.pos);
      out.push({ line: line + 1, text: text.slice(range.pos, range.end) });
    }
  };
  const visit = (node) => {
    const children = node.getChildren(source);
    if (children.length === 0) {
      take(ts.getLeadingCommentRanges(text, node.pos));
      take(ts.getTrailingCommentRanges(text, node.end));
    }
    for (const child of children) visit(child);
  };
  visit(source);
  return out;
}

/** The journal entries among `text`'s comments. */
function journalIn(text, fileName) {
  const found = [];
  for (const comment of commentsOf(text, fileName)) {
    for (const [pattern, reason] of JOURNAL) {
      const match = comment.text.match(pattern);
      if (match) found.push(`${fileName}:${comment.line} ${reason}: "${match[0]}"`);
    }
  }
  return found;
}

function sourcesUnder(directory, extension, skip = []) {
  const out = [];
  const walk = (relative) => {
    for (const entry of fs.readdirSync(path.join(ROOT, relative), { withFileTypes: true })) {
      const child = `${relative}${entry.name}`;
      if (skip.some((prefix) => child.startsWith(prefix))) continue;
      if (entry.isDirectory()) walk(`${child}/`);
      else if (child.endsWith(extension)) out.push(child);
    }
  };
  walk(directory);
  return out;
}

const SOURCES = [
  ...sourcesUnder("src/", ".ts"),
  ...sourcesUnder("tests/", ".mjs"),
  ...sourcesUnder("research/", ".mjs", ["research/physics-bakeoff/results/"]),
  ...sourcesUnder("scripts/", ".mjs"),
];

test("the_guard_reads_comments_and_only_comments", () => {
  const sample = [
    "// H41 has the script.",
    "const record = \"docs/history.md@0d63a616#h41 // session 5\";",
    "const note = `the golem ${record} /* stage 2 */`;",
    "/** Tuned in session 07 against Havok. */",
    "function f() {",
    "  return 1; // until 2026-09-05 a copy",
    "  // in git at 77a0cd77",
    "}",
    "/* commit 0d63a616 removed the old path's golems */",
    "// As docs/plans/2026-09-28-core-foundation.md says.",
  ].join("\n");
  const found = journalIn(sample, "sample.ts").map((line) => line.replace(/^sample\.ts:/, ""));
  assert.deepEqual(found, [
    "1 cites a history entry: \"H41\"",
    "4 names a work session: \"session 0\"",
    "4 names an engine the game no longer has: \"Havok\"",
    "6 dates a change: \"until 2026-09-05\"",
    "7 cites a commit: \"in git at 77a0cd77\"",
    "9 names the deleted golem: \"golems\"",
    "9 names the deleted old path: \"old path\"",
    "9 cites a commit: \"commit 0d63a616\"",
    "10 cites a plan or the project's history: \"docs/plans/\"",
  ]);
});

test("the_guard_reads_every_source", () => {
  for (const expected of ["src/core/world.ts", "tests/comments.test.mjs", "research/core-strike-search.mjs"]) {
    assert.ok(SOURCES.includes(expected), `${expected} is read`);
  }
  assert.ok(!SOURCES.some((file) => file.includes("/results/")), "the bake-off's results are records, not code");
});

test("no_comment_is_a_journal_entry", () => {
  const found = SOURCES.flatMap((file) => journalIn(fs.readFileSync(path.join(ROOT, file), "utf8"), file));
  assert.deepEqual(found, []);
});
