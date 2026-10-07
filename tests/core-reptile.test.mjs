import test from "node:test";
import assert from "node:assert/strict";
import { createQuadrupedMind } from "../src/core/reptile/mind.ts";
import { reptileSpec } from "../src/core/reptile/spec.ts";
import { specProvenanceFaults } from "./fixtures/spec.mjs";
import { coreStand } from "./harness/core-stand.mjs";
import { buildBody } from "../src/core/build/build-body.ts";
import { modelSpec } from "../src/core/models.ts";
import { createPool } from "../src/core/rules/pool.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { watchBlows } from "../src/core/rules/blows.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { createSenses } from "../src/core/mind/senses.ts";

test("the reptile has its own complete sourced anatomy", () => {
  const spec = reptileSpec();
  assert.deepEqual(specProvenanceFaults(spec), []);
  assert.equal(spec.mass.value, 8);
  assert.equal(spec.wounds.hp.value, 1);
  assert.equal(spec.attributes.balance.value, 0);
  assert.ok(Math.abs(spec.segments.reduce((n, s) => n + s.mass.value, 0) - 8) < 1e-12);
  assert.equal(spec.segments.filter(s => s.name.startsWith("paw.")).length, 4);
  assert.ok(spec.segments.every(s => s.mass.value > 0 && s.inertia.value.every(n => n > 0)));
  assert.equal(spec.joints.length, spec.segments.length - 1);
  assert.ok(spec.joints.every(j => j.dofs.every(d => d.min.value <= 0 && d.max.value >= 0)));
});

test("the reptile constructs in its declared joint pose without a corrective impulse", async () => {
  const stand = await coreStand(reptileSpec(), { gravity: false, ground: false });
  try {
    stand.step(8);
    for (const s of stand.built.segments.values()) {
      const v = s.body.linearVelocityToRef(s.node.position.clone());
      assert.ok(v.length() < 1e-5, `${s.spec.name}: ${v.length()}`);
    }
  } finally { stand.dispose(); }
});

test("the reptile stands for thirty seconds without an assist", async () => {
  const s = await coreStand(reptileSpec(), { engine: "rapier-coordinate" }), m = createQuadrupedMind(s.built, s.world);
  try {
    for (let i = 0; i < 30 * 120; i++) { s.step(); assert.equal(m.body.down, false); }
    const reading = m.body.observe();
    assert.equal(reading.down, false);
    assert.ok(reading.height > .17);
    assert.ok(Math.sqrt(reading.centre[0] * reading.centre[0] + reading.centre[2] * reading.centre[2]) < .05);
    assert.ok(Array.from(m.body.muscles.pulled).every(Number.isFinite));
  } finally { m.body.dispose(); s.dispose(); }
});

test("autonomous tactics approach sensed surfaces, close the jaw and verify release", async () => {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate", joints: { jaw: [.3] } });
  const enemy = buildBody(modelSpec("workshop-fighter"), stand.world, { position: [.18, 0, .54] });
  for (const segment of enemy.segments.values()) segment.body.setFixed(true);
  const hub = createSenses(stand.world), see = hub.add({ id: "reptile", side: "one", built: stand.built, out: () => false });
  hub.add({ id: "target", side: "two", built: enemy, out: () => false });
  let cancel = false, hit = null, before = 0, returnedAtHit = 0;
  const mind = createQuadrupedMind(stand.built, stand.world, () => cancel ? STAND_ORDERS : null, see);
  const rules = rulebook("arena"), mine = createPool(stand.built.spec, rules), theirs = createPool(enemy.spec, rules);
  const bite = mind.body.state.mind.host.bite, jaw = mind.body.muscles.channel("jaw axis0");
  const watch = watchBlows(stand.world, [{ id: "reptile", side: "one", built: stand.built, pool: mine },
    { id: "target", side: "two", built: enemy, pool: theirs }], rules, blow => {
    if (!hit && bite.cycle.phase === "swing" && blow.sides[0].segment === "jaw" && before < 0) {
      hit = blow; cancel = true; returnedAtHit = bite.returned;
    }
  });
  try {
    for (let step = 0; step < 15 * stand.world.hz; step++) {
      before = mind.body.muscles.rate(jaw); stand.step();
      if (hit && bite.returned > returnedAtHit && bite.cycle.phase === null) break;
    }
    assert.ok(hit && hit.closing > 0 && hit.energy > 0, "a sensed target receives a closing-jaw blow");
    assert.ok(hit.sides.every(side => side.damage > 0));
    assert.ok(bite.launched > 0 && bite.returned > returnedAtHit);
    const own = new Set([...stand.built.segments.values()].map(segment => segment.body));
    for (const name of ["head", "jaw"]) assert.ok(stand.world.physics.contactsOf(stand.built.segments.get(name).body)
      .every(contact => !contact.other || own.has(contact.other) || contact.impulse === 0));
    assert.equal(mind.body.down, false);
    assert.equal(mind.body.assist.meter.force, 0); assert.equal(mind.body.assist.meter.moment, 0);
  } finally { watch.dispose(); mind.body.dispose(); hub.dispose(); enemy.dispose(); stand.dispose(); }
});

test("holding and resuming a moving quadruped retains its bodies and resumes from actual paws", async () => {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate" });
  const mind = createQuadrupedMind(stand.built, stand.world, () => ({ move: { x: 0, z: 1 }, face: { x: 0, z: 1 }, attack: null }));
  try {
    stand.step(480);
    const host = mind.body.state.mind.host, sequence = host.crawl.sequence;
    const bodies = [...stand.built.segments.values()].map(segment => segment.body);
    mind.body.setLevel("held"); stand.step(120);
    assert.equal(mind.body.has, "nobody");
    assert.ok(Object.values(host.tracker.effectors).every(effector => effector.goal === null));
    mind.body.setLevel("full"); stand.step();
    assert.equal(mind.body.has, "crawl"); assert.equal(host.crawl.phase, "settle");
    assert.ok(host.crawl.sequence > sequence);
    assert.deepEqual([...stand.built.segments.values()].map(segment => segment.body), bodies);
    const steps = host.crawl.steps; stand.step(1200);
    assert.ok(host.crawl.steps > steps); assert.equal(mind.body.down, false);
  } finally { mind.body.dispose(); stand.dispose(); }
});

test("a closing jaw wounds through the common contact rules and releases after cancellation", async () => {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate", joints: { jaw: [.3] } });
  const enemy = buildBody(modelSpec("workshop-fighter"), stand.world, { position: [.18, 0, .53] });
  for (const segment of enemy.segments.values()) segment.body.setFixed(true);
  let attack = [.01, .22, .48];
  const mind = createQuadrupedMind(stand.built, stand.world, () => ({ ...STAND_ORDERS, attack }));
  const rules = rulebook("arena"), mine = createPool(stand.built.spec, rules), theirs = createPool(enemy.spec, rules);
  const jaw = mind.body.muscles.channel("jaw axis0"), bite = mind.body.state.mind.host.bite;
  let before = 0;
  const hits = [];
  const watch = watchBlows(stand.world, [{ id: "reptile", side: "one", built: stand.built, pool: mine },
    { id: "target", side: "two", built: enemy, pool: theirs }], rules, blow => {
    hits.push({ blow, phase: bite.cycle.phase, before });
    if (blow.sides[0].segment === "jaw" && bite.cycle.phase === "swing") attack = null;
  });
  try {
    for (let step = 0; step < 1200 && !bite.returned; step++) { before = mind.body.muscles.rate(jaw); stand.step(); }
    assert.equal(hits.length, 1);
    const hit = hits[0];
    assert.equal(hit.phase, "swing");
    assert.ok(hit.before < 0, "the jaw closes before impact");
    assert.ok(hit.blow.closing > 0 && hit.blow.energy > 0);
    assert.deepEqual(hit.blow.sides.map(side => side.segment), ["jaw", "shank.left"]);
    assert.ok(hit.blow.sides.every(side => side.damage > 0 && side.wound !== null));
    assert.ok(theirs.bar() < 1 && mine.bar() < 1);
    assert.deepEqual([bite.launched, bite.returned, bite.failed, bite.cycle.phase], [1, 1, 0, null]);
    const own = new Set([...stand.built.segments.values()].map(segment => segment.body));
    for (const name of ["head", "jaw"]) assert.ok(stand.world.physics.contactsOf(stand.built.segments.get(name).body)
      .every(contact => !contact.other || own.has(contact.other) || contact.impulse === 0), `${name} releases the target`);
    assert.equal(mind.body.down, false);
    assert.equal(mind.body.assist.meter.force, 0);
    assert.equal(mind.body.assist.meter.moment, 0);
  } finally { watch.dispose(); mind.body.dispose(); enemy.dispose(); stand.dispose(); }
});

test("the crawl walks two trunk lengths, stops, reverses and turns on physical paw landings", async () => {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate" });
  let orders = STAND_ORDERS;
  const mind = createQuadrupedMind(stand.built, stand.world, () => orders);
  const host = mind.body.state.mind.host, crawl = host.crawl;
  const names = ["front.left", "hind.right", "front.right", "hind.left"];
  const run = seconds => {
    for (let i = 0; i < seconds * stand.world.hz; i++) {
      const steps = crawl.steps, paw = crawl.paw;
      stand.step();
      assert.equal(mind.body.down, false);
      assert.ok(crawl.command.endpoints.filter(endpoint => !endpoint.bearing).length <= 1);
      if (crawl.steps !== steps) {
        assert.equal(crawl.steps, steps + 1);
        assert.equal(crawl.lifted, true);
        assert.equal(host.motor.endpoints[paw].contact, true, `paw.${names[paw]} lands in physics`);
      }
    }
    return mind.body.observe().centre;
  };
  try {
    const start = run(2);
    orders = { move: { x: 0, z: 1 }, face: { x: 0, z: 1 }, attack: null };
    const forward = run(60);
    assert.ok(forward[2] - start[2] >= .88, "two .44 m trunk lengths");
    assert.ok(crawl.steps >= 20);
    orders = STAND_ORDERS; run(5);
    assert.equal(crawl.phase, "settle");
    const stopped = mind.body.observe().centre, stoppedSteps = crawl.steps;
    run(5);
    assert.equal(crawl.steps, stoppedSteps);
    const quiet = mind.body.observe().centre;
    assert.ok(Math.hypot(quiet[0] - stopped[0], quiet[2] - stopped[2]) < .02);
    orders = { move: { x: 0, z: -1 }, face: { x: 0, z: 1 }, attack: null };
    const backward = run(60);
    assert.ok(quiet[2] - backward[2] >= .88);
    orders = { move: null, face: { x: 1, z: 0 }, attack: null }; run(120);
    assert.ok(Math.abs(crawl.yaw - Math.PI / 2) < .1);
    orders = { move: { x: 1, z: 0 }, face: { x: 1, z: 0 }, attack: null };
    const turning = mind.body.observe().centre, right = run(60);
    assert.ok(right[0] - turning[0] >= .88);
    assert.equal(mind.body.assist.meter.force, 0);
    assert.equal(mind.body.assist.meter.moment, 0);
  } finally { mind.body.dispose(); stand.dispose(); }
});
