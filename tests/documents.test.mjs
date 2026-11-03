/**
 * **The documents hold together** (`scripts/documents.mjs`). On a planted tree the broken citations
 * are exactly the missing file, the missing heading, the missing file behind a `@commit`, the link
 * out of the repository and the missing reference target, and the comment marks exactly the date,
 * the commit hash and the plan and analysis citations in a comment of `src/`; everything else
 * planted, in code, strings, regular expressions, template literals, fenced blocks and code spans,
 * passes. On this repository there are none.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { MARKS, anchorsOf, brokenCitations, commentMarks, repositoryDocuments } from "../scripts/documents.mjs";

/** The documents folder, spelled so this file's own text cites nothing. */
const D = "docs/";

test("anchors_are_github_slugs_a_repeated_heading_numbered", () => {
  const markdown = [
    "# The `run` cycle: v2.0",
    "## Héros & foes — set",
    "## Twice", "## Twice",
    "```", "## Not a heading", "```",
    '<a id="kept-here"></a>',
    "### [Linked](x.md) heading ##",
  ].join("\n");
  assert.deepEqual([...anchorsOf(markdown)], ["the-run-cycle-v20", "héros--foes--set", "twice", "twice-1", "kept-here", "linked-heading"]);
});

test("broken_citations_are_the_missing_file_heading_and_target_and_nothing_present", () => {
  const tree = {
    [`${D}a.md`]: ["# A", "## Here", "## Here", "", `[same](#here-1) [gone](#nowhere) [up](../${D}a.md)`,
      "[b](b.md#there) [code](../src/m.ts#L3) [folder](../src/) [web](https://example.com/x.md) [mail](mailto:a@b.c)",
      "[missing](c.md) [out](../../x.md) `[spanned](c.md)`", "```", "[fenced](c.md)", "```", "[ref]: c.md"].join("\n"),
    [`${D}b.md`]: "# B\n\n## There\n",
    "src/m.ts": [
      `// ${D}a.md#here ${D}a.md#here-1 ${D}b.md`,
      `const cited = "${D}b.md#there", gone = "${D}b.md#elsewhere";`,
      `/* ${D}c.md and ${D}c.md@47ad569f#x and ${D}b.md@47ad569f#there */`,
    ].join("\n"),
    "assets/x.mjs": `// ${D}c.md, outside the citing folders`,
  };
  const read = (file) => tree[file];
  assert.deepEqual(brokenCitations(Object.keys(tree), read), [
    `${D}a.md:5 links #nowhere, which has no heading #nowhere`,
    `${D}a.md:7 links c.md, which does not exist`,
    `${D}a.md:7 links ../../x.md, which is outside the repository`,
    `${D}a.md:11 links c.md, which does not exist`,
    `src/m.ts:2 cites ${D}b.md#elsewhere, which has no heading #elsewhere`,
    `src/m.ts:3 cites ${D}c.md, which does not exist`,
    `src/m.ts:3 cites ${D}c.md@47ad569f#x, which does not exist`,
  ]);
});

test("comment_marks_are_the_dates_hashes_and_plan_citations_in_comments_of_src_only", () => {
  const plans = `${D}plans/`, analysis = `${D}analysis/`;
  const tree = {
    "src/marked.ts": [
      "// read on 2026-10-24 at 2a1b29ac",
      `/** as ${plans}x.md says,`,
      ` * and ${analysis}y.md; at \`680f281f\` */`,
      "const x = 1; // trailing f327dd9e40",
      "if (x) /* a1b2c3d */ x = 2;",
    ].join("\n"),
    "src/clean.ts": [
      "// a decade of facades, deadbeef, 0x5f3759df, 1.57079632679e+00, 2026-13-40, the owner",
      'const when = "2026-10-24", colour = "#a1b2c3ff", hash = "2a1b29ac";',
      "const slashes = /\\/\\/ 2026-10-24 [/]/g, ratio = a / b / 2026;",
      "const text = `${ { a: \"// 2026-10-24\" }.a } and ${`${\"/* 2a1b29ac */\"}`}`; // fine",
    ].join("\n"),
    "scripts/s.mjs": "// 2026-10-24 2a1b29ac",
  };
  const read = (file) => tree[file];
  const files = Object.keys(tree);
  assert.deepEqual(commentMarks(files, read), [
    "src/marked.ts:1 holds a date in a comment: 2026-10-24",
    "src/marked.ts:1 holds a commit hash in a comment: 2a1b29ac",
    `src/marked.ts:2 holds a citation of a plan or an analysis in a comment: ${plans}`,
    "src/marked.ts:3 holds a commit hash in a comment: 680f281f",
    `src/marked.ts:3 holds a citation of a plan or an analysis in a comment: ${analysis}`,
    "src/marked.ts:4 holds a commit hash in a comment: f327dd9e40",
    "src/marked.ts:5 holds a commit hash in a comment: a1b2c3d",
  ]);
  const owner = { name: "the owner", pattern: /\bthe owner\b/g };
  assert.deepEqual(commentMarks(files, read, [...MARKS, owner]).filter((found) => found.includes("the owner")),
    ["src/clean.ts:1 holds the owner in a comment: the owner"], "a mark is one more entry");
});

test("every_document_cited_resolves_and_no_comment_in_src_holds_a_mark", () => {
  const { citations, marks } = repositoryDocuments();
  assert.deepEqual(citations, [], `${citations.length} broken citations:\n${citations.join("\n")}`);
  assert.deepEqual(marks, [], `${marks.length} comment marks:\n${marks.join("\n")}`);
});
