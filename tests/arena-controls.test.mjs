// Gameplay integration on the Node arena stand, vendored Rapier, 120 Hz.
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Duel } from "../src/arena/duel.ts";
import { controllerLabel, linkedMind, mindsSearch, readControls, readMinds, readRecovery } from "../src/arena/matchup.ts";
import { addArenaSolids } from "../src/arena/room.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { CLASSIC, PUNCHER, QUADRUPED, RECIPE_FIGHTER, SCRAPPER } from "../src/core/mind/config.ts";
import { PRESETS } from "../src/core/mind/controllers.ts";
import { partOf, treeFaults } from "../src/core/mind/catalog.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { saveState } from "../src/core/state.ts";
import { createWorld } from "../src/core/world.ts";
import { traceOf } from "./harness/trace.mjs";
import { freshEngine } from "./harness/core-stand.mjs";
import { COMBAT, withParts } from "./fixtures/minds.mjs";

async function bout(overrides = {}) {
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await freshEngine());
  addArenaSolids(world.physics);
  const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue", capSeconds: 20,
    held: { left: "empty", right: "empty" }, minds: { left: COMBAT, right: RECIPE_FIGHTER }, recoverySeconds: 15, ...overrides });
  return { world, duel, dispose() { duel.dispose(); world.dispose(); scene.dispose(); engine.dispose(); } };
}

test("controller and recovery links preserve independent choices", () => {
  assert.deepEqual(readControls(""), { left: "classic", right: "classic" });
  assert.deepEqual(readControls("?control=unknown,scrapper"), { left: "classic", right: "scrapper" });
  assert.deepEqual(readControls("?control=combat,kicker"), { left: "classic", right: "classic" });
  assert.deepEqual(readControls("?control=point-left,point-alternate"), { left: "classic", right: "classic" });
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
  const edited = withParts(SCRAPPER, { tactics: { prefers: "head", spacing: .5 }, subs: [{ kind: "staged-rise" }, { kind: "lie" }] });
  const tuned = withParts(edited, { locomotion: { tuning: { turnLimit: 2 } }, blow: { tuning: { paths: { returnLimit: .05 } } } });
  const search = mindsSearch("?control=classic,scrapper&left.mind=x", { left: CLASSIC, right: tuned });
  assert.deepEqual(JSON.parse(query(search).get("right.mind")), edited);
  assert.equal(query(search).get("left.mind"), null);
  assert.deepEqual(readMinds(search), { left: CLASSIC, right: edited });
  assert.deepEqual(readMinds(`?control=classic,scrapper&right.mind=${encodeURIComponent(JSON.stringify(tuned))}`).right, edited);
  // Every field of every part of every preset, set to each value it takes but the preset's, round trips, or is the preset where the tree has a fault.
  let fields = 0;
  for (const [control, { config: preset }] of Object.entries(PRESETS)) {
    const parts = [[null, preset], ...partOf(preset).slots.filter((slot) => !slot.many && preset[slot.key]).map((slot) => [slot.key, preset[slot.key]])];
    for (const [key, part] of parts) for (const field of partOf(part).fields) {
      const values = field.kind === "choice" ? field.options.map(([value]) => value) : [field.least, field.most].map(String);
      for (const value of values.filter((value) => value !== field.read(part))) {
        const changed = field.write(part, value), config = key ? { ...preset, [key]: changed } : changed;
        const linked = mindsSearch(`?control=classic,${control}`, { left: CLASSIC, right: config });
        assert.deepEqual(readMinds(linked).right, treeFaults(config).length > 0 ? preset : config, `${control} ${key}.${field.key}=${value}`);
        assert.deepEqual(readMinds(linked).left, CLASSIC);
        fields++;
      }
    }
  }
  assert.ok(fields > 40, `${fields} changes of a field`);
  // A tree with a fault is the preset whole, and the panel shows it with why.
  const faulty = withParts(SCRAPPER, { tactics: { combinations: "follow-up", hands: "right" } }), refused = mindsSearch("?control=classic,scrapper", { left: CLASSIC, right: faulty });
  assert.deepEqual(readMinds(refused).right, SCRAPPER);
  assert.deepEqual(linkedMind(refused, "right"), { config: faulty, faults: ["tactics: combat combinations require alternate hands"] });
  // Classic with the path strike for its blow is a fault at the blow, and plays Classic.
  const pathed = withParts(CLASSIC, { blow: { kind: "path-strike", overlap: false } }), classic = mindsSearch("?control=classic,scrapper", { left: pathed, right: SCRAPPER });
  assert.deepEqual(readMinds(classic).left, CLASSIC);
  assert.deepEqual(linkedMind(classic, "left").faults, ["blow: the path strike carries out a blow only along a path, and these tactics name none"]);
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
  assert.equal(readMinds(`?control=classic,scrapper&right.mind=${encodeURIComponent(JSON.stringify(withParts(SCRAPPER, { tactics: { spacing: .25 } })))}`).right.tactics.spacing, .25);
  assert.deepEqual(readMinds("?control=puncher,classic").left, PUNCHER);
  assert.deepEqual(readMinds("?control=classic,classic").left, CLASSIC);
});

test("a real fall hands control to recovery, keeps sensing the opponent, and replays its countdown", async () => {
  const stand = await bout({ gap: 8, capSeconds: 60, recoverySeconds: 4 });
  try {
    const { world, duel } = stand, fighter = duel.duelists.left;
    duel.order("left", STAND_ORDERS); duel.order("right", STAND_ORDERS);
    world.step(120);
    const trunk = fighter.built.segments.get("middleTrunk"), mass = [...fighter.built.segments.values()].reduce((n, p) => n + p.rigid.mass, 0);
    trunk.body.applyImpulse(new Vector3(0, 0, mass * 1.5), centreOfToRef(trunk, new Vector3()));
    while (!fighter.body.down && duel.steps < 600) world.step();
    assert.ok(fighter.body.down, "the physical shove caused a fall");
    world.step(2);
    assert.equal(fighter.body.has, "recovery: rise");
    assert.equal(duel.verdict, null);
    assert.equal(duel.eliminated("left"), false);
    assert.equal(duel.duelists.right.body.view.senses.others.find(o => o.id === "left").out, false);
    const saved = duel.save();
    const run = () => {
      const trace = traceOf(Object.values(duel.duelists).map(d => d.built));
      while (!duel.verdict) { world.step(); trace.take(); }
      return trace.digest();
    };
    const digest = run();
    assert.equal(duel.verdict?.ending, "fallen");
    assert.ok(duel.state.recovery.left >= 4);
    const expected = saveState(duel.state);
    duel.load(saved); assert.equal(run(), digest);
    assert.deepEqual(saveState(duel.state), expected);
  } finally { stand.dispose(); }
});
