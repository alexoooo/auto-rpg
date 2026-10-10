import test from "node:test";
import assert from "node:assert/strict";
import { armed } from "../src/core/human/grip.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { kindsFor, treeFits } from "../src/core/mind/catalog.ts";
import { PUNCHER } from "../src/core/mind/config.ts";
import { dynamicRiseFits, dynamicRisePolicy } from "../src/core/mind/rise/dynamic.ts";
import { RISE } from "../src/core/mind/rise/stages.ts";
import { ratesToRef } from "../src/core/build/joint-state.ts";
import { minimumJerk } from "../src/core/skills/whole-body-strike.ts";
import { createMind } from "../src/core/mind/minds.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { modelSpec } from "../src/core/models.ts";
import { saveState } from "../src/core/state.ts";
import { saveStand, loadStand } from "./harness/core-stand.mjs";
import { dynamicFall, felled } from "../research/core-rise-trials.mjs";

const config = { ...PUNCHER, subs: [{ kind: "dynamic-rise" }] };

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
    held: null, fours: {} };
  assert.throws(() => dynamicRisePolicy({ ...model, gravity: 0 }), /invalid dynamic rise model/);
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

async function fallen() {
  const stand = await felled({ model: "workshop-fighter", held: "empty", degrees: 247.5, engine: "rapier-coordinate" },
    (built, world) => createMind(built, world, config, { name: "dynamic replay", orders: () => STAND_ORDERS }).body, config);
  assert.equal(stand.body.down, true, "the checkpoint follows an actual fall");
  return stand;
}

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
