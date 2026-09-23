import test from "node:test";
import assert from "node:assert/strict";
import { assessPolicy, assessRequirement, policyBodyForSetup, policyBodyForView, policyPickerRows } from "../src/policy-applicability.ts";
import { POLICIES } from "../src/mind.ts";
import { HUMAN_BUILDS } from "../src/golem/humanoid/presets.ts";
import { moduleFamily } from "../src/golem/family.ts";
import { FAMILY_SETUP } from "../src/golem/family-setup.ts";
import { GOLEM_EFFECTORS, defaultGolemSetup } from "../src/golem/build.ts";
import { NAMED_BUILDS, namedBuild } from "../src/golem/roster.ts";
import { skeletonSetup } from "../src/golem/skeleton/presets.ts";
import { createBout, freshHavok } from "./harness/bout-runner.mjs";
import { startRun, waveEnemy } from "../src/waves.ts";

const needle = POLICIES.find((p) => p.name === "golem-researched-needle-v1");
const paired = POLICIES.find((p) => p.name === "golem-researched-paired-v1");

test("specialists require actual controls, while evidence scope does not restrict compatibility", () => {
  for (const [name, expected] of [["default", "applicable"], ["two-blades", "applicable"],
    ["pitch-blade", "fallback-only"], ["maul", "fallback-only"], ["ram-capped", "fallback-only"],
    ["fists", "fallback-only"], ["whip", "fallback-only"]]) {
    assert.equal(assessPolicy(needle, true, namedBuild(name).setup).status, expected, name);
  }
  for (const name of ["two-blades", "fists", "pitch-blade", "default"]) {
    // A shield arm still accepts thrust commands; compatibility is not a strength claim.
    assert.equal(assessPolicy(paired, true, namedBuild(name).setup).status, "applicable", name);
  }
  for (const name of ["maul", "ram-capped"]) {
    assert.equal(assessPolicy(paired, true, namedBuild(name).setup).status, "fallback-only", name);
  }
  assert.equal(assessPolicy(needle, false, defaultGolemSetup()).status, "incompatible");
  assert.equal(assessPolicy(undefined, true, defaultGolemSetup()).status, "incompatible");
  assert.equal(assessPolicy(needle, true, { ...defaultGolemSetup(), primary: { chain: "bad", terminal: "blade" } }).status, "incompatible");
});

test("every registered effector's setup declaration agrees with a real assembled body", async () => {
  for (const option of GOLEM_EFFECTORS) {
    const pick = { chain: option.chain, terminal: option.terminal ?? "none" };
    const build = { ...FAMILY_SETUP[moduleFamily(option.chain)](), primary: pick, secondary: pick };
    const bout = createBout({ left: "idle", right: "idle", seeds: [7, 8], maxSeconds: 1,
      leftGolem: build, rightGolem: defaultGolemSetup(), locomotionMode: "supported", physics: await freshHavok() });
    try {
      bout.step();
      assert.deepEqual(policyBodyForSetup(build), policyBodyForView(bout.left.view.self), option.id);
      for (const policy of [needle, paired]) {
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
  const rows = POLICIES.map((p) => ({ ...p, assessment: assessPolicy(p, true, namedBuild("maul").setup) }));
  const selected = needle.name;
  const visible = policyPickerRows(rows, selected, false);
  assert.ok(visible.some((r) => r.name === selected && r.assessment.status === "fallback-only"));
  assert.ok(!visible.some((r) => r.name === paired.name));
  assert.deepEqual(policyPickerRows(rows, selected, true), rows);
  assert.equal(assessPolicy(needle, true, namedBuild("two-blades").setup).status, "applicable");
});

test("limb loss changes applicability without mutating the selected policy", () => {
  const body = policyBodyForSetup(namedBuild("two-blades").setup);
  body.secondary.lost = true;
  assert.equal(assessRequirement(paired.requirement, body).status, "fallback-only");
  assert.equal(assessRequirement(needle.requirement, body).status, "applicable");
  body.primary.lost = true;
  assert.equal(assessRequirement(needle.requirement, body).status, "fallback-only");
});

test("automatically selected wave policies are applicable to their bodies", () => {
  const run = startRun(73);
  for (let wave = 1; wave <= 144; wave++) {
    const enemy = waveEnemy({ ...run, wave });
    assert.equal(assessPolicy(POLICIES.find((p) => p.name === enemy.policy), true, enemy.build.setup).status, "applicable");
  }
});
