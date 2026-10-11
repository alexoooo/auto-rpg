import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { armed } from "../src/core/human/grip.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { kindsFor, treeFits } from "../src/core/mind/catalog.ts";
import { PUNCHER } from "../src/core/mind/config.ts";
import { dynamicRiseFits, dynamicRisePolicy, riseFootPlanted, riseCanExtend, riseContactPoints } from "../src/core/mind/rise/dynamic.ts";
import { RISE } from "../src/core/mind/rise/stages.ts";
import { ratesToRef } from "../src/core/build/joint-state.ts";
import { atan2 } from "../src/core/math/real.ts";
import { turnAboutToRef } from "../src/core/math/turn.ts";
import { footStatesOf, withinSupport } from "../src/core/control/support.ts";
import poses from "../assets/research/posture-holds.json" with { type: "json" };
import { lowsOf, uprightness } from "../src/core/control/ground.ts";
import { embody } from "../src/core/mind/mind.ts";
import { observeBody } from "../src/core/observation.ts";
import { minimumJerk } from "../src/core/skills/whole-body-strike.ts";
import { createMind } from "../src/core/mind/minds.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { modelSpec } from "../src/core/models.ts";
import { saveState } from "../src/core/state.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";
import { dynamicFall, felled } from "../research/core-rise-trials.mjs";
import { toeSupport } from "./fixtures/toe-support.mjs";

const config = { ...PUNCHER, subs: [{ kind: "dynamic-rise" }] };
const soleUpOf = built => Object.fromEntries(["left", "right"].map(side => [side,
  Vector3.Up().applyRotationQuaternionToRef(Quaternion.Inverse(built.segments.get(`foot.${side}`).rest), new Vector3()).asArray()]));
const solesOf = built => Object.fromEntries(footStatesOf(built).map(foot => [foot.side,
  { at: foot.sole.reduce((middle, corner) => middle.addInPlace(corner), new Vector3()).scaleInPlace(1 / foot.sole.length).asArray(),
    rest: foot.segment.rest.asArray() }]));

test("dynamic rise retains a measured rear toe before asking the hands to release", async () => {
  const f = await toeSupport();
  try {
    f.stand.step(12);
    const { built } = f.stand, muscles = f.body.own.muscles, root = built.segments.get("lowerTrunk");
    const model = { channels: muscles.channels.map(c => ({ name: c.name, min: c.dof.spec.min.value,
      max: c.dof.spec.max.value, bind: c.dof.spec.bind.value })), fours: {},
      segments: [...built.segments.values()].map(s => ({ name: s.spec.name, mass: s.rigid.mass })),
      rest: root.rest.asArray(), soleUp: soleUpOf(built), soles: solesOf(built), rootHeight: root.frame.origin[1],
      leg: 1, gravity: -f.stand.world.physics.gravity[1], held: null };
    const policy = dynamicRisePolicy(model), observation = f.observe();
    assert.ok(observation.contacts.some(c => c.segment === "foot.left" && c.fixed !== null && c.impulse > 0));
    assert.equal(riseFootPlanted(observation, "left", model.soleUp.left), false, "a loaded toe is not a flat sole");
    policy.begin(observation); const command = policy.step(observation, f.stand.world.dt);
    assert.deepEqual({ phase: policy.state.phase, lead: policy.state.lead }, { phase: "transfer", lead: "right" });
    assert.deepEqual(command.supports.filter(s => s.frame.name === "foot.left"),
      [{ frame: { kind: "segment", name: "foot.left" }, mode: "auto", normalLoad: { pointMin: 1 } }]);
    const unloaded = { ...observation, contacts: observation.contacts.filter(c => c.segment !== "foot.left") };
    policy.begin(unloaded); const next = policy.step(unloaded, f.stand.world.dt);
    assert.deepEqual(next.supports.filter(s => s.frame.name === "foot.left"),
      [{ frame: { kind: "segment", name: "foot.left" }, mode: "free" }], "the policy does not invent a missing toe contact");
  } finally { f.dispose(); }
});

test("a loaded boot's complete contact patch carries a capture point outside the pair-average outline", async () => {
  const spec = armed(modelSpec("workshop-fighter"), "right", woodenClub());
  const placement = poses.find(p => p.model === spec.model && p.id === "half-kneel").placement;
  const stand = await coreStand(spec, { ...placement, engine: "rapier-coordinate" });
  let held;
  try {
    held = embody(stand.built, stand.world, own => {
      const up = uprightness(own.built), observe = observeBody(own.built, own.muscles, stand.world,
        () => ({ time: stand.world.time, others: [] }), undefined, () => up.down(), true);
      return { name: "contact-patch half-kneel", state: {}, observe, step() {
        own.muscles.activation.fill(1); own.muscles.velocity.fill(0);
      } };
    });
    stand.world.step(24);
    const before = saveStand(stand.world, {}), o = held.mind.observe();
    assert.deepEqual(saveStand(stand.world, {}), before, "reading contact patches leaves physics unchanged");
    const boot = o.contacts.find(c => c.segment === "foot.left" && c.fixed !== null && c.impulse > 0);
    assert.ok(boot);
    const expected = stand.world.physics.contactManifoldsOf(stand.built.segments.get("foot.left").body, other => other === null)
      .filter(m => m.fixed === boot.fixed && m.impulse > 0).flatMap(m => m.points.map(p => ({ point: p.point, normal: m.normal, distance: p.distance })));
    assert.deepEqual(boot.patch, expected, "the observation retains every current point and its gap and normal");
    assert.ok(riseContactPoints(boot).length >= 3 && boot.pairs.length === 1, "one collider pair has a finite support face");
    assert.ok(Object.isFrozen(boot.patch) && Object.isFrozen(boot.patch[0].point));
    const mass = [...stand.built.segments.values()].reduce((sum, s) => sum + s.rigid.mass, 0);
    const model = { soleUp: soleUpOf(stand.built), rest: stand.built.segments.get("lowerTrunk").rest.asArray(),
      segments: [...stand.built.segments.values()].map(s => ({ name: s.spec.name, mass: s.rigid.mass })), gravity: -stand.world.physics.gravity[1] };
    assert.equal(riseCanExtend(o, "left", model, 0), true, "the loaded boot face supports the actual half-kneel before the impulse");
    const legs = o.contacts.filter(c => c.fixed !== null && c.impulse > 0 && /^(foot|shank)\./.test(c.segment));
    const averaged = legs.map(c => ({ corners: c.pairs.map(p => new Vector3(...p.point)) }));
    const target = riseContactPoints(boot).map(p => [.75 * p[0] + .25 * boot.point[0], .75 * p[2] + .25 * boot.point[2]])
      .find(([x, z]) => { const q = withinSupport(averaged, x, z, 0); return (q[0] - x) * (q[0] - x) + (q[1] - z) * (q[1] - z) > .000001; });
    assert.ok(target, "the real boot face extends beyond the averaged support outline");
    const velocity = o.segments.reduce((v, s) => v.map((value, k) => value + s.velocity[k] * stand.built.segments.get(s.name).rigid.mass / mass), [0, 0, 0]);
    const span = Math.sqrt(o.centre[1] / model.gravity), change = [(target[0] - o.centre[0]) / span - velocity[0], 0,
      (target[1] - o.centre[2]) / span - velocity[2]];
    for (const s of o.segments) {
      const part = stand.built.segments.get(s.name);
      part.body.applyImpulse(new Vector3(...change).scale(part.rigid.mass), new Vector3(...s.centre));
    }
    const disturbed = held.mind.observe();
    assert.equal(riseCanExtend(disturbed, "left", model, 0), true, "the physical velocity projection is carried by the complete boot patch");
    const averagedObservation = { ...disturbed, contacts: disturbed.contacts.map(({ patch, ...contact }) => contact) };
    assert.equal(riseCanExtend(averagedObservation, "left", model, 0), false, "pair averages falsely reject the same actual body state");
    assert.deepEqual(riseContactPoints({ ...boot, impulse: 0 }), []);
    assert.deepEqual(riseContactPoints({ ...boot, fixed: null }), []);
    assert.deepEqual(riseContactPoints({ ...boot, patch: boot.patch.map(p => ({ ...p, distance: .01 })) }), []);
    assert.deepEqual(riseContactPoints({ ...boot, patch: boot.patch.map(p => ({ ...p, normal: [1, 0, 0] })) }), []);
  } finally { held?.dispose(); stand.dispose(); }
});

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

async function fallen(degrees = 247.5) {
  const stand = await felled({ model: "workshop-fighter", held: "empty", degrees, engine: "rapier-coordinate" },
    (built, world) => createMind(built, world, config, { name: "dynamic replay", orders: () => STAND_ORDERS }).body, config);
  assert.equal(stand.body.down, true, "the checkpoint follows an actual fall");
  return stand;
}

test("a boot landing on its side during a real fall does not release the supports for transfer", async () => {
  const stand = await fallen(135);
  try {
    const p = stand.body.state.mind.subs[0].policy, soleUp = soleUpOf(stand.built);
    let found = false;
    for (let step = 0; step < 840; step++) {
      const o = stand.body.observe(), loaded = name => o.contacts.some(c => c.fixed !== null
        && c.impulse > 0 && Math.abs(c.normal[1]) >= .9 && c.segment === name);
      if (p.phase === "place" && p.released && loaded(`foot.${p.lead}`)
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
    let placementFrom = null;
    for (let step = 0; step < 720 && !(saved.phase === "place" && saved.released); step++) {
      placementFrom = stand.body.observe(); stand.world.step();
    }
    assert.deepEqual({ phase: saved.phase, released: saved.released }, { phase: "place", released: true });
    const o = stand.body.observe(), muscles = stand.body.muscles, root = stand.built.segments.get("lowerTrunk");
    assert.ok(placementFrom, "the fall reaches placement through the hosted controller");
    const right = Vector3.Right().applyRotationQuaternionToRef(Quaternion.FromArray(placementFrom.segments.find(s => s.name === "lowerTrunk").rotation)
      .multiply(Quaternion.Inverse(root.rest)), new Vector3());
    const actualHeading = atan2(-right.z, right.x);
    assert.ok(Math.abs(saved.yaw - actualHeading) < 1e-10, "placement follows the body's heading after rolling and acquisition");
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
    const expectedTurn = turnAboutToRef(Vector3.UpReadOnly, actualHeading, new Quaternion()).multiply(foot.segment.rest);
    assert.ok(1 - Math.abs(Quaternion.Dot(expectedTurn, Quaternion.FromArray(landed.orientation.target))) < 1e-10,
      "the planted boot faces the acquired support posture");
    const heights = foot.sole.map(corner => corner.subtract(Vector3.FromArray(landed.at))
      .applyRotationQuaternionToRef(Quaternion.FromArray(landed.orientation.target), new Vector3()).y + landed.translation.target[1]);
    assert.ok(heights.every(y => Math.abs(y - saved.ground) < 1e-10), `every sole corner lands at the floor: ${heights}`);
    const corners = foot.segment.rigid.shapes.flatMap(shape => lowsOf(shape, foot.segment.frame)).map(low => ({
      at: Vector3.FromArray(low.at).subtract(Vector3.FromArray(foot.segment.frame.origin))
        .applyRotationQuaternionToRef(Quaternion.Inverse(foot.segment.rest), new Vector3()), radius: low.radius,
    }));
    const bootLow = frame => Math.min(...corners.map(corner => corner.at.subtract(Vector3.FromArray(frame.at))
      .applyRotationQuaternionToRef(Quaternion.FromArray(frame.orientation.target), new Vector3()).y
      + frame.translation.target[1] - corner.radius));
    const floor = Math.min(saved.ground, bootLow(commandAt(0)));
    for (const time of [.05, .1, .2, .325, .5, .6, .65]) assert.ok(bootLow(commandAt(time)) >= floor - 1e-7,
      `the whole boot clears the floor throughout placement at ${time}`);
    assert.ok(bootLow(flight) > saved.ground, "the boot is airborne while advancing");
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

test("dynamic rise keeps placement when the rear boot releases despite a supported capture point", async () => {
  const spec = modelSpec("workshop-fighter");
  const placement = poses.find(p => p.model === spec.model && p.id === "half-kneel").placement;
  const stand = await coreStand(spec, { ...placement, engine: "rapier-coordinate" });
  let held;
  try {
    held = embody(stand.built, stand.world, own => {
      const state = { release: false }, index = own.muscles.channel("ankle.right dorsiflexion");
      const observe = observeBody(own.built, own.muscles, stand.world,
        () => ({ time: stand.world.time, others: [] }), undefined, () => true, true);
      return { name: "rear boot release", state, observe, step() {
        own.muscles.activation.fill(1); own.muscles.velocity.fill(0);
        if (state.release) own.muscles.velocity[index] = -2;
      } };
    });
    stand.world.step(24);
    assert.ok(held.mind.observe().contacts.some(c => c.segment === "foot.right" && c.fixed !== null && c.impulse > 0));
    held.mind.state.release = true;
    stand.world.step(25);
    const o = held.mind.observe(), loaded = o.contacts.filter(c => c.fixed !== null && c.impulse > 0 && -c.normal[1] > .9);
    assert.deepEqual(loaded.map(c => c.segment).sort(), ["foot.left", "shank.right"], "ordinary ankle motion releases the actual rear boot");
    const model = { soleUp: soleUpOf(stand.built), rest: stand.built.segments.get("lowerTrunk").rest.asArray(),
      segments: [...stand.built.segments.values()].map(s => ({ name: s.spec.name, mass: s.rigid.mass })), gravity: 9.81 };
    const boot = loaded.find(c => c.segment === "foot.left"), points = riseContactPoints(boot);
    const target = points.reduce((v, p) => [v[0] + p[0] / points.length, v[1] + p[2] / points.length], [0, 0]);
    const mass = model.segments.reduce((sum, s) => sum + s.mass, 0);
    const velocity = o.segments.reduce((v, s) => v.map((value, k) => value
      + s.velocity[k] * stand.built.segments.get(s.name).rigid.mass / mass), [0, 0, 0]);
    const span = Math.sqrt(o.centre[1] / model.gravity), change = [(target[0] - o.centre[0]) / span - velocity[0], 0,
      (target[1] - o.centre[2]) / span - velocity[2]];
    for (const s of o.segments) {
      const part = stand.built.segments.get(s.name);
      part.body.applyImpulse(new Vector3(...change).scale(part.rigid.mass), new Vector3(...s.centre));
    }
    const disturbed = held.mind.observe(), root = stand.built.segments.get("lowerTrunk");
    const up = Vector3.UpReadOnly.applyRotationQuaternionToRef(root.node.rotationQuaternion.multiply(Quaternion.Inverse(root.rest)), new Vector3());
    assert.ok(up.y > .9 && riseFootPlanted(disturbed, "left", model.soleUp.left));
    const patches = loaded.map(c => ({ corners: riseContactPoints(c).map(p => new Vector3(...p)) }));
    assert.deepEqual(withinSupport(patches, target[0], target[1], 0), target, "the remaining contacts carry the physical capture point");
    assert.equal(riseCanExtend(disturbed, "left", model, 0), false, "two-foot extension requires the rear boot to bear weight");
  } finally { held?.dispose(); stand.dispose(); }
});

test("dynamic rise extends a supported half-kneel, then hands over a quiet stand and walk", async () => {
  const placement = poses.find(p => p.model === "workshop-fighter" && p.id === "half-kneel").placement;
  const make = async () => {
    const stand = await coreStand(modelSpec("workshop-fighter"), { ...placement, engine: "rapier-coordinate" });
    let orders = STAND_ORDERS;
    const made = createMind(stand.built, stand.world, config, { name: "half-kneel recovery", orders: () => orders });
    return { ...stand, body: made.body, walk() { orders = { move: { x: 0, z: 1 }, face: null, attack: null }; },
      dispose() { made.body.dispose(); stand.dispose(); } };
  };
  const a = await make(), b = await make();
  try {
    const sub = a.body.state.mind.subs[0];
    for (let step = 0; step < 12 && !sub.extending; step++) a.world.step();
    assert.equal(sub.extending, true, "the controller extends before both boots have flat soles");
    const o = a.body.observe(), model = { soleUp: soleUpOf(a.built), rest: a.built.segments.get("lowerTrunk").rest.asArray(),
      segments: [...a.built.segments.values()].map(s => ({ name: s.spec.name, mass: s.rigid.mass })), gravity: 9.81 };
    assert.equal(o.down, true);
    assert.equal(riseFootPlanted(o, "right", model.soleUp.right), false);
    assert.equal(riseCanExtend(o, "left", model, sub.policy.ground), true);
    assert.equal(riseCanExtend({ ...o, contacts: o.contacts.filter(c => c.segment !== "foot.right") }, "left", model, sub.policy.ground), false,
      "the loaded rear toe is part of the support that carries the capture point");
    const saved = saveStand(a.world, { body: a.body.state });
    const finish = stand => {
      const recovery = stand.body.state.mind.subs[0], trace = [];
      const step = () => {
        stand.world.step(); const observation = stand.body.observe(); trace.push(observation);
        assert.deepEqual({ force: stand.body.assist.meter.force, moment: stand.body.assist.meter.moment }, { force: 0, moment: 0 });
        for (const j of observation.joints) assert.ok(j.effort <= j.positive + .0001 && -j.effort <= j.negative + .0001, j.name);
      };
      while (!recovery.policy.completed && stand.world.time < 4) step();
      assert.equal(recovery.policy.completed, 1);
      assert.ok(recovery.policy.ready >= .5);
      assert.equal(stand.body.down, false);
      const completed = stand.world.time;
      for (let i = 0; i < 240; i++) { step(); assert.equal(stand.body.down, false); }
      const from = stand.body.observe().centre; stand.walk();
      for (let i = 0; i < 120; i++) { step(); assert.equal(stand.body.down, false); }
      const to = stand.body.observe().centre;
      assert.ok((to[0] - from[0]) * (to[0] - from[0]) + (to[2] - from[2]) * (to[2] - from[2]) > .05 * .05);
      return { completed, trace, state: saveState({ world: stand.world.state, body: stand.body.state }) };
    };
    const expected = finish(a);
    loadStand(b.world, { body: b.body.state }, saved);
    assert.deepEqual(finish(b), expected);
  } finally { a.dispose(); b.dispose(); }
});
