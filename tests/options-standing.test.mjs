/**
 * **Standing options on built situations** (`src/core/mind/options/`): a distance goal closes,
 * backs off or stands as its bounds say, and flees facing away; holding the edge walks to just
 * outside the foe's reach and stands there, and has run its course once a blow is ready or its
 * patience is spent; evading steps back while a blow is predicted to land; striking a low foe is
 * on offer only against one down and may walk into its reach; and every walk keeps out of a fallen
 * body's reach and out of a solid's clearance. Situations built by hand, the foe
 * the Warrior's spec, no physics.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { rangeOf } from "../src/core/skills/strike.ts";
import { setDistance } from "../src/core/mind/options/distance.ts";
import { holdEdge } from "../src/core/mind/options/edge.ts";
import { evade } from "../src/core/mind/options/evade.ts";
import { strikeLow } from "../src/core/mind/options/low.ts";
import { SCRAPPER } from "../src/core/mind/config.ts";
import { walker } from "../src/core/mind/options/walk.ts";

const SPEC = humanSpec("workshop-fighter"), walk = walker(SPEC), PACE = .5, HEAD = 1.6;
/** A gait's envelope that holds `PACE` every way and `RUN` forward, as a walk that runs does. */
const RUN = 3, ENVELOPE = { walk: { value: PACE }, ways: { forward: { value: RUN }, back: { value: PACE }, left: { value: PACE }, right: { value: PACE } } };
/** How far the foe reaches a head level with its own, m head to head: its range's outer bound. */
const OUTSIDE = (() => { const range = rangeOf(SPEC, "right", 0); return range.reach + range.along[1]; })();

/** A foe standing (or lying) `apart` m down +z of a body at the origin facing +z, its head level with the body's. */
const foe = (apart, down = false, id = "foe") => {
  const at = { x: 0, y: down ? .2 : 1, z: apart };
  return { id, side: "right", out: false, down, spec: SPEC, centre: at,
    segments: new Map([[SPEC.marks.high, { centre: { x: 0, y: down ? .2 : HEAD, z: apart } }], ["pelvis", { centre: at }]]) };
};
/** The body at the origin, facing +z, with `others` sensed and `solids` about it, at `time` s. */
const situation = (others, { time = 0, solids = [], incoming = null, actions = [] } = {}) => {
  const focus = others[0] ?? null;
  return {
    sight: { view: { time, down: false, head: { x: 0, y: HEAD, z: 0 }, stance: { centre: { x: 0, y: 1, z: 0 }, support: { y: 0 }, phase: "stand" }, senses: { side: "left", others, solids } },
      report: { heading: 0, actions }, envelope: ENVELOPE },
    time, down: false, orders: null, focus, apart: focus ? Math.abs(focus.centre.z) : Infinity, threat: null, incoming, danger: 0, exposure: 0, blows: { left: 0, right: 0 },
    reach: focus ? { apart: Math.abs(focus.centre.z), theirs: OUTSIDE, mine: OUTSIDE } : { apart: Infinity, theirs: 0, mine: 0 },
  };
};
const forward = (intent) => intent.move?.[0] ?? 0;

test("a_distance_goal_closes_backs_off_or_stands_and_a_flight_faces_away", () => {
  const closeIn = setDistance({ name: "close in", foe: "standing", to: "centre", near: 0, far: 1, correcting: false, facing: "foe", slant: 0 }, walk);
  assert.ok(forward(closeIn.step(situation([foe(3)]))) > 0, "far, it closes");
  // Closing, it goes as fast as its gait holds forward and it stops from before the foe, and no slower than its walk.
  const near = forward(closeIn.step(situation([foe(1.05)]))), mid = forward(closeIn.step(situation([foe(3)]))), far = forward(closeIn.step(situation([foe(40)])));
  assert.ok(near >= PACE && near < mid && mid < far && far === RUN, `closing at ${near}, ${mid} and ${far} m/s from 1.05, 3 and 40 m`);
  assert.equal(closeIn.step(situation([foe(.8)])).move, null, "within, it stands");
  const keep = setDistance({ name: "keep distance", foe: "standing", to: "centre", near: 2, far: 3, correcting: false, facing: "foe", slant: 0 }, walk);
  assert.ok(forward(keep.step(situation([foe(1)]))) < 0, "near, it backs off");
  const flee = setDistance({ name: "flee", foe: "any", to: "centre", near: Infinity, far: Infinity, correcting: false, facing: "away", slant: 0 }, walk);
  const fleeing = flee.step(situation([foe(1)]));
  assert.ok(forward(fleeing) < 0 && Math.abs(Math.abs(fleeing.face) - Math.PI) < 1e-9, `it walks off with its back to the foe: ${JSON.stringify(fleeing)}`);
});

test("holding_the_edge_stands_just_outside_reach_until_a_blow_is_ready_or_its_patience_spent", () => {
  const range = rangeOf(SPEC, "right", 0), outside = range.reach + range.along[1], band = .25;
  let ready = false;
  const edge = holdEdge({ band, patience: 1 }, walk, () => ready);
  const at = (apart, time = 0) => situation([foe(apart)], { time });
  assert.ok(forward(edge.step(at(outside + band + .5))) > 0, "far, it walks in");
  assert.ok(forward(edge.step(at(outside - .2))) < 0, "within reach, it backs off");
  edge.begin(at(outside + band / 2));
  assert.equal(edge.step(at(outside + band / 2)).move, null, "at the edge, it stands");
  assert.equal(edge.ended(at(outside + band / 2, .5)), false);
  ready = true;
  assert.equal(edge.ended(at(outside + band / 2, .5)), true, "a blow ready, it is over");
  ready = false;
  edge.step(at(outside + band / 2, .5));
  assert.equal(edge.ended(at(outside + band / 2, 1)), true, "its patience spent at the edge, it is over");
  assert.equal(edge.available(at(outside + band / 2, 1.5)), false, "and not on offer again against that foe");
  assert.equal(edge.available(situation([foe(outside + band / 2, false, "other")], { time: 1.5 })), true, "but against another");
  assert.equal(edge.available(situation([foe(outside)], { actions: [{ id: 1 }] })), false, "nor with a blow of its own under way");
});

test("evading_steps_back_while_a_blow_is_predicted_to_land", () => {
  const option = evade(walk), threatened = situation([foe(1)], { incoming: { region: "head" } });
  assert.equal(option.available(situation([foe(1)])), false);
  assert.equal(option.available(threatened), true);
  assert.ok(forward(option.step(threatened)) < 0);
  assert.equal(option.ended(situation([foe(1)])), true);
});

test("striking_a_low_foe_is_on_offer_against_one_down_and_may_walk_into_its_reach", () => {
  const option = strikeLow(SCRAPPER.actions.find((action) => action.lower !== undefined), SPEC, walk), lying = situation([foe(1, true)]);
  assert.equal(option.available(situation([foe(1)])), false, "not against a standing foe");
  assert.equal(option.available(lying), true);
  assert.equal(option.near(lying), "foe");
  assert.equal(option.yields(lying), true, "it yields until its placement begins");
});

test("every_walk_keeps_out_of_a_fallen_body's_reach_and_a_solid's_clearance", () => {
  const ahead = [PACE, 0], lying = foe(.5, true);
  // A fallen body within reach: the walk is away from it, whatever was asked, but where the option means to be near it.
  assert.ok(walk.constrain(situation([lying]), ahead, null)[0] < 0);
  assert.deepEqual(walk.constrain(situation([lying]), ahead, "foe"), ahead);
  assert.deepEqual(walk.constrain(situation([foe(2, true)]), ahead, null), ahead, "out of reach, the walk is as asked");
  // Standing in a wall's clearance just behind: the walk is out of it, forward.
  const wall = { kind: "box", centre: [0, 1, -.3], size: [4, 2, .2] };
  const out = walk.constrain(situation([], { solids: [wall] }), null, null);
  assert.ok(out && out[0] > 0, `out of the wall's clearance: ${JSON.stringify(out)}`);
});

test("a_slanted_break_backs_off_turned_out_of_the_foe's_path", () => {
  const breaking = setDistance({ name: "break", foe: "standing", to: "centre", near: 2, far: Infinity, correcting: false, facing: "foe", slant: .8 }, walk);
  const ways = [.5, -.5].map((x) => breaking.step(situation([{ ...foe(1), velocity: { x, z: -1 } }])).move);
  for (const [ahead, across] of ways) assert.ok(ahead < 0 && Math.abs(Math.atan2(Math.abs(across), -ahead) - .8) < 1e-6, `it backs off 0.8 rad off straight back: ${ahead}, ${across}`);
  assert.ok(ways[0][1] * ways[1][1] < 0, `a foe coming in from the other side turns it the other way: ${ways[0][1]}, ${ways[1][1]}`);
});
