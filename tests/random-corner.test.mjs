// Random replay's draw: the corner asked for is redrawn, the other is never touched, and the drawn
// corner is left with a mind that can drive it.
import test from "node:test";
import assert from "node:assert/strict";

import { golemMatchup, matchupFromQuery, matchupQuery, withGolemBuild, withPolicy } from "../src/bout.ts";
import { defaultGolemSetup } from "../src/golem/build.ts";
import { randomViableGolemSetup, randomViableOpponent } from "../src/golem/viability.ts";
import { mulberry32 } from "../src/rng.ts";
import { bodyFamily, FAMILY_POLICY } from "../src/golem/family.ts";
import { FAMILY_SETUP } from "../src/golem/family-setup.ts";
import { NAMED_BUILDS } from "../src/golem/roster.ts";
import { POLICIES } from "../src/mind.ts";
import { assessPolicy } from "../src/policy-applicability.ts";
import { fittedPolicy, randomCorner } from "../src/random-corner.ts";

const applicable = (corner) =>
  assessPolicy(POLICIES.find((p) => p.name === corner.policy), true, corner.golem).status === "applicable";

test("random_corner_redraws_only_the_corner_it_is_asked_for", () => {
  const start = golemMatchup(defaultGolemSetup());
  for (const side of ["left", "right"]) {
    const other = side === "left" ? "right" : "left";
    for (const seed of [1, 7, 20260923]) {
      const drawn = randomCorner(start, side, seed);
      assert.deepEqual(drawn[other], start[other], `${side}: the other corner moved on seed ${seed}`);
      assert.equal(drawn[side].seed, seed, "the seed is kept on the corner");
      assert.deepEqual(randomCorner(start, side, seed), drawn, "the same seed draws the same body");
    }
    // Some seed must draw a different body, or the draw is a no-op that passes the lines above.
    assert.ok([1, 7, 20260923].some((seed) =>
      JSON.stringify(randomCorner(start, side, seed)[side].golem) !== JSON.stringify(start[side].golem)),
    `${side}: no seed drew a new body`);
  }
});

test("random_corner_keeps_the_corner_s_family", () => {
  for (const family of ["golem", "human", "skeleton"]) {
    const start = withGolemBuild(golemMatchup(defaultGolemSetup()), "right", FAMILY_SETUP[family](), 0);
    for (const seed of [3, 11, 99]) {
      assert.equal(bodyFamily(randomCorner(start, "right", seed).right.golem), family, `${family} on seed ${seed}`);
    }
  }
});

test("a_drawn_corner_keeps_a_policy_that_drives_it_and_is_given_its_family_s_otherwise", () => {
  // Every roster body, under a policy measured on another family, is handed its own duelist.
  for (const named of NAMED_BUILDS) {
    const family = bodyFamily(named.setup);
    const wrong = family === "skeleton" ? "golem-duelist" : "skeleton-duelist";
    const start = withPolicy(withGolemBuild(golemMatchup(defaultGolemSetup()), "right", named.setup, 0), "right", wrong);
    assert.equal(applicable(start.right), false, `${named.name}: the fixture's policy should not apply`);
    const fitted = fittedPolicy(start, "right");
    assert.equal(fitted.right.policy, FAMILY_POLICY[family], named.name);
    assert.equal(applicable(fitted.right), true, `${named.name}: the family duelist cannot drive it`);
    assert.deepEqual(fitted.left, start.left, "the other corner is untouched");
  }
  // And a policy that already applies is left alone.
  const kept = fittedPolicy(withPolicy(golemMatchup(defaultGolemSetup()), "right", "golem-brawler"), "right");
  assert.equal(kept.right.policy, "golem-brawler");
});

test("an_old_link_naming_a_mode_still_opens_and_carries_no_mode", () => {
  const plain = golemMatchup(defaultGolemSetup());
  for (const mode of ["arena", "waves"]) {
    const link = matchupQuery({ ...plain, mode }).replace(/^\?/, "");
    const read = matchupFromQuery(link);
    assert.ok(read, `a ${mode} link was refused`);
    assert.equal("mode" in read, false, `a ${mode} link kept its mode`);
    assert.deepEqual(read, matchupFromQuery(matchupQuery(plain).replace(/^\?/, "")));
  }
});

test("an_old_link_carrying_wave_wear_opens_a_whole_body", () => {
  const plain = golemMatchup(defaultGolemSetup());
  const worn = { ...plain, left: { ...plain.left, golem: { ...plain.left.golem, wear: { torso: 0.5 } } } };
  const link = matchupQuery(worn).replace(/^\?/, "");
  assert.match(decodeURIComponent(link), /"wear"/, "the control: the link carries the wear");
  const read = matchupFromQuery(link);
  assert.ok(read, "a link carrying wear was refused");
  assert.equal("wear" in read.left.golem, false, "the wear was kept");
  assert.deepEqual(read, matchupFromQuery(matchupQuery(plain).replace(/^\?/, "")));
});

test("a_seed_whose_draw_runs_out_of_tries_is_followed_by_the_next_and_the_corner_keeps_that_one", () => {
  // Find, deterministically, an opponent and a seed on which `randomViableOpponent` throws: about
  // one draw in a thousand does, nearly all of them against a plate-armed primary.
  let found = null;
  for (let s = 1; s <= 400 && !found; s += 1) {
    const other = randomViableGolemSetup(mulberry32(s * 7919));
    for (let k = 0; k < 20 && !found; k += 1) {
      const seed = s * 1000 + k;
      try { randomViableOpponent(mulberry32(seed), other); } catch { found = { other, seed }; }
    }
  }
  assert.ok(found, "the control: some seed runs out of tries");
  const start = withGolemBuild(golemMatchup(defaultGolemSetup()), "left", found.other, 1);
  const drawn = randomCorner(start, "right", found.seed);
  assert.deepEqual(drawn.left, start.left, "the other corner is untouched");
  assert.notEqual(drawn.right.seed, found.seed, "the seed that ran out is not the one kept");
  assert.ok(drawn.right.seed > found.seed && drawn.right.seed < found.seed + 8, "the next seeds are tried in order");
  assert.deepEqual(randomCorner(start, "right", drawn.right.seed), drawn, "the kept seed draws this body again");
});
