/**
 * **The reptile's choice of a bite target** (`quadrupedTactics`, `src/core/reptile/tactics.ts`):
 * a committed stroke keeps its foe, a changed one clears a target still in the chamber, and a buried
 * mouth backs off before it bites (Node core stand, Rapier, 120 Hz).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { buildBody } from "../src/core/build/build-body.ts";
import { pointOfToRef } from "../src/core/control/support.ts";
import { surfaceContains } from "../src/core/mind/openings.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { createSenses } from "../src/core/mind/senses.ts";
import { quadrupedMind } from "../src/core/reptile/mind.ts";
import { hostedMind } from "../src/core/mind/host.ts";
import { reptileSpec } from "../src/core/reptile/spec.ts";
import { quadrupedTactics } from "../src/core/reptile/tactics.ts";
import { coreStand } from "./harness/core-stand.mjs";

test("a changed foe clears an unreachable chamber target and preserves a committed stroke", async () => {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate" });
  const first = buildBody(reptileSpec(), stand.world, { position: [0, 0, 1], rotation: [0, 1, 0, 0] });
  const second = buildBody(reptileSpec(), stand.world, { position: [.7, 0, 1], rotation: [0, 1, 0, 0] });
  const hub = createSenses(stand.world), see = hub.add({ id: "mine", side: "one", built: stand.built, out: () => false });
  hub.add({ id: "first", side: "two", built: first, out: () => false });
  hub.add({ id: "second", side: "two", built: second, out: () => false });
  const own = hostedMind(stand.built, stand.world, { orders: () => STAND_ORDERS }, (host, wiring) => quadrupedMind(host, wiring));
  let orders = { ...STAND_ORDERS, foe: "first" };
  const tactics = quadrupedTactics(own.body, () => orders);
  try {
    stand.step();
    const sight = { view: { senses: see(), feet: own.body.state.mind.host.motor.endpoints }, bite: { phase: null } };
    const original = tactics.decide(sight, stand.world.dt);
    assert.equal(tactics.state.target.foe, "first");
    assert.ok(original.biteAt);
    sight.bite.phase = "swing";
    orders = { ...STAND_ORDERS, foe: "second" };
    const committed = tactics.decide(sight, stand.world.dt);
    assert.equal(tactics.state.target.foe, "first");
    assert.deepEqual(committed.biteAt, original.biteAt);
    sight.bite.phase = "chamber";
    const changed = tactics.decide(sight, stand.world.dt);
    assert.equal(tactics.state.target, null);
    assert.equal(changed.biteAt, null);
  } finally { own.body.dispose(); hub.dispose(); first.dispose(); second.dispose(); stand.dispose(); }
});

test("a buried mouth creates clearance before an autonomous bite is armed", async () => {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate" });
  const target = buildBody(reptileSpec(), stand.world, { position: [0, 0, .9], rotation: [0, 1, 0, 0] });
  for (const part of target.segments.values()) part.body.setFixed(true);
  const hub = createSenses(stand.world), see = hub.add({ id: "mine", side: "one", built: stand.built, out: () => false });
  hub.add({ id: "target", side: "two", built: target, out: () => false });
  const own = hostedMind(stand.built, stand.world, { orders: () => STAND_ORDERS }, (host, wiring) => quadrupedMind(host, wiring));
  const tactics = quadrupedTactics(own.body, () => null);
  try {
    const head = stand.built.segments.get("head");
    const at = pointOfToRef(head, head.spec.points.mouth.value, new Vector3());
    assert.equal(surfaceContains(see().others[0], "head", at.asArray()), true);
    assert.equal(stand.world.physics.contactsOf(head.body).some(contact => contact.impulse > 0), false);
    const intent = tactics.decide({ view: { senses: see(), centre: own.body.state.mind.host.motor.centre,
      yaw: 0, feet: own.body.state.mind.host.motor.endpoints }, bite: { phase: null } });
    assert.equal(tactics.state.target, null);
    assert.equal(intent.biteAt, null);
    assert.ok(intent.move.x * intent.face.x + intent.move.z * intent.face.z < 0);
    assert.equal(intent.creep, true);
  } finally { own.body.dispose(); hub.dispose(); target.dispose(); stand.dispose(); }
});
