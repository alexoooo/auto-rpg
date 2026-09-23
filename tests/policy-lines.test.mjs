import test from "node:test";
import assert from "node:assert/strict";
import { POLICIES } from "../src/mind.ts";
import { policyLine } from "../src/policy-lines.ts";
import variants from "../src/golem/researched-variants.json" with { type: "json" };
import labEntries from "../src/golem/researched-lab.json" with { type: "json" };

const lineShape = (name, line) => {
  assert.equal(typeof line, "string", `${name} has a line`);
  assert.ok(line.length <= 90, `${name}'s line fits one row: ${line.length} characters`);
  assert.match(line, /^[A-Z][^.]*\.$/, `${name}'s line is one sentence ending in a full stop`);
  assert.doesNotMatch(line, /—/, `${name}'s line has no em dash`);
};

test("every_registered_policy_has_one_short_line", () => {
  for (const { name } of POLICIES) lineShape(name, policyLine(name));
});

test("the_next_admitted_policy_has_a_line_without_anybody_writing_one", () => {
  // The next promotion and the next lab admission, as their scripts would append them: a real
  // record each, renamed, so the table has no row for either.
  const variant = { ...variants.at(-1), name: "golem-researched-skirmisher-9-9", parent: "golem-skirmisher" };
  const lab = { ...labEntries.at(-1), name: "golem-researched-next-v1" };
  const researched = [...variants, ...labEntries, variant, lab];
  assert.equal(policyLine(variant.name), null, "the fixture's names are not already known");
  lineShape(variant.name, policyLine(variant.name, researched));
  assert.match(policyLine(variant.name, researched), /Golem skirmisher/, "a variant names its parent");
  lineShape(lab.name, policyLine(lab.name, researched));
  // A row in the table still wins over the derived line.
  assert.doesNotMatch(policyLine(variants[0].name, researched), /search-tuned/);
});

test("a_name_the_table_does_not_hold_has_no_line", () => {
  assert.equal(policyLine("no-such-policy"), null);
  assert.equal(policyLine("constructor"), null, "an inherited key is not a line");
});
