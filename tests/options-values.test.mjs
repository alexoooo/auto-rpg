/**
 * **The options fighter's values** (`src/core/mind/options/value.ts`, `meta.ts`): an option's worth
 * is its weighted terms over its run; a blow taken costs as its square, so a jab little and a heavy
 * blow a lot; a body's record of an action moves its prior; and a valued meta-controller, walking
 * to where it is told, walks through a weak blow, steps back from a heavy one and walks on, and
 * keeps the offers it chose from; a person's obedience moves the blow it steps aside from when
 * ordered, and nothing unordered. A config's weights must name terms. Built situations, the
 * Warrior's spec, no physics.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { CONTROLLERS } from "../src/core/mind/controllers.ts";
import { metaController, valued } from "../src/core/mind/options/meta.ts";
import { followOrders } from "../src/core/mind/options/orders.ts";
import { evade } from "../src/core/mind/options/evade.ts";
import { setDistance } from "../src/core/mind/options/distance.ts";
import { blowEnergy, cost, record, WEIGHTS, worth } from "../src/core/mind/options/value.ts";
import { walker } from "../src/core/mind/options/walk.ts";

const SPEC = humanSpec("workshop-fighter"), walk = walker(SPEC), PACE = .5;
const FOE = { id: "foe", side: "right", out: false, down: false, spec: SPEC, centre: { x: 0, y: 1, z: 3 }, segments: new Map() };
/** Told to walk 5 m on, a foe 3 m off and out of reach, at `time` s, with a blow of `energy` J predicted to land, or none. */
const walking = (time, energy = null, ledger = []) => ({
  sight: { view: { time, stance: { centre: { x: 0, y: 1, z: 0 } } }, report: { heading: 0, actions: [], ledger }, envelope: { walk: { value: PACE } } },
  time, down: false, orders: { move: { x: 0, z: 1 }, face: null, destination: 5 }, focus: FOE, apart: 3, threat: null,
  incoming: energy === null ? null : { threat: [0, 1.6, .4], guarded: [0, 1.6, 0] }, danger: energy === null ? 0 : .3 * cost(energy),
  reach: { apart: 3, theirs: .8, mine: .8 }, exposure: 0, blows: { left: 0, right: 0 },
});

test("an_option's_worth_is_its_weighted_terms_over_its_run_and_a_blow_taken_costs_as_its_square", () => {
  const terms = { duration: 1, dealt: 10, taken: 4, orders: .5, fall: .1 };
  assert.equal(worth(terms, { dealt: 1, taken: 1, orders: 0, fall: 0 }), 3);
  assert.equal(worth(terms, { dealt: 0, taken: 0, orders: 2, fall: 10 }), 0);
  assert.ok(cost(5) < 5 && cost(60) > 60 && cost(60) / cost(30) === 4, "a jab costs less than its energy, a heavy blow more, as its square");
  assert.equal(blowEnergy(SPEC, "right", SPEC, 10) / blowEnergy(SPEC, "right", SPEC, 5), 4, "a blow's energy is its closing speed's square");
  assert.ok(blowEnergy(SPEC, "right", SPEC) > 10, "a bare fist's blow at the head, with its arm behind it");
});

test("a_body's_record_of_an_action_moves_its_prior", () => {
  const ended = (hit, began) => ({ action: "punch", committed: true, began, ended: began + .4, contacts: { counts: { commit: { target: hit ? 1 : 0 } } } });
  const prior = record([], "punch");
  assert.deepEqual(prior, { lands: .3, seconds: .6 });
  const after = record([ended(true, 0), ended(true, 1), ended(false, 2), { ...ended(true, 3), action: "kick" }], "punch");
  assert.ok(Math.abs(after.lands - (2 + .9) / 6) < 1e-12 && Math.abs(after.seconds - (1.2 + 1.8) / 6) < 1e-12, JSON.stringify(after));
});

test("walking_where_it_is_told_a_valued_mind_walks_through_a_weak_blow_steps_back_from_a_heavy_one_and_walks_on", () => {
  const hold = setDistance({ name: "hold", foe: "any", to: "centre", near: 0, far: Infinity, correcting: false, facing: "foe", slant: 0 }, walk);
  const meta = metaController([followOrders(walk), evade(walk), hold], valued("hand-built", WEIGHTS));
  const chosen = (now) => meta.decide(now)?.name;
  assert.equal(chosen(walking(0)), "follow orders");
  assert.equal(chosen(walking(.25, 5)), "follow orders", "a jab coming: walked through");
  assert.equal(chosen(walking(.5, 60)), "evade", "a heavy blow coming: it steps back");
  assert.equal(chosen(walking(.6)), "follow orders", "the blow gone: it walks on");
  assert.deepEqual(meta.state.offers.map((offer) => offer.name), ["follow orders", "hold"]);
  assert.ok(meta.state.offers.every((offer) => offer.terms !== null && offer.worth === worth(offer.terms, WEIGHTS)));
});

test("a_person's_obedience_sets_how_heavy_a_blow_coming_turns_the_fighter_from_its_orders_and_without_orders_nothing", () => {
  const field = CONTROLLERS.options.fields.find((field) => field.label === "Obedience");
  const weighed = (level) => ({ ...WEIGHTS, ...field.write(CONTROLLERS.options.defaults, level).weights });
  const choices = (level, now) => {
    const hold = setDistance({ name: "hold", foe: "any", to: "centre", near: 0, far: Infinity, correcting: false, facing: "foe", slant: 0 }, walk);
    const meta = metaController([followOrders(walk), evade(walk), hold], valued("hand-built", weighed(level)));
    meta.decide(walking(0));
    return meta.decide(now)?.name;
  };
  assert.deepEqual(["own", "steady", "orders"].map((level) => [40, 90].map((energy) => choices(level, walking(.25, energy)))), [
    ["evade", "evade"], ["follow orders", "evade"], ["follow orders", "follow orders"]]);
  const unordered = { ...walking(.25, 40), orders: null };
  assert.deepEqual(["own", "orders"].map((level) => choices(level, unordered)), [choices("steady", unordered), choices("steady", unordered)]);
  assert.deepEqual(field.write(CONTROLLERS.options.defaults, "steady"), CONTROLLERS.options.defaults, "the steady level writes nothing");
  assert.deepEqual(field.write({ kind: "options", weights: { taken: 2, orders: 10 } }, "steady"), { kind: "options", weights: { taken: 2 } });
  assert.deepEqual(["own", "steady", "orders"].map((level) => field.read(field.write(CONTROLLERS.options.defaults, level))), ["own", "steady", "orders"]);
  assert.equal(field.write(CONTROLLERS.options.defaults, "obey"), null);
});

test("a_valued_config's_weights_name_terms_of_finite_weights", () => {
  const faults = CONTROLLERS.options.faults;
  assert.deepEqual(faults({ ...CONTROLLERS.options.defaults, meta: "valued", weights: { taken: 2 } }), []);
  assert.equal(faults({ ...CONTROLLERS.options.defaults, weights: { bravery: 1 } }).length, 1);
  assert.equal(faults({ ...CONTROLLERS.options.defaults, weights: { taken: -1 } }).length, 1);
  assert.equal(faults({ ...CONTROLLERS.options.defaults, meta: "random" }).length, 1);
});
