import test from "node:test";
import assert from "node:assert/strict";
import { assessPolicy, assessRequirement, policyBodyForSetup, policyBodyForView, policyPickerRows } from "../src/policy-applicability.ts";
import { POLICIES } from "../src/mind.ts";
import { HUMAN_BUILDS, humanSetup } from "../src/golem/humanoid/presets.ts";
import { moduleFamily } from "../src/golem/family.ts";
import { FAMILY_SETUP } from "../src/golem/family-setup.ts";
import { GOLEM_EFFECTORS, defaultGolemSetup } from "../src/golem/build.ts";
import { NAMED_BUILDS, namedBuild } from "../src/golem/roster.ts";
import { skeletonSetup } from "../src/golem/skeleton/presets.ts";
import { createBout, freshHavok } from "./harness/bout-runner.mjs";

const archer = POLICIES.find((p) => p.name === "humanoid-archer");
const human = (name) => HUMAN_BUILDS.find((b) => b.name === name).setup;

test("a requirement reads the body's actual controls", () => {
  assert.equal(archer.requirement, "bow", "the fixture is the one policy that declares a requirement");
  assert.equal(assessPolicy(archer, true, human("rogue")).status, "applicable");
  for (const name of ["warrior", "warrior-sword", "warrior-unarmed", "rogue-sword"]) {
    const assessment = assessPolicy(archer, true, human(name));
    assert.equal(assessment.status, "incompatible", name);
    assert.match(assessment.reason, /bow/, name);
  }
  assert.equal(assessPolicy(archer, false, human("rogue")).status, "incompatible");
  assert.equal(assessPolicy(undefined, true, defaultGolemSetup()).status, "incompatible");
  assert.equal(assessPolicy(archer, true, { ...human("rogue"), primary: { chain: "bad", terminal: "bow" } }).status, "incompatible");
});

test("every registered effector's setup declaration agrees with a real assembled body", async () => {
  for (const option of GOLEM_EFFECTORS) {
    const pick = { chain: option.chain, terminal: option.terminal ?? "none" };
    // A human's hands are not one shelf: the shield goes on the left and the sword on the right.
    const build = moduleFamily(option.chain) === "human"
      ? humanSetup(pick.terminal === "plate" ? "fist" : pick.terminal, pick.terminal === "blade" ? "fist" : pick.terminal)
      : { ...FAMILY_SETUP[moduleFamily(option.chain)](), primary: pick, secondary: pick };
    const bout = createBout({ left: "idle", right: "idle", seeds: [7, 8], maxSeconds: 1,
      leftGolem: build, rightGolem: defaultGolemSetup(), locomotionMode: "supported", physics: await freshHavok() });
    try {
      bout.step();
      assert.deepEqual(policyBodyForSetup(build), policyBodyForView(bout.left.view.self), option.id);
      for (const policy of [archer]) {
        assert.deepEqual(assessRequirement(policy.requirement, policyBodyForSetup(build)),
          assessRequirement(policy.requirement, policyBodyForView(bout.left.view.self)));
      }
    } finally { bout.dispose(); }
  }
});

test("policies are offered only on the body family they were built and measured on", () => {
  const idle = POLICIES.find((p) => p.name === "idle");
  const human = POLICIES.find((p) => p.name === "humanoid-duelist");
  const skeleton = POLICIES.find((p) => p.name === "skeleton-duelist");
  const golemPolicies = POLICIES.filter((p) => p.surface !== null && (p.bodyFamily ?? "golem") === "golem");
  // The control: each is offered on some golem body, so a refusal below is the family gate and
  // not a policy that could not be picked anywhere.
  for (const policy of golemPolicies) {
    assert.ok(NAMED_BUILDS.some((b) => assessPolicy(policy, true, b.setup).status === "applicable"), policy.name);
  }
  for (const build of HUMAN_BUILDS) {
    for (const policy of golemPolicies) {
      const assessment = assessPolicy(policy, true, build.setup);
      assert.equal(assessment.status, "incompatible", `${policy.name} on ${build.name}`);
      assert.match(assessment.reason, /golem bodies/);
    }
    assert.equal(assessPolicy(human, true, build.setup).status, "applicable", build.name);
    assert.equal(assessPolicy(idle, true, build.setup).status, "applicable", build.name);
  }
  for (const build of NAMED_BUILDS) {
    assert.equal(assessPolicy(human, true, build.setup).status, "incompatible", build.name);
    assert.equal(assessPolicy(skeleton, true, build.setup).status, "incompatible", build.name);
    assert.equal(assessPolicy(idle, true, build.setup).status, "applicable", build.name);
  }
  // The skeleton's own mind drives a skeleton and nothing else, and no stone or human mind is
  // offered on one: the golem duelist's code runs there, but nothing measured it there.
  for (const setup of [skeletonSetup(), skeletonSetup("maul"), skeletonSetup("fist", "fist")]) {
    const name = `skeleton ${setup.primary.terminal}`;
    assert.equal(assessPolicy(skeleton, true, setup).status, "applicable", name);
    assert.equal(assessPolicy(idle, true, setup).status, "applicable", name);
    assert.equal(assessPolicy(human, true, setup).status, "incompatible", name);
    for (const policy of golemPolicies) {
      const assessment = assessPolicy(policy, true, setup);
      assert.equal(assessment.status, "incompatible", `${policy.name} on ${name}`);
      assert.match(assessment.reason, /not evaluated on skeleton bodies/);
    }
  }
  for (const build of HUMAN_BUILDS) {
    assert.equal(assessPolicy(skeleton, true, build.setup).status, "incompatible", build.name);
  }
});

test("picker preserves stale selections while hiding other unavailable policies", () => {
  const rows = POLICIES.map((p) => ({ ...p, assessment: assessPolicy(p, true, human("warrior")) }));
  const selected = archer.name;
  const visible = policyPickerRows(rows, selected, false);
  assert.ok(visible.some((r) => r.name === selected && r.assessment.status === "incompatible"));
  assert.ok(visible.some((r) => r.name === "humanoid-duelist"), "the control: an applicable row is shown");
  assert.ok(!visible.some((r) => r.name === "golem-duelist"));
  assert.deepEqual(policyPickerRows(rows, selected, true), rows);
});

test("limb loss changes applicability without mutating the selected policy", () => {
  const body = policyBodyForSetup(human("rogue"));
  assert.equal(assessRequirement(archer.requirement, body).status, "applicable");
  body.secondary.lost = true;
  assert.equal(assessRequirement(archer.requirement, body).status, "incompatible");
  body.secondary.lost = false;
  body.primary.lost = true;
  assert.equal(assessRequirement(archer.requirement, body).status, "incompatible");
  assert.equal(archer.requirement, "bow");
});
