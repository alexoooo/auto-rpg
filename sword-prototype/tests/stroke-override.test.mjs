import assert from "node:assert/strict";
import test from "node:test";

import { GOLEM_TACTICS, STROKE_SHAPES } from "../src/golem/tactics.ts";
import { GOLEM_TACTICS_V2, fencerStroke, golemFencer } from "../src/golem/tactics-v2.ts";

test("no_override_hands_back_the_module_global_itself_and_not_a_copy", () => {
  // `assert.equal` and not `deepEqual`, on purpose. A copy would pass a deep comparison and would
  // still have silently turned off `?tactic=` and `scripts/stroke-sweep.mjs`, both of which work
  // by writing `GOLEM_TACTICS` and relying on `STROKE_SHAPES.sword`'s getters to carry it.
  assert.equal(fencerStroke("sword", null), STROKE_SHAPES.sword);
  assert.equal(fencerStroke("club", null), STROKE_SHAPES.club);
});

test("the_live_read_still_reaches_a_default_fencer_after_the_change", () => {
  // The property the whole null path exists to preserve, driven through a built mind rather than
  // through the helper, because the mind is what memoises and a memo is how this would break.
  const fencer = golemFencer(20260917);
  const before = GOLEM_TACTICS.cutRoll;
  try {
    GOLEM_TACTICS.cutRoll = before + 0.37;
    assert.equal(fencer.strokeFor("sword").roll, before + 0.37);
    assert.equal(fencer.strokeFor("sword").windRoll, before + 0.37);
  } finally {
    GOLEM_TACTICS.cutRoll = before;
  }
  assert.equal(fencer.strokeFor("sword").roll, before, "the probe did not put the table back");
});

test("an_override_lays_over_the_shipped_shape_and_leaves_the_rest_of_it_alone", () => {
  const over = fencerStroke("sword", { chamberReach: 0.15 });
  assert.equal(over.chamberReach, 0.15);
  // Everything not named comes from the shipped shape, read at the moment of the merge.
  assert.equal(over.strokeSeconds, STROKE_SHAPES.sword.strokeSeconds);
  assert.equal(over.chamberSwing, STROKE_SHAPES.sword.chamberSwing);
  assert.equal(over.roll, STROKE_SHAPES.sword.roll);
  assert.ok(Object.isFrozen(over), "an override a stroke could change mid-arc is not survivable");
  // And the global is untouched, which is the difference between an override and a write.
  assert.equal(STROKE_SHAPES.sword.chamberReach, GOLEM_TACTICS.chamberReach);
  assert.notEqual(GOLEM_TACTICS.chamberReach, 0.15);
});

test("an_override_moves_one_fencer_and_not_the_other", () => {
  // The contract CG exists for. Without this the paired bench's central claim -- that the margin
  // it measured came from one side's stroke -- could only be made by watching damage and hoping.
  const shipped = golemFencer(20260917);
  const changed = golemFencer(20260917, { ...GOLEM_TACTICS_V2, strokeOver: { chamberReach: 0.15 } });

  assert.equal(shipped.strokeFor("sword"), STROKE_SHAPES.sword);
  assert.equal(shipped.strokeFor("sword").chamberReach, GOLEM_TACTICS.chamberReach);
  assert.equal(changed.strokeFor("sword").chamberReach, 0.15);
  assert.notEqual(changed.strokeFor("sword"), STROKE_SHAPES.sword);

  // Memoised per kind, so the same mind hands back the same object rather than a fresh merge.
  assert.equal(changed.strokeFor("sword"), changed.strokeFor("sword"));
  // And the override is per weapon kind, not a single shape smeared across all of them.
  assert.equal(changed.strokeFor("club").chamberReach, 0.15);
  assert.equal(changed.strokeFor("club").chamberLift, STROKE_SHAPES.club.chamberLift);
});

test("nothing_that_ships_sets_an_override", () => {
  // A default fencer has to be the fencer that shipped, and the cheapest way to keep that true is
  // that the field is null on the shipped table and no other table in the tree sets it.
  assert.equal(GOLEM_TACTICS_V2.strokeOver, null);
  assert.equal(golemFencer(1).strokeFor("sword"), STROKE_SHAPES.sword);
});
