import test from "node:test";
import assert from "node:assert/strict";
import { inventory, inventoryFaults, knownFails } from "../../scripts/inventory.mjs";

/**
 * A strike tuned on the man alone was reported as general, and nothing showed that every other
 * body priced it by hand or was refused it for its name: the fights still played. The inventory
 * lists what each body's Mind reads to price a fight and where each reading comes from, and this
 * holds its failing rows to the list known today (`scripts/inventory-known.json`). So a new
 * reading by hand, by a name or for one pairing fails here on the day it is written, and one
 * that is mended must be taken off the list. No drill or bout shows where a reading came from.
 */
test("no body's Mind reads by hand, by a name or for one pairing anything but what is known today", async () => {
  const listed = await inventory(), rows = Object.values(listed.bodies);
  assert.ok(rows.length >= 10 && rows.every((row) => Object.keys(row.reads).length > 0 && Object.keys(row.offers).length > 0),
    "a body's reads or offers were not listed, so this test would pass on nothing");
  assert.deepEqual(inventoryFaults(Object.keys(listed.fails), knownFails()), []);
});
