import test from "node:test";
import assert from "node:assert/strict";
import { POLICIES } from "../src/mind.ts";
import { policyLine } from "../src/policy-lines.ts";

const lineShape = (name, line) => {
  assert.equal(typeof line, "string", `${name} has a line`);
  assert.ok(line.length <= 90, `${name}'s line fits one row: ${line.length} characters`);
  assert.match(line, /^[A-Z][^.]*\.$/, `${name}'s line is one sentence ending in a full stop`);
  assert.doesNotMatch(line, /—/, `${name}'s line has no em dash`);
};

test("every_registered_policy_has_one_short_line", () => {
  for (const { name } of POLICIES) lineShape(name, policyLine(name));
});

test("a_name_the_table_does_not_hold_has_no_line", () => {
  assert.equal(policyLine("no-such-policy"), null);
  assert.equal(policyLine("constructor"), null, "an inherited key is not a line");
});
