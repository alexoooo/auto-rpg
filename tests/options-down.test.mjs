/**
 * **Down options choose by worth and hand the body over cleanly** (`downOption`, `downHalf`,
 * `src/core/mind/options/down.ts`): of two down options on offer, a foe near, the meta-controller
 * takes the worthier, rolling away or getting up as their worths say, and with no foe near only
 * getting up is on offer. The down half begins the chosen option's sub-mind once it is handed the
 * body, ends one sub-mind and begins the other when the choice changes while it has the body, and
 * gives the body up ending only what it began. Stub sub-minds and situations, no physics.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { downHalf, downOption } from "../src/core/mind/options/down.ts";
import { metaController } from "../src/core/mind/options/meta.ts";

/** A sub-mind that wants the body while `wants` says, and logs its hand-overs. */
const sub = (name, log, wants) => ({ name, state: {}, wants: (senses) => wants(senses), holds: () => false,
  begin() { log.push(`begin ${name}`); }, end() { log.push(`end ${name}`); }, step() { log.push(`step ${name}`); } });
/** A body down, its foe `apart` m off. */
const at = (time, apart) => ({ sight: { view: { senses: { apart } } }, time, down: true, orders: null, focus: null, apart, threat: null });
const NEAR = 2;

/** The two down options, getting up always on offer down and rolling away only with a foe near, and the down half over them. */
function downs(values) {
  const log = [], half = { current: false };
  const options = [downOption("get up", sub("rise", log, () => true), half), downOption("roll away", sub("roll", log, (senses) => senses.apart < NEAR), half)];
  const meta = metaController(options, values);
  let now = null;
  const running = () => meta.state.running >= 0 ? options[meta.state.running] : null;
  const body = downHalf(options, running, () => meta.decide(now), half);
  return { log, meta, body, at(time, apart) { now = at(time, apart); return now; } };
}

test("down_options_choose_by_worth_a_foe_near", () => {
  const rolling = downs([1, 2]), rising = downs([2, 1]);
  rolling.at(0, 1); rising.at(0, 1);
  assert.equal(rolling.body.wants(), true);
  assert.equal(rolling.body.name, "roll");
  assert.equal(rising.body.wants(), true);
  assert.equal(rising.body.name, "rise");
  // With no foe near, rolling away is not on offer.
  const far = downs([1, 2]);
  far.at(0, 5);
  far.body.wants();
  assert.equal(far.body.name, "rise");
});

test("the_down_half_begins_switches_and_ends_only_what_it_began", () => {
  const { log, body, at } = downs([1, 2]);
  at(0, 1);
  // Chosen before the body is handed over, no sub-mind is begun until it is.
  assert.equal(body.wants(), true);
  assert.deepEqual(log, []);
  body.begin(); body.step({}, 1 / 120);
  assert.deepEqual(log, ["begin roll", "step roll"]);
  // The foe goes off: rolling away is over, and getting up begins at once, the body still the half's.
  at(.01, 5);
  assert.equal(body.wants(), true);
  body.step({}, 1 / 120);
  assert.deepEqual(log.slice(2), ["end roll", "begin rise", "step rise"]);
  // Given up, the half ends the one it began; handed back, it begins the running one again.
  body.end();
  assert.deepEqual(log.slice(5), ["end rise"]);
  body.end();
  assert.deepEqual(log.slice(6), [], "nothing is ended twice");
  body.begin();
  assert.deepEqual(log.slice(6), ["begin rise"]);
});
