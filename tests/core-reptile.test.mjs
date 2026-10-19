/**
 * **The reptile** (`src/core/reptile/`) on the Node core stand, Rapier, 120 Hz: it stands, is held
 * and resumes, bites and releases, and trots on paws that land. Its body is `reptile-body`'s, its
 * choice of target `reptile-tactics`'s, and how well it bites and trots `core-reptile-capability`'s.
 */
import test from "node:test";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { mouthOf } from "../src/core/reptile/bite.ts";
import { pointAtToRef, rootFrameToRef } from "../src/core/control/kinematics.ts";
import { biteTrial } from "../research/reptile-bite.mjs";
import assert from "node:assert/strict";
import { quadrupedMind } from "../src/core/reptile/mind.ts";
import { hostedMind } from "../src/core/mind/host.ts";
import { reptileSpec } from "../src/core/reptile/spec.ts";
import { coreStand } from "./harness/core-stand.mjs";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { createSenses } from "../src/core/mind/senses.ts";
import { quadrupedTactics } from "../src/core/reptile/tactics.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { REPTILE_BITE } from "../src/core/reptile/tuning.ts";

test("the reptile stands for thirty seconds without an assist", async () => {
  const s = await coreStand(reptileSpec(), { engine: "rapier-coordinate" }), m = hostedMind(s.built, s.world, {}, (host, wiring) => quadrupedMind(host, wiring));
  try {
    for (let i = 0; i < 30 * 120; i++) { s.step(); assert.equal(m.body.down, false); }
    const reading = m.body.observe();
    assert.equal(reading.down, false);
    assert.ok(reading.height > .17);
    assert.ok(Math.sqrt(reading.centre[0] * reading.centre[0] + reading.centre[2] * reading.centre[2]) < .05);
    assert.ok(Array.from(m.body.muscles.pulled).every(Number.isFinite));
  } finally { m.body.dispose(); s.dispose(); }
});

test("holding and resuming a moving quadruped retains its bodies and resumes from actual paws", async () => {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate" });
  const mind = hostedMind(stand.built, stand.world, { orders: () => ({ move: { x: 0, z: 1 }, face: { x: 0, z: 1 } }) }, (host, wiring) => quadrupedMind(host, wiring));
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
  // How fast it closes and how much the bite gives is `core-reptile-capability`'s.
  const row = await biteTrial();
  const hit = row.hits.find(h => h.blow.work > 0 && h.blow.sides.some(side => side.mechanism === "point"));
  assert.ok(hit, `the fixture did not reach its case: no tooth met the foe (${JSON.stringify(row)})`);
  assert.ok(hit.blow.closing > 0);
  assert.deepEqual(hit.blow.sides.map(side => side.segment), ["jaw", "jaw"]);
  assert.ok(hit.blow.sides.every(side => side.damage > 0 && side.wound !== null));
  assert.ok(row.bars.every(bar => bar < 1));
  assert.ok(hit.blow.sides[0].region?.startsWith("tooth."));
  assert.equal(hit.blow.sides[1].mechanism, "point");
  assert.deepEqual(row.cycle, { launched: 1, returned: 1, failed: 0, phase: null });
  assert.equal(row.clear, true);
  assert.deepEqual(row.assist, { steps: 0, force: 0, moment: 0 });
});

test("a bite request stops the next paw placement while the jaw prepares", async () => {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate", groundSize: 100 });
  let orders = STAND_ORDERS, biteAt = null;
  const mind = hostedMind(stand.built, stand.world, { orders: () => orders, biteTarget: () => biteAt }, (host, wiring) => quadrupedMind(host, wiring)), host = mind.body.state.mind.host;
  try {
    stand.step(240);
    orders = { move: { x: 0, z: 1 }, face: { x: 0, z: 1 } };
    while (stand.world.time < 4 && !(host.crawl.phase === "swing" && host.motor.endpoints.some(foot => !foot.contact))) stand.step();
    assert.equal(host.crawl.phase, "swing");
    assert.ok(host.motor.endpoints.some(foot => !foot.contact));
    while (host.crawl.phase !== "settle") stand.step();
    stand.step(2);
    assert.ok(host.motor.endpoints.every(foot => foot.contact));
    const steps = host.crawl.steps, { lower, hinge, head } = mouthOf(stand.built);
    const frame = { position: new Vector3(), rotation: new Quaternion() };
    rootFrameToRef(head, frame);
    const at = pointAtToRef([hinge], [[REPTILE_BITE.open * REPTILE_BITE.contactAt]], lower.spec.points.bite.value, new Vector3());
    at.applyRotationQuaternionToRef(frame.rotation, at).addInPlace(frame.position);
    biteAt = at.asArray();
    while (stand.world.time < 6 && host.bite.launched === 0) stand.step();
    assert.equal(host.bite.launched, 1);
    assert.ok(host.motor.endpoints.every(foot => foot.contact));
    assert.equal(host.crawl.steps, steps, "the bite request prevents another placement before the jaw is prepared");
    assert.equal(mind.body.down, false);
  } finally { mind.body.dispose(); stand.dispose(); }
});

test("a pending bite retains its material point across physical preparation steps", async () => {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate" });
  const target = buildBody(reptileSpec(), stand.world, { position: [0, 0, .97], rotation: [0, 1, 0, 0] });
  for (const part of target.segments.values()) part.body.setFixed(true);
  const hub = createSenses(stand.world), see = hub.add({ id: "mine", side: "one", built: stand.built, out: () => false });
  hub.add({ id: "target", side: "two", built: target, out: () => false });
  const own = hostedMind(stand.built, stand.world, { orders: () => STAND_ORDERS }, (host, wiring) => quadrupedMind(host, wiring));
  const tactics = quadrupedTactics(own.body, () => STAND_ORDERS);
  try {
    stand.step();
    const sight = { view: { senses: see(), feet: own.body.state.mind.host.motor.endpoints }, bite: { phase: null } };
    tactics.decide(sight, stand.world.dt);
    const selected = tactics.state.target, point = structuredClone(selected);
    assert.ok(selected);
    for (let i = 0; i < 20; i++) { stand.step(); tactics.decide(sight, stand.world.dt); assert.deepEqual(tactics.state.target, point); }
    let renewed = false;
    for (let i = 0; i < 2 * stand.world.hz; i++) {
      stand.step(); tactics.decide(sight, stand.world.dt); renewed ||= tactics.state.target !== selected;
    }
    assert.equal(renewed, true, "a pending target has a finite placement deadline");
    assert.equal(own.body.down, false);
  } finally { own.body.dispose(); hub.dispose(); target.dispose(); stand.dispose(); }
});

test("an unloaded snap cannot invent a wound", async () => {
  const row = await biteTrial({ target: false });
  assert.ok(row.peak.rate < -3, `the fixture did not reach its case: the jaw closed at ${row.peak.rate} rad/s`);
  assert.deepEqual(row.hits, []);
  assert.deepEqual(row.bars, [1, null]);
  assert.ok(row.cycles.every(cycle => cycle.energy === 0 && cycle.damage === 0));
  assert.equal(row.down, false);
});

test("a physical wall interrupts a closing tooth before it damages the opponent", async () => {
  const row = await biteTrial({ obstacle: { position: [0, .125, .485], size: [.3, .15, .015] }, seconds: 5 });
  assert.equal(row.worldContact, true);
  assert.ok(row.cycles.every(cycle => cycle.aborted && cycle.energy === 0 && cycle.damage === 0));
  assert.ok(row.cycle.returned > 0);
  assert.equal(row.compression, 0);
  assert.equal(row.down, false);
});

test("a mechanically stopped jaw ends a missed stroke on the snap clock", async () => {
  const base = reptileSpec(), spec = { ...base, joints: base.joints.map(joint => joint.name === "jaw"
    ? { ...joint, dofs: joint.dofs.map(dof => ({ ...dof, min: sourced(.3, "rad", "reptile-contact-sweep", "jaw-stop witness") })) } : joint) };
  const stand = await coreStand(spec, { engine: "rapier-coordinate", joints: { jaw: [REPTILE_BITE.open] } });
  const mind = hostedMind(stand.built, stand.world, { orders: () => STAND_ORDERS, biteTarget: () => [0, .1925, .485] }, (host, wiring) => quadrupedMind(host, wiring));
  const bite = mind.body.state.mind.host.bite, jaw = mind.body.muscles.channel("jaw axis0");
  let launched = null, admitted = false;
  try {
    while (stand.world.time < 5) {
      stand.step();
      if (bite.cycle.phase === "swing") { launched ??= stand.world.time; admitted ||= bite.cycle.impact !== null; }
      else if (launched !== null) break;
    }
    assert.notEqual(launched, null);
    assert.equal(admitted, false);
    assert.equal(mind.body.state.mind.host.feedback.jaw.impulse, 0);
    assert.ok(mind.body.muscles.angle(jaw) > .29, "the actual joint stop prevents the requested closed pose");
    assert.equal(bite.cycle.phase, "return");
    assert.ok(stand.world.time - launched <= 2 * REPTILE_BITE.snap + 2 * stand.world.dt);
    assert.equal(mind.body.down, false);
  } finally { mind.body.dispose(); stand.dispose(); }
});

test("the trot lands its paws in physics and stops", async () => {
  // How fast and how far it travels, reverses and turns is `core-reptile-capability`'s.
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate", groundSize: 100 });
  let orders = STAND_ORDERS;
  const mind = hostedMind(stand.built, stand.world, { orders: () => orders }, (host, wiring) => quadrupedMind(host, wiring));
  const host = mind.body.state.mind.host, crawl = host.crawl;
  const groups = [[0, 1], [2, 3]];
  const run = seconds => {
    for (let i = 0; i < seconds * stand.world.hz; i++) {
      const steps = crawl.steps, paw = crawl.paw;
      stand.step();
      assert.equal(mind.body.down, false, "the fixture did not reach its case: it fell");
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
    run(2);
    orders = { move: { x: 0, z: 1 }, face: { x: 0, z: 1 } };
    const steps = crawl.steps;
    run(3);
    assert.ok(crawl.steps > steps, "the fixture did not reach its case: it never stepped");
    orders = STAND_ORDERS; run(5);
    const stopped = mind.body.observe().centre, stoppedSteps = crawl.steps;
    run(2);
    assert.equal(crawl.steps, stoppedSteps);
    const quiet = mind.body.observe().centre;
    assert.ok(Math.hypot(quiet[0] - stopped[0], quiet[2] - stopped[2]) < .02);
    assert.equal(mind.body.assist.meter.force, 0);
    assert.equal(mind.body.assist.meter.moment, 0);
  } finally { mind.body.dispose(); stand.dispose(); }
});
