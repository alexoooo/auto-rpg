/**
 * **Reflexes under an option** (`src/core/mind/options/reflex.ts`) on built situations: cover
 * takes the hand on the side a blow closes on the head from and hands it back once none does; it
 * leaves that hand where a blow holds it or the option asks for it; it holds its hands at most its longest, then
 * lets go until its trigger has gone; and a reflex that seizes ends the blow holding its hand and
 * drops the option's requests on it. No physics.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cover, reflexLayer } from "../src/core/mind/options/reflex.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";

/** A blow closing on the head of a body at the origin facing +z, from its right, and from its left. */
const THREAT = { threat: [.2, 1.6, .5], guarded: [0, 1.6, 0] }, LEFT = { threat: [-.2, 1.6, .5], guarded: [0, 1.6, 0] };
/** A situation at `time` s, the body facing +z, with `threat` closing and `actions` live. */
const situation = (time, threat = THREAT, actions = []) => ({ time, threat, sight: { report: { heading: 0, actions } } });
/** A live blow of the right hand. */
const PUNCH = { id: 7, action: "punch", effector: "hand.right", holds: ["hand.right", "trunk", "legs"] };
const option = (actions = []) => ({ move: null, face: 0, guard: NO_COVER, actions });

test("cover_takes_the_hand_on_the_side_a_blow_closes_from_and_hands_it_back", () => {
  const layer = reflexLayer([cover(1)]);
  assert.deepEqual(layer.apply(situation(0), option()).guard, { left: null, right: THREAT });
  assert.deepEqual(layer.state.reflexes[0].hands, ["right"]);
  assert.deepEqual(layer.apply(situation(0, LEFT), option()).guard, { left: LEFT, right: null });
  const calm = option();
  assert.equal(layer.apply(situation(.1, null), calm), calm, "no threat: the option's intent as it was");
  assert.deepEqual(layer.state.reflexes[0].hands, []);
});

test("cover_leaves_its_hand_where_a_blow_holds_it_or_the_option_asks_for_it", () => {
  const layer = reflexLayer([cover(1)]);
  assert.deepEqual(layer.apply(situation(0, THREAT, [PUNCH]), option([PUNCH])).guard, NO_COVER);
  const asked = { id: 8, action: "punch", effector: "hand.left", target: {} };
  const out = layer.apply(situation(0, LEFT, [PUNCH]), option([PUNCH, asked]));
  assert.deepEqual([out.guard, out.actions], [NO_COVER, [PUNCH, asked]]);
});

test("cover_holds_at_most_its_longest_then_lets_go_until_its_trigger_has_gone", () => {
  const layer = reflexLayer([cover(.5)]), up = (time, threat = THREAT) => layer.apply(situation(time, threat), option()).guard;
  assert.deepEqual(up(0), { left: null, right: THREAT });
  assert.deepEqual(up(.4), { left: null, right: THREAT });
  assert.deepEqual(up(.5), NO_COVER, "its longest held");
  assert.deepEqual(up(.9), NO_COVER, "and not again while the trigger holds");
  up(1, null);
  assert.deepEqual(up(1.1), { left: null, right: THREAT }, "the trigger gone and back, it takes them again");
});

test("a_reflex_that_seizes_ends_the_blow_holding_its_hand_and_drops_the_option's_requests_on_it", () => {
  const brace = { name: "brace", limbs: ["right"], seizes: true, longest: 1, trigger: (now) => now.threat ? { guard: { right: now.threat } } : null };
  const asked = { id: 9, action: "punch", effector: "hand.left", target: {} };
  const out = reflexLayer([brace]).apply(situation(0, THREAT, [PUNCH]), option([PUNCH, asked]));
  assert.deepEqual([out.guard, out.actions, out.interrupt], [{ left: null, right: THREAT }, [asked], [PUNCH.id]]);
});
