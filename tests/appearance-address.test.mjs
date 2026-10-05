import test from "node:test";
import assert from "node:assert/strict";
import { appearanceSearch, readAppearances, readMatchup } from "../src/arena/matchup.ts";
import { labAddress, labHref } from "../src/lab/scenarios.ts";
import { loadoutSpec } from "../src/lab/loadout.ts";

test("arena appearances round trip per side without changing the recipe parameters", () => {
  const search = "?play=arena&matchup=workshop-fighter,workshop-fighter&you=left&balance=5,2&held=empty,club";
  const matchup = readMatchup(search);
  for (const left of ["default", "industrial", "relic", "duelist"]) for (const right of ["default", "industrial", "relic", "duelist"]) {
    const changed = appearanceSearch(search, matchup, { left, right });
    assert.deepEqual(readAppearances(changed, matchup), { left, right });
    const query = new URLSearchParams(changed); query.delete("appearance");
    assert.deepEqual([...query], [...new URLSearchParams(search)]);
  }
  assert.deepEqual(readAppearances("?appearance=bad,relic", matchup), { left: "default", right: "relic" });
  assert.deepEqual(readAppearances("?appearance=industrial,duelist", { left: "workshop-rogue", right: "crypt-skeleton" }), { left: "default", right: "default" });
});

test("Lab appearances survive scenario navigation and never enter the physical loadout", () => {
  const physical = spec => JSON.parse(JSON.stringify(spec, (key, value) => key === "provenance" ? undefined : value));
  const base = labAddress("?play=lab&scenario=stance&right=club&boots=0&armour=0"), spec = loadoutSpec(base);
  for (const appearance of ["default", "industrial", "relic", "duelist"]) {
    const address = { ...base, appearance }, href = labHref(address, "?keep=yes");
    assert.deepEqual(labAddress(href), address);
    assert.equal(new URLSearchParams(href).get("keep"), "yes");
    const menu = labAddress(labHref({ ...address, scenario: null }));
    assert.deepEqual(labAddress(labHref({ ...menu, scenario: "routine" })), { ...address, scenario: "routine" });
    assert.deepEqual(physical(loadoutSpec(address)), physical(spec));
  }
  for (const model of ["workshop-rogue", "crypt-skeleton"]) {
    assert.equal(labAddress(`?model=${model}&appearance=relic`).appearance, "default");
  }
});
