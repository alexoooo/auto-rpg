import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { armed } from "../src/core/human/grip.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { kindsFor, treeFits } from "../src/core/mind/catalog.ts";
import { PUNCHER } from "../src/core/mind/config.ts";
import { dynamicRiseFits, dynamicRisePolicy, riseFootPlanted } from "../src/core/mind/rise/dynamic.ts";
import { RISE } from "../src/core/mind/rise/stages.ts";
import { ratesToRef } from "../src/core/build/joint-state.ts";
import { footStatesOf } from "../src/core/control/support.ts";
import poses from "../assets/research/posture-holds.json" with { type: "json" };
import { uprightness } from "../src/core/control/ground.ts";
import { embody } from "../src/core/mind/mind.ts";
import { observeBody } from "../src/core/observation.ts";
import { minimumJerk } from "../src/core/skills/whole-body-strike.ts";
import { createMind } from "../src/core/mind/minds.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { modelSpec } from "../src/core/models.ts";
import { saveState } from "../src/core/state.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";
import { dynamicFall, felled } from "../research/core-rise-trials.mjs";

const config = { ...PUNCHER, subs: [{ kind: "dynamic-rise" }] };
const soleUpOf = built => Object.fromEntries(["left", "right"].map(side => [side,
  Vector3.Up().applyRotationQuaternionToRef(Quaternion.Inverse(built.segments.get(`foot.${side}`).rest), new Vector3()).asArray()]));
const solesOf = built => Object.fromEntries(footStatesOf(built).map(foot => [foot.side,
  { at: foot.sole.reduce((middle, corner) => middle.addInPlace(corner), new Vector3()).scaleInPlace(1 / foot.sole.length).asArray(),
    rest: foot.segment.rest.asArray() }]));

test("dynamic rise is an additional human recovery choice, including a retained club", () => {
  for (const model of ["workshop-fighter", "workshop-rogue"]) {
    const human = modelSpec(model), club = armed(human, "right", woodenClub());
    for (const spec of [human, club]) {
      assert.equal(dynamicRiseFits(spec), true);
      assert.equal(treeFits(spec, config), true);
      assert.equal(kindsFor("sub-mind", spec).find(p => p.kind === "dynamic-rise").reason, null);
    }
    assert.equal(dynamicRiseFits(armed(club, "left", woodenClub())), false);
  }
  for (const model of ["crypt-skeleton", "reptile"]) assert.equal(dynamicRiseFits(modelSpec(model)), false);
  assert.deepEqual(PUNCHER.subs, [{ kind: "staged-rise" }]);
});

test("dynamic rise rejects invalid model and clock data before producing a command", () => {
  const model = { channels: [{ name: "knee.left flexion", min: 0, max: 2, bind: 0 }],
    segments: [{ name: "lowerTrunk", mass: 1 }], rest: [0, 0, 0, 1], rootHeight: 1, leg: 1, gravity: 9.81,
    held: null, fours: {}, soleUp: { left: [0, 1, 0], right: [0, 1, 0] },
    soles: { left: { at: [0, 0, 0], rest: [0, 0, 0, 1] }, right: { at: [0, 0, 0], rest: [0, 0, 0, 1] } } };
  assert.throws(() => dynamicRisePolicy({ ...model, gravity: 0 }), /invalid dynamic rise model/);
  assert.throws(() => dynamicRisePolicy({ ...model, soleUp: { left: [0, 0, 0], right: [0, 1, 0] } }), /invalid dynamic rise model/);
  assert.throws(() => dynamicRisePolicy({ ...model, soles: undefined }), /invalid dynamic rise model/);
  const policy = dynamicRisePolicy(model);
  const before = saveState(policy.state);
  for (const dt of [0, -1, NaN, Infinity]) assert.throws(() => policy.step({}, dt), /invalid dynamic rise step/);
  assert.deepEqual(saveState(policy.state), before);
});

test("an unfinished fall is censored instead of being counted as a fast rise", async () => {
  for (const model of ["workshop-fighter", "workshop-rogue"]) for (const held of ["empty", "club"]) {
    const row = await dynamicFall({ model, held, degrees: 0, watch: .1 });
    assert.deepEqual({ fell: row.fell, seconds: row.seconds, success: row.success, retained: row.retained, assist: row.assist },
      { fell: true, seconds: null, success: false, retained: true, assist: { force: 0, moment: 0 } });
    assert.ok(row.attempts >= 1 && row.effortExcess <= .0001);
    assert.deepEqual(row.harness, { name: "Node core stand with Arena solids", engine: "rapier-coordinate", hz: 120, actuation: "symmetric", balance: 0 });
  }
});

test("dynamic rise keeps an actual planted leg when the other hand holds a club", async () => {
  const spec = armed(modelSpec("workshop-fighter"), "right", woodenClub());
  const placement = poses.find(p => p.model === spec.model && p.id === "half-kneel").placement;
  const stand = await coreStand(spec, { ...placement, engine: "rapier-coordinate" });
  let held;
  try {
    held = embody(stand.built, stand.world, own => {
      const up = uprightness(own.built), observe = observeBody(own.built, own.muscles, stand.world,
        () => ({ time: stand.world.time, others: [] }), undefined, () => up.down());
      return { name: "half-kneel fixture", state: {}, observe, step() {
        own.muscles.activation.fill(1); own.muscles.velocity.fill(0);
      } };
    });
    stand.world.step(24);
    const observation = held.mind.observe(), root = stand.built.segments.get("lowerTrunk");
    const loaded = name => observation.contacts.some(c => c.fixed !== null && c.segment === name && c.impulse > 0);
    assert.equal(observation.down, true);
    assert.deepEqual([loaded("foot.left"), loaded("shank.left"), loaded("shank.right")], [true, false, true]);
    const soleUp = soleUpOf(stand.built);
    assert.equal(riseFootPlanted(observation, "left", soleUp.left), true);
    const policy = dynamicRisePolicy({
      channels: held.own.muscles.channels.map(c => ({ name: c.name, min: c.dof.spec.min.value, max: c.dof.spec.max.value, bind: c.dof.spec.bind.value })),
      segments: [...stand.built.segments.values()].map(s => ({ name: s.spec.name, mass: s.rigid.mass })),
      rest: root.rest.asArray(), rootHeight: root.frame.origin[1], leg: 1, gravity: 9.81, held: "right", fours: {},
      soleUp, soles: solesOf(stand.built),
    });
    policy.begin(observation);
    assert.deepEqual({ phase: policy.state.phase, lead: policy.state.lead }, { phase: "transfer", lead: "left" });
    policy.state.lead = "right"; policy.reclassify(observation);
    assert.deepEqual({ phase: policy.state.phase, lead: policy.state.lead }, { phase: "transfer", lead: "left" });
    policy.state.phase = "acquire"; policy.state.stage = 3;
    const command = policy.step(observation, stand.world.dt);
    const freed = name => command.supports.some(s => s.frame.kind === "segment" && s.frame.name === name && s.mode === "free");
    assert.deepEqual([freed("hand.left"), freed("hand.right")], [false, true]);
  } finally { held?.dispose(); stand.dispose(); }
});

async function fallen() {
  const stand = await felled({ model: "workshop-fighter", held: "empty", degrees: 247.5, engine: "rapier-coordinate" },
    (built, world) => createMind(built, world, config, { name: "dynamic replay", orders: () => STAND_ORDERS }).body, config);
  assert.equal(stand.body.down, true, "the checkpoint follows an actual fall");
  return stand;
}

test("a boot landing on its side during a real fall does not release the supports for transfer", async () => {
  const stand = await fallen();
  try {
    const p = stand.body.state.mind.subs[0].policy, soleUp = soleUpOf(stand.built);
    let found = false;
    for (let step = 0; step < 840; step++) {
      const o = stand.body.observe(), loaded = name => o.contacts.some(c => c.fixed !== null
        && c.impulse > 0 && Math.abs(c.normal[1]) >= .9 && c.segment === name);
      if (p.phase === "place" && p.released && loaded(`foot.${p.lead}`) && !loaded(`shank.${p.lead}`)
        && !riseFootPlanted(o, p.lead, soleUp[p.lead])) {
        assert.equal(o.down, true);
        assert.ok(o.contacts.some(c => c.fixed !== null && c.impulse > 0 && !c.segment.startsWith("foot.")),
          "the body still relies on other floor contacts");
        stand.world.step();
        assert.notEqual(p.phase, "transfer", "an unsafe contact cannot start weight transfer");
        found = true;
        break;
      }
      stand.world.step();
    }
    assert.equal(found, true, "the physical fall must reach the contact that caused the false transition");
  } finally { stand.dispose(); }
});

test("placement from a real fall targets a flat sole on the floor with clearance in flight", async () => {
  const stand = await fallen();
  try {
    const saved = stand.body.state.mind.subs[0].policy;
    for (let step = 0; step < 720 && !(saved.phase === "place" && saved.released); step++) stand.world.step();
    assert.deepEqual({ phase: saved.phase, released: saved.released }, { phase: "place", released: true });
    const o = stand.body.observe(), muscles = stand.body.muscles, root = stand.built.segments.get("lowerTrunk");
    const leg = stand.built.spec.segments.filter(s => /^(thigh|shank)\.left$/.test(s.name)).reduce((sum, s) =>
      sum + Vector3.Distance(Vector3.FromArray(s.proximal.value), Vector3.FromArray(s.distal.value)), 0);
    const policy = dynamicRisePolicy({
      channels: muscles.channels.map(c => ({ name: c.name, min: c.dof.spec.min.value, max: c.dof.spec.max.value, bind: c.dof.spec.bind.value })),
      segments: [...stand.built.segments.values()].map(s => ({ name: s.spec.name, mass: s.rigid.mass })),
      rest: root.rest.asArray(), rootHeight: root.frame.origin[1], leg, gravity: 9.81, held: null, fours: {},
      soleUp: soleUpOf(stand.built), soles: solesOf(stand.built),
    });
    const commandAt = time => {
      Object.assign(policy.state, structuredClone(saved), { time: time - stand.world.dt, stagnant: 0, error: Infinity });
      return policy.step(o, stand.world.dt).frames.find(frame => frame.id === "foot");
    };
    const flight = commandAt(.325), landed = commandAt(.65);
    assert.ok(flight?.orientation && landed?.orientation, "placement controls the boot's orientation as well as its point");
    const canonical = values => values.map(v => v === 0 ? 0 : v);
    assert.deepEqual({ ...landed.translation, velocity: canonical(landed.translation.velocity), acceleration: canonical(landed.translation.acceleration) },
      { target: saved.pointTo, velocity: [0, 0, 0], acceleration: [0, 0, 0], seconds: .15, weight: 2 });
    const foot = footStatesOf(stand.built).find(f => f.side === saved.lead);
    const heights = foot.sole.map(corner => corner.subtract(Vector3.FromArray(landed.at))
      .applyRotationQuaternionToRef(Quaternion.FromArray(landed.orientation.target), new Vector3()).y + landed.translation.target[1]);
    assert.ok(heights.every(y => Math.abs(y - saved.ground) < 1e-10), `every sole corner lands at the floor: ${heights}`);
    assert.ok(Math.abs(flight.translation.target[1] - (saved.pointFrom[1] + saved.pointTo[1]) / 2 - .18 * leg) < 1e-10);
    assert.deepEqual(canonical(landed.orientation.velocity), [0, 0, 0]);
    assert.deepEqual(canonical(landed.orientation.acceleration), [0, 0, 0]);
    assert.ok(foot.sole.some(corner => corner.subtract(Vector3.FromArray(landed.at)).length() > .1), "the sole has extent around its tracked centre");
  } finally { stand.dispose(); }
});

test("a dynamic roll requests coordinate rates through the bent joints of a real fall", async () => {
  const stand = await felled({ model: "workshop-fighter", held: "empty", degrees: 180, engine: "rapier-coordinate" },
    (built, world) => createMind(built, world, config, { name: "roll coordinates", orders: () => STAND_ORDERS }).body, config);
  try {
    const p = stand.body.state.mind.subs[0].policy, muscles = stand.body.muscles;
    for (let step = 0; step < 360; step++) {
      stand.world.step();
      if (p.landed && p.phase === "orient" && p.stage === 0 && p.time >= .2) break;
    }
    assert.equal(p.phase, "orient");
    assert.equal(p.stage, 0);
    assert.ok(p.landed && p.time >= .2 && p.time < .4, "the motors are sampled during a landed back roll");
    assert.equal(p.roll, "right");
    const posture = RISE.roll.back[0].posture, blend = minimumJerk(p.time, .25).s;
    let conversion = 0;
    for (const joint of stand.built.joints.values()) {
      const first = muscles.channel(`${joint.spec.name} ${joint.dofs[0].spec.positive}`);
      const angles = joint.dofs.map((_, k) => muscles.angle(first + k));
      const speeds = joint.dofs.map((_, k) => muscles.velocity[first + k]);
      const rates = ratesToRef(joint, angles, speeds, []);
      joint.dofs.forEach((dof, k) => {
        const i = first + k, name = muscles.channels[i].name;
        const target = Math.max(dof.spec.min.value, Math.min(dof.spec.max.value, (posture[name] ?? 0) - dof.spec.bind.value));
        const goal = p.from[i] + (target - p.from[i]) * blend;
        const requested = Math.max(-10, Math.min(10, (goal - angles[k]) / .03));
        assert.ok(Math.abs(rates[k] - requested) < 1e-10, name);
        conversion = Math.max(conversion, Math.abs(speeds[k] - rates[k]));
      });
    }
    assert.ok(conversion > .1, "the bent-joint fixture distinguishes motor speed from coordinate rate");
  } finally { stand.dispose(); }
});

test("a dynamic support-transfer checkpoint continues identically in a fresh world", async () => {
  const a = await fallen(), b = await fallen();
  try {
    const recovery = a.body.state.mind.subs[0], start = a.world.time;
    while (a.world.time - start < 6 && recovery.tracking.steps === 0) a.world.step();
    assert.ok(recovery.tracking.steps > 0, "the fall reaches the whole-body adapter");
    assert.ok(recovery.policy.elapsed > 0 && recovery.policy.attempts > 0);
    const saved = saveStand(a.world, { body: a.body.state });
    const finish = stand => {
      const trace = [];
      for (let step = 0; step < 36; step++) { stand.world.step(); trace.push(stand.body.observe()); }
      return { trace, state: saveState({ world: stand.world.state, body: stand.body.state }) };
    };
    const expected = finish(a);
    loadStand(b.world, { body: b.body.state }, saved);
    assert.deepEqual(finish(b), expected);
    loadStand(a.world, { body: a.body.state }, saved);
    assert.deepEqual(finish(a), expected);
    assert.deepEqual({ force: a.body.assist.meter.force, moment: a.body.assist.meter.moment }, { force: 0, moment: 0 });
    for (const o of expected.trace) for (const j of o.joints) {
      assert.ok(j.effort <= j.positive + .0001 && -j.effort <= j.negative + .0001, j.name);
    }
  } finally { a.dispose(); b.dispose(); }
});
