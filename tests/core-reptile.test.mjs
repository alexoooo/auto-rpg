import test from "node:test";
import { biteTrial } from "../research/reptile-bite.mjs";
import assert from "node:assert/strict";
import { createQuadrupedMind } from "../src/core/reptile/mind.ts";
import { reptileSpec } from "../src/core/reptile/spec.ts";
import { specProvenanceFaults } from "./fixtures/spec.mjs";
import { coreStand } from "./harness/core-stand.mjs";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { createSenses } from "../src/core/mind/senses.ts";
import { quadrupedTactics } from "../src/core/reptile/tactics.ts";
import { createDirectBody } from "../src/core/mind/direct.ts";

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

test("a reptile is down by its own rule under any mind", async () => {
  // A mind that knows nothing of reptiles reads the spec's rule: on its back it is down, built on its paws it is not.
  const read = async (rotation, position) => {
    const s = await coreStand(reptileSpec(), { engine: "rapier-coordinate", rotation, position });
    const body = createDirectBody(s.built, s.world, { kind: "direct", targets: {}, seconds: 0.05, speed: 1, activation: 0 });
    try { s.step(); return [body.down, body.observe().down]; } finally { body.dispose(); s.dispose(); }
  };
  assert.deepEqual(await read(undefined, [0, 0, 0]), [false, false]);
  assert.deepEqual(await read([0, 0, 1, 0], [0, 0.5, 0]), [true, true]);
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

test("autonomous tactics capture a sensed surface, snap and verify release", async () => {
  const row = await biteTrial({ autonomous: true });
  const hit = row.hits.find(h => h.phase === "swing" && h.before.rate < -2);
  assert.ok(hit && hit.blow.closing > .5 && hit.blow.energy > .005, JSON.stringify(row));
  assert.ok(hit.blow.sides.every(side => side.damage > 0));
  assert.deepEqual(row.cycle, { launched: 1, returned: 1, failed: 0, phase: null });
  assert.equal(row.clear, true); assert.equal(row.down, false);
  assert.deepEqual(row.assist, { steps: 0, force: 0, moment: 0 });
});

test("holding and resuming a moving quadruped retains its bodies and resumes from actual paws", async () => {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate" });
  const mind = createQuadrupedMind(stand.built, stand.world, { orders: () => ({ move: { x: 0, z: 1 }, face: { x: 0, z: 1 }, attack: null }) });
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

test("a closing jaw strikes during its fast motion and releases after cancellation", async () => {
  const row = await biteTrial();
  const hit = row.hits.find(h => h.phase === "swing");
  assert.ok(hit && hit.before.rate < -2 && hit.before.elapsed < .12, JSON.stringify(row));
  assert.ok(hit.blow.closing > .5 && hit.blow.energy > .005);
  assert.deepEqual(hit.blow.sides.map(side => side.segment), ["jaw", "jaw"]);
  assert.ok(hit.blow.sides.every(side => side.damage > 0 && side.wound !== null));
  assert.ok(row.bars.every(bar => bar < 1));
  assert.ok(hit.blow.sides[0].region?.startsWith("tooth."));
  assert.equal(hit.blow.sides[1].mechanism, "point");
  assert.ok(hit.blow.sides[1].damage > .002, JSON.stringify(hit.blow));
  assert.deepEqual(row.cycle, { launched: 1, returned: 1, failed: 0, phase: null });
  assert.equal(row.clear, true); assert.equal(row.down, false);
  assert.deepEqual(row.assist, { steps: 0, force: 0, moment: 0 });
});

test("a changed foe order replaces the chamber's material target", async () => {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate" });
  const first = buildBody(reptileSpec(), stand.world, { position: [0, 0, .97], rotation: [0, 1, 0, 0] });
  const second = buildBody(reptileSpec(), stand.world, { position: [.7, 0, .97], rotation: [0, 1, 0, 0] });
  const hub = createSenses(stand.world), see = hub.add({ id: "mine", side: "one", built: stand.built, out: () => false });
  hub.add({ id: "first", side: "two", built: first, out: () => false });
  hub.add({ id: "second", side: "two", built: second, out: () => false });
  const own = createQuadrupedMind(stand.built, stand.world, { orders: () => STAND_ORDERS });
  let orders = { ...STAND_ORDERS, foe: "first" };
  const tactics = quadrupedTactics(own.body, () => orders);
  try {
    stand.step();
    const sight = { view: { senses: see() }, bite: { phase: null } };
    const original = tactics.decide(sight, stand.world.dt);
    sight.bite.phase = "chamber";
    orders = { ...STAND_ORDERS, foe: "second" };
    const changed = tactics.decide(sight, stand.world.dt);
    assert.equal(tactics.state.target.foe, "second");
    assert.notDeepEqual(changed.attack, original.attack);
    sight.bite.phase = "swing";
    orders = { ...STAND_ORDERS, foe: "first" };
    const committed = tactics.decide(sight, stand.world.dt);
    assert.equal(tactics.state.target.foe, "second");
    assert.deepEqual(committed.attack, changed.attack);
  } finally { own.body.dispose(); hub.dispose(); first.dispose(); second.dispose(); stand.dispose(); }
});

test("an unloaded snap cannot invent a wound", async () => {
  const row = await biteTrial({ target: false });
  assert.deepEqual(row.hits, []);
  assert.deepEqual(row.bars, [1, null]);
  assert.ok(row.peak.rate < -3);
  assert.equal(row.down, false);
});

test("the trot travels quickly, stops, reverses and turns on physical paw landings", async () => {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate", groundSize: 100 });
  let orders = STAND_ORDERS;
  const mind = createQuadrupedMind(stand.built, stand.world, { orders: () => orders });
  const host = mind.body.state.mind.host, crawl = host.crawl;
  const groups = [[0, 1], [2, 3]];
  const run = seconds => {
    for (let i = 0; i < seconds * stand.world.hz; i++) {
      const steps = crawl.steps, paw = crawl.paw;
      stand.step();
      assert.equal(mind.body.down, false);
      assert.ok(crawl.command.endpoints.filter(endpoint => !endpoint.bearing).length <= 2);
      if (crawl.steps !== steps) {
        assert.equal(crawl.steps, steps + 2);
        assert.equal(crawl.lifted, true);
        for (const i of groups[paw]) {
          assert.equal(crawl.liftedPaws[i], true);
          assert.equal(host.motor.endpoints[i].contact, true, `paw ${i} lands in physics`);
        }
      }
    }
    return mind.body.observe().centre;
  };
  try {
    const start = run(2);
    orders = { move: { x: 0, z: 1 }, face: { x: 0, z: 1 }, attack: null };
    const forward = run(10);
    assert.ok(forward[2] - start[2] >= 2, "at least .2 m/s including acceleration");
    assert.ok(crawl.steps >= 60);
    orders = STAND_ORDERS; run(5);
    assert.equal(crawl.phase, "settle");
    const stopped = mind.body.observe().centre, stoppedSteps = crawl.steps;
    run(5);
    assert.equal(crawl.steps, stoppedSteps);
    const quiet = mind.body.observe().centre;
    assert.ok(Math.hypot(quiet[0] - stopped[0], quiet[2] - stopped[2]) < .02);
    orders = { move: { x: 0, z: -1 }, face: { x: 0, z: 1 }, attack: null };
    const backward = run(10);
    assert.ok(quiet[2] - backward[2] >= 1.8);
    orders = { move: null, face: { x: 1, z: 0 }, attack: null }; run(20);
    assert.ok(Math.abs(crawl.yaw - Math.PI / 2) < .1);
    orders = { move: { x: 1, z: 0 }, face: { x: 1, z: 0 }, attack: null };
    const turning = mind.body.observe().centre, right = run(10);
    assert.ok(right[0] - turning[0] >= 2);
    assert.equal(mind.body.assist.meter.force, 0);
    assert.equal(mind.body.assist.meter.moment, 0);
  } finally { mind.body.dispose(); stand.dispose(); }
});
