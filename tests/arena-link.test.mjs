/**
 * **What an arena link carries** (`src/arena/matchup.ts`) and what a person's keys and pointer make
 * of orders (`src/arena/orders-input.ts`): each choice read back from the address it writes, a
 * malformed one falling back, and a tape in the fragment.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MATCHUP, controllerLabel, linkedMind, matchupSearch, mindsSearch, readBalance, readCap, readControls, readGap, readHaste, readHeld, readMatchup, readMinds, readRecovery, readTape, readYou, tapeHash, youSearch } from "../src/arena/matchup.ts";
import { ORBIT, orbitPosition } from "../src/arena/orbit.ts";
import { aimPoint, keysToMove, personOrders } from "../src/arena/orders-input.ts";
import { CLASSIC, PUNCHER, QUADRUPED, SCRAPPER } from "../src/core/mind/config.ts";
import { PRESETS } from "../src/core/mind/controllers.ts";
import { partOf, treeFaults } from "../src/core/mind/catalog.ts";
import { STAND_ORDERS, isOrders } from "../src/core/mind/orders.ts";

test("an_arena_link_names_its_matchup_and_a_malformed_one_falls_back", () => {
  assert.deepEqual(readMatchup("?play=arena&matchup=crypt-skeleton,workshop-fighter"), { left: "crypt-skeleton", right: "workshop-fighter" });
  assert.deepEqual(readMatchup("?matchup=workshop-rogue"), { left: "workshop-rogue", right: DEFAULT_MATCHUP.right });
  assert.deepEqual(readMatchup("?matchup=%7B%22left%22%3A1%7D"), DEFAULT_MATCHUP, "a malformed link");
  assert.deepEqual(readMatchup(""), DEFAULT_MATCHUP);
  const written = matchupSearch("?play=arena&matchup=x", { left: "workshop-rogue", right: "crypt-skeleton" });
  assert.equal(written, "?play=arena&matchup=workshop-rogue,crypt-skeleton");
  assert.deepEqual(readMatchup(written), { left: "workshop-rogue", right: "crypt-skeleton" });
  // The side a person fights: named, or nobody.
  assert.deepEqual(["?you=left", "?play=arena&you=right", "?you=both", "?you=", ""].map(readYou), ["left", "right", null, null, null]);
  assert.equal(youSearch(written, "right"), "?play=arena&matchup=workshop-rogue,crypt-skeleton&you=right");
  assert.equal(youSearch("?play=arena&you=left&matchup=a,b", null), "?play=arena&matchup=a,b");
  // Each side's balance: left then right, one number for both, or the characters' own.
  assert.deepEqual(["?balance=5,2", "?play=arena&balance=5", "?balance=0,20.5", "?balance=%205%20,%202"].map(readBalance),
    [{ left: 5, right: 2 }, { left: 5, right: 5 }, { left: 0, right: 20.5 }, { left: 5, right: 2 }]);
  assert.deepEqual(["", "?balance=", "?balance=5,", "?balance=,5", "?balance=-1", "?balance=5,-1", "?balance=1,2,3", "?balance=many", "?balance=Infinity"].map(readBalance),
    Array(9).fill(undefined));
  // Each side's haste, per cent over a person's and signed: left then right, one number for both, a side whose model takes none left its own; nothing at or under -100.
  assert.deepEqual(["?haste=50,20", "?haste=+50", "?matchup=reptile,workshop-rogue&haste=50,30", "?matchup=workshop-rogue,reptile&haste=50", "?haste=-5"].map(readHaste),
    [{ left: 50, right: 20 }, { left: 50, right: 50 }, { right: 30 }, { left: 50 }, { left: -5, right: -5 }]);
  assert.deepEqual(["", "?haste=", "?haste=-100", "?haste=50,-120", "?haste=1,2,3", "?haste=fast"].map(readHaste), Array(6).fill(undefined));
});

test("a_tape_rides_in_a_link's_fragment", () => {
  const toward = { x: 0.6, z: -0.8 };
  const tape = [
    { step: 0, side: "left", orders: { move: toward, face: null } },
    { step: 60, side: "right", orders: { move: null, face: { x: 1 / 3, z: 2e-17 }, foe: "left", region: "head" } },
    { step: 120, side: "left", orders: null },
  ];
  const hash = tapeHash(tape);
  assert.match(hash, /^#tape=%5B/);
  assert.deepEqual(readTape(hash), tape);
  assert.deepEqual(readTape(hash.slice(1)), tape, "with or without its #");
  assert.deepEqual(["", "#", "#tape=", "#tape=%7B%7D", "#tape=nonsense", "#other=1"].map(readTape), Array(6).fill([]));
  // One entry that is not an entry and the tape is none: a tape played in part is another bout.
  const wrong = [
    { step: 1.5, side: "left", orders: null }, { step: -1, side: "left", orders: null }, { side: "left", orders: null },
    { step: 1, side: "top", orders: null }, { step: 1, side: "left" }, { step: 1, side: "left", orders: 3 }, null,
    { step: 1, side: "left", orders: { move: { x: "1", z: 0 }, face: null } },
    { step: 1, side: "left", orders: { move: null, face: { x: 1 } } },
    { step: 1, side: "left", orders: { move: null, face: null, attack: [1, 2] } },
    { step: 1, side: "left", orders: { move: null, face: null, attack: [1, 2, null] } },
    { step: 1, side: "left", orders: { move: null, face: null, region: "head" } },
  ];
  for (const entry of wrong) assert.deepEqual(readTape(tapeHash([tape[0], entry])), [], JSON.stringify(entry));
  assert.deepEqual([STAND_ORDERS, tape[1].orders, null, [], { move: null, face: null, attack: "head" }].map(isOrders), [true, true, false, false, false]);
  // A pace is a ceiling, m/s: a number, finite and not below zero, or none.
  assert.deepEqual([0.4, 0, -0.1, Infinity, "slow"].map((pace) => isOrders({ move: { x: 0, z: 1 }, pace, face: null })), [true, true, false, false, false]);
  // The gap and the cap a link asks for, each within its range or not at all.
  // What each side's right hand holds: left then right, one word for both, or the club.
  assert.deepEqual(["?held=empty,club", "?play=arena&held=empty", "?held=club", "?held=%20club%20,empty"].map(readHeld),
    [{ left: "empty", right: "club" }, { left: "empty", right: "empty" }, { left: "club", right: "club" }, { left: "club", right: "empty" }]);
  assert.deepEqual(["", "?held=", "?held=empty,", "?held=,empty", "?held=sword", "?held=empty,club,club", "?balance=empty"].map(readHeld), Array(7).fill(undefined));
  assert.deepEqual(["?gap=3.5", "?play=arena&gap=1", "?gap=8"].map(readGap), [3.5, 1, 8]);
  assert.deepEqual(["", "?gap=", "?gap=0", "?gap=0.99", "?gap=8.01", "?gap=x", "?gap=Infinity", "?cap=4"].map(readGap), Array(8).fill(undefined));
  assert.deepEqual(["?cap=30", "?cap=1", "?cap=600"].map(readCap), [30, 1, 600]);
  assert.deepEqual(["", "?cap=", "?cap=0", "?cap=601", "?cap=x", "?gap=4"].map(readCap), Array(6).fill(undefined));
});

test("controller and recovery links preserve independent choices", () => {
  // A side's control is its model's own mind's preset unless the link names another it fits.
  assert.deepEqual(readControls(""), { left: "options", right: "options" });
  assert.deepEqual(readControls("?control=unknown,scrapper"), { left: "options", right: "scrapper" });
  assert.deepEqual(readControls("?control=combat,kicker"), { left: "options", right: "options" });
  assert.deepEqual(readControls("?control=point-left,point-alternate"), { left: "options", right: "options" });
  assert.deepEqual(readControls("?matchup=reptile,workshop-fighter&control=classic"), { left: "crawl", right: "classic" });
  assert.deepEqual(readMinds("?control=scrapper,classic&guard=cover&right.guard=cover"), { left: SCRAPPER, right: CLASSIC });
  assert.deepEqual(readMinds("?control=puncher,scrapper"), { left: PUNCHER, right: SCRAPPER });
  assert.deepEqual(["", "?recovery=", "?recovery=-1", "?recovery=Infinity", "?recovery=61"].map(readRecovery), Array(5).fill(undefined));
  assert.equal(readRecovery("?recovery=continue"), null);
  assert.deepEqual(["?recovery=0", "?recovery=15", "?recovery=60"].map(readRecovery), [0, 15, 60]);
});

test("each side's mind travels in a link as its whole tree, without research tuning, and comes back as its config", () => {
  const query = (search) => new URLSearchParams(search);
  // A preset writes nothing; a changed tree writes itself whole, and a link drops any research tuning.
  assert.equal(mindsSearch("?control=classic,scrapper", { left: CLASSIC, right: SCRAPPER }), "?control=classic%2Cscrapper");
  const edited = { ...SCRAPPER, actions: SCRAPPER.actions.map(action => ({ ...action, regions: [{ kind: "mark", mark: "high" }] })), tactics: { ...SCRAPPER.tactics, list: SCRAPPER.tactics.list.map(b => b.kind === "approach" ? { ...b, spacing: .5 } : b) }, subs: [{ kind: "support-recovery" }, { kind: "lie" }] };
  const tuned = { ...edited, executors: edited.executors.map(executor => ({ ...executor, tuning: { paths: { returnLimit: .05 } } })) };
  const search = mindsSearch("?control=classic,scrapper&left.mind=x", { left: CLASSIC, right: tuned });
  assert.deepEqual(JSON.parse(query(search).get("right.mind")), edited);
  assert.equal(query(search).get("left.mind"), null);
  assert.deepEqual(readMinds(search), { left: CLASSIC, right: edited });
  assert.deepEqual(readMinds(`?control=classic,scrapper&right.mind=${encodeURIComponent(JSON.stringify(tuned))}`).right, edited);
  // Every field of every part of every preset, set to each value it takes but the preset's, round trips, or is the preset where the tree has a fault.
  const reached = new Set();
  for (const [control, { config: preset }] of Object.entries(PRESETS)) {
    const parts = [[null, preset], ...partOf(preset).slots.filter((slot) => !slot.many && preset[slot.key]).map((slot) => [slot.key, preset[slot.key]])];
    for (const [key, part] of parts) for (const field of partOf(part).fields) {
      const values = field.kind === "choice" ? field.options.map(([value]) => value) : [field.least, field.most].map(String);
      for (const value of values.filter((value) => value !== field.read(part))) {
        const changed = field.write(part, value), config = key ? { ...preset, [key]: changed } : changed;
        const linked = mindsSearch(`?control=classic,${control}`, { left: CLASSIC, right: config });
        assert.deepEqual(readMinds(linked).right, treeFaults(config).length > 0 ? preset : config, `${control} ${key}.${field.key}=${value}`);
        assert.deepEqual(readMinds(linked).left, CLASSIC);
        reached.add(`${part.kind}.${field.key}`);
      }
    }
  }
  // The walk reaches the parts a person edits most: the tactics, the blow and how the body gets about.
  for (const field of ["move.otherwise"]) assert.ok(reached.has(field), [...reached].join(" "));
  // A named action with no executor is rejected as a whole config.
  const faulty = { ...SCRAPPER, actions: SCRAPPER.actions.map(action => ({ ...action, executor: "missing" })) };
  const refused = mindsSearch("?control=classic,scrapper", { left: CLASSIC, right: faulty });
  assert.deepEqual(readMinds(refused).right, SCRAPPER);
  assert.deepEqual(linkedMind(refused, "right"), { config: faulty, faults: treeFaults(faulty) });
  assert.ok(treeFaults(faulty).some(fault => fault.includes("missing")));
  const pathed = { ...CLASSIC, executors: [{ name: "paths", kind: "path-strike", overlap: false }], actions: CLASSIC.actions.map(action => ({ ...action, executor: "paths" })) };
  const classic = mindsSearch("?control=classic,scrapper", { left: pathed, right: SCRAPPER });
  assert.deepEqual(readMinds(classic).left, CLASSIC);
  assert.deepEqual(linkedMind(classic, "left").faults, ["the mind does not fit this body"]);
  const nested = mindsSearch("?control=classic,scrapper", { left: CLASSIC, right: { ...SCRAPPER, subs: [{ kind: "lie" }, { kind: "fly" }] } });
  assert.deepEqual(linkedMind(nested, "right").faults, ['subs.1: no part of kind "fly"']);
  assert.deepEqual(readMinds(nested).right, SCRAPPER);
  // Text that is no mind's tree is the preset, with nothing to show.
  for (const text of ["{", "null", "[]", '{"kind":"point-fighter"}', '{"kind":"lie"}', '{"kind":"constructor"}']) {
    const search = `?control=classic,scrapper&right.mind=${encodeURIComponent(text)}`;
    assert.deepEqual(readMinds(search).right, SCRAPPER, text);
    assert.deepEqual(linkedMind(search, "right"), { config: SCRAPPER, faults: [] }, text);
  }
  // A mind that does not fit the side's body is the preset.
  const reptile = `?matchup=reptile,reptile&control=crawl,crawl&left.mind=${encodeURIComponent(JSON.stringify(CLASSIC))}`;
  assert.deepEqual(readMinds(reptile).left, QUADRUPED);
  assert.deepEqual(linkedMind(reptile, "left").faults, ["the mind does not fit this body"]);
  // The HUD marks an edited side.
  assert.deepEqual(["left", "right"].map((side) => controllerLabel(search, side)), ["Classic fighter", "Custom (from Scrapper)"]);
  assert.equal(controllerLabel("?control=classic,puncher", "right"), "Puncher");
  assert.equal(readMinds(search).right.tactics.list.find(b => b.kind === "approach").spacing, .5);
  assert.deepEqual(readMinds("?control=puncher,classic").left, PUNCHER);
  assert.deepEqual(readMinds("?control=classic,classic").left, CLASSIC);
});

test("keys_and_a_pointer_make_orders_in_the_world's_frame", () => {
  const near = (a, b) => assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-12, `${JSON.stringify(a)} is ${JSON.stringify(b)}`);
  const keys = (names) => ({ up: names.includes("up"), down: names.includes("down"), left: names.includes("left"), right: names.includes("right") });
  // The camera looking along +z: up the screen is +z, right is +x.
  near(keysToMove(keys(["up"]), 0), { x: 0, z: 1 });
  near(keysToMove(keys(["down"]), 0), { x: 0, z: -1 });
  near(keysToMove(keys(["right"]), 0), { x: 1, z: 0 });
  near(keysToMove(keys(["left"]), 0), { x: -1, z: 0 });
  near(keysToMove(keys(["up", "right"]), 0), { x: Math.SQRT1_2, z: Math.SQRT1_2 });
  // Turned a quarter to the right, looking along +x: up is +x, right is -z.
  near(keysToMove(keys(["up"]), Math.PI / 2), { x: 1, z: 0 });
  near(keysToMove(keys(["right"]), Math.PI / 2), { x: 0, z: -1 });
  assert.equal(keysToMove(keys([]), 0), null);
  assert.equal(keysToMove(keys(["up", "down"]), 0), null);
  assert.equal(keysToMove(keys(["left", "right"]), 0), null);
  // Up the screen is away from where the orbit camera stands.
  const [cx, , cz] = orbitPosition({ x: 0, y: 1, z: 0 }, 0.7, ORBIT.pitch, ORBIT.distance), up = keysToMove(keys(["up"]), 0.7);
  near(up, { x: -cx / Math.hypot(cx, cz), z: -cz / Math.hypot(cx, cz) });
  // A ray from above, down to the plane at chest height.
  assert.deepEqual(aimPoint([0, 5, -4], [0, -0.8, 0.6], 1), [0, 1, -1]);
  assert.deepEqual(aimPoint([1, 3, 2], [0.5, -1, -0.25], 1), [2, 1, 1.5]);
  assert.equal(aimPoint([0, 5, -4], [0, 0.1, 1], 1), null, "a ray going up meets no plane below it");
  assert.equal(aimPoint([0, 0.5, -4], [0, -0.8, 0.6], 1), null, "nor one that starts under the plane");
  assert.deepEqual(personOrders({ x: 1, z: 0 }, [2, 1, 3], null, { x: 1, z: 1 }), { move: { x: 1, z: 0 }, face: { x: 1, z: 2 } });
  assert.deepEqual(personOrders(null, [2, 1, 3], { foe: "right", region: "head" }, { x: 1, z: 1 }), { move: null, face: { x: 1, z: 2 }, foe: "right", region: "head" });
  assert.deepEqual(personOrders(null, null, null, { x: 1, z: 1 }), { move: null, face: null });
});
