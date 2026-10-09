import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { sourced } from "../src/core/spec/quantity.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { watchBlows } from "../src/core/rules/blows.ts";
import { createPool } from "../src/core/rules/pool.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";
import { lone } from "./fixtures/lone.mjs";
import { centreOfToRef } from "../src/core/control/support.ts";
import { effectorFeedback, unintendedContact } from "../src/core/control/effector-feedback.ts";

const q = (v, unit) => sourced(v, unit, "reptile-contact-sweep", "three-tooth contact fixture");
const rules = rulebook("arena");

/** Node stand, rapier-coordinate at 120 Hz: three teeth meet one fixed material slab. */
async function rig(reverse = false) {
  const base = lone("teeth", "jaw", 1, { hp: 100 });
  const contacts = [-.018, 0, .018].map((x, i) => ({ name: `tooth.${i}`, shape: { kind: "hull", points:
    [[x - .004, -.004, .055], [x + .004, -.004, .055], [x + .004, .004, .055], [x - .004, .004, .055], [x, 0, .063]].map(p => q(p, "m")) },
  surface: { stiffness: q(10e6, "N/m"), point: { direction: q([0, 0, 1], "1"), alignment: q(.8, "1") } } }));
  const spec = { ...base, segments: base.segments.map(s => ({ ...s, contacts, points: { bite: q([0, 0, .063], "m") } })) };
  const stand = await coreStand(spec, { gravity: false, ground: false, engine: "rapier-coordinate" });
  const slab = lone("slab", "trunk", 1, { hp: 100, stiffness: 17000 });
  const target = buildBody({ ...slab, segments: slab.segments.map(s => ({ ...s,
    shape: { kind: "box", centre: q([0, 0, 0], "m"), size: q([.2, .2, .1], "m") },
    surface: { ...s.surface, layer: { stiffness: q(500, "N/m"), dampingRatio: q(.5, "1"), depth: q(.008, "m") } } })) }, stand.world, { position: [0, 0, .12] });
  target.segments.get("trunk").body.setFixed(true);
  const fighters = [{ id: "teeth", side: "one", built: stand.built, pool: createPool(spec, rules) },
    { id: "slab", side: "two", built: target, pool: createPool(target.spec, rules) }];
  const order = reverse ? [...fighters].reverse() : fighters;
  let watch = watchBlows(stand.world, order, rules);
  const segment = stand.built.segments.get("jaw"), jaw = segment.body, force = new Vector3(), at = new Vector3();
  const hook = stand.world.beforeStep(() => {
    if (stand.world.steps < 180) jaw.applyForce(force.set(0, 0, 3), centreOfToRef(segment, at));
    else if (stand.world.steps < 210) jaw.applyForce(force.set(0, 0, -3), centreOfToRef(segment, at));
  });
  return { ...stand, fighters, target, get watch() { return watch; },
    states: () => ({ pools: fighters.map(f => f.pool.state), watch: watch.state }),
    replace() { watch.dispose(); watch = watchBlows(stand.world, order, rules); },
    dispose() { hook.dispose(); watch.dispose(); target.dispose(); stand.dispose(); } };
}

test("a weaker wall contact remains visible beside the intended tooth contact", async () => {
  const run = await rig(), jaw = run.built.segments.get("jaw"), force = new Vector3(), at = new Vector3();
  run.world.physics.addFixedBox([-.057, 0, .04], [.01, .2, .2]);
  const push = run.world.beforeStep(() => jaw.body.applyForce(force.set(-.2, 0, 0), centreOfToRef(jaw, at)));
  const reading = effectorFeedback(run.built, ["jaw"], other => other === run.target.segments.get("trunk").body
    ? { kind: "body", body: "slab", segment: "trunk", guard: false } : null, undefined,
    { jaw: { point: "bite", regions: ["tooth.0", "tooth.1", "tooth.2"] } });
  try {
    run.step(100); reading.read();
    assert.equal(reading.state.jaw.contact.target.kind, "body");
    assert.equal(reading.state.jaw.contact.target.body, "slab");
    assert.ok(reading.state.jaw.contacts.some(contact => contact.kind === "world"));
    assert.ok(reading.state.jaw.contact.impulse > reading.state.jaw.obstruction.impulse);
    assert.equal(unintendedContact(reading.state.jaw, "slab"), true);
  } finally { push.dispose(); run.dispose(); }
});

test("three teeth price one released work episode, including replacement of the combat observer", async () => {
  const rows = [];
  for (const reverse of [false, true]) {
    const run = await rig(reverse);
    try {
      run.step(100);
      assert.equal(run.world.contactWork.active.size, 1);
      assert.equal(run.world.physics.materialContacts().length, 3);
      assert.equal(run.watch.blows.length, 0);
      assert.deepEqual(run.fighters.map(f => f.pool.bar()), [1, 1]);
      const work = [...run.world.contactWork.active.values()][0].work;
      run.replace(); run.step(75);
      assert.ok(Math.abs([...run.world.contactWork.active.values()][0].work - work) < .00001);
      run.step(100);
      assert.equal(run.world.contactWork.active.size, 0);
      assert.equal(run.watch.blows.length, 1, JSON.stringify(run.watch.blows));
      const blow = run.watch.blows[0];
      assert.ok(blow.work > 0 && blow.energy === blow.work);
      assert.equal(blow.sides.find(s => s.fighter === "slab").mechanism, "point");
      rows.push(blow);
    } finally { run.dispose(); }
  }
  assert.deepEqual(rows[0], rows[1]);
});

test("a snapshot during loaded contact preserves accumulated work and the eventual wound", async () => {
  const trunk = await rig(), twin = await rig(), forgotten = await rig();
  try {
    trunk.step(40);
    assert.equal(trunk.world.contactWork.active.size, 1);
    const saved = saveStand(trunk.world, trunk.states());
    loadStand(twin.world, twin.states(), saved);
    loadStand(forgotten.world, forgotten.states(), { ...saved, state: { ...saved.state, world: { ...saved.state.world,
      contactWork: { active: new Map(), released: [] } } } });
    assert.deepEqual(twin.world.contactWork, trunk.world.contactWork);
    trunk.step(235); twin.step(235); forgotten.step(235);
    assert.equal(trunk.watch.blows.length, 1);
    assert.deepEqual(saveStand(twin.world, twin.states()).state, saveStand(trunk.world, trunk.states()).state);
    assert.notDeepEqual(forgotten.watch.blows, trunk.watch.blows);
  } finally { trunk.dispose(); twin.dispose(); forgotten.dispose(); }
});


test("opposing tooth sets retain both point contributions in one body-pair wound", async () => {
  const make = (model, sign) => {
    const base = lone(model, "jaw", 1, { hp: 100, stiffness: 17000 });
    const contacts = [.02, .04, .06].map((v, i) => {
      const x = -sign * v, z = sign * .05;
      return { name: `tooth.${i}`, shape: { kind: "hull", points:
        [[x - .004, -.004, z], [x + .004, -.004, z], [x + .004, .004, z], [x - .004, .004, z], [x, 0, z + sign * .008]].map(p => q(p, "m")) },
        surface: { stiffness: q(10e6, "N/m"), point: { direction: q([0, 0, sign], "1"), alignment: q(.8, "1") } } };
    });
    return { ...base, segments: base.segments.map(s => ({ ...s, contacts,
      shape: { kind: "box", centre: q([0, 0, 0], "m"), size: q([.16, .12, .1], "m") },
      surface: { ...s.surface, layer: { stiffness: q(500, "N/m"), dampingRatio: q(.5, "1"), depth: q(.008, "m") } } })) };
  };
  const stand = await coreStand(make("lower", 1), { gravity: false, ground: false, engine: "rapier-coordinate" });
  const target = buildBody(make("upper", -1), stand.world, { position: [0, 0, .12] });
  const lower = stand.built.segments.get("jaw"), upper = target.segments.get("jaw"); upper.body.setFixed(true);
  const fighters = [{ id: "lower", side: "one", built: stand.built, pool: createPool(stand.built.spec, rules) },
    { id: "upper", side: "two", built: target, pool: createPool(target.spec, rules) }];
  const watch = watchBlows(stand.world, fighters, rules), force = new Vector3(), at = new Vector3();
  try {
    for (let i = 0; i < 180; i++) { lower.body.applyForce(force.set(0, 0, 3), centreOfToRef(lower, at)); stand.step(); }
    const episode = [...stand.world.contactWork.active.values()][0];
    assert.equal(stand.world.contactWork.active.size, 1); assert.equal(episode.pairs.size, 6);
    assert.ok([...episode.pairs.values()].some(p => p.mine > 0));
    assert.ok([...episode.pairs.values()].some(p => p.theirs > 0));
    assert.equal(watch.blows.length, 0);
    for (let i = 0; i < 30; i++) { lower.body.applyForce(force.set(0, 0, -3), centreOfToRef(lower, at)); stand.step(); }
    stand.step(100);
    assert.equal(watch.blows.length, 1);
    const blow = watch.blows[0];
    assert.ok(blow.work > 0);
    assert.ok(blow.sides.every(s => s.mechanism === "point" && s.region.startsWith("tooth") && s.pointDamage > 0));
    assert.ok(blow.sides.every(s => s.pointDamage <= s.damage));
    assert.ok(Math.abs(blow.sides.reduce((sum, s) => sum + s.share, 0) - 1) < 1e-12);
    assert.ok(Math.abs(blow.sides[0].damage - blow.sides[1].damage) / blow.sides[0].damage < .05, JSON.stringify(blow));
  } finally { watch.dispose(); target.dispose(); stand.dispose(); }
});
