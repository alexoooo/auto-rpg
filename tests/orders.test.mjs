// Orders (skill ceiling session 06, the orders half): `src/orders.ts` and the driver that carries
// them out, `GolemDriver.step` in `src/golem/golem-control.ts`.
//
// Harness: the pure half runs on a view read off a real bout; the rest is the Node bout runner
// (`tests/harness/bout-runner.mjs`), supported locomotion, default golems.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { createBout, freshHavok, FRAME } from "./harness/bout-runner.mjs";
import {
  AUTO_COMMANDERS, AttackNearest, HoldHere, ORDER_TUNING, OrderFollower, StandingOrders, autoCommander,
  hasOrders, isAutoCommanderName,
} from "../src/orders.ts";
import { policyMind } from "../src/mind.ts";

Logger.LogLevels = Logger.ErrorLogLevel;

const SEEDS = [0x1234567, 0x7654321];

/** A bout of two default golems, the left one ordered by `commander`. */
async function bout({ left = "golem-duelist", right = "golem-duelist", commander = null, leftMind = null,
  separation = undefined, seconds = 6 } = {}) {
  return createBout({ left, right, seeds: SEEDS, locomotionMode: "supported", maxSeconds: seconds,
    leftCommander: commander, leftMind, physics: await freshHavok(), ...(separation ? { separation } : {}) });
}

/** A hash of every limb's position and health, both bodies, every frame: the bout's trajectory. */
function trajectory(b) {
  const hash = createHash("sha1");
  const floats = new Float64Array(1);
  const bytes = new Uint8Array(floats.buffer);
  const put = (x) => { floats[0] = x; hash.update(bytes); };
  while (b.step()) {
    for (const body of [b.left, b.right]) {
      for (const limb of body.limbs) {
        const p = limb.part.mesh.position;
        put(p.x); put(p.y); put(p.z); put(limb.health);
      }
    }
  }
  return hash.digest("hex");
}

const groundOf = (b, side) => b[side].view.self.ground;
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------------------------------------
// The pure half, on a real publication
// ---------------------------------------------------------------------------------------------

/** One real view, published after a frame, and the duelist's command on it. */
async function realView() {
  const b = await bout({ seconds: 1 });
  b.step();
  const view = b.left.view;
  const mind = policyMind("golem-duelist", 7);
  return { b, view, mind };
}

test("no_orders_and_empty_orders_are_not_orders", () => {
  assert.equal(hasOrders(null), false);
  assert.equal(hasOrders(undefined), false);
  assert.equal(hasOrders({ target: null, destination: null }), false);
  assert.equal(hasOrders({ target: "enemy-0", destination: null }), true);
  assert.equal(hasOrders({ target: { x: 0, z: 0 }, destination: null }), true);
  assert.equal(hasOrders({ target: null, destination: { x: 0, z: 0 } }), true);
});

test("a_destination_writes_only_the_footwork_and_the_mind_s_own_record_is_untouched", async () => {
  const { b, view, mind } = await realView();
  try {
    const at = view.self.ground;
    // Both sides of centre and both ends: ahead, behind, to either side of the body's own facing.
    const f = view.self.facing;
    const cases = [
      { name: "ahead", x: Math.sin(f), z: Math.cos(f), forward: 1, strafe: 0 },
      { name: "behind", x: -Math.sin(f), z: -Math.cos(f), forward: -1, strafe: 0 },
      { name: "strafe +", x: Math.cos(f), z: -Math.sin(f), forward: 0, strafe: 1 },
      { name: "strafe -", x: -Math.cos(f), z: Math.sin(f), forward: 0, strafe: -1 },
    ];
    for (const c of cases) {
      const follower = new OrderFollower();
      const intent = mind.decide(view, FRAME);
      const before = structuredClone(intent);
      const destination = { x: at.x + 2 * c.x, z: at.z + 2 * c.z };
      const out = follower.obey(intent, view, { target: null, destination });
      assert.deepEqual(intent, before, `${c.name}: the mind's record was written`);
      assert.notEqual(out, intent, c.name);
      assert.ok(Math.abs(out.forward - c.forward) < 1e-9, `${c.name}: forward ${out.forward}`);
      assert.ok(Math.abs(out.strafe - c.strafe) < 1e-9, `${c.name}: strafe ${out.strafe}`);
      // Everything but the footwork (and the turn, which is the mind's only while the enemy is near)
      // is the mind's, compared whole rather than leaf by leaf.
      const { forward: _f, strafe: _s, turn: _t, ...rest } = out;
      const { forward: _f2, strafe: _s2, turn: _t2, ...mine } = intent;
      assert.deepEqual(rest, mine, c.name);
    }
  } finally { b.dispose(); }
});

test("a_destination_keeps_the_mind_s_facing_near_the_enemy_and_turns_to_travel_away_from_it", async () => {
  const { b, view, mind } = await realView();
  try {
    const at = view.self.ground;
    const enemyGap = flat(at, view.opponent.ground);
    assert.ok(enemyGap < ORDER_TUNING.threatM, `the fixture's enemy is near: ${enemyGap}`);
    const intent = mind.decide(view, FRAME);
    // Behind the body: the turn to travel there would be a half turn, and it is the mind's instead.
    const behind = { x: at.x - 2 * Math.sin(view.self.facing), z: at.z - 2 * Math.cos(view.self.facing) };
    const near = new OrderFollower().obey(intent, view, { target: null, destination: behind });
    assert.equal(near.turn, intent.turn);
    // The same order with the enemy moved out of reach: the body turns to face where it goes.
    const far = { ...view, opponent: { ...view.opponent, ground: { x: at.x + 50, y: 0, z: at.z + 50 } } };
    const away = new OrderFollower().obey(intent, far, { target: null, destination: behind });
    assert.equal(Math.abs(away.turn), 1, `turn ${away.turn}`);
  } finally { b.dispose(); }
});

test("a_body_arrives_holds_inside_the_leash_and_is_walked_back_past_it", async () => {
  const { b, view, mind } = await realView();
  try {
    const at = view.self.ground;
    const intent = mind.decide(view, FRAME);
    const follower = new OrderFollower();
    const dir = { x: Math.sin(view.self.facing), z: Math.cos(view.self.facing) };
    const point = (d) => ({ x: at.x + d * dir.x, z: at.z + d * dir.z });
    // Outside the arrive band: walking.
    let destination = point(ORDER_TUNING.arriveM + 0.1);
    assert.notEqual(follower.obey(intent, view, { target: null, destination }), intent);
    assert.equal(follower.holding, false);
    // The same point, the body now inside the band (moved by moving the point): holding, and the
    // command is the mind's own object.
    const inside = { x: at.x + (ORDER_TUNING.arriveM - 0.1) * dir.x, z: at.z + (ORDER_TUNING.arriveM - 0.1) * dir.z };
    const follower2 = new OrderFollower();
    assert.equal(follower2.obey(intent, view, { target: null, destination: inside }), intent);
    assert.equal(follower2.holding, true);
    // Holding tolerates the gap between the bands, and a stray past the leash is walked back. The
    // body is displaced by moving the view's ground, so the destination stays the one it holds.
    const shifted = (d) => ({ ...view, self: { ...view.self, ground: {
      x: inside.x - d * dir.x, y: at.y, z: inside.z - d * dir.z } } });
    assert.equal(follower2.obey(intent, shifted((ORDER_TUNING.arriveM + ORDER_TUNING.leashM) / 2), { target: null, destination: inside }), intent);
    assert.equal(follower2.holding, true);
    const back = follower2.obey(intent, shifted(ORDER_TUNING.leashM + 0.1), { target: null, destination: inside });
    assert.equal(follower2.holding, false);
    assert.ok(back.forward > 0.5, `walked back: forward ${back.forward}`);
    // A new point is a new walk even from inside the old band.
    destination = point(2);
    assert.notEqual(follower2.obey(intent, view, { target: null, destination }), intent);
  } finally { b.dispose(); }
});

test("an_attack_move_walks_until_the_enemy_is_near_and_then_leaves_the_fight_to_the_mind", async () => {
  const { b, view, mind } = await realView();
  try {
    const at = view.self.ground;
    const intent = mind.decide(view, FRAME);
    const target = { x: at.x + 5, z: at.z - 5 };
    // The fixture's enemy is inside `engageM`: the mind's command, untouched.
    assert.ok(flat(at, view.opponent.ground) <= ORDER_TUNING.engageM);
    assert.equal(new OrderFollower().obey(intent, view, { target, destination: null }), intent);
    // Enemy moved out: the body walks to the point.
    const far = { ...view, opponent: { ...view.opponent, ground: { x: at.x - 50, y: 0, z: at.z - 50 } } };
    assert.notEqual(new OrderFollower().obey(intent, far, { target, destination: null }), intent);
    // A body id is resolved by the host into the view's enemy; the follower has nothing to do.
    assert.equal(new OrderFollower().obey(intent, far, { target: "right", destination: null }), intent);
  } finally { b.dispose(); }
});

test("every_auto_commander_is_built_by_name", () => {
  for (const name of AUTO_COMMANDERS) {
    assert.ok(isAutoCommanderName(name));
    assert.equal(autoCommander(name).name, name);
  }
  assert.equal(isAutoCommanderName("puppet"), false);
  assert.equal(new AttackNearest().orders(), null);
  assert.equal(new StandingOrders().orders(), null);
});

// ---------------------------------------------------------------------------------------------
// In a bout
// ---------------------------------------------------------------------------------------------

test("no_orders_is_the_bout_without_orders_to_the_bit", async () => {
  const reference = trajectory(await bout({ seconds: 4 }));
  const empty = new StandingOrders();
  empty.current = { target: null, destination: null };
  for (const [name, commander] of [["attack-nearest", new AttackNearest()], ["a person with no orders", new StandingOrders()],
    ["empty orders", empty]]) {
    const b = await bout({ seconds: 4, commander });
    try { assert.equal(trajectory(b), reference, name); } finally { b.dispose(); }
  }
  // The control: an order that asks for something moves the bout, so the hash above can see one.
  const held = await bout({ seconds: 4, commander: new HoldHere() });
  try { assert.notEqual(trajectory(held), reference, "a hold order left the bout identical"); } finally { held.dispose(); }
});

test("a_body_walks_to_its_destination_and_holds_it_while_the_mind_keeps_the_arms", async () => {
  // Against an idle body, so nothing but the order moves it; the duelist would otherwise close.
  const seen = { decisions: 0, walked: 0, armsDiffer: 0 };
  const inner = policyMind("golem-duelist", 11);
  let last = null;
  const leftMind = { name: inner.name, decide(view, dt, orders) { last = inner.decide(view, dt, orders); return last; } };
  const orders = new StandingOrders();
  const b = await bout({ right: "idle", commander: orders, leftMind, seconds: 5 });
  try {
    b.step();
    const start = { x: groundOf(b, "left").x, z: groundOf(b, "left").z };
    // Two metres to the body's side, away from the enemy's line.
    const f = b.left.view.self.facing;
    const destination = { x: start.x + 2 * Math.cos(f), z: start.z - 2 * Math.sin(f) };
    orders.current = { target: null, destination };
    b.left.control.observer = (_view, applied) => {
      if (!last) return;
      seen.decisions += 1;
      if (applied !== last && (applied.forward !== last.forward || applied.strafe !== last.strafe)) seen.walked += 1;
      for (const key of ["primary", "secondary", "natural", "posture", "actingHand"]) {
        if (JSON.stringify(applied[key]) !== JSON.stringify(last[key])) seen.armsDiffer += 1;
      }
    };
    let arrivedAt = null;
    const after = [];
    while (b.step()) {
      const d = flat(groundOf(b, "left"), destination);
      if (arrivedAt === null && d <= ORDER_TUNING.arriveM) arrivedAt = b.clock;
      if (arrivedAt !== null) after.push(d);
    }
    // Measured: arrives at 0.95 s and never strays past 0.80 m after (the leash's taper); without
    // the taper it was past the leash on 127 of 245 frames, out to 1.32 m.
    assert.ok(arrivedAt !== null && arrivedAt < 4, `arrived at ${arrivedAt}`);
    const worst = Math.max(...after);
    assert.ok(worst <= ORDER_TUNING.leashM + 0.05, `strayed ${worst.toFixed(3)} m from the point after arriving`);
    assert.ok(seen.walked > 0, "the order never wrote the footwork");
    assert.equal(seen.armsDiffer, 0, "the order wrote something other than the footwork");
  } finally { b.dispose(); }
});

test("a_hold_order_keeps_a_fighting_body_near_its_ground_and_without_one_it_roams", async () => {
  // The control first: the same duelist mirror with no commander leaves its start by more than the
  // leash, so the held run below is the order's doing.
  const roam = async (commander) => {
    const b = await bout({ commander, seconds: 8, separation: 3.2 });
    try {
      b.step();
      const start = { x: groundOf(b, "left").x, z: groundOf(b, "left").z };
      let worst = 0, outside = 0, frames = 0;
      while (b.step()) {
        const d = flat(groundOf(b, "left"), start);
        worst = Math.max(worst, d);
        frames += 1;
        if (d > ORDER_TUNING.leashM + 0.3) outside += 1;
      }
      return { worst, outside: outside / frames };
    } finally { b.dispose(); }
  };
  const free = await roam(null);
  const held = await roam(new HoldHere());
  // Measured: free 3.23 m at worst and 73.5 % of frames past the leash plus 0.3 m; held 0.85 m and 0 %.
  assert.ok(free.worst > ORDER_TUNING.leashM + 0.3 && free.outside > 0.3,
    `the free duelist stayed put: ${free.worst.toFixed(3)} m, ${(100 * free.outside).toFixed(1)} %`);
  assert.ok(held.worst <= ORDER_TUNING.leashM + 0.1, `the held duelist strayed ${held.worst.toFixed(3)} m`);
  assert.equal(held.outside, 0);
});

test("a_mind_that_obeys_its_own_orders_is_handed_them_and_applied_as_it_is", async () => {
  const inner = policyMind("golem-duelist", 3);
  const handed = [];
  let last = null;
  const leftMind = { name: "self-obeying", obeysOrders: true,
    decide(view, dt, orders) { handed.push(orders ?? null); last = inner.decide(view, dt); return last; } };
  const orders = new StandingOrders();
  const b = await bout({ commander: orders, leftMind, seconds: 1 });
  try {
    let same = 0, applied = 0;
    b.left.control.observer = (_view, intent) => { applied += 1; if (intent === last) same += 1; };
    b.step();
    orders.current = { target: null, destination: { x: 5, z: 5 } };
    while (b.step()) { /* run */ }
    assert.ok(handed.some((o) => o === null), "no decision was made without orders");
    assert.ok(handed.some((o) => o === orders.current), "the orders never reached the mind");
    // Held substeps re-apply the last decision, so every applied command is the mind's own.
    assert.equal(same, applied);
  } finally { b.dispose(); }
});
