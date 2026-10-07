// Gameplay integration on the Node arena stand, vendored Rapier, 120 Hz.
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Duel } from "../src/arena/duel.ts";
import { controllerLabel, linkedSettings, readControls, readMinds, readRecovery, settingsSearch, settled } from "../src/arena/matchup.ts";
import { addArenaSolids } from "../src/arena/room.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { BRAWLER, CLASSIC, COMBAT, QUADRUPED, RECIPE_FIGHTER, SCRAPPER } from "../src/core/mind/config.ts";
import { fieldsOf, PRESETS } from "../src/core/mind/controllers.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { saveState } from "../src/core/state.ts";
import { createWorld } from "../src/core/world.ts";
import { traceOf } from "./harness/trace.mjs";
import { freshEngine } from "./harness/core-stand.mjs";

async function bout(overrides = {}) {
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await freshEngine());
  addArenaSolids(world.physics);
  const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue", capSeconds: 20,
    held: { left: "empty", right: "empty" }, minds: { left: COMBAT, right: RECIPE_FIGHTER }, recoverySeconds: 15, ...overrides });
  return { world, duel, dispose() { duel.dispose(); world.dispose(); scene.dispose(); engine.dispose(); } };
}

test("controller and recovery links preserve independent choices and classic guard settings", () => {
  assert.deepEqual(readControls(""), { left: "classic", right: "classic" });
  assert.deepEqual(readControls("?control=unknown,combat"), { left: "classic", right: "combat" });
  assert.deepEqual(readControls("?control=point-left,point-alternate"), { left: "classic", right: "classic" });
  assert.deepEqual(readMinds("?control=combat,classic&guard=cover"), {
    left: COMBAT, right: { ...CLASSIC, guard: "cover" },
  });
  assert.deepEqual(readMinds("?control=brawler,combat"), { left: BRAWLER, right: COMBAT });
  assert.deepEqual(["", "?recovery=", "?recovery=-1", "?recovery=Infinity", "?recovery=61"].map(readRecovery), Array(5).fill(undefined));
  assert.equal(readRecovery("?recovery=continue"), null);
  assert.deepEqual(["?recovery=0", "?recovery=15", "?recovery=60"].map(readRecovery), [0, 15, 60]);
});

test("each controller's settings travel in a link and come back as its config", () => {
  const sides = { left: {}, right: {} };
  // Every field of every preset, set to each value it takes but the preset's, round trips.
  for (const [control, { config: preset }] of Object.entries(PRESETS)) {
    for (const field of fieldsOf(preset)) {
      const values = field.kind === "choice" ? field.options.map(([value]) => value) : [field.least, field.most].map(String);
      for (const value of values.filter((value) => value !== field.read(preset))) {
        const search = settingsSearch(`?control=classic,${control}`, { ...sides, right: { [field.key]: value } });
        assert.equal(new URLSearchParams(search).get(`right.${field.key}`), value, `${control} ${field.key}=${value}`);
        const refused = settled(control, (key) => key === field.key ? value : null).faults.length > 0;
        assert.deepEqual(readMinds(search).right, refused ? preset : field.write(preset, value), `${control} ${field.key}=${value}`);
        assert.deepEqual(readMinds(search).left, CLASSIC);
      }
    }
  }
  // The values a link writes: changed from the preset, as the field reads them, for a field the controller has.
  assert.equal(settingsSearch("?control=classic,combat", { left: { guard: "pose", aim: "pays", spacing: "1" }, right: { spacing: "0.50", guard: "cover" } }),
    "?control=classic%2Ccombat&left.aim=pays&right.spacing=0.5");
  assert.equal(settingsSearch("?control=classic,combat&left.aim=pays&guard=cover", sides), "?control=classic%2Ccombat");
  assert.deepEqual(readMinds("?control=classic,scrapper&left.down=lie&right.spacing=.25&right.kicks=yes&right.down=staged-rise"), {
    left: RECIPE_FIGHTER, right: { ...SCRAPPER, spacing: .25, kicks: true, subs: [{ kind: "staged-rise" }] },
  });
  // A value a field does not take keeps the preset's; the others still apply.
  assert.deepEqual(readMinds("?control=combat,combat&left.spacing=2&left.hands=right&right.strikes=sideways&right.kicks=true&right.prefers=body"), {
    left: { ...COMBAT, hands: "right" }, right: { ...COMBAT, prefers: "body" },
  });
  // A config its controller refuses is the preset whole, and the panel names why.
  const overlap = (key) => ({ combinations: "overlap", hands: "right", spacing: ".3" })[key] ?? null;
  assert.deepEqual(settled("combat", overlap).faults, ["combat combinations require alternate hands"]);
  const refused = "?control=combat,combat&left.combinations=overlap&left.hands=right&left.spacing=.3&right.combinations=overlap";
  assert.deepEqual(readMinds(refused), { left: COMBAT, right: { ...COMBAT, combinations: "overlap" } });
  assert.deepEqual(linkedSettings(refused, "left"), settled("combat", overlap));
  assert.deepEqual(linkedSettings(refused, "left").config, { ...COMBAT, combinations: "overlap", hands: "right", spacing: .3 });
  // An old link: its `&guard=` sets each recipe fighter's guard under the side's own, and a point control is Classic.
  assert.deepEqual(readMinds("?control=point-left,classic&guard=cover&right.guard=pose"), { left: { ...CLASSIC, guard: "cover" }, right: CLASSIC });
  assert.deepEqual(readMinds("?guard=shield"), { left: CLASSIC, right: CLASSIC });
  // A controller with no settings ignores a link's, and the HUD marks an edited side.
  assert.deepEqual(fieldsOf(QUADRUPED), []);
  assert.deepEqual(readMinds("?matchup=reptile,reptile&control=crawl,crawl&left.guard=cover&right.down=lie").left, QUADRUPED);
  assert.deepEqual(["left", "right"].map((side) => controllerLabel("?control=classic,brawler&right.prefers=head", side)),
    ["Classic fighter", "Brawler (experimental) (edited)"]);
  assert.equal(controllerLabel("?control=classic,brawler&right.prefers=body", "right"), "Brawler (experimental)");
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
