import test from "node:test";
import assert from "node:assert/strict";
import { failing, inventory, inventoryFaults, knownFails } from "../../scripts/inventory.mjs";
import { byHand, given, measuredFrom, notPriced } from "../../src/skills/framework/profile/source.ts";

/**
 * A strike tuned on the man alone was reported as general, and nothing showed that every other
 * body priced it by hand or was refused it for its name: the fights still played. The inventory
 * lists what each body's Mind reads to price a fight and where each reading comes from, and this
 * holds its failing rows to the list known today (`scripts/inventory-known.json`), each for the
 * same standings. So a new reading by hand, by a name or for one pairing fails here on the day
 * it is written, and one that is mended must be taken off the list. No drill or bout shows
 * where a reading came from.
 *
 * What it holds is what a first decision reads, with each body once as the one that prices and
 * once as the foe of the empty-handed man: every lookup the Mind's Options and its foe's
 * pressure make, the price of each Option on offer as a bout begins, and each guess in the
 * registry. It does not hold the price of an Option that is offered only later in a fight, such
 * as a strike or a way up. Those are counted over played decisions by the bout trace.
 */
test("no body's Mind reads by hand, by a name or for one pairing anything but what is known today", async () => {
  const listed = await inventory(), rows = Object.values(listed.bodies);
  assert.ok(rows.length >= 19 && rows.every((row) => Object.keys(row.reads).length > 0 && Object.keys(row.offers).length > 0),
    "a body's reads or offers were not listed, so this test would pass on nothing");
  assert.deepEqual(inventoryFaults(listed.fails, knownFails()), []);
});

/**
 * The control of the test above. A row once failed in one way only, the first it met, so a
 * reading that was both for the pairing and found by a name was held for the first alone. And
 * the list once held rows with no bodies, so a row that came to fail for another body passed.
 * This shows each way of failing is named, a reading of the body's own is not, and each way the
 * rows and the list can differ is a fault.
 */
test("the inventory names every way a source fails, and every way the rows differ from the list", () => {
  const side = (by, own = true) => ({ own, of: "a body", by, gaps: [] });
  assert.deepEqual(failing(byHand([], "a reason")), ["by hand"]);
  assert.deepEqual(failing(notPriced("a reason")), ["not priced"]);
  assert.deepEqual(failing(given("a reason")), []);
  assert.deepEqual(failing(measuredFrom({ body: side("numbers"), target: side("numbers", false) })), []);
  assert.deepEqual(failing(measuredFrom({ body: side("name"), target: side("rule"), pairing: true })), ["measured for the pairing", "found by a name", "found by a rule"]);

  const known = { "a row": ["one body", "another"] };
  assert.deepEqual(inventoryFaults(known, known), []);
  assert.equal(inventoryFaults({ ...known, "a new row": ["one body"] }, known).length, 1);
  assert.equal(inventoryFaults({}, known).length, 1);
  assert.equal(inventoryFaults({ "a row": ["one body", "another", "a third"] }, known).length, 1);
  assert.equal(inventoryFaults({ "a row": ["one body"] }, known).length, 1);
});
