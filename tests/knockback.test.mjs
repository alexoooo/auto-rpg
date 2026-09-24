import test from "node:test";
import assert from "node:assert/strict";

// Physical contact session 06: a contact pushes the struck body by the momentum it moved. Each test
// strikes a real standing golem through `Combat` with one hand-made contact, and reads what was
// filed into that body's stability ledger against `contactImpulseNs` of the two effective masses.
// The bout's own left `Combat` watches the same blade, so every contact is filed twice, once by each.

const near = (actual, expected, relative, what) =>
  assert.ok(Math.abs(actual - expected) <= relative * Math.abs(expected), `${what}: ${actual} against ${expected}`);

async function arena() {
  const { Logger } = await import("@babylonjs/core/Misc/logger.js");
  const { createBout, freshHavok } = await import("./harness/bout-runner.mjs");
  const { namedBuild } = await import("../src/golem/roster.ts");
  const { Combat } = await import("../src/combat.ts");
  Logger.LogLevels = Logger.ErrorLogLevel;
  const setup = namedBuild("default").setup;
  const bout = createBout({ left: "idle", right: "idle", leftGolem: setup, rightGolem: setup,
    locomotionMode: "supported", physics: await freshHavok(), seeds: [1, 2] });
  for (let i = 0; i < 30; i++) bout.step();
  const striker = bout.left.strikers.find((s) => s.kind === "sword");
  assert.ok(striker, "the control: a blade to strike with");
  const queued = [];
  const queue = bout.right.queueStabilityEvent.bind(bout.right);
  bout.right.queueStabilityEvent = (event) => { queued.push(event); queue(event); };
  const combat = new Combat("left", [striker]);
  combat.advance(1);
  combat.attach(bout.right);
  return { bout, striker, combat, queued };
}

/** One contact of `striker` on `body` at the blade's centre of mass, moving at `velocity`. */
async function strike(striker, body, velocity) {
  const { PhysicsEventType } = await import("@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js");
  striker.body.setLinearVelocity(velocity);
  striker.body.setAngularVelocity(velocity.scale(0));
  const point = striker.centreOfMass().clone();
  const normal = velocity.normalizeToNew();
  striker.body.getCollisionObservable().notifyObservers({ collider: striker.body, collidedAgainst: body,
    type: PhysicsEventType.COLLISION_STARTED, point, normal: normal.scale(-2), distance: 0, impulse: 0 });
  return { point, normal };
}

const filed = (event) => Math.hypot(event.horizontalShoveNs[0], event.verticalShoveNs ?? 0, event.horizontalShoveNs[1]);
// What the ledger is handed is the physical impulse times the recorded blow gain (physical contact
// session 08); what is reported is the physical impulse.
const { TIPPING } = await import("../src/tipping.ts");
const GAIN = TIPPING.BLOW_GAIN;

test("every_contact_files_the_inelastic_impulse_of_its_two_effective_masses_into_the_struck_body", async () => {
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const { contactImpulseNs } = await import("../src/scoring.ts");
  const { bout, striker, combat, queued } = await arena();
  try {
    const limb = bout.right.limbs.find((l) => l.key.endsWith("core"));
    assert.ok(limb, "the control: a core to strike");
    // A cut at 9 m/s, level with the ground and toward the struck body.
    const velocity = new Vector3(0, 0, 9);
    const { point } = await strike(striker, limb.part.body, velocity);
    const report = combat.lastHit;
    assert.ok(report && report.damage > 0, "the control: the cut wounded");
    assert.equal(queued.length, 2, "one contact files one shove per Combat watching it");
    const expected = contactImpulseNs(report.strikerMassKg, report.partMassKg, report.closingSpeed);
    near(report.transferNs, expected, 1e-9, "reported");
    for (const event of queued) near(filed(event), expected * GAIN, 1e-9, "filed");
    // At the height it landed, which the ledger reads as a lever about the base (session 08).
    for (const event of queued) near(event.atY, point.y, 1e-9, "landed at");
    assert.ok(point.y > 0.5, `the control: a height worth reading, ${point.y}`);
    // Along the blow, whichever way round Havok handed the normal (it is reversed above).
    assert.ok(queued[0].horizontalShoveNs[1] > 0.99 * expected * GAIN, `pushed the way the blade went: ${queued[0].horizontalShoveNs}`);
    assert.ok(expected > report.strikerMassKg * 9 * 0.3,
      `a blade arrives with its arm behind it: ${expected.toFixed(2)} N.s at 9 m/s`);

    // A blade leaned on bites nothing and still pushes by what it carries: under the edge's floor,
    // across a different part so the part's own cooldown cannot stop it. It comes down from above,
    // so the vertical share the ledger does not read is filed as well.
    const slow = bout.right.limbs.find((l) => l !== limb && !l.severed && l.key.includes("head"));
    assert.ok(slow, "the control: a second part to lean on");
    await strike(striker, slow.part.body, new Vector3(0, -0.48, 0.64));
    const leaned = combat.lastHit;
    assert.equal(leaned.damage, 0, "the control: a lean does not wound");
    assert.equal(queued.length, 4, "and is still filed");
    near(filed(queued[3]), GAIN * contactImpulseNs(leaned.strikerMassKg, leaned.partMassKg, leaned.closingSpeed), 1e-9, "leaned");
    assert.ok(queued[3].verticalShoveNs < -0.5 * filed(queued[3]), `and downward: ${queued[3].verticalShoveNs}`);
  } finally { bout.dispose(); }
});

test("a_parry_pushes_the_body_behind_the_guard_by_the_same_rule", async () => {
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const { contactImpulseNs } = await import("../src/scoring.ts");
  const { effectiveMassAt } = await import("../src/body-inertia.ts");
  const { bout, striker, combat, queued } = await arena();
  try {
    const guard = bout.right.strikers.find((s) => s.kind === "sword");
    assert.ok(guard && bout.right.parriedBy(guard.body), "the control: the other blade is a guard");
    const { point, normal } = await strike(striker, guard.body, new Vector3(0, 0, 9));
    const report = combat.lastHit;
    assert.equal(report.damage, 0, "a parry wounds nothing");
    assert.ok(report.key.startsWith("block:"), `and is filed as a block: ${report.key}`);
    const expected = contactImpulseNs(effectiveMassAt(striker.body, point, normal),
      effectiveMassAt(guard.body, point, normal), 9);
    assert.equal(queued.length, 2, "the block files a shove on the guard's owner");
    near(report.transferNs, expected, 1e-9, "reported");
    for (const event of queued) near(filed(event), expected * GAIN, 1e-9, "filed");
  } finally { bout.dispose(); }
});
