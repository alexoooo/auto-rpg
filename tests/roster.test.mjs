// The roster: every build a person can pick is one the registry accepts, the other families are
// not in the research pool, and a family whose hands hold chosen weapons is armed from what
// its own chains offer -- which is what the dungeon's hero picker hands `ARMED_SETUP`.
import test from "node:test";
import assert from "node:assert/strict";

import { golemSetupRefusal, golemTerminalOptions } from "../src/golem/build.ts";
import { bodyFamily } from "../src/golem/family.ts";
import { ARMED_SETUP, FAMILY_SETUP } from "../src/golem/family-setup.ts";
import { HUMAN_BUILDS } from "../src/golem/humanoid/presets.ts";
import { NAMED_BUILDS, PLAYABLE_BUILDS } from "../src/golem/roster.ts";
import { SKELETON_BUILDS } from "../src/golem/skeleton/presets.ts";

test("every_playable_build_is_accepted_at_load", () => {
  const names = PLAYABLE_BUILDS.map((build) => build.name);
  assert.equal(new Set(names).size, names.length, `a name is used twice: ${names.join(", ")}`);
  for (const build of PLAYABLE_BUILDS) assert.equal(golemSetupRefusal(build.setup), null, build.name);
  for (const build of [...HUMAN_BUILDS, ...SKELETON_BUILDS]) {
    assert.ok(names.includes(build.name), `${build.name} cannot be picked`);
    assert.ok(!NAMED_BUILDS.some((enemy) => enemy.name === build.name), `${build.name} is in the research pool`);
  }
  assert.ok(SKELETON_BUILDS.every((build) => bodyFamily(build.setup) === "skeleton"));
});

test("an_armed_family_is_armed_from_what_its_own_chains_offer", () => {
  assert.deepEqual(Object.keys(ARMED_SETUP).sort(), ["human", "skeleton"],
    "a stone golem's weapons are its build, so it has no arming");
  for (const [family, arm] of Object.entries(ARMED_SETUP)) {
    const body = FAMILY_SETUP[family]();
    for (const { id } of golemTerminalOptions(body.primary.chain)) {
      const setup = arm(id, "plate");
      assert.equal(bodyFamily(setup), family, `${family} armed with ${id}`);
      assert.equal(golemSetupRefusal(setup), null, `${family} armed with ${id}`);
      assert.equal(setup.primary.terminal, id, `${family} armed with ${id}`);
      if (id === "maul") assert.equal(setup.secondary.terminal, "maul", "a maul takes both hands");
    }
  }
});
