/**
 * **The lab's loadout** (`src/core-lab/loadout.ts`): the body a loadout makes. Clothing is the
 * skin's and changes nothing here; a club in a hand is one rigid body with it. Run on the Node
 * core stand.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { loadoutSpec } from "../src/core-lab/loadout.ts";
import { startStance } from "../src/core-lab/stance-mode.ts";
import { specProvenanceFaults } from "./fixtures/spec.mjs";
import { coreStand } from "./harness/core-stand.mjs";

const MODELS = ["workshop-fighter", "workshop-rogue"];
const bare = (model) => ({ model, right: "empty", left: "empty", boots: true, armour: true });
/** A spec's numbers and names: each derivation's rule is a fresh closure per call, so it is left out. */
const plain = (spec) => JSON.parse(JSON.stringify(spec));

test("an_empty_loadout_is_the_models_human_whatever_it_wears", () => {
  for (const model of MODELS) {
    for (const boots of [false, true]) {
      for (const armour of [false, true]) assert.deepEqual(plain(loadoutSpec({ ...bare(model), boots, armour })), plain(humanSpec(model)));
    }
  }
});

test("each_hand_holds_what_the_loadout_says_and_nothing_else", () => {
  const club = woodenClub();
  for (const model of MODELS) {
    const holding = (loadout) => (loadoutSpec(loadout).held ?? []).map((held) => [held.segment, held.item.name]);
    assert.deepEqual(holding({ ...bare(model), right: "club" }), [["hand.right", club.name]]);
    assert.deepEqual(holding({ ...bare(model), left: "club" }), [["hand.left", club.name]]);
    assert.deepEqual(holding({ ...bare(model), right: "club", left: "club" }), [["hand.right", club.name], ["hand.left", club.name]]);
    const both = loadoutSpec({ ...bare(model), right: "club", left: "club" });
    assert.deepEqual(specProvenanceFaults(both), []);
    // Holding changes no segment: the club is the hand's rigid body's, not its segment's.
    assert.deepEqual(plain(both.segments), plain(humanSpec(model).segments));
  }
});

test("a_club_makes_its_hand_heavier_by_the_club_and_leaves_the_other", async () => {
  const kg = woodenClub().mass.value;
  const hand = (model, side) => humanSpec(model).segments.find((s) => s.name === `hand.${side}`).mass.value;
  const stand = await coreStand(loadoutSpec({ ...bare("workshop-rogue"), left: "club" }), { ground: false, gravity: false });
  try {
    const left = stand.built.segments.get("hand.left"), right = stand.built.segments.get("hand.right");
    assert.ok(Math.abs(left.rigid.mass - (hand("workshop-rogue", "left") + kg)) < 1e-12, `left ${left.rigid.mass}`);
    assert.ok(Math.abs(left.body.engineMass() - left.rigid.mass) < 1e-6, "the engine's mass is the rigid body's");
    assert.equal(right.rigid.mass, hand("workshop-rogue", "right"));
    // Its club is drawn from the rigid body's shapes after its own (`drawHeld`, `view.ts`).
    assert.equal(left.rigid.shapes.length, 1 + woodenClub().shapes.length);
    assert.equal(right.rigid.shapes.length, 1);
  } finally { stand.dispose(); }
});

test("with_a_club_in_each_hand_each_human_stands_walks_and_stops_in_the_stance", async () => {
  for (const model of MODELS) {
    const stand = await coreStand(loadoutSpec({ ...bare(model), right: "club", left: "club" }), { ground: true });
    const stance = startStance(stand.built, stand.world);
    const run = (seconds) => stand.step(stand.seconds(seconds));
    try {
      run(2);
      const stood = stance.frame();
      stance.orders.forward = 0.3;
      run(5);
      const walked = stance.frame();
      stance.orders.forward = 0;
      run(3);
      const stopped = stance.frame();
      assert.ok(stood.phase === "stand" && stood.recoveries === 0 && !stood.fallen, `${model} standing: ${JSON.stringify(stood)}`);
      assert.ok(walked.strides >= 8 && !walked.fallen, `${model} walking: ${JSON.stringify(walked)}`);
      assert.ok(stopped.phase === "stand" && !stopped.fallen, `${model} stopping: ${JSON.stringify(stopped)}`);
    } finally { stance.dispose(); stand.dispose(); }
  }
});
